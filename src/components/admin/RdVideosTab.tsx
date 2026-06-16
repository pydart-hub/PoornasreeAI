"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Film, Pencil, Plus, Trash2, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
  
  const [videoForm, setVideoForm] = useState({ title: "", description: "", youtubeUrl: "", keywords: "" });
  const [videoFormError, setVideoFormError] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [editingVideo, setEditingVideo] = useState<RdVideo | null>(null);
  
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

  const handleSaveVideo = useCallback(async () => {
    setVideoFormError("");
    const { title, description, youtubeUrl, keywords } = videoForm;
    if (!title.trim() || !youtubeUrl.trim() || !keywords.trim()) {
      setVideoFormError("Title, YouTube URL, and keywords are required.");
      return;
    }
    setSavingVideo(true);
    try {
      const url = editingVideo ? `/api/admin/rd-videos/${editingVideo.id}` : "/api/admin/rd-videos";
      const method = editingVideo ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, youtubeUrl, keywords }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchVideos();
        setEditingVideo(null);
        setVideoForm({ title: "", description: "", youtubeUrl: "", keywords: "" });
      } else {
        setVideoFormError(data.error || "Failed to save video.");
      }
    } catch {
      setVideoFormError("An unexpected error occurred.");
    } finally {
      setSavingVideo(false);
    }
  }, [videoForm, editingVideo, fetchVideos]);

  const startEditVideo = useCallback((v: RdVideo) => {
    setEditingVideo(v);
    setVideoForm({ title: v.title, description: v.description ?? "", youtubeUrl: v.youtubeUrl, keywords: v.keywords });
    setVideoFormError("");
  }, []);

  const cancelEditVideo = useCallback(() => {
    setEditingVideo(null);
    setVideoForm({ title: "", description: "", youtubeUrl: "", keywords: "" });
    setVideoFormError("");
  }, []);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-content dark:text-content-dark">
          R&D Videos ({videos.length})
        </h2>
      </div>

      <p className="text-sm text-content-secondary dark:text-content-dark-secondary -mt-4">
        Add YouTube videos here. They will be automatically sent to engineers on WhatsApp when troubleshooting steps match the keywords.
      </p>

      {/* Add / Edit form */}
      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-content dark:text-content-dark">
          {editingVideo ? "Edit Video" : "Add New Video"}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Title *</label>
            <input
              value={videoForm.title}
              onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. How to calibrate VIBRO milk analyzer"
              className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">YouTube URL *</label>
            <input
              value={videoForm.youtubeUrl}
              onChange={(e) => setVideoForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Keywords * <span className="font-normal">(comma-separated)</span></label>
            <input
              value={videoForm.keywords}
              onChange={(e) => setVideoForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder="e.g. vibro,calibration,fat,snf,milk"
              className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Description <span className="font-normal">(optional)</span></label>
            <input
              value={videoForm.description}
              onChange={(e) => setVideoForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description shown under the title"
              className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {videoFormError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {videoFormError}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveVideo}
            disabled={savingVideo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            {savingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : editingVideo ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingVideo ? "Save Changes" : "Add Video"}
          </button>
          {editingVideo && (
            <button
              onClick={cancelEditVideo}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-line-dark text-sm text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Video list */}
      {loading && videos.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-line dark:border-line-dark">
          <Film className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-40" />
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No R&D videos added yet</p>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">Add YouTube videos above — they will be sent to engineers on WhatsApp</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
          {videos.map((v, i) => {
            const videoId = (() => {
              try {
                const u = new URL(v.youtubeUrl);
                if (u.hostname === "youtu.be") return u.pathname.slice(1);
                return u.searchParams.get("v") ?? "";
              } catch { return ""; }
            })();
            const thumb = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
            return (
              <div
                key={v.id}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors",
                  i < videos.length - 1 && "border-b border-line dark:border-line-dark"
                )}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={v.title} className="w-20 h-14 object-cover rounded-xl shrink-0 bg-surface-tertiary dark:bg-surface-dark-tertiary" />
                ) : (
                  <div className="w-20 h-14 rounded-xl shrink-0 bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                    <Film className="w-6 h-6 text-red-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content dark:text-content-dark truncate">{v.title}</p>
                  {v.description && (
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate mt-0.5">{v.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {v.keywords.split(",").filter(Boolean).map((kw) => (
                      <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium">
                        {kw.trim()}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <a
                    href={v.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Open on YouTube"
                  >
                    <Film className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => startEditVideo(v)}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 dark:hover:bg-primary-400/10 transition-colors"
                    title="Edit video"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(v.id)}
                    disabled={deletingId === v.id}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                    title="Delete video"
                  >
                    {deletingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
