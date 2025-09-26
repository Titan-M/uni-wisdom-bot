import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: string;
  isUser: boolean;
  timestamp?: string;
}

export const ChatMessage = ({ message, isUser, timestamp }: ChatMessageProps) => {
  return (
    <div className={cn(
      "flex w-full mb-4",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 transition-smooth",
        isUser 
          ? "bg-chat-bubble-user text-chat-bubble-user-foreground ml-auto" 
          : "bg-chat-bubble-assistant text-chat-bubble-assistant-foreground border border-border shadow-sm"
      )}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
        {timestamp && (
          <span className={cn(
            "text-xs mt-2 block opacity-70",
            isUser ? "text-right" : "text-left"
          )}>
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
};