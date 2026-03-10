"use client";

import {
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  Youtube,
  User,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MessageBubbleProps {
  msg: ChatMessage;
  liked?: boolean | null;
  onLike?: (v: boolean) => void;
  youtubeQuery?: string;
  speakingId?: string | null;
  onSpeak?: (msgId: string, text: string) => void;
  translatedContent?: string;
}

export default function MessageBubble({
  msg,
  liked,
  onLike,
  youtubeQuery,
  speakingId,
  onSpeak,
  translatedContent,
}: MessageBubbleProps) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-2 items-end">
        <div className="max-w-[80%] sm:max-w-[65%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary text-white text-sm font-medium shadow-sm">
          {msg.content}
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-primary dark:text-primary-300" />
        </div>
      </div>
    );
  }

  const isSpeaking = speakingId === msg.id;
  const ytSearchUrl = youtubeQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery + " troubleshooting repair")}`
    : null;

  return (
    <div className="flex items-end gap-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
        <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
      </div>
      <div className="flex-1 space-y-2.5 max-w-[90%] sm:max-w-[80%]">
        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-sm">
          <p className="text-sm text-content dark:text-content-dark whitespace-pre-line leading-relaxed">
            {(translatedContent || msg.content).replace(/\*\*(.*?)\*\*/g, "$1")}
          </p>
        </div>

        {ytSearchUrl && msg.id !== "welcome" && (
          <a
            href={ytSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors group"
          >
            <div className="shrink-0 p-1.5 rounded-lg bg-red-100 dark:bg-red-500/20">
              <Youtube className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                Watch related videos on YouTube
              </p>
              <p className="text-[10px] text-red-500 dark:text-red-400 truncate">
                Search: {youtubeQuery}
              </p>
            </div>
            <span className="text-xs text-red-400 group-hover:text-red-500 dark:group-hover:text-red-300">&rarr;</span>
          </a>
        )}

        <div className="flex items-center gap-2 pl-1">
          {onLike && (
            <>
              <span className="text-xs text-content-secondary dark:text-content-dark-secondary">Was this helpful?</span>
              <button
                onClick={() => onLike(true)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  liked === true
                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onLike(false)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  liked === false
                    ? "bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400"
                    : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {onSpeak && msg.id !== "welcome" && (
            <button
              onClick={() => onSpeak(msg.id, translatedContent || msg.content)}
              className={cn(
                "p-1.5 rounded-lg transition-colors ml-1",
                isSpeaking
                  ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                  : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              )}
              title={isSpeaking ? "Stop speaking" : "Listen to response"}
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
