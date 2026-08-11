"use client";

import { useCallback, useState, useMemo } from "react";
import {
  Youtube,
  RefreshCw,
  Plus,
  Pencil,
  X,
  Trash2,
  Loader2,
  ExternalLink,
  Search,
} from "lucide-react";
import type { ApiVideo } from "./types";
import { cn } from "@/lib/utils";

interface VideosTabProps {
  videos: ApiVideo[];
  videosLoading: boolean;
  onFetchVideos: () => void;
  onSaveVideo: () => void;
  onStartEditVideo: (v: ApiVideo) => void;
  onCancelEditVideo: () => void;
  onDeleteVideo: (id: string) => void;
  videoForm: { title: string; description: string; youtubeUrl: string; keywords: string };
  onSetVideoForm: (f: { title: string; description: string; youtubeUrl: string; keywords: string }) => void;
  videoFormError: string;
  editingVideo: ApiVideo | null;
  savingVideo: boolean;
  deletingVideoId: string | null;
}

export default function VideosTab({
  videos,
  videosLoading,
  onFetchVideos,
  onSaveVideo,
  onStartEditVideo,
  onCancelEditVideo,
  onDeleteVideo,
  videoForm,
  onSetVideoForm,
  videoFormError,
  editingVideo,
  savingVideo,
  deletingVideoId,
}: VideosTabProps) {
  const [search, setSearch] = useState("");

  const getYouTubeId = useCallback((url: string) => {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") return u.pathname.slice(1);
      return u.searchParams.get("v") ?? "";
    } catch {
      return "";
    }
  }, []);

  const filteredVideos = useMemo(() => {
    if (!search) return videos;
    const q = search.toLowerCase();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        v.keywords.toLowerCase().includes(q),
    );
  }, [videos, search]);

  return (
    <div className="space-y-6">
      {/* ── Add / Edit Video Card ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 shrink-0">
              <Youtube className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingVideo ? "Edit Video Tutorial" : "Add YouTube Video Tutorial"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Videos are automatically recommended in customer &amp; engineer AI chat responses.
              </p>
            </div>
          </div>

          <button
            onClick={onFetchVideos}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            title="Refresh videos"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", videosLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Video Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Video Title *
            </label>
            <input
              type="text"
              value={videoForm.title}
              onChange={(e) => onSetVideoForm({ ...videoForm, title: e.target.value })}
              placeholder="e.g., How to replace seal ring in ECO V3"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              YouTube URL *
            </label>
            <input
              type="text"
              value={videoForm.youtubeUrl}
              onChange={(e) => onSetVideoForm({ ...videoForm, youtubeUrl: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={videoForm.description}
              onChange={(e) => onSetVideoForm({ ...videoForm, description: e.target.value })}
              placeholder="Brief description of what this video demonstrates…"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Keywords * (comma separated for AI matching)
            </label>
            <input
              type="text"
              value={videoForm.keywords}
              onChange={(e) => onSetVideoForm({ ...videoForm, keywords: e.target.value })}
              placeholder="e.g., seal replacement, eco v3, blinking error, water leak"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {videoFormError && (
          <p className="text-xs font-bold text-red-600 dark:text-red-400">
            {videoFormError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveVideo}
            disabled={savingVideo}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-600 active:scale-95 transition-all shadow-sm disabled:opacity-50"
          >
            {savingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : editingVideo ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{editingVideo ? "Update Video" : "Save Video"}</span>
          </button>

          {editingVideo && (
            <button
              type="button"
              onClick={onCancelEditVideo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Video List Card with Search ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Video Library
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {filteredVideos.length} of {videos.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configured YouTube video guides available for AI recommendation.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative shrink-0 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or keywords…"
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {videosLoading && videos.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            <Youtube className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No videos found
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Add YouTube videos above or try a different search filter.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVideos.map((v) => {
              const videoId = getYouTubeId(v.youtubeUrl);
              const thumb = videoId
                ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
                : null;
              return (
                <div
                  key={v.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={v.title}
                        className="w-20 h-14 object-cover rounded-xl shrink-0 bg-slate-200 dark:bg-slate-700"
                      />
                    ) : (
                      <div className="w-20 h-14 rounded-xl shrink-0 bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
                        <Youtube className="w-6 h-6 text-red-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {v.title}
                      </p>
                      {v.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {v.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {v.keywords.split(",").filter(Boolean).map((kw) => (
                          <span
                            key={kw}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 font-bold"
                          >
                            {kw.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                    <a
                      href={v.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-950/50 transition-colors"
                      title="Open YouTube video"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => onStartEditVideo(v)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Edit video"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteVideo(v.id)}
                      disabled={deletingVideoId === v.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                      title="Delete video"
                    >
                      {deletingVideoId === v.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-500" />
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
      </div>
    </div>
  );
}
