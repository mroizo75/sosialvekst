"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { CreatePostDialog } from "@/components/calendar/CreatePostDialog";
import { cn } from "@/lib/utils";
import type { PostDraft, SocialChannel } from "@/lib/types";

/* ─── Inline SVG icon components ─── */

const ic = (d: string) => {
  const C = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
  C.displayName = "Icon";
  return C;
};

const IconX = ic("M6 18L18 6M6 6l12 12");
const IconCheck = ic("M4.5 12.75l6 6 9-13.5");
const IconCheckCircle = ic("M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z");
const IconEdit = ic("M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10");
const IconImage = ic("M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z");
const IconVideo = ic("M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z");
const IconFolder = ic("M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z");
const IconUpload = ic("M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5");
const IconTrash = ic("M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0");
const IconPlus = ic("M12 4.5v15m7.5-7.5h-15");
const IconChart = ic("M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z");
const IconSave = ic("M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z");
const IconSparkles = ic("M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z");
const IconRefresh = ic("M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.355v4.992");
const IconPen = ic("M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z");
const IconAlertCircle = ic("M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z");
const IconCalendar = ic("M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5");
const IconClock = ic("M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z");
const IconHistory = ic("M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z");
const IconGrid = ic("M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z");

type CalendarView = "month" | "week";

const DAY_NAMES = ["man", "tir", "ons", "tor", "fre", "lor", "son"] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const getIsoWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const getMondayOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonthGrid = (year: number, month: number): Date[][] => {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() || 7) - 1;
  const gridStart = new Date(year, month, 1 - startOffset);

  const weeks: Date[][] = [];
  const current = new Date(gridStart);

  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    if (w >= 4 && week[0].getMonth() !== month) break;
    weeks.push(week);
  }

  return weeks;
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isToday = (date: Date): boolean => isSameDay(date, new Date());

const channelColor: Record<SocialChannel, string> = {
  facebook: "bg-facebook/15 border-facebook/30 text-facebook",
  instagram: "bg-instagram/15 border-instagram/30 text-instagram",
  linkedin: "bg-linkedin/15 border-linkedin/30 text-linkedin",
  tiktok: "bg-foreground/10 border-foreground/20 text-foreground",
};

const channelDot: Record<SocialChannel, string> = {
  facebook: "bg-facebook",
  instagram: "bg-instagram",
  linkedin: "bg-linkedin",
  tiktok: "bg-foreground",
};

type PostCardMiniProps = {
  post: PostDraft;
  onClick: () => void;
  onDragStart?: (postId: string) => void;
  onDragEnd?: () => void;
};

