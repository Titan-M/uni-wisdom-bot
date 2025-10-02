import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

interface AnswerRequest {
  query: string;
  top_k?: number;
  max_tokens?: number;
  contextOverride?: string[]; // optional raw context snippets provided by client
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, top_k = 3, contextOverride }: AnswerRequest = await req.json();

    if (!query || typeof query !== 'string') {
      throw new Error('Query text is required');
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not found');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // If client provided contextOverride, use it directly to build the answer
    let contextText = '';
    let ranked: any[] = [];
    let documents: any[] = [];

    if (Array.isArray(contextOverride) && contextOverride.length > 0) {
      contextText = contextOverride.join('\n\n---\n\n');
      // Still fetch documents for sources metadata
      const { data: docs, error: fetchError } = await supabase
        .from('documents')
        .select('*');

      if (!fetchError && docs) {
        documents = docs;
        // For contextOverride, we'll create a simple ranked array based on available docs
        // This is a simplified approach - in a real implementation you might want to
        // match the contextOverride snippets to actual documents
        ranked = documents.slice(0, Math.min(top_k, 3)).map(doc => ({
          doc,
          similarity: 0.8 // Placeholder similarity since we don't have embeddings for contextOverride
        }));
      }
    } else {
      // 1) Create embedding for the query
      const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: query }] },
          }),
        }
      );

      if (!embedRes.ok) {
        const errText = await embedRes.text();
        console.error('Gemini embed error:', errText);
        throw new Error(`Gemini embed error: ${embedRes.status}`);
      }

      const embedJson = await embedRes.json();
      const queryEmbedding: number[] = embedJson.embedding.values;

      // 2) Fetch all documents and compute similarity in memory
      const { data: docs, error: fetchError } = await supabase
        .from('documents')
        .select('*');

      if (fetchError) {
        console.error('DB fetch error:', fetchError);
        throw fetchError;
      }

      documents = docs || [];
      const k = Math.max(3, Math.min(top_k || 3, 6));
      // Rank by cosine, then add a tiny bonus if the chunk includes keywords or numbers (helps pull policies)
      let prelim = (documents || [])
        .map((doc: any) => {
          const emb = doc?.metadata?.embedding;
          const content: string = doc?.content || '';
          if (!emb || !Array.isArray(emb)) return { doc, similarity: 0 };
          let sim = cosineSimilarity(queryEmbedding, emb);
          const text = content.toLowerCase();
          const hasNum = /\b\d{1,3}%\b/.test(content);
          const hasAttn = text.includes('attend') || text.includes('examin') || text.includes('eligib');
          if (hasNum) sim += 0.02;
          if (hasAttn) sim += 0.02;
          return { doc, similarity: sim };
        })
        .filter((r) => r.similarity > 0.05)
        .sort((a, b) => b.similarity - a.similarity);

      ranked = prelim.slice(0, k);

      // Neighbor expansion: include adjacent chunks per top hit to capture complete rules
      const byTitle: Record<string, any[]> = {};
      for (const d of (documents || [])) {
        const t = d.title;
        if (!byTitle[t]) byTitle[t] = [];
        byTitle[t].push(d);
      }
      for (const t in byTitle) {
        byTitle[t].sort((a, b) => (a.metadata?.chunk_index ?? 0) - (b.metadata?.chunk_index ?? 0));
      }

      const contextSet: string[] = [];
      const seen = new Set<string>();
      const pushContent = (c?: string) => {
        if (!c) return;
        const key = c.slice(0, 120);
        if (!seen.has(key)) { seen.add(key); contextSet.push(c); }
      };

      for (const r of ranked) {
        const doc = r.doc;
        pushContent(doc.content);
        const title = doc.title;
        const idx = doc.metadata?.chunk_index ?? 0;
        const group = byTitle[title] || [];
        const addByIndex = (j: number) => {
          const found = group.find((g: any) => (g.metadata?.chunk_index ?? -1) === j);
          if (found) pushContent(found.content);
        };
        addByIndex(idx - 1);
        addByIndex(idx + 1);
        addByIndex(idx - 2);
        addByIndex(idx + 2);
        if (contextSet.length >= 10) break;
      }

      contextText = contextSet.join('\n\n---\n\n');
    }

    if (!ranked.length && !contextOverride) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No relevant documents found',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    const prompt = `You are a helpful assistant. Answer ONLY using the provided excerpts from the NMIMS Student Resource Book. If there is truly no relevant information in the excerpts, reply exactly: "I don't know based on the provided document." Otherwise, give a concise, clear answer. Be decisive if the excerpts contain relevant rules.

Rules (plain text, no markdown tables):
- First line: state the exact numeric requirement(s) if present (e.g., "Eligible with ≥80% attendance per course").
- Then up to 4 bullets (start with "- ") covering: counting period, relaxations/allowances, documentation deadlines, consequences of shortfall.
- Prefer concrete rules, numbers, limits, and eligibility criteria.
- Total length <= 120 words.
- No introductions, no disclaimers, no references to "document" or "context".
- Paraphrase; do not quote large passages.

Question:
"""${query}"""

Excerpts:
"""
${contextText}
"""

Answer:`;

    // 4) Generate a concise answer with Gemini using model discovery and v1beta endpoint
    async function listModels(): Promise<{ name: string, supportedGenerationMethods?: string[] }[]> {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        method: 'GET',
        headers: {
          'x-goog-api-key': geminiApiKey!,
        },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`ListModels failed: ${res.status}${t ? ` - ${t}` : ''}`);
      }
      const json = await res.json();
      return json?.models || [];
    }

    function pickModel(models: { name: string, supportedGenerationMethods?: string[] }[]): string[] {
      // Extract model ids without the 'models/' prefix and rank by preference
      const usable = models
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name) // e.g., 'models/gemini-2.5-flash'
        .filter(Boolean);

      const preferred = [
        'models/gemini-2.5-flash',
        'models/gemini-2.5-flash-lite',
        'models/gemini-1.5-flash',
        'models/gemini-1.5-flash-latest',
      ];

      const ranked: string[] = [];
      for (const p of preferred) {
        const exact = usable.find(u => u === p);
        if (exact) ranked.push(exact);
      }
      // As a last resort, take any flash model
      for (const u of usable) {
        if (!ranked.includes(u) && /gemini-.*flash/i.test(u)) ranked.push(u);
      }
      // Final fallback: any model that supports generateContent
      for (const u of usable) {
        if (!ranked.includes(u)) ranked.push(u);
      }
      return ranked;
    }

    async function tryGenerate(promptText: string): Promise<{ text: string, model: string }> {
      const models = await listModels();
      const candidates = pickModel(models);
      let lastErr = '';
      for (const modelName of candidates) {
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiApiKey!,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 192 },
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && typeof text === 'string' && text.trim().length > 0) {
            return { text, model: modelName };
          }
          lastErr = 'empty response';
          continue;
        } else {
          const t = await res.text().catch(() => '');
          lastErr = `${res.status}${t ? ` - ${t}` : ''}`;
          // Try next model
          continue;
        }
      }
      throw new Error(`Gemini generate error: ${lastErr || 'no_usable_model'}`);
    }

    const { text: answerText, model: usedModel } = await tryGenerate(prompt);
    

    const sources = ranked.map((r) => ({
      id: r.doc.id,
      title: r.doc.title,
      chunk_index: r.doc.metadata?.chunk_index ?? null,
      similarity: r.similarity,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        answer: answerText,
        sources,
        used_model: usedModel || 'auto',
        total_documents_considered: (typeof documents !== 'undefined' && documents) ? documents.length : undefined,
        top_k: undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('Error in answer-question function:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});