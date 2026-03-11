export interface VideoResource {
  id: string;
  title: string;
  description?: string | null;
  youtubeUrl: string;
  keywords: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  videos?: VideoResource[];
  sources?: { title: string; snippet: string }[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
