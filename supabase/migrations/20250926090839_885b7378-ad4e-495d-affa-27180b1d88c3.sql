-- Create table for document content (simplified without vector embeddings for now)
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for student queries/prompts
CREATE TABLE public.student_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT,
  is_answered BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security but make tables publicly accessible
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_queries ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Anyone can view documents" 
ON public.documents 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can view student queries" 
ON public.student_queries 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create student queries" 
ON public.student_queries 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_documents_category ON public.documents(category);
CREATE INDEX idx_documents_created_at ON public.documents(created_at);
CREATE INDEX idx_student_queries_created_at ON public.student_queries(created_at);
CREATE INDEX idx_student_queries_answered ON public.student_queries(is_answered);

-- Insert sample common questions and documents
INSERT INTO public.documents (title, content, category) VALUES
('Academic Calendar', 'The academic year runs from September to June, divided into two semesters. Fall semester: September-December, Spring semester: January-May. Summer sessions available May-August.', 'academics'),
('Enrollment Process', 'Students must complete registration during designated enrollment periods. Priority given to returning students, then new admits. Late registration incurs additional fees.', 'enrollment'),
('Financial Aid', 'Various financial aid options available including scholarships, grants, loans, and work-study programs. FAFSA required for federal aid consideration.', 'finance'),
('Campus Housing', 'On-campus housing includes dormitories and apartments. Housing applications due by May 1st for fall semester. Meal plans required for all residents.', 'housing'),
('Library Services', 'Library open 24/7 during semester. Services include book checkout, research assistance, computer labs, study rooms, and online database access.', 'services'),
('Student Support', 'Counseling services, tutoring center, career services, and disability support available. Health center provides basic medical care and mental health resources.', 'support');