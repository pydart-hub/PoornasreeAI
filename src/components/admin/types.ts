// Shared types for admin page and tab components

export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: string;
  createdAt: string;
  _count: { conversations: number };
}

export interface ApiDocument {
  id: string;
  title: string;
  filePath: string;
  createdAt: string;
  uploadedBy: string;
  chunkCount: number;
  documentType: "service" | "customer";
  status: "trained" | "pending";
}

export interface ApiVideo {
  id: string;
  title: string;
  description?: string | null;
  youtubeUrl: string;
  keywords: string;
  createdAt: string;
}
