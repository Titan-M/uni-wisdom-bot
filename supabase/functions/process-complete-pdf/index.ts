import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessPDFRequest {
  pdfContent?: string;
  pdfContents?: string[];
  title: string;
  category?: string;
  cleanupFirst?: boolean;
  chunkSize?: number; // approximate characters per chunk
  overlapSize?: number; // words of overlap between chunks
}

interface ChunkMetadata {
  chunk_index: number;
  total_chunks: number;
  embedding: number[];
  source_document: string;
  chunk_size: number;
  overlap_size?: number;
  start_position: number;
  end_position: number;
  word_count: number;
}

function preprocessText(input: string): string {
  let text = input || "";
  text = text.replace(/^\uFEFF/, "");
  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/\u00AD/g, "");
  text = text.replace(/([A-Za-z])\-\n([A-Za-z])/g, "$1$2");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/([^\n])\n(?!\n)/g, "$1 ");
  text = text.replace(/[\t\f\v]+/g, " ");
  text = text.replace(/\s{2,}/g, " ");
  return text.trim();
}

function createIntelligentChunks(text: string, chunkSize = 1200, overlapSize = 120): string[] {
  const chunks: string[] = [];
  let current = "";

  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const sentenceSplit = (p: string) =>
    p.split(/(?<=[.!?])\s+(?=[A-Z0-9\(\"'\*])/).map(s => s.trim()).filter(s => s.length > 0);

  const pushWithOverlap = (sentence: string) => {
    const addLen = sentence.length + (current ? 1 : 0);
    if (current.length + addLen > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      if (overlapSize > 0) {
        const words = current.split(/\s+/);
        const overlapWords = words.slice(-Math.min(overlapSize, words.length));
        current = overlapWords.join(" ");
      } else {
        current = "";
      }
    }
    current += (current ? " " : "") + sentence;
  };

  for (const para of paragraphs) {
    const sentences = sentenceSplit(para);
    for (const s of sentences) {
      pushWithOverlap(s);
    }
    if (current.length > chunkSize * 0.9) {
      chunks.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > Math.min(60, Math.floor(chunkSize * 0.08)));
}

async function generateEmbedding(text: string, geminiApiKey: string, retries = 3): Promise<number[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: text.substring(0, 30000) }] }
          }),
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }
      const embeddingData = await response.json();
      return embeddingData.embedding.values;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error('Failed to generate embedding after all retries');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      pdfContent, 
      pdfContents,
      title = "NMIMS Student Resource Book", 
      category = "University Policy",
      cleanupFirst = true,
      chunkSize = 1200,
      overlapSize = 120
    }: ProcessPDFRequest = await req.json();
    
    const rawText = Array.isArray(pdfContents) && pdfContents.length > 0
      ? pdfContents.join("\n\n---\n\n")
      : (pdfContent || "");

    if (!rawText || rawText.trim().length === 0) {
      throw new Error('PDF content is required');
    }

    const cleanedText = preprocessText(rawText);

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not found');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Processing PDF: "${title}" with ${cleanedText.length} characters`);

    if (cleanupFirst) {
      console.log('Cleaning up existing documents...');
      const { error: cleanupError } = await supabase.functions.invoke('cleanup-documents', {
        body: {
          category: category,
          title_pattern: `${title}%`
        }
      });
      if (cleanupError) {
        console.warn('Cleanup warning (continuing anyway):', cleanupError);
      }
    }

    const chunks = createIntelligentChunks(cleanedText, chunkSize, overlapSize);
    console.log(`Created ${chunks.length} chunks from PDF content`);

    const results = [];
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));

      const batchPromises = batch.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex;
        try {
          const embedding = await generateEmbedding(chunk, geminiApiKey);
          const wordCount = chunk.split(/\s+/).length;
          const startPos = cleanedText.indexOf(chunk.substring(0, 50));
          const endPos = startPos >= 0 ? startPos + chunk.length : -1;

          const metadata: ChunkMetadata = {
            chunk_index: chunkIndex,
            total_chunks: chunks.length,
            embedding: embedding,
            source_document: title,
            chunk_size: chunk.length,
            overlap_size: overlapSize,
            start_position: Math.max(0, startPos),
            end_position: Math.max(0, endPos),
            word_count: wordCount
          };

          const { error: insertError } = await supabase
            .from('documents')
            .insert({
              title: `${title} (Part ${chunkIndex + 1}/${chunks.length})`,
              content: chunk,
              category: category,
              metadata: metadata
            });

          if (insertError) {
            throw insertError;
          }

          return { success: true, chunkIndex: chunkIndex + 1, wordCount };

        } catch (error) {
          return { success: false, chunkIndex: chunkIndex + 1, error: (error as Error).message };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value.success).length;
    const failed = results.length - successful;
    const totalWords = results
      .filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value.success)
      .reduce((sum, r) => sum + ((r as PromiseFulfilledResult<any>).value.wordCount || 0), 0);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Successfully processed PDF "${title}"`,
        statistics: {
          total_chunks: chunks.length,
          successful_chunks: successful,
          failed_chunks: failed,
          total_characters: cleanedText.length,
          total_words: totalWords,
          average_chunk_size: Math.round(cleanedText.length / chunks.length),
          overlap_size: overlapSize
        },
        processing_details: {
          cleanup_performed: cleanupFirst,
          chunk_strategy: 'paragraph_sentence_overlap',
          batch_size: batchSize,
          embedding_model: 'text-embedding-004'
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
