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
    const { category, title_pattern } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Cleaning up documents with category: ${category}, title pattern: ${title_pattern}`);

    // Build the delete query based on parameters
    let query = supabase.from('documents').delete();

    if (category) {
      query = query.eq('category', category);
    }

    if (title_pattern) {
      query = query.like('title', title_pattern);
    }

    // If no filters provided, delete all documents (be careful!)
    if (!category && !title_pattern) {
      query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // This will delete all records
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Database cleanup error:', error);
      throw error;
    }

    console.log(`Successfully deleted ${count || 0} documents`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Successfully deleted ${count || 0} documents`,
        deleted_count: count || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in cleanup-documents function:', error);
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