const PostCardMini = ({ post, onClick, onDragStart, onDragEnd }: PostCardMiniProps) => {
  const time = new Date(post.scheduledAt).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (post.status === "generating") {
    return (
      <div
        className={cn(
          "w-full rounded-md border overflow-hidden animate-pulse",
          channelColor[post.channel],
        )}
      >
        <div className="h-10 bg-current/5" />
        <div className="px-1.5 py-1 space-y-0.5">
          <div className="h-1.5 w-3/4 rounded bg-current/15" />
          <div className="flex items-center gap-1 text-[10px] opacity-60">
            <span>{time}</span>
            <span className="capitalize">{post.channel}</span>
            <span className="inline-block size-1.5 rounded-full bg-current animate-bounce ml-auto" />
          </div>
        </div>
      </div>
    );
  }

  const isApproved = post.status === "approved";
  const isFailed = post.status === "failed";
  const isScheduled = post.status === "scheduled";
  const isPublished = post.status === "published";

  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/post-id", post.id);
        onDragStart?.(post.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        "w-full rounded-md border overflow-hidden text-left transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer",
        isScheduled
          ? "border-success bg-success/5 ring-1 ring-success/30"
          : isApproved
            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
            : isPublished
              ? "border-success/40 bg-success/5"
              : isFailed
                ? "border-destructive/50 bg-destructive/5"
                : channelColor[post.channel],
      )}
    >
      {isApproved && (
        <div className="flex items-center gap-1 bg-primary/10 px-1.5 py-0.5">
          <span className="flex size-3 items-center justify-center rounded-full bg-primary text-[7px] text-white font-bold">✓</span>
          <span className="text-[9px] font-semibold text-primary">Godkjent</span>
        </div>
      )}
      {isScheduled && (
        <div className="flex items-center gap-1 bg-success/15 px-1.5 py-0.5">
          <span className="flex size-3 items-center justify-center rounded-full bg-success text-[7px] text-white font-bold">✓</span>
          <span className="text-[9px] font-semibold text-success">Publiseres automatisk</span>
        </div>
      )}
      {isPublished && (
        <div className="flex items-center gap-1 bg-success/10 px-1.5 py-0.5">
          <span className="text-[9px] font-semibold text-success">Publisert</span>
        </div>
      )}
      {isFailed && (
        <div className="flex items-center gap-1 bg-destructive/10 px-1.5 py-0.5">
          <span className="text-[9px] font-semibold text-destructive">Feilet</span>
        </div>
      )}
      {post.videoUrl ? (
        <div className="flex h-12 w-full items-center justify-center bg-muted/40 text-[10px] font-medium text-muted-foreground">
          Video valgt
        </div>
      ) : post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          className="h-12 w-full object-cover"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="px-1.5 py-1">
        <p className="text-[10px] leading-tight line-clamp-2 mb-0.5">
          {post.text.slice(0, 60)}{post.text.length > 60 ? "…" : ""}
        </p>
        <div className="flex items-center gap-1 text-[10px] opacity-70">
          <span className="font-medium">{time}</span>
          <span className={cn("size-1.5 rounded-full", channelDot[post.channel])} />
          <span className="capitalize">{post.channel}</span>
          {post.additionalImageUrls && post.additionalImageUrls.length > 0 ? (
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
              +{post.additionalImageUrls.length} bilde{post.additionalImageUrls.length > 1 ? "r" : ""}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
};

type DetailPanelProps = {
  post: PostDraft;
  onClose: () => void;
  onSave: (
    id: string,
    payload: { text: string; imageUrl?: string; videoUrl?: string; additionalImageUrls?: string[] },
  ) => void;
  onRegenerateAll: (id: string) => void;
  onRegenerateText: (id: string) => void;
  onRegenerateImage: (id: string) => void;
  onRewriteTopic: (id: string, topic: string) => void;
  onApprove: (id: string) => void;
  processingAction: string | null;
  approving: boolean;
  aiEditsRemaining: number;
};

type PublishJobHistory = {
  id: string;
  status: "queued" | "retrying" | "completed" | "failed" | string;
  attempts: number;
  last_error: string | null;
  run_at: string;
  updated_at: string;
  channel: SocialChannel;
};

type MediaFile = {
  key: string;
  url: string;
  size: number;
  updatedAt: string;
};

const STATUS_LABEL_NO: Record<string, string> = {
  generating: "Genereres",
  draft: "Utkast",
  approved: "Godkjent",
  scheduled: "Planlagt",
  published: "Publisert",
  failed: "Feilet",
  needs_review: "Trenger gjennomgang",
};

const CHANNEL_LABEL_NO: Record<SocialChannel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

const PUBLISH_JOB_STATUS_LABEL_NO: Record<string, string> = {
  queued: "I kø",
  retrying: "Prøver igjen",
  processing: "Publiserer nå",
  completed: "Publisert",
  failed: "Feilet",
};

const detectMediaKind = (key: string): "image" | "video" | "other" => {
  if (key.includes("/videos/")) return "video";
  if (key.includes("/images/") || key.includes("/logos/")) return "image";
  return "other";
};

type MediaPickerDialogProps = {
  onClose: () => void;
  onSelect: (file: MediaFile) => void;
};

const MediaPickerDialog = ({ onClose, onSelect }: MediaPickerDialogProps) => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  useEffect(() => {
    let cancelled = false;
    const loadFiles = async () => {
      try {
        const response = await fetch("/api/media/files");
        if (!response.ok) {
          if (!cancelled) setError("Kunne ikke hente filer fra mediebiblioteket.");
          return;
        }
        const data = (await response.json()) as { files: MediaFile[] };
        if (!cancelled) {
          setFiles((data.files ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
          setError("");
        }
      } catch {
        if (!cancelled) setError("Nettverksfeil ved henting av mediefiler.");
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    };
    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleFiles = useMemo(() => {
    if (filter === "all") return files;
    return files.filter((file) => detectMediaKind(file.key) === filter);
  }, [files, filter]);

  const FILTER_OPTIONS = [
    { key: "all" as const, label: "Alle", icon: <IconGrid className="size-3.5" /> },
    { key: "image" as const, label: "Bilder", icon: <IconImage className="size-3.5" /> },
    { key: "video" as const, label: "Video", icon: <IconVideo className="size-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative z-10 flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <IconFolder className="size-4 text-primary" />
            </div>
            <h4 className="text-sm font-bold">Mediebibliotek</h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <IconX className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-b border-border px-5 py-2.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                filter === opt.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">{visibleFiles.length} filer</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loadingFiles ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Laster mediefiler...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <IconAlertCircle className="size-8 text-destructive/60" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <IconFolder className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Ingen filer funnet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleFiles.map((file) => {
                const kind = detectMediaKind(file.key);
                return (
                  <button
                    key={file.key}
                    type="button"
                    onClick={() => onSelect(file)}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary/40 hover:shadow-md cursor-pointer"
                  >
                    <div className="relative">
                      {kind === "video" ? (
                        <video src={file.url} className="aspect-square w-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.url} alt="" className="aspect-square w-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                      {kind === "video" && (
                        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5">
                          <IconVideo className="size-3 text-white" />
                          <span className="text-[10px] font-medium text-white">Video</span>
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="line-clamp-1 text-xs font-medium text-foreground">{file.key.split("/").pop()}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const qualityLabel = (score: number): { text: string; color: string } => {
  if (score >= 75) return { text: "Bra", color: "text-success" };
  if (score >= 55) return { text: "OK", color: "text-warning-foreground" };
  return { text: "Kan forbedres", color: "text-destructive" };
};

const DetailPanel = ({
  post,
  onClose,
  onSave,
  onRegenerateAll,
  onRegenerateText,
  onRegenerateImage,
  onRewriteTopic,
  onApprove,
  processingAction,
  approving,
  aiEditsRemaining,
}: DetailPanelProps) => {
  const scheduledDate = new Date(post.scheduledAt);
  const [textDraft, setTextDraft] = useState(post.text);
  const [imageUrlDraft, setImageUrlDraft] = useState(post.imageUrl ?? "");
  const [videoUrlDraft, setVideoUrlDraft] = useState(post.videoUrl ?? "");
  const [additionalImageUrlsDraft, setAdditionalImageUrlsDraft] = useState<string[]>(
    post.additionalImageUrls ?? [],
  );
  const [topicDraft, setTopicDraft] = useState("");
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"primary" | "additional">("primary");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = async (file: File) => {
    if (!file.type.startsWith("video/")) return;
    setUploadingVideo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mediaKind", "video");
      const response = await fetch("/api/media/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload feilet");
      const data = (await response.json()) as { url?: string };
      if (data.url) {
        setVideoUrlDraft(data.url);
        setImageUrlDraft("");
        setAdditionalImageUrlsDraft([]);
      }
    } catch {
      /* upload failed silently */
    } finally {
      setUploadingVideo(false);
    }
  };
  const [publishJobs, setPublishJobs] = useState<PublishJobHistory[]>([]);
  const [publishHistoryStatus, setPublishHistoryStatus] = useState("");
  const [showPublishHistory, setShowPublishHistory] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const prevPostRef = useRef(post);
  useEffect(() => {
    if (prevPostRef.current !== post) {
      setTextDraft(post.text);
      setImageUrlDraft(post.imageUrl ?? "");
      setVideoUrlDraft(post.videoUrl ?? "");
      setAdditionalImageUrlsDraft(post.additionalImageUrls ?? []);
      prevPostRef.current = post;
    }
  }, [post]);

  const isProcessing = Boolean(processingAction);
  // TODO: Aktiver igjen etter test
  const aiBlocked = false; // aiEditsRemaining <= 0;
  const quality = qualityLabel(post.quality.total);
  const hasMedia = Boolean(imageUrlDraft) || Boolean(videoUrlDraft);
  const canApprove = post.status === "draft" || post.status === "needs_review";

  useEffect(() => {
    let cancelled = false;
    const loadPublishHistory = async () => {
      try {
        const response = await fetch(`/api/publish/history?postId=${post.id}`);
        if (!response.ok) {
          if (!cancelled) {
            setPublishHistoryStatus("Kunne ikke hente publiseringshistorikk.");
          }
          return;
        }
        const data = (await response.json()) as { jobs: PublishJobHistory[] };
        if (!cancelled) {
          setPublishJobs(data.jobs ?? []);
          setPublishHistoryStatus("");
        }
      } catch {
        if (!cancelled) {
          setPublishHistoryStatus("Nettverksfeil ved henting av publiseringshistorikk.");
        }
      }
    };
    void loadPublishHistory();
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  useEffect(() => {
    const previousFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      previousFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const CHANNEL_ICONS: Record<SocialChannel, React.ReactNode> = {
    facebook: <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
    instagram: <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
    linkedin: <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
    tiktok: <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>,
  };

  const CHANNEL_HEADER_BG: Record<SocialChannel, string> = {
    facebook: "from-[#1877F2]/10 to-transparent",
    instagram: "from-[#DD2A7B]/10 to-transparent",
    linkedin: "from-[#0A66C2]/10 to-transparent",
    tiktok: "from-foreground/5 to-transparent",
  };

  const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
    generating: { bg: "bg-primary/10", text: "text-primary" },
    draft: { bg: "bg-muted", text: "text-muted-foreground" },
    approved: { bg: "bg-success/10", text: "text-success" },
    scheduled: { bg: "bg-success/10", text: "text-success" },
    published: { bg: "bg-success/10", text: "text-success" },
    failed: { bg: "bg-destructive/10", text: "text-destructive" },
    needs_review: { bg: "bg-warning/10", text: "text-warning-foreground" },
  };

  const statusBadge = STATUS_BADGE[post.status] ?? STATUS_BADGE.draft;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Rediger post"
        tabIndex={-1}
        className="flex h-[95vh] sm:h-[90vh] w-full sm:max-w-5xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl animate-scale-in"
      >
        {/* --- Header --- */}
        <div className={cn("flex items-center justify-between border-b border-border px-4 sm:px-5 py-3 bg-gradient-to-r", CHANNEL_HEADER_BG[post.channel])}>
          <div className="flex items-center gap-3">
            <div className={cn("flex size-9 items-center justify-center rounded-xl", channelColor[post.channel])}>
              {CHANNEL_ICONS[post.channel]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold leading-tight">
                  {CHANNEL_LABEL_NO[post.channel]}
                </h3>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", statusBadge.bg, statusBadge.text)}>
                  {STATUS_LABEL_NO[post.status] ?? post.status}
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <IconCalendar className="size-3" />
                {scheduledDate.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })}
                <span className="text-border">·</span>
                <IconClock className="size-3" />
                {scheduledDate.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <button
            autoFocus
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <IconX className="size-4" />
          </button>
        </div>

        {/* --- Approve banner --- */}
        {canApprove && (
          <div className="flex items-center justify-between border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-5 py-2.5">
            <div className="flex items-center gap-2">
              <IconCheckCircle className="size-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Klar til å godkjenne?</p>
            </div>
            <Button
              size="sm"
              onClick={() => onApprove(post.id)}
              disabled={approving || isProcessing}
            >
              {approving ? "Godkjenner..." : "Godkjenn"}
            </Button>
          </div>
        )}
        {post.status === "approved" && (
          <div className="flex items-center gap-2 border-b border-success/20 bg-gradient-to-r from-success/5 to-transparent px-5 py-2.5">
            <IconCheckCircle className="size-4 text-success" />
            <p className="text-sm font-medium text-success">Godkjent — klar for publisering</p>
          </div>
        )}

        {/* --- Body --- */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2">

            {/* === LEFT: Forhåndsvisning === */}
            <div className="p-3 sm:p-5 space-y-4 lg:border-r lg:border-border">

              {/* Media preview */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <IconImage className="size-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Forhåndsvisning</p>
                </div>
                {videoUrlDraft ? (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-border bg-muted/20 overflow-hidden">
                    <video src={videoUrlDraft} controls className="h-full w-full object-contain" />
                  </div>
                ) : imageUrlDraft ? (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-border bg-muted/20 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrlDraft}
                      alt="Postbilde"
                      className="h-full w-full object-contain"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/5">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
                        {post.channel === "tiktok"
                          ? <IconVideo className="size-6 text-muted-foreground" />
                          : <IconImage className="size-6 text-muted-foreground" />
                        }
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {post.channel === "tiktok" ? "Last opp video for TikTok" : "Ingen bilde eller video"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {post.channel === "tiktok" && (
                          <>
                            <input
                              ref={videoInputRef}
                              type="file"
                              accept="video/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleVideoUpload(file);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              size="sm"
                              onClick={() => videoInputRef.current?.click()}
                              disabled={isProcessing || uploadingVideo}
                            >
                              <IconUpload className="size-3.5" />
                              {uploadingVideo ? "Laster opp..." : "Last opp video"}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setPickerTarget("primary"); setShowMediaPicker(true); }}
                          disabled={isProcessing}
                        >
                          <IconFolder className="size-3.5" />
                          Velg fra bibliotek
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Additional images */}
              {additionalImageUrlsDraft.length > 0 && !videoUrlDraft && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <IconGrid className="size-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">
                      Ekstra bilder ({additionalImageUrlsDraft.length})
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {additionalImageUrlsDraft.map((url, index) => (
                      <div key={`${url}-${index}`} className="group relative rounded-lg border border-border overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-16 w-full object-cover" />
                        <button
                          type="button"
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                          onClick={() => setAdditionalImageUrlsDraft((c) => c.filter((_, i) => i !== index))}
                          disabled={isProcessing}
                        >
                          <IconTrash className="size-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Media actions */}
              {hasMedia && (
                <div className="flex flex-wrap gap-2">
                  {post.channel === "tiktok" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={isProcessing || uploadingVideo}
                    >
                      <IconUpload className="size-3.5" />
                      {uploadingVideo ? "Laster opp..." : "Bytt video"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setPickerTarget("primary"); setShowMediaPicker(true); }}
                    disabled={isProcessing}
                  >
                    <IconFolder className="size-3.5" />
                    Bibliotek
                  </Button>
                  {!videoUrlDraft && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPickerTarget("additional"); setShowMediaPicker(true); }}
                      disabled={isProcessing}
                    >
                      <IconPlus className="size-3.5" />
                      Legg til bilde
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setImageUrlDraft(""); setVideoUrlDraft(""); setAdditionalImageUrlsDraft([]); }}
                    disabled={isProcessing}
                    className="text-destructive hover:text-destructive"
                  >
                    <IconTrash className="size-3.5" />
                    Fjern
                  </Button>
                </div>
              )}

              {/* Quality bar */}
              <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <IconChart className="size-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">Kvalitetspoeng</span>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold",
                    post.quality.total >= 75 ? "bg-success/10 text-success" :
                    post.quality.total >= 55 ? "bg-warning/10 text-warning-foreground" :
                    "bg-destructive/10 text-destructive",
                  )}>
                    {post.quality.total}/100
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      post.quality.total >= 75 ? "bg-gradient-to-r from-success to-success/80" :
                      post.quality.total >= 55 ? "bg-gradient-to-r from-warning to-warning/80" :
                      "bg-gradient-to-r from-destructive to-destructive/80",
                    )}
                    style={{ width: `${post.quality.total}%` }}
                  />
                </div>
                <div className="flex gap-4 text-[11px]">
                  <span className={cn("flex items-center gap-1", post.quality.companyMentioned ? "text-success" : "text-muted-foreground")}>
                    {post.quality.companyMentioned ? <IconCheck className="size-3" /> : <IconX className="size-3" />}
                    Bedriftsnavn
                  </span>
                  <span className={cn("flex items-center gap-1", post.quality.ctaPresent ? "text-success" : "text-muted-foreground")}>
                    {post.quality.ctaPresent ? <IconCheck className="size-3" /> : <IconX className="size-3" />}
                    Oppfordring
                  </span>
                </div>
              </div>

              {/* Publish history */}
              {(publishJobs.length > 0 || publishHistoryStatus) && (
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setShowPublishHistory((v) => !v)}
                  >
                    <div className="flex items-center gap-1.5">
                      <IconHistory className="size-3.5" />
                      <span>Publiseringshistorikk ({publishJobs.length})</span>
                    </div>
                    <svg className={cn("size-3.5 transition-transform", showPublishHistory && "rotate-180")} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {showPublishHistory && (
                    <div className="border-t border-border px-3.5 py-2.5 space-y-1.5">
                      {publishHistoryStatus && <p className="text-xs text-muted-foreground">{publishHistoryStatus}</p>}
                      {publishJobs.map((job) => (
                        <div key={job.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                          <span className="font-medium">{CHANNEL_LABEL_NO[job.channel] ?? job.channel}</span>
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            job.status === "completed" && "bg-success/10 text-success",
                            job.status === "failed" && "bg-destructive/10 text-destructive",
                            (job.status === "queued" || job.status === "retrying") && "bg-warning/10 text-warning-foreground",
                          )}>
                            {PUBLISH_JOB_STATUS_LABEL_NO[job.status] ?? job.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* === RIGHT: Redigering === */}
            <div className="p-3 sm:p-5 space-y-4 sm:space-y-5">

              {/* Text editing */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <IconEdit className="size-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tekst</p>
                </div>
                <Textarea
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  rows={10}
                  className="resize-none"
                  placeholder="Skriv teksten til innlegget her..."
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">{textDraft.length} tegn</p>
              </div>

              {/* Save button */}
              <Button
                onClick={() => onSave(post.id, {
                  text: textDraft,
                  imageUrl: imageUrlDraft || undefined,
                  videoUrl: videoUrlDraft || undefined,
                  additionalImageUrls: additionalImageUrlsDraft,
                })}
                disabled={isProcessing || textDraft.trim().length === 0}
                className="w-full"
                size="lg"
              >
                {processingAction === "save" ? (
                  <>
                    <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Lagrer...
                  </>
                ) : (
                  <>
                    <IconSave className="size-4" />
                    Lagre endringer
                  </>
                )}
              </Button>

              {/* AI section */}
              <div className={cn(
                "rounded-xl border p-4 space-y-3",
                aiBlocked ? "border-border bg-muted/30" : "border-primary/10 bg-gradient-to-b from-primary/5 to-transparent",
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <IconSparkles className="size-4 text-primary" />
                    <p className="text-xs font-bold text-foreground">AI-verktøy</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                    aiBlocked
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary",
                  )}>
                    {aiEditsRemaining} igjen
                  </span>
                </div>

                {aiBlocked ? (
                  <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <IconAlertCircle className="size-5 shrink-0 text-destructive/60" />
                    <div>
                      <p className="text-xs font-medium text-foreground">AI-redigeringer er brukt opp</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Du kan fortsatt redigere tekst og bilder manuelt.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onRegenerateText(post.id)}
                        disabled={isProcessing}
                        className={cn(
                          "group rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm disabled:opacity-50 cursor-pointer",
                          processingAction === "regenerate_text" && "border-primary/40 animate-pulse",
                        )}
                      >
                        <div className="flex size-8 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-primary/10">
                          <IconEdit className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                        </div>
                        <p className="mt-2 text-xs font-semibold text-foreground">
                          {processingAction === "regenerate_text" ? "Skriver..." : "Ny tekst"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Behold bilde</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => onRegenerateImage(post.id)}
                        disabled={isProcessing}
                        className={cn(
                          "group rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm disabled:opacity-50 cursor-pointer",
                          processingAction === "regenerate_image" && "border-primary/40 animate-pulse",
                        )}
                      >
                        <div className="flex size-8 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-primary/10">
                          <IconImage className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                        </div>
                        <p className="mt-2 text-xs font-semibold text-foreground">
                          {processingAction === "regenerate_image" ? "Lager bilde..." : "Nytt bilde"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Behold tekst</p>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRegenerateAll(post.id)}
                      disabled={isProcessing}
                      className={cn(
                        "group w-full rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm disabled:opacity-50 cursor-pointer",
                        processingAction === "regenerate_all" && "border-primary/40 animate-pulse",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-primary/10">
                          <IconRefresh className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {processingAction === "regenerate_all" ? "Genererer..." : "Lag helt nytt innlegg"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Ny tekst og nytt bilde</p>
                        </div>
                      </div>
                    </button>

                    <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <IconPen className="size-3.5 text-muted-foreground" />
                        <p className="text-xs font-semibold text-foreground">Skriv om med tema</p>
                      </div>
                      <Input
                        value={topicDraft}
                        onChange={(event) => setTopicDraft(event.target.value)}
                        placeholder="F.eks. «Vårkampanje» eller «HMS-tips»"
                      />
                      <Button
                        onClick={() => onRewriteTopic(post.id, topicDraft)}
                        disabled={isProcessing || topicDraft.trim().length < 2}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        {processingAction === "rewrite_topic" ? "Skriver om..." : "Skriv om med dette temaet"}
                      </Button>
                    </div>
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
      {showMediaPicker && (
        <MediaPickerDialog
          onClose={() => setShowMediaPicker(false)}
          onSelect={(file) => {
            const kind = detectMediaKind(file.key);
            if (pickerTarget === "additional") {
              if (kind === "image") {
                setAdditionalImageUrlsDraft((current) => {
                  if (current.includes(file.url) || file.url === imageUrlDraft) return current;
                  return [...current, file.url];
                });
                setVideoUrlDraft("");
              }
            } else {
              if (kind === "video") {
                setVideoUrlDraft(file.url);
                setImageUrlDraft("");
                setAdditionalImageUrlsDraft([]);
              } else {
                setImageUrlDraft(file.url);
                setVideoUrlDraft("");
              }
            }
            setShowMediaPicker(false);
          }}
        />
      )}
    </div>
  );
};

type AiEditLimits = { used: number; limit: number };

export const PostCalendar = () => {
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<PostDraft | null>(null);
  const [processingPost, setProcessingPost] = useState<{
    id: string;
    action: "save" | "regenerate_all" | "regenerate_text" | "regenerate_image" | "rewrite_topic";
  } | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [aiLimits, setAiLimits] = useState<AiEditLimits>({ used: 0, limit: 5 });

  const hasGenerating = useMemo(
    () => posts.some((p) => p.status === "generating"),
    [posts],
  );

  const readyCount = useMemo(
    () => posts.filter((p) => p.status !== "generating").length,
    [posts],
  );

  const loadPosts = useCallback(async () => {
    try {
      const response = await fetch("/api/posts");
      if (!response.ok) {
        setStatus("Kunne ikke hente poster");
        setPollErrorCount((current) => Math.min(current + 1, 6));
        setLoading(false);
        return;
      }
      const data = (await response.json()) as { posts: PostDraft[]; aiEdits?: AiEditLimits };
      setPosts(data.posts);
      if (data.aiEdits) setAiLimits(data.aiEdits);
      setPollErrorCount(0);
    } catch {
      setStatus("Nettverksfeil ved henting av poster");
      setPollErrorCount((current) => Math.min(current + 1, 6));
    } finally {
      setLoading(false);
    }
  }, []);

  // TODO: Aktiver igjen etter test
  const aiEditsRemaining = aiLimits.limit; // aiLimits.limit - aiLimits.used;

  const updatePost = async (
    postId: string,
    action: "save" | "regenerate_all" | "regenerate_text" | "regenerate_image" | "rewrite_topic",
    payload: Record<string, string | string[] | undefined> = {},
  ) => {
    const isAiAction = action !== "save";

    // TODO: Aktiver igjen etter test
    // if (isAiAction && aiEditsRemaining <= 0) {
    //   setStatus("Du har brukt opp dine AI-redigeringer for denne perioden. Du kan fortsatt redigere tekst og bilder manuelt.");
    //   return;
    // }

    setProcessingPost({ id: postId, action });
    setStatus(action === "save" ? "Lagrer endringer..." : "AI oppdaterer posten...");

    const response = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null) as { message?: string; code?: string } | null;
      setStatus(data?.message ?? "Kunne ikke oppdatere posten.");
      setProcessingPost(null);
      return;
    }

    const updatedPost = (await response.json()) as PostDraft;
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    setSelectedPost(updatedPost);
    setStatus("");
    setProcessingPost(null);

    // TODO: Aktiver igjen etter test
    // if (isAiAction) {
    //   setAiLimits((prev) => ({ ...prev, used: prev.used + 1 }));
    // }
  };

  const draftCount = useMemo(
    () => posts.filter((p) => p.status === "draft" || p.status === "needs_review").length,
    [posts],
  );

  const approvePost = async (postId: string) => {
    setApprovingId(postId);
    try {
      const response = await fetch("/api/posts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: [postId] }),
      });
      if (response.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "approved" as const } : p)));
        setSelectedPost((prev) => prev?.id === postId ? { ...prev, status: "approved" as const } : prev);
        setStatus("Posten er godkjent for publisering.");
        setTimeout(() => setStatus(""), 3000);
        return;
      }
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatus(data?.message ?? "Kunne ikke godkjenne posten.");
    } catch {
      setStatus("Nettverksfeil ved godkjenning av post.");
    } finally {
      setApprovingId(null);
    }
  };

  const approveAll = async () => {
    const ids = posts
      .filter((p) => p.status === "draft" || p.status === "needs_review")
      .map((p) => p.id);
    if (ids.length === 0) return;
    setStatus("Godkjenner alle poster...");
    const response = await fetch("/api/posts/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postIds: ids }),
    });
    if (response.ok) {
      const result = (await response.json()) as { approved: number };
      setPosts((prev) =>
        prev.map((p) =>
          ids.includes(p.id) && (p.status === "draft" || p.status === "needs_review")
            ? { ...p, status: "approved" as const }
            : p,
        ),
      );
      setStatus(`${result.approved} poster godkjent for publisering.`);
      setTimeout(() => setStatus(""), 3000);
    } else {
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatus(data?.message ?? "Kunne ikke godkjenne poster.");
    }
  };

  const movePostToDate = async (postId: string, dateKey: string) => {
    const sourcePost = posts.find((post) => post.id === postId);
    if (!sourcePost) {
      return;
    }

    const original = new Date(sourcePost.scheduledAt);
    const target = new Date(`${dateKey}T00:00:00`);
    target.setHours(original.getHours(), original.getMinutes(), 0, 0);

    if (target.getTime() <= Date.now()) {
      setStatus("Du kan ikke flytte en post til en dato i fortiden.");
      return;
    }

    if (new Date(sourcePost.scheduledAt).toISOString().slice(0, 10) === dateKey) {
      return;
    }

    setStatus("Flytter post...");
    const response = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reschedule",
        scheduledAt: target.toISOString(),
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatus(data?.message ?? "Kunne ikke flytte post.");
      return;
    }

    const updatedPost = (await response.json()) as PostDraft;
    setPosts((prev) =>
      prev
        .map((post) => (post.id === updatedPost.id ? updatedPost : post))
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    );
    setSelectedPost((prev) => (prev?.id === updatedPost.id ? updatedPost : prev));
    setStatus("Post flyttet.");
    setTimeout(() => setStatus(""), 2000);
  };

  useEffect(() => {
    const pending = sessionStorage.getItem("pendingPosts");
    if (pending) {
      try {
        const cached = JSON.parse(pending) as PostDraft[];
        if (cached.length > 0) {
          setPosts(cached);
          setLoading(false);
          setCurrentDate(new Date(cached[0].scheduledAt));
          sessionStorage.removeItem("pendingPosts");
          return;
        }
      } catch {
        sessionStorage.removeItem("pendingPosts");
      }
    }
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const baseDelay = hasGenerating ? 3000 : 15000;
    const maxDelay = hasGenerating ? 30000 : 120000;
    const calculatedDelay = Math.min(baseDelay * 2 ** pollErrorCount, maxDelay);

    const run = () => {
      if (cancelled) {
        return;
      }
      timeoutId = setTimeout(async () => {
        if (cancelled) {
          return;
        }
        if (document.hidden) {
          run();
          return;
        }
        await loadPosts();
        run();
      }, document.hidden ? 60000 : calculatedDelay);
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        void loadPosts();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    run();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [loadPosts, hasGenerating, pollErrorCount]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, PostDraft[]>();
    for (const post of posts) {
      const key = new Date(post.scheduledAt).toISOString().slice(0, 10);
      const existing = map.get(key) ?? [];
      existing.push(post);
      map.set(key, existing);
    }
    return map;
  }, [posts]);

  const navigateMonth = (offset: number) => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + offset, 1));
  };

  const navigateWeek = (offset: number) => {
    setCurrentDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + offset * 7);
      return next;
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  const monthGrid = useMemo(
    () => getMonthGrid(currentDate.getFullYear(), currentDate.getMonth()),
    [currentDate],
  );

  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Laster kalender…</div>
      </div>
    );
  }

  if (posts.length === 0 && !hasGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">Ingen poster funnet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Gå til oppsett for å generere innhold, eller lag din egen post.
        </p>
        <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
          + Lag egen post
        </Button>
        {status ? (
          <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {status}
          </div>
        ) : null}
        {showCreateDialog && (
          <CreatePostDialog
            onClose={() => setShowCreateDialog(false)}
            onCreated={(post) => {
              setPosts((prev) => [...prev, post].sort(
                (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
              ));
              setShowCreateDialog(false);
            }}
          />
        )}
      </div>
    );
  }

  const monthLabel = currentDate.toLocaleDateString("nb-NO", {
    month: "long",
    year: "numeric",
  });

  const weekLabel = `Uke ${getIsoWeekNumber(weekDays[0])}, ${weekDays[0].toLocaleDateString("nb-NO", { day: "numeric", month: "short" })} - ${weekDays[6].toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (view === "month" ? navigateMonth(-1) : navigateWeek(-1))}
          >
            &larr;
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            I dag
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (view === "month" ? navigateMonth(1) : navigateWeek(1))}
          >
            &rarr;
          </Button>
          <h2 className="ml-1 sm:ml-2 text-sm sm:text-lg font-semibold capitalize truncate">
            {view === "month" ? monthLabel : weekLabel}
          </h2>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {draftCount > 0 && (
            <Button
              size="sm"
              onClick={() => void approveAll()}
            >
              Godkjenn alle ({draftCount})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateDialog(true)}
          >
            + Lag egen post
          </Button>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setView("month")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              view === "month"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Måned
          </button>
          <button
            type="button"
            onClick={() => setView("week")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              view === "week"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Uke
          </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="hidden sm:block">Tips: Godkjenn poster fortløpende. Godkjente poster publiseres automatisk.</p>
        <div className={cn(
          "rounded-lg border px-3 py-1.5 font-medium text-center sm:text-left",
          aiEditsRemaining > 0
            ? "border-border bg-muted/30 text-foreground"
            : "border-destructive/30 bg-destructive/5 text-destructive",
        )}>
          AI-endringer: {aiEditsRemaining} av {aiLimits.limit} igjen
        </div>
      </div>

      {hasGenerating && (
        <div className="sticky top-0 z-30 rounded-xl border-2 border-primary/30 bg-primary/10 px-5 py-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex size-8 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                <span className="relative size-3 rounded-full bg-primary" />
              </div>
              <div>
                <span className="text-base font-bold text-primary">Genererer innhold</span>
                <p className="text-xs text-muted-foreground">
                  {readyCount === 0
                    ? "Starter generering av tekst og bilder..."
                    : "Nye poster legges inn fortløpende i kalenderen"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="tabular-nums text-2xl font-bold text-primary">
                {readyCount}
              </span>
              <span className="text-sm text-muted-foreground"> / {posts.length}</span>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{ width: `${posts.length > 0 ? (readyCount / posts.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-center text-sm font-medium text-primary/80">
            {readyCount === 0
              ? "Poster genereres i bakgrunnen — du kan se kalenderen under imens"
              : `${readyCount} av ${posts.length} poster ferdig — ${posts.length - readyCount} gjenstår`}
          </p>
        </div>
      )}

      {status && !hasGenerating && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {status}
        </div>
      )}

      {view === "month" && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          <div className="min-w-[480px]">
          <div className="grid grid-cols-[2.5rem_repeat(7,1fr)] sm:grid-cols-[3rem_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div className="p-1.5 sm:p-2 text-center text-[9px] sm:text-[10px] font-medium uppercase text-muted-foreground">
              Uke
            </div>
            {DAY_NAMES.map((name) => (
              <div
                key={name}
                className="border-l border-border p-1.5 sm:p-2 text-center text-[9px] sm:text-[10px] font-medium uppercase text-muted-foreground"
              >
                {name}
              </div>
            ))}
          </div>

          {monthGrid.map((week, weekIdx) => {
            const weekNum = getIsoWeekNumber(week[0]);
            return (
              <div
                key={weekIdx}
                className="grid grid-cols-[2.5rem_repeat(7,1fr)] sm:grid-cols-[3rem_repeat(7,1fr)] border-b border-border last:border-b-0"
              >
                <div className="flex items-start justify-center border-r border-border p-1.5 sm:p-2 text-[9px] sm:text-[10px] font-medium text-muted-foreground">
                  {weekNum}
                </div>
                {week.map((day, dayIdx) => {
                  const dateKey = day.toISOString().slice(0, 10);
                  const dayPosts = postsByDate.get(dateKey) ?? [];
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();

                  return (
                    <div
                      key={dayIdx}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (draggingPostId) {
                          setDragOverDateKey(dateKey);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverDateKey === dateKey) {
                          setDragOverDateKey(null);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const droppedPostId = event.dataTransfer.getData("text/post-id") || draggingPostId;
                        if (droppedPostId) {
                          void movePostToDate(droppedPostId, dateKey);
                        }
                        setDraggingPostId(null);
                        setDragOverDateKey(null);
                      }}
                      className={cn(
                        "min-h-[80px] sm:min-h-[120px] border-l border-border p-1 sm:p-1.5 transition-colors",
                        !isCurrentMonth && "bg-muted/20",
                        isToday(day) && "bg-primary/5",
                        dragOverDateKey === dateKey && "ring-2 ring-primary/40 ring-inset bg-primary/10",
                      )}
                    >
                      <div
                        className={cn(
                          "mb-1 text-right text-xs",
                          isToday(day)
                            ? "inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold float-right"
                            : isCurrentMonth
                              ? "text-foreground"
                              : "text-muted-foreground/50",
                        )}
                      >
                        {day.getDate()}
                      </div>
                      <div className="clear-both space-y-0.5">
                        {dayPosts.slice(0, 4).map((post) => (
                          <PostCardMini
                            key={post.id}
                            post={post}
                            onClick={() => setSelectedPost(post)}
                            onDragStart={(id) => {
                              setDraggingPostId(id);
                            }}
                            onDragEnd={() => {
                              setDraggingPostId(null);
                              setDragOverDateKey(null);
                            }}
                          />
                        ))}
                        {dayPosts.length > 4 && (
                          <p className="text-[10px] text-muted-foreground">
                            +{dayPosts.length - 4} flere
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          <div className="min-w-[480px]">
          <div className="grid grid-cols-[2.5rem_repeat(7,1fr)] sm:grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div className="p-1.5 sm:p-2" />
            {weekDays.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "border-l border-border p-1.5 sm:p-2 text-center",
                  isToday(day) && "bg-primary/5",
                )}
              >
                <div className="text-[9px] sm:text-[10px] font-medium uppercase text-muted-foreground">
                  {DAY_NAMES[i]}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-base sm:text-lg font-semibold",
                    isToday(day) ? "text-primary" : "text-foreground",
                  )}
                >
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {HOURS.filter((h) => h >= 6 && h <= 22).map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-[2.5rem_repeat(7,1fr)] sm:grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border/50 last:border-b-0"
              >
                <div className="flex items-start justify-center p-1 text-[10px] text-muted-foreground">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {weekDays.map((day, dayIdx) => {
                  const dateKey = day.toISOString().slice(0, 10);
                  const dayPosts = postsByDate.get(dateKey) ?? [];
                  const hourPosts = dayPosts.filter(
                    (p) => new Date(p.scheduledAt).getHours() === hour,
                  );

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "min-h-[3rem] border-l border-border/50 p-0.5",
                        isToday(day) && "bg-primary/3",
                      )}
                    >
                      {hourPosts.map((post) => {
                        const weekScheduled = post.status === "scheduled";
                        const weekApproved = post.status === "approved";
                        const weekFailed = post.status === "failed";
                        return (
                          <button
                            key={post.id}
                            type="button"
                            onClick={() => setSelectedPost(post)}
                            className={cn(
                              "mb-0.5 w-full rounded border p-1.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80 cursor-pointer",
                              weekScheduled
                                ? "border-success bg-success/5"
                                : weekApproved
                                  ? "border-primary/50 bg-primary/5"
                                  : weekFailed
                                    ? "border-destructive/50 bg-destructive/5"
                                    : channelColor[post.channel],
                            )}
                          >
                            <div className="flex items-center gap-1">
                              <span
                                className={cn("size-1.5 rounded-full", channelDot[post.channel])}
                              />
                              <span className="font-medium capitalize">{post.channel}</span>
                              {weekScheduled && (
                                <span className="ml-auto flex size-3.5 items-center justify-center rounded-full bg-success text-[8px] text-white font-bold">✓</span>
                              )}
                              {weekApproved && (
                                <span className="ml-auto flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] text-white font-bold">✓</span>
                              )}
                              {weekFailed && (
                                <span className="ml-auto text-[9px] font-semibold text-destructive">!</span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-foreground/70">
                              {post.text.slice(0, 60)}...
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-facebook" /> Facebook
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-instagram" /> Instagram
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-linkedin" /> LinkedIn
          </span>
          <span className="hidden sm:inline text-border">|</span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/30" /> Utkast
          </span>
          <span className="flex items-center gap-1">
            <span className="flex size-3 items-center justify-center rounded-full bg-primary text-[7px] text-white font-bold">✓</span>
            Godkjent
          </span>
          <span className="flex items-center gap-1">
            <span className="flex size-3 items-center justify-center rounded-full bg-success text-[7px] text-white font-bold">✓</span>
            Publiseres
          </span>
        </div>
        <span>{posts.length} poster totalt</span>
      </div>

      {selectedPost && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setSelectedPost(null)}
            role="presentation"
          />
          <DetailPanel
            key={selectedPost.id}
            post={selectedPost}
            onClose={() => setSelectedPost(null)}
            onSave={(id, payload) => void updatePost(id, "save", payload)}
            onRegenerateAll={(id) => void updatePost(id, "regenerate_all")}
            onRegenerateText={(id) => void updatePost(id, "regenerate_text")}
            onRegenerateImage={(id) => void updatePost(id, "regenerate_image")}
            onRewriteTopic={(id, topic) => void updatePost(id, "rewrite_topic", { topic })}
            onApprove={(id) => void approvePost(id)}
            processingAction={processingPost?.id === selectedPost.id ? processingPost.action : null}
            approving={approvingId === selectedPost.id}
            aiEditsRemaining={aiEditsRemaining}
          />
        </>
      )}

      {showCreateDialog && (
        <CreatePostDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={(post) => {
            setPosts((prev) => [...prev, post].sort(
              (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
            ));
            setShowCreateDialog(false);
          }}
        />
      )}
    </div>
  );
};
