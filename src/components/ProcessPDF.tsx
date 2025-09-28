import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, CheckCircle, FileText, AlertCircle, Database, Zap } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from 'pdfjs-dist';

// Configure the PDF.js worker (hosted via CDN)
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

// Extract text from a PDF File using pdfjs-dist
async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ normalizeWhitespace: true, includeMarkedContent: false } as any);
    const strings = (content.items as any[]).map((item) => (item.str ?? '') as string);
    fullText += strings.join(' ') + '\n\n';
  }
  await pdf.destroy();
  return fullText.trim();
}

export const ProcessPDF = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [cleanupFirst, setCleanupFirst] = useState(true);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: any) => {
    const selected = Array.from(e.target.files || []) as File[];
    setFiles(selected);
    if (selected.length > 0) {
      const derived = selected.map(f => f.name.replace(/\.pdf$/i, '')).join(' + ');
      setTitle(derived);
    }
  };

  const processPDF = async () => {
    if (files.length === 0) {
      setStatus('error');
      setMessage('Please select at least one PDF file.');
      return;
    }

    setIsProcessing(true);
    setStatus('processing');
    setMessage('Extracting text from PDF(s)...');
    setProgress(10);

    try {
      const pdfContents: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const text = await extractPdfText(files[i]);
        pdfContents.push(text);
        setMessage(`Extracted ${i + 1}/${files.length} file(s)...`);
        setProgress(Math.min(80, Math.round(((i + 1) / files.length) * 70)));
      }

      setMessage('Generating embeddings and storing in database...');
      setProgress(85);

      const { data, error } = await supabase.functions.invoke('process-complete-pdf', {
        body: {
          pdfContents,
          title: title || files.map(f => f.name.replace(/\.pdf$/i, '')).join(' + '),
          category: 'University Policy',
          cleanupFirst,
          chunkSize: 1200,
          overlapSize: 120,
        }
      });

      if (error) {
        console.error('Error processing PDF:', error);
        setStatus('error');
        setMessage(`Error: ${error.message || 'Failed to process PDF'}`);
        setProgress(0);
        return;
      }

      setProgress(100);
      setStatus('success');
      setMessage(data?.message || 'PDF processed successfully! The chatbot can now answer questions with improved accuracy.');
      console.log('PDF processing result:', data);

    } catch (error) {
      console.error('Error processing PDF:', error);
      setStatus('error');
      setMessage('Failed to process PDF. Please try again.');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Process NMIMS Student Resource Book
        </CardTitle>
        <CardDescription>
          Generate Gemini embeddings for the NMIMS Student Resource Book to enable intelligent chatbot responses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload controls */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm font-medium">Select PDF file(s)</span>
          </div>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileChange}
            disabled={isProcessing}
            className="block w-full text-sm"
          />
          {files.length > 0 && (
            <div className="grid gap-1 text-xs text-muted-foreground">
              {files.map((f) => (
                <div key={f.name}>{f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)</div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isProcessing}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={cleanupFirst}
                onChange={(e) => setCleanupFirst(e.target.checked)}
                disabled={isProcessing}
              />
              <span className="flex items-center gap-1"><Database className="h-3 w-3" /> Clean previous chunks for this title</span>
            </label>
          </div>
        </div>

        {/* Primary action button */}
        <Button 
          onClick={processPDF} 
          disabled={isProcessing || files.length === 0}
          className="w-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Extract & Generate Embeddings
            </>
          )}
        </Button>

        {status === 'processing' && (
          <div className="space-y-3">
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {status === 'success' && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="text-green-600">{message}</AlertDescription>
          </Alert>
        )}

        {status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {status === 'success' && (
          <Button 
            onClick={() => {
              setStatus('idle');
              setMessage('');
              setFiles([]);
              setProgress(0);
            }}
            variant="outline"
            className="w-full"
          >
            Process Another PDF
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
