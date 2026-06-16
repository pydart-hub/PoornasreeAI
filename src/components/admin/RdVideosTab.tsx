"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Film, Upload, Trash2 } from "lucide-react";

interface RdVideo {
  id: string;
  title: string;
  description?: string | null;
  youtubeUrl: string;
  keywords: string;
  uploadedBy: { id: string; firstName: string; lastName?: string | null };
  createdAt: string;
}

export default function RdVideosTab() {
  const [videos, setVideos] = useState<RdVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [keywords, setKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rd-videos", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setVideos(data.videos);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleUpload = async () => {
    if (!youtubeUrl.trim() || !title.trim()) {
      setError("Title and YouTube URL are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/rd-videos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, youtubeUrl, keywords }),
      });
      const data = await res.json();
      if (res.ok) {
        setTitle("");
        setDescription("");
        setYoutubeUrl("");
        setKeywords("");
        fetchVideos();
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Upload failed");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/rd-videos/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) setVideos(prev => prev.filter(v => v.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
        <Film className="w-5 h-5" /> R&D Videos ({videos.length})
      </h2>

      {/* Upload form */}
      <div className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-3">
        <h3 className="text-sm font-semibold text-content dark:text-content-dark">Upload R&D Video</h3>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Video title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="YouTube URL"
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
            <input
              type="text"
              placeholder="Keywords (comma separated)"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={handleUpload}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload
        </button>
      </div>

      {/* Video list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : videos.length === 0 ? (
        <p className="text-center py-12 text-content-secondary text-sm">No R&D videos uploaded</p>
      ) : (
        <div className="space-y-2">
          {videos.map(v => (
            <div key={v.id} className="flex items-center justify-between p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
              <div>
                <p className="text-sm font-medium text-content dark:text-content-dark">{v.title}</p>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                  {v.description ? `${v.description} — ` : ""}
                  {v.keywords ? `Keywords: ${v.keywords} — ` : ""}
                  Uploaded by {v.uploadedBy.firstName}
                  {" — "}{new Date(v.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(v.id)}
                disabled={deletingId === v.id}
                className="p-2 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                {deletingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
