import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 5 } = await req.json();
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not found');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Searching for: "${query}"`);

    // Generate embedding for the query
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
            parts: [{ text: query }]
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
    const queryEmbedding = embeddingData.embedding.values;

    // Get all documents with their embeddings
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('*');

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      throw fetchError;
    }

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ 
          results: [],
          message: "No documents found in database"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate similarity scores for each document
    const resultsWithScores = documents
      .map(doc => {
        const docEmbedding = doc.metadata?.embedding;
        if (!docEmbedding || !Array.isArray(docEmbedding)) {
          return { ...doc, similarity: 0 };
        }
        
        const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
        return { ...doc, similarity };
      })
      .filter(doc => doc.similarity > 0.1) // Filter out very low similarity scores
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`Found ${resultsWithScores.length} relevant documents`);

    return new Response(
      JSON.stringify({ 
        results: resultsWithScores,
        query: query,
        total_documents_searched: documents.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in semantic-search function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        results: []
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});