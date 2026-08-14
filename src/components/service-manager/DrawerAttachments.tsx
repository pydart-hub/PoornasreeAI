"use client";

import { FileText } from "lucide-react";
import type { ServiceTicket } from "./types";

interface DrawerAttachmentsProps {
  ticket: ServiceTicket;
}

export function DrawerAttachments({ ticket }: DrawerAttachmentsProps) {
  const urls = ticket.mediaUrls;
  if (!urls || urls.length === 0) return null;

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
  const isAudio = (url: string) => /\.(ogg|mp3|wav|m4a|aac)(\?|$)/i.test(url) || url.includes("audio");
  const isVideo = (url: string) => /\.(mp4|webm|mov|mkv)(\?|$)/i.test(url) || url.includes("video");

  return (
    <div className="px-5 py-4 border-t border-line dark:border-line-dark">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-2">
        Complaint Attachments & Voice/Video ({urls.length})
      </h4>
      <div className="flex flex-col gap-3">
        {urls.map((url, index) => {
          if (isAudio(url)) {
            return (
              <div key={index} className="p-3 rounded-lg border border-line dark:border-line-dark bg-surface-secondary dark:bg-surface-dark-secondary">
                <div className="flex items-center gap-2 mb-1.5 text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
                  <span>🎙️ Voice Note / Audio Attachment {index + 1}</span>
                </div>
                <audio controls src={url} className="w-full h-8" />
              </div>
            );
          }

          if (isVideo(url)) {
            return (
              <div key={index} className="p-3 rounded-lg border border-line dark:border-line-dark bg-surface-secondary dark:bg-surface-dark-secondary">
                <div className="flex items-center gap-2 mb-1.5 text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
                  <span>📹 Video Attachment {index + 1}</span>
                </div>
                <video controls src={url} className="w-full max-h-48 rounded-lg object-cover" />
              </div>
            );
          }

          if (isImage(url)) {
            return (
              <a
                key={index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block max-w-[200px] aspect-square rounded-lg overflow-hidden border border-line dark:border-line-dark hover:border-primary/50 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Attachment ${index + 1}`} className="w-full h-full object-cover" />
              </a>
            );
          }

          return (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 rounded-lg border border-line dark:border-line-dark hover:border-primary/50 hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors"
            >
              <FileText className="w-5 h-5 text-content-tertiary dark:text-content-dark-tertiary" />
              <span className="text-xs text-content-tertiary dark:text-content-dark-tertiary truncate">
                Attachment File {index + 1}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
