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

  return (
    <div className="px-5 py-4 border-t border-line dark:border-line-dark">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-2">
        Attachments ({urls.length})
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {urls.map((url, index) =>
          isImage(url) ? (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square rounded-lg overflow-hidden border border-line dark:border-line-dark hover:border-primary/50 transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Attachment ${index + 1}`} className="w-full h-full object-cover" />
            </a>
          ) : (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-1 aspect-square rounded-lg border border-line dark:border-line-dark hover:border-primary/50 hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors p-2"
            >
              <FileText className="w-5 h-5 text-content-tertiary dark:text-content-dark-tertiary" />
              <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary text-center truncate w-full">
                File {index + 1}
              </span>
            </a>
          )
        )}
      </div>
    </div>
  );
}
