import { useState, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ProcessPDF } from "@/components/ProcessPDF";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GraduationCap, Users, DollarSign, Home, BookMarked, HeadphonesIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: string;
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      content: "Hello! I'm your Student Resource Book assistant. I can help you find information about NMIMS policies, academic programs, student services, campus facilities, and much more. What would you like to know?",
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);

  const commonQuestions = [
    { 
      id: 1, 
      question: "What are the attendance requirements at NMIMS?", 
      category: "academics", 
      icon: BookMarked, 
      color: "bg-blue-500/10 text-blue-600 border-blue-200" 
    },
    { 
      id: 2, 
      question: "What are the guidelines for scholarships and financial aid?", 
      category: "finance", 
      icon: DollarSign, 
      color: "bg-green-500/10 text-green-600 border-green-200" 
    },
    { 
      id: 3, 
      question: "What are the rules for using campus facilities?", 
      category: "campus", 
      icon: Home, 
      color: "bg-purple-500/10 text-purple-600 border-purple-200" 
    },
    { 
      id: 4, 
      question: "How do I register for courses and electives?", 
      category: "enrollment", 
      icon: Users, 
      color: "bg-orange-500/10 text-orange-600 border-orange-200" 
    },
    { 
      id: 5, 
      question: "What are the library rules and regulations?", 
      category: "services", 
      icon: BookOpen, 
      color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" 
    },
    { 
      id: 6, 
      question: "What support services are available for students?", 
      category: "support", 
      icon: HeadphonesIcon, 
      color: "bg-pink-500/10 text-pink-600 border-pink-200" 
    }
  ];

  useEffect(() => {
    // Remove the automatic document fetching since we now search on demand
  }, []);

  const fetchDocuments = async (query: string) => {
    try {
      console.log('Searching with query:', query);
      
      // Use the new semantic search function
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: { query, limit: 5 }
      });

      if (error) {
        console.error('Semantic search error:', error);
        return [];
      }

      const results = data?.results || [];
      console.log('Search results:', results);
      return results;
    } catch (error) {
      console.error('Error in fetchDocuments:', error);
      return [];
    }
  };

  const handleSendMessage = async (message: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Store the user query in the database
      await supabase
        .from('student_queries')
        .insert([{ question: message }]);

      // Get a concise answer via the answer-question function (top_k kept small for precision)
      const { data: answerData, error: answerError } = await supabase.functions.invoke('answer-question', {
        body: { query: message, top_k: 8 }
      });

      let responseContent = "";

      const needsFallback = !!answerError || !answerData || answerData?.success === false || !answerData?.answer;
      if (needsFallback) {
        if (answerError) console.error('Answer generation error:', answerError);
        // Fallback: use semantic search and then call the formatter with a context override
        const relevantDocs = await fetchDocuments(message);
        if (relevantDocs.length > 0) {
          const top = relevantDocs.slice(0, 8);
          const contextOverride = top.map((d: any) => d.content);
          const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('answer-question', {
            body: { query: message, top_k: 8, contextOverride }
          });
          if (!fallbackError && fallbackData?.answer) {
            responseContent = fallbackData.answer.trim();
          } else {
            responseContent = "I couldn't find that in the Student Resource Book. Please rephrase or ask a simpler follow-up.";
          }
        } else {
          responseContent = "I couldn't find that in the Student Resource Book. Please rephrase or ask a simpler follow-up.";
        }
      } else {
        responseContent = (answerData?.answer || "I couldn't generate an answer right now.").trim();
        // Keep replies clean; no inline sources
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseContent,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I encountered an error while processing your question. Please try again.",
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuestionClick = (question: string) => {
    handleSendMessage(question);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gradient-primary rounded-lg">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Student Resource Assistant
              </h1>
              <p className="text-sm text-muted-foreground">
                Your guide to college resources and policies
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Common Questions Section */}
      {messages.length === 1 && (
        <div className="max-w-4xl mx-auto w-full px-4 py-6">
          <div className="mb-8">
            <ProcessPDF />
          </div>
          
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3">Common Questions</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Click on any question below to get started, or type your own question.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {commonQuestions.map((item) => {
                const Icon = item.icon;
                return (
                  <Card 
                    key={item.id} 
                    className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${item.color} border`}
                    onClick={() => handleQuestionClick(item.question)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-background/50">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-relaxed">
                            {item.question}
                          </p>
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {item.category}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 max-w-4xl mx-auto w-full">
        <ScrollArea className="h-full">
          <div className="px-4 py-6 space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message.content}
                isUser={message.isUser}
                timestamp={message.timestamp}
              />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-chat-bubble-assistant border border-border rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Input */}
      <div className="max-w-4xl mx-auto w-full">
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Ask about academic policies, student services, campus facilities..."
        />
      </div>
    </div>
  );
};

export default Chat;