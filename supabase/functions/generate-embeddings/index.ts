import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, title, category } = await req.json();
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not found');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Split content into chunks (roughly 1000 characters each)
    const chunkSize = 1000;
    const chunks = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.substring(i, i + chunkSize));
    }

    console.log(`Processing ${chunks.length} chunks for "${title}"`);

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Generate embedding using Gemini
      const embeddingResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: {
              parts: [{ text: chunk }]
            }
          }),
        }
      );

      if (!embeddingResponse.ok) {
        const errorText = await embeddingResponse.text();
        console.error('Gemini API error:', errorText);
        throw new Error(`Gemini API error: ${embeddingResponse.status}`);
      }

      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.embedding.values;

      // Store chunk with embedding in database
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          title: `${title} (Part ${i + 1}/${chunks.length})`,
          content: chunk,
          category: category || null,
          metadata: {
            chunk_index: i,
            total_chunks: chunks.length,
            embedding: embedding,
            source_document: title
          }
        });

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw insertError;
      }

      console.log(`Processed chunk ${i + 1}/${chunks.length}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${chunks.length} chunks from "${title}"`,
        chunks_processed: chunks.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in generate-embeddings function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});