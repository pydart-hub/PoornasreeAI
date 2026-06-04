"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import {
  getWorkReport,
  workReportImageSrc,
  type WorkReport,
  type WorkReportImage,
} from "@/lib/api";

interface DrawerWorkReportProps {
  ticketId: string;
  onImageClick?: (url: string) => void;
}

export function DrawerWorkReport({ ticketId, onImageClick }: DrawerWorkReportProps) {
  const [report, setReport] = useState<WorkReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWorkReport(ticketId)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (loading) {
    return (
      <div className="px-5 py-4 border-t border-line dark:border-line-dark flex items-center gap-2 text-xs text-content-tertiary dark:text-content-dark-tertiary">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading engineer report…
      </div>
    );
  }

  if (!report) return null;

  const hasText =
    !!report.problemDiagnosed?.trim() ||
    !!report.workDone?.trim() ||
    (report.parts?.length ?? 0) > 0;
  const images = report.images ?? [];

  if (!hasText && images.length === 0) return null;

  return (
    <div className="px-5 py-4 border-t border-line dark:border-line-dark space-y-3">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider flex items-center gap-1.5">
        <ClipboardList className="w-3 h-3" />
        Engineer service report
      </h4>

      {report.problemDiagnosed?.trim() && (
        <div>
          <p className="text-[10px] font-semibold text-content-secondary dark:text-content-dark-secondary mb-0.5">
            Problem diagnosed
          </p>
          <p className="text-xs text-content dark:text-content-dark leading-relaxed whitespace-pre-wrap">
            {report.problemDiagnosed}
          </p>
        </div>
      )}

      {report.workDone?.trim() && (
        <div>
          <p className="text-[10px] font-semibold text-content-secondary dark:text-content-dark-secondary mb-0.5">
            Work done
          </p>
          <p className="text-xs text-content dark:text-content-dark leading-relaxed whitespace-pre-wrap">
            {report.workDone}
          </p>
        </div>
      )}

      {(report.parts?.length ?? 0) > 0 && (
        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
          {report.parts!.length} part{report.parts!.length !== 1 ? "s" : ""} replaced
        </p>
      )}

      {images.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-content-secondary dark:text-content-dark-secondary mb-2">
            Photos ({images.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img: WorkReportImage) => {
              const src = workReportImageSrc(img.url);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onImageClick?.(src)}
                  className="block aspect-square rounded-lg overflow-hidden border border-line dark:border-line-dark hover:border-primary/50 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={img.fileName || "Report photo"} className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
