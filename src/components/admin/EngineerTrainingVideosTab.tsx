"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Loader2,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Sparkles,
  Search,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  Film,
  Play,
} from "lucide-react";
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
  const [searchQuery, setSearchQuery] = useState("");

  const [videoForm, setVideoForm] = useState({
    title: "",
    description: "",
    youtubeUrl: "",
    topic: "",
  });
  const [videoFormError, setVideoFormError] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [editingVideo, setEditingVideo] = useState<TrainingVideo | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/training-videos", { credentials: "include" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.videos)) {
        setVideos(data.videos);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleSaveVideo = useCallback(async () => {
    setVideoFormError("");
    const { title, youtubeUrl, topic } = videoForm;
    if (!title.trim() || !youtubeUrl.trim() || !topic.trim()) {
      setVideoFormError("Title, YouTube URL, and topic keywords are required.");
      return;
    }
    setSavingVideo(true);
    try {
      const url = editingVideo
        ? `/api/admin/training-videos/${editingVideo.id}`
        : "/api/admin/training-videos";
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
      setVideoFormError("An unexpected network error occurred.");
    } finally {
      setSavingVideo(false);
    }
  }, [videoForm, editingVideo, fetchVideos]);

  const startEditVideo = useCallback((v: TrainingVideo) => {
    setEditingVideo(v);
    setVideoForm({
      title: v.title,
      description: v.description ?? "",
      youtubeUrl: v.youtubeUrl,
      topic: v.topic,
    });
    setVideoFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const cancelEditVideo = useCallback(() => {
    setEditingVideo(null);
    setVideoForm({ title: "", description: "", youtubeUrl: "", topic: "" });
    setVideoFormError("");
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this training video?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/training-videos/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch {
      /* ignore */
    }
    setDeletingId(null);
  };

  const handleSeedVideos = async (overwrite: boolean = false) => {
    if (overwrite && !confirm("This will replace all existing training videos with the standard 21 ECOD training videos. Continue?")) {
      return;
    }
    setSeeding(true);
    setSeedStatus(null);
    try {
      const res = await fetch("/api/admin/training-videos/seed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwrite }),
      });
      const data = await res.json();
      if (res.ok) {
        setSeedStatus(data.message || `Successfully loaded 21 training videos!`);
        await fetchVideos();
      } else {
        setSeedStatus(data.error || "Failed to seed videos.");
      }
    } catch {
      setSeedStatus("Network error while seeding videos.");
    } finally {
      setSeeding(false);
      setTimeout(() => setSeedStatus(null), 5000);
    }
  };

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.toLowerCase().trim();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.topic.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q))
    );
  }, [videos, searchQuery]);

  const getYouTubeEmbedId = (url: string) => {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") return u.pathname.slice(1);
      return u.searchParams.get("v") ?? "";
    } catch {
      return "";
    }
  };

  return (
    <section className="space-y-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-600/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-content dark:text-content-dark">
              Engineer Training Videos ({videos.length})
            </h2>
            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">
              <Sparkles className="w-3 h-3 text-violet-500" />
              AI Topic Matcher
            </span>
          </div>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1.5 max-w-2xl">
            Private YouTube video repository for service engineers. When an engineer asks about topics like{" "}
            <code className="text-violet-600 dark:text-violet-400 font-mono bg-violet-50 dark:bg-violet-950/40 px-1 py-0.5 rounded text-[11px]">
              &quot;channels&quot;
            </code>
            ,{" "}
            <code className="text-violet-600 dark:text-violet-400 font-mono bg-violet-50 dark:bg-violet-950/40 px-1 py-0.5 rounded text-[11px]">
              &quot;chart settings&quot;
            </code>
            , or{" "}
            <code className="text-violet-600 dark:text-violet-400 font-mono bg-violet-50 dark:bg-violet-950/40 px-1 py-0.5 rounded text-[11px]">
              &quot;wifi&quot;
            </code>
            , AI matches and shares the corresponding tutorial.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSeedVideos(videos.length > 0)}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-violet-200 dark:border-violet-800/40 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/30 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300 transition-all disabled:opacity-60 shadow-sm"
            title="Seed standard 21 ECOD training videos"
          >
            {seeding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 text-violet-600" />
            )}
            {videos.length === 0 ? "Load 21 ECOD Videos" : "Reset Default 21 Videos"}
          </button>
        </div>
      </div>

      {/* Seed Status Alert */}
      {seedStatus && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs font-medium text-emerald-700 dark:text-emerald-300 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          {seedStatus}
        </div>
      )}

      {/* Add / Edit Form Card */}
      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-5 shadow-sm space-y-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-content dark:text-content-dark flex items-center gap-2">
            {editingVideo ? (
              <>
                <Pencil className="w-4 h-4 text-violet-500" />
                Edit Training Video
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 text-violet-500" />
                Add New Training Video
              </>
            )}
          </h3>
          {editingVideo && (
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
              Editing: {editingVideo.title}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
              Video Title *
            </label>
            <input
              value={videoForm.title}
              onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. ECOD Channel Selection & Testing Modes"
              className="w-full h-9.5 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
              YouTube URL *
            </label>
            <input
              value={videoForm.youtubeUrl}
              onChange={(e) => setVideoForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full h-9.5 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex items-center justify-between">
              <span>Topic Keywords *</span>
              <span className="text-[11px] font-normal text-violet-600 dark:text-violet-400">
                (Comma-separated tags for AI matching)
              </span>
            </label>
            <input
              value={videoForm.topic}
              onChange={(e) => setVideoForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. channels, channel selection, cow, buffalo, mix"
              className="w-full h-9.5 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
              Description <span className="font-normal text-content-secondary/70">(optional)</span>
            </label>
            <input
              value={videoForm.description}
              onChange={(e) => setVideoForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short explanation of procedures covered in this video"
              className="w-full h-9.5 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
          </div>
        </div>

        {videoFormError && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {videoFormError}
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-1">
          <button
            onClick={handleSaveVideo}
            disabled={savingVideo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-all disabled:opacity-60 shadow-sm"
          >
            {savingVideo ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : editingVideo ? (
              <Pencil className="w-3.5 h-3.5" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            {editingVideo ? "Save Changes" : "Add Training Video"}
          </button>
          {editingVideo && (
            <button
              onClick={cancelEditVideo}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line dark:border-line-dark text-xs text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-secondary" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos by title, topic (e.g. 'channels'), or keywords..."
            className="w-full h-9 pl-9 pr-8 rounded-xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card text-xs text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <span className="text-xs text-content-secondary dark:text-content-dark-secondary font-medium">
          Showing {filteredVideos.length} of {videos.length} videos
        </span>
      </div>

      {/* Video List */}
      {loading && videos.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-line dark:border-line-dark bg-surface-card/50 dark:bg-surface-dark-card/50 space-y-3">
          <div className="p-3.5 rounded-2xl bg-violet-50 dark:bg-violet-950/40 text-violet-500 mx-auto w-fit">
            <Film className="w-8 h-8 opacity-70" />
          </div>
          <div>
            <p className="text-sm font-semibold text-content dark:text-content-dark">
              No training videos found
            </p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1 max-w-sm mx-auto">
              Populate the 21 standard ECOD training videos in one click or add custom training tutorials above.
            </p>
          </div>
          <button
            onClick={() => handleSeedVideos(false)}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-all shadow-sm"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Load Standard 21 ECOD Training Videos
          </button>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-line dark:border-line-dark">
          <Search className="w-8 h-8 text-content-secondary mx-auto mb-2 opacity-40" />
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
            No training videos match &quot;{searchQuery}&quot;
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden divide-y divide-line dark:divide-line-dark shadow-sm">
          {filteredVideos.map((v, i) => {
            const videoId = getYouTubeEmbedId(v.youtubeUrl);
            const thumb = videoId
              ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
              : null;
            const topicTags = v.topic
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);

            return (
              <div
                key={v.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 hover:bg-surface-hover/60 dark:hover:bg-surface-dark-hover/60 transition-colors group"
              >
                {/* Thumbnail / Index */}
                <div className="relative shrink-0 w-full sm:w-28 h-20 sm:h-18 rounded-xl overflow-hidden bg-surface-tertiary dark:bg-surface-dark-tertiary flex items-center justify-center border border-line/60 dark:border-line-dark/60 group-hover:border-violet-400/40 transition-all">
                  {thumb ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt={v.title}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => setPreviewVideoUrl(v.youtubeUrl)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        title="Preview video"
                      >
                        <Play className="w-6 h-6 text-white drop-shadow-md" fill="white" />
                      </button>
                    </>
                  ) : (
                    <GraduationCap className="w-7 h-7 text-violet-400" />
                  )}
                  <span className="absolute top-1 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white font-mono">
                    #{i + 1}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-content dark:text-content-dark">
                      {v.title}
                    </p>
                  </div>

                  {v.description && (
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary line-clamp-2 leading-relaxed">
                      {v.description}
                    </p>
                  )}

                  {/* Topic Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] font-semibold text-content-secondary/80 flex items-center gap-1 mr-0.5">
                      <Sparkles className="w-2.5 h-2.5 text-violet-500" /> Topics:
                    </span>
                    {topicTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium border border-violet-100 dark:border-violet-500/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1.5 self-end sm:self-center pt-2 sm:pt-0">
                  <a
                    href={v.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Open on YouTube"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => startEditVideo(v)}
                    className="p-2 rounded-xl text-content-secondary hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                    title="Edit video"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(v.id)}
                    disabled={deletingId === v.id}
                    className="p-2 rounded-xl text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                    title="Delete video"
                  >
                    {deletingId === v.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewVideoUrl(null)}
        >
          <div
            className="bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark rounded-2xl max-w-2xl w-full p-4 overflow-hidden space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-line dark:border-line-dark">
              <h4 className="text-sm font-bold text-content dark:text-content-dark flex items-center gap-2">
                <Film className="w-4 h-4 text-violet-500" />
                Training Video Preview
              </h4>
              <button
                onClick={() => setPreviewVideoUrl(null)}
                className="p-1 rounded-lg text-content-secondary hover:text-content hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
              {getYouTubeEmbedId(previewVideoUrl) ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${getYouTubeEmbedId(previewVideoUrl)}?autoplay=1`}
                  title="YouTube video player"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-white/70">
                  Invalid YouTube URL: {previewVideoUrl}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
