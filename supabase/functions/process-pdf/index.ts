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
    const { pdfContent, title = "NMIMS Student Resource Book" } = await req.json();
    
    if (!pdfContent) {
      throw new Error('PDF content is required');
    }

    // Initialize Supabase client  
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Processing PDF: "${title}"`);

    // Call the generate-embeddings function to process the content
    const { data, error } = await supabase.functions.invoke('generate-embeddings', {
      body: {
        content: pdfContent,
        title: title,
        category: 'University Policy'
      }
    });

    if (error) {
      console.error('Error calling generate-embeddings:', error);
      throw error;
    }

    console.log('PDF processing completed:', data);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Successfully processed PDF: "${title}"`,
        data: data
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in process-pdf function:', error);
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