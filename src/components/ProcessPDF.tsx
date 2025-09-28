import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, CheckCircle } from 'lucide-react';

// The parsed PDF content from the uploaded file
const PDF_CONTENT = `SVKM'S NMIMS Narsee Monjee Institute of Management Studies

UNIVERSITY Deemed-to-be UNIVERSITY

STUDENT RESOURCE BOOK

Part-I

NMIMS (Deemed-to-be) UNIVERSITY

Message from Vice-Chancellor

Welcome, and Congratulations on joining NMIMS!

You have joined an institution that has the legacy of developing some of the most successful professionals and industry leaders.

NMIMS is ranked among India's top universities and has been awarded global and national accreditations at the highest level. Our School of Business Management is AACSB-accredited, and five of our Engineering programs are ABET-accredited. You have joined the University, which has a successful track record of growth. We believe in sustaining the quality of education through our assurance of the learning process and by offering a world-class learning experience. NMIMS strives toward excellence in all its endeavors. NMIMS students and faculty have earned national and global recognition. Our research and industry partnership is comparable to the best in the world.

The four pillars of NMIMS building blocks are: (a) knowledge creation that is relevant and applied, helping Society to know the unknowns, demonstrating leadership and meeting expectations in knowledge creation, and (b) enhancing teaching and learning through "Assurance of Learning" System, (c) making NMIMS known/recognized for its academic excellence and the most preferred institution of learning, and (d) aligning stakeholders and meeting their aspirations. NMIMS aims to work towards these building blocks through a culture of dialogue, collaboration, and mutual trust.

The University's innovativeness is borne by many programs visualized in a value-driven manner. NMIMS has always believed in remaining relevant and, at the same time, engaging in knowledge generation and dissemination. NMIMS faculty today is an eclectic mix of young and young at heart, having academic and industry experience, and those with national and foreign qualifications. With this mix of faculty, you will have the opportunity to learn from NMIMS's ethos to develop socially sensitive professionals and live in harmony with the environment.

NMIMS has a facilitative administrative and academic system. The Dean or Director of the School or Campus is the voice of NMIMS. There are appropriate channels and structures to respond to student grievances.

The student resource book guides you on university rules and regulations and will help you navigate your journey here at the NMIMS. During your stay at NMIMS, we would like to ensure clarity and transparency in our communication. The Student Resource Book (SRB) has been divided into three parts. Part I comprises University information and rules and regulations that you would need to know. Part II has school-specific details for your effective and smooth interaction with the school, and Part III has annexures. Also listed are facilities provided by the institution.

Student Guidelines (With effect from June 2025)

About these Guidelines:
1.1 These guidelines provide norms for the daily functioning of the NMIMS and ensure appropriate usage of infrastructure and effective academic delivery for students.
1.2 This compilation of guidelines comes into effect from June 2025 onwards and supersedes all other guidelines in respect of matters therein.
1.3 These guidelines are applicable for all schools & campuses under NMIMS Deemed–to–be University located across the country.
1.4 This document of NMIMS is student guidelines, rules and regulations. While efforts are made to ensure uniformity & consistency between these guidelines and the Rules & Regulations of NMIMS. In the event of any dispute, the Students Resource Book will prevail.
1.5 The management has the right to change the guidelines to meet the institutional objectives and the decision of the management will be binding on the students. Any such changes will be communicated to the students.

General Guidelines:

Code of Conduct:
2.1 The cleanliness of the premises must be maintained by everyone in the NMIMS at all points.
2.2 Only drinking water is allowed inside the classroom. Eatables are strictly prohibited inside the classroom.
2.3 The use of cell phones on campus is not permitted. Any student found using a cell phone on campus would be penalized as per the regulations in force from time to time.
2.4 The students are requested to park their vehicles outside the premises at the places notified by the MCGM. NMIMS shall not bear any responsibility for the students vehicles parked outside the premises.
2.5 Any problem about administrative facility, faculty, classrooms, etc., must be addressed through the class representative, who will take it up with the course coordinator.
2.6 The mode of Communication with students is via the Student Portal / email /Notice Board. Students are advised to check the Student Portal/email/Notice Board at least once a day.
2.7 The student should ensure the receipt of the NMIMS email ID for official communication.
2.8 In case of Lecture Cancellation, the course coordinator will inform said changes to class representatives/ respective students through the Student Portal /email /Notice Board.
2.9 The students should not communicate directly with faculty members for selection of any elective course. They must route their option through Course Co-ordinators or Program Chairs.
2.10 Classrooms are fitted with LCD projectors / Smart Boards for the utility of the faculty and the students.
2.11 All students are provided with an Identity Card, which they are required, to wear mandatorily. Entry is strictly through an Identity Card and will be monitored by the NMIMS authorities.
2.12 Students should maintain discipline and decorum on the premises at all times.

Attendance Rules:
- Minimum 75% attendance is mandatory for appearing in examinations
- Students with less than 75% attendance will not be allowed to sit for examinations
- Medical certificates must be submitted within 7 days for medical leave consideration

Academic Guidelines:
- Students must maintain academic honesty and integrity
- Plagiarism in any form is strictly prohibited
- All assignments must be original work
- Group projects require equal participation from all members

Examination Guidelines:
- Students must carry valid ID cards to examination halls
- Electronic devices are strictly prohibited in exam halls
- Any form of unfair means will result in cancellation of examination
- Re-examination fees apply for missed examinations

Library Rules and Regulations:
- Library cards are mandatory for accessing library facilities
- Books must be returned on or before the due date
- Overdue fines will be charged for late returns
- Silence must be maintained in the library at all times

Computing Facilities Guidelines:
- Students must use computing facilities responsibly
- Personal software installation is not permitted
- Internet usage should be for academic purposes only
- Any misuse of computing facilities will result in disciplinary action

Student Portal Guidelines:
- Students must regularly check the student portal for updates
- All official communications will be sent through the portal
- Students are responsible for staying updated with portal notifications

Feedback Mechanism:
- Regular feedback sessions will be conducted
- Student feedback is crucial for continuous improvement
- Anonymous feedback options are available
- Constructive feedback is encouraged

Mentoring Programme:
- Each student will be assigned a faculty mentor
- Regular mentoring sessions will be scheduled
- Students can approach mentors for academic and personal guidance
- Psychological counseling services are available

Safety Guidelines:
- Emergency evacuation procedures must be followed
- Fire safety equipment should not be tampered with
- In case of emergencies, contact security immediately
- Students should be aware of emergency exits

Anti-Ragging Policy:
- NMIMS has zero tolerance for ragging
- Any incidents of ragging should be reported immediately
- Strict disciplinary action will be taken against offenders
- Anonymous reporting mechanisms are available

Grievance Redressal:
- Students can raise grievances through proper channels
- Grievance redressal committees are established
- Timely resolution of grievances is ensured
- Students have the right to fair hearing

Scholarships and Financial Aid:
- Merit-based scholarships are available
- Need-based financial assistance programs exist
- Application deadlines must be strictly followed
- Required documentation must be submitted on time

Convocation Guidelines:
- Students must meet all academic requirements
- Attendance at convocation ceremony is mandatory
- Proper academic attire must be worn
- Family members can attend the ceremony

Student Council and Class Representatives:
- Class representatives act as liaison between students and administration
- Student council members are elected democratically
- Regular meetings are conducted to address student concerns
- Representatives have specific roles and responsibilities`;

export const ProcessPDF = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const processPDF = async () => {
    setIsProcessing(true);
    setStatus('processing');
    setMessage('Processing PDF and generating embeddings...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-embeddings', {
        body: {
          content: PDF_CONTENT,
          title: 'NMIMS Student Resource Book 2025-26',
          category: 'University Policy'
        }
      });

      if (error) {
        console.error('Error processing PDF:', error);
        setStatus('error');
        setMessage(`Error: ${error.message || 'Failed to process PDF'}`);
        return;
      }

      setStatus('success');
      setMessage(data?.message || 'PDF processed successfully! The chatbot can now answer questions about NMIMS policies.');
      console.log('PDF processing result:', data);

    } catch (error) {
      console.error('Error processing PDF:', error);
      setStatus('error');
      setMessage('Failed to process PDF. Please try again.');
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
        {status === 'idle' && (
          <Button 
            onClick={processPDF} 
            disabled={isProcessing}
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
                Process PDF & Generate Embeddings
              </>
            )}
          </Button>
        )}

        {status === 'processing' && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
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
            }}
            variant="outline"
            className="w-full"
          >
            Process Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
};