"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, GraduationCap, Pencil, Plus, Trash2, X, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrainingVideo {
  id: string;
  title: string;
  description?: string | null;
  youtubeUrl: string;
  topic: string;
  createdAt: string;
}

export default function EngineerTrainingVideosTab() {
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [videoForm, setVideoForm] = useState({ title: "", description: "", youtubeUrl: "", topic: "" });
  const [videoFormError, setVideoFormError] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [editingVideo, setEditingVideo] = useState<TrainingVideo | null>(null);
  
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/training-videos", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setVideos(data.videos);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleSaveVideo = useCallback(async () => {
    setVideoFormError("");
    const { title, youtubeUrl, topic } = videoForm;
    if (!title.trim() || !youtubeUrl.trim() || !topic.trim()) {
      setVideoFormError("Title, YouTube URL, and topic are required.");
      return;
    }
    setSavingVideo(true);
    try {
      const url = editingVideo ? `/api/admin/training-videos/${editingVideo.id}` : "/api/admin/training-videos";
      const method = editingVideo ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(videoForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchVideos();
        setEditingVideo(null);
        setVideoForm({ title: "", description: "", youtubeUrl: "", topic: "" });
      } else {
        setVideoFormError(data.error || "Failed to save video.");
      }
    } catch {
      setVideoFormError("An unexpected error occurred.");
    } finally {
      setSavingVideo(false);
    }
  }, [videoForm, editingVideo, fetchVideos]);

  const startEditVideo = useCallback((v: TrainingVideo) => {
    setEditingVideo(v);
    setVideoForm({ title: v.title, description: v.description ?? "", youtubeUrl: v.youtubeUrl, topic: v.topic });
    setVideoFormError("");
  }, []);

  const cancelEditVideo = useCallback(() => {
    setEditingVideo(null);
    setVideoForm({ title: "", description: "", youtubeUrl: "", topic: "" });
    setVideoFormError("");
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this training video?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/training-videos/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) setVideos(prev => prev.filter(v => v.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-content dark:text-content-dark">
            Training Videos ({videos.length})
          </h2>
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <Sparkles className="w-3 h-3" />
            AI Search
          </span>
        </div>
      </div>

      <p className="text-sm text-content-secondary dark:text-content-dark-secondary -mt-4">
        Private YouTube videos for engineers. When an engineer types a topic in WhatsApp (e.g. &quot;channels&quot;, &quot;chart settings&quot;, &quot;wifi&quot;), 
        AI will automatically match and send relevant videos. <strong>Separate from troubleshooting R&amp;D videos.</strong>
      </p>

      {/* Add / Edit form */}
      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-content dark:text-content-dark">
          {editingVideo ? "Edit Training Video" : "Add New Training Video"}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Title *</label>
            <input
              value={videoForm.title}
              onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. ECOD Channel Selection & Testing"
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
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
              Topic * <span className="font-normal text-violet-500">(used for AI matching)</span>
            </label>
            <input
              value={videoForm.topic}
              onChange={(e) => setVideoForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. channels, channel selection, testing modes"
              className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Description <span className="font-normal">(optional)</span></label>
            <input
              value={videoForm.description}
              onChange={(e) => setVideoForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description of the video content"
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
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
          <GraduationCap className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-40" />
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No training videos added yet</p>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">Add YouTube videos above — engineers can search for them via WhatsApp using AI</p>
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
                  <div className="w-20 h-14 rounded-xl shrink-0 bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                    <GraduationCap className="w-6 h-6 text-violet-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content dark:text-content-dark truncate">{v.title}</p>
                  {v.description && (
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate mt-0.5">{v.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">
                      <Sparkles className="w-2.5 h-2.5" />
                      {v.topic}
                    </span>
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
                    <GraduationCap className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => startEditVideo(v)}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
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
