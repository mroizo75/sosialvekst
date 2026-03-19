"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { CreatePostDialog } from "@/components/calendar/CreatePostDialog";
import { cn } from "@/lib/utils";
import type { PostDraft, SocialChannel } from "@/lib/types";

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
};

const channelDot: Record<SocialChannel, string> = {
  facebook: "bg-facebook",
  instagram: "bg-instagram",
  linkedin: "bg-linkedin",
};

type PostCardMiniProps = {
  post: PostDraft;
  onClick: () => void;
};

const PostCardMini = ({ post, onClick }: PostCardMiniProps) => {
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

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-md border overflow-hidden text-left transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer",
        channelColor[post.channel],
      )}
    >
      {post.imageUrl && (
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
          <span className="capitalize">{post.channel}</span>
          {post.status === "approved" && (
            <span className="ml-auto inline-block size-1.5 rounded-full bg-green-500" title="Godkjent" />
          )}
          {post.status === "failed" && (
            <span className="ml-auto inline-block size-1.5 rounded-full bg-red-500" title="Feilet" />
          )}
        </div>
      </div>
    </button>
  );
};

type DetailPanelProps = {
  post: PostDraft;
  onClose: () => void;
  onSave: (id: string, payload: { text: string; imageUrl?: string }) => void;
  onRegenerateAll: (id: string) => void;
  onRegenerateText: (id: string) => void;
  onRegenerateImage: (id: string) => void;
  onRewriteTopic: (id: string, topic: string) => void;
  onApprove: (id: string) => void;
  processingAction: string | null;
  approving: boolean;
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
};

const PUBLISH_JOB_STATUS_LABEL_NO: Record<string, string> = {
  queued: "I kø",
  retrying: "Prøver igjen",
  processing: "Publiserer nå",
  completed: "Publisert",
  failed: "Feilet",
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
}: DetailPanelProps) => {
  const scheduledDate = new Date(post.scheduledAt);
  const [textDraft, setTextDraft] = useState(post.text);
  const [imageUrlDraft, setImageUrlDraft] = useState(post.imageUrl ?? "");
  const [topicDraft, setTopicDraft] = useState("");
  const [publishJobs, setPublishJobs] = useState<PublishJobHistory[]>([]);
  const [publishHistoryStatus, setPublishHistoryStatus] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  const isProcessing = Boolean(processingAction);

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
      if (event.key !== "Tab") {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        return;
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Rediger post"
        tabIndex={-1}
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Rediger post</h3>
            <p className="text-xs text-muted-foreground">
              {CHANNEL_LABEL_NO[post.channel]} · {scheduledDate.toLocaleDateString("nb-NO")}
            </p>
          </div>
          <Button autoFocus variant="ghost" size="sm" onClick={onClose}>
            Lukk
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr,1fr]">
            <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge channel={post.channel}>{CHANNEL_LABEL_NO[post.channel]}</Badge>
              <Badge status={post.status}>{STATUS_LABEL_NO[post.status] ?? post.status}</Badge>
              {post.intent ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  {post.intent.replace("_", " ")}
                </span>
              ) : null}
              {post.format ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                  {post.format.replace("_", " ")}
                </span>
              ) : null}
            </div>

            <div className="text-sm text-muted-foreground">
              <p>
                {scheduledDate.toLocaleDateString("nb-NO", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p>
                Kl.{" "}
                {scheduledDate.toLocaleTimeString("nb-NO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {post.imageUrl ? (
              <div className="flex h-[210px] w-full items-center justify-center rounded-lg border border-border bg-muted/20 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.imageUrl}
                  alt="Postbilde"
                  className="h-full w-full rounded-md object-contain"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
            ) : null}

            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Kvalitet</span>
                <span className={cn(
                  "font-medium",
                  post.quality.total >= 75 ? "text-success" : post.quality.total >= 55 ? "text-warning-foreground" : "text-destructive",
                )}>
                  {post.quality.total}/100
                </span>
              </div>
              <div className="flex gap-3">
                <span className={post.quality.companyMentioned ? "text-success" : "text-destructive"}>
                  {post.quality.companyMentioned ? "\u2713" : "\u2717"} Bedriftsnavn
                </span>
                <span className={post.quality.ctaPresent ? "text-success" : "text-destructive"}>
                  {post.quality.ctaPresent ? "\u2713" : "\u2717"} CTA
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Publiseringshistorikk</h4>
              {publishHistoryStatus ? (
                <p className="text-xs text-muted-foreground">{publishHistoryStatus}</p>
              ) : null}
              {publishJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ingen publiseringsforsøk ennå.</p>
              ) : (
                <div className="space-y-2">
                  {publishJobs.map((job) => (
                    <div key={job.id} className="rounded-md border border-border bg-background px-2 py-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>{CHANNEL_LABEL_NO[job.channel] ?? job.channel}</span>
                        <span
                          className={cn(
                            "font-medium",
                            job.status === "completed" && "text-success",
                            job.status === "failed" && "text-destructive",
                            (job.status === "queued" || job.status === "retrying") && "text-warning-foreground",
                            job.status === "processing" && "text-info",
                          )}
                        >
                          {PUBLISH_JOB_STATUS_LABEL_NO[job.status] ?? job.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Forsøk: {job.attempts} · Sist oppdatert: {new Date(job.updated_at).toLocaleString("nb-NO")}
                      </p>
                      {(job.status === "queued" || job.status === "retrying" || job.status === "processing") && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Neste/aktiv kjøring: {new Date(job.run_at).toLocaleString("nb-NO")}
                        </p>
                      )}
                      {job.last_error ? (
                        <p className="mt-1 text-[11px] text-destructive">{job.last_error}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>

            <div className="border-t border-border p-5 space-y-3 lg:border-l lg:border-t-0">
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
              <Textarea
                label="Posttekst"
                value={textDraft}
                onChange={(event) => setTextDraft(event.target.value)}
                rows={7}
                className="resize-none"
                placeholder="Skriv eller lim inn tekst..."
              />
              <Input
                label="Bilde-URL (valgfritt)"
                value={imageUrlDraft}
                onChange={(event) => setImageUrlDraft(event.target.value)}
                placeholder="https://..."
              />
              <Button
                onClick={() => onSave(post.id, { text: textDraft, imageUrl: imageUrlDraft })}
                disabled={isProcessing || textDraft.trim().length === 0}
                className="w-full"
              >
                {processingAction === "save" ? "Lagrer..." : "Lagre tekst og bilde"}
              </Button>
            </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                onClick={() => onRegenerateText(post.id)}
                disabled={isProcessing}
                variant="outline"
                size="sm"
                className="h-9"
              >
                {processingAction === "regenerate_text" ? "Genererer..." : "AI: Lag ny tekst"}
              </Button>
              <Button
                onClick={() => onRegenerateImage(post.id)}
                disabled={isProcessing}
                variant="outline"
                size="sm"
                className="h-9"
              >
                {processingAction === "regenerate_image" ? "Genererer..." : "AI: Lag nytt bilde"}
              </Button>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2">
              <Input
                label="Skriv om med nytt emne"
                value={topicDraft}
                onChange={(event) => setTopicDraft(event.target.value)}
                placeholder="Eksempel: HMS-opplæring for nyansatte"
              />
              <Button
                onClick={() => onRewriteTopic(post.id, topicDraft)}
                disabled={isProcessing || topicDraft.trim().length < 2}
                variant="outline"
                size="sm"
                className="h-9 w-full"
              >
                {processingAction === "rewrite_topic" ? "Skriver om..." : "AI: Skriv om med nytt emne"}
              </Button>
              </div>

              {(post.status === "draft" || post.status === "needs_review") && (
              <Button
                onClick={() => onApprove(post.id)}
                disabled={approving || isProcessing}
                className="w-full"
                variant="primary"
              >
                {approving ? "Godkjenner..." : "Godkjenn for publisering"}
              </Button>
              )}
              {post.status === "approved" && (
              <div className="rounded-md bg-success/10 px-3 py-2 text-center text-sm font-medium text-success">
                Godkjent — klar for automatisk publisering
              </div>
              )}
              <Button
              onClick={() => onRegenerateAll(post.id)}
              disabled={isProcessing}
              variant="outline"
              size="sm"
              className="h-9 w-full"
            >
              {processingAction === "regenerate_all" ? "Genererer..." : "AI: Lag helt ny versjon"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
      const data = (await response.json()) as { posts: PostDraft[] };
      setPosts(data.posts);
      setPollErrorCount(0);
    } catch {
      setStatus("Nettverksfeil ved henting av poster");
      setPollErrorCount((current) => Math.min(current + 1, 6));
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePost = async (
    postId: string,
    action: "save" | "regenerate_all" | "regenerate_text" | "regenerate_image" | "rewrite_topic",
    payload: Record<string, string | undefined> = {},
  ) => {
    setProcessingPost({ id: postId, action });
    setStatus(action === "save" ? "Lagrer endringer..." : "AI oppdaterer posten...");

    const response = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null) as { message?: string } | null;
      setStatus(data?.message ?? "Kunne ikke oppdatere posten.");
      setProcessingPost(null);
      return;
    }

    const updatedPost = (await response.json()) as PostDraft;
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    setSelectedPost(updatedPost);
    setStatus("");
    setProcessingPost(null);
  };

  const regenerateAll = async () => {
    if (!window.confirm("Vil du lage en helt ny 4-ukers plan? Eksisterende poster og bilder i planen blir erstattet.")) {
      return;
    }
    setSelectedPost(null);
    setPosts([]);
    setStatus("Starter ny plan og generering av poster...");

    const response = await fetch("/api/posts/regenerate-all", { method: "POST" });
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { message?: string } | null;
      setStatus(data?.message ?? "Kunne ikke starte regenerering.");
      await loadPosts();
      return;
    }
    const result = (await response.json()) as { total: number; posts: PostDraft[] };
    setStatus("");
    setPosts(result.posts);
    if (result.posts.length > 0) {
      setCurrentDate(new Date(result.posts[0].scheduledAt));
    }
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <h2 className="ml-2 text-lg font-semibold capitalize">
            {view === "month" ? monthLabel : weekLabel}
          </h2>
        </div>

        <div className="flex items-center gap-2">
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
            onClick={() => void regenerateAll()}
            disabled={hasGenerating || posts.length === 0}
          >
            Lag ny 4-ukers plan
          </Button>
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

      <p className="text-xs text-muted-foreground">
        Tips: Godkjenn poster fortløpende. Godkjente poster kan legges i publiseringskø fra dashboard eller publiseringssiden.
      </p>

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
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div className="p-2 text-center text-[10px] font-medium uppercase text-muted-foreground">
              Uke
            </div>
            {DAY_NAMES.map((name) => (
              <div
                key={name}
                className="border-l border-border p-2 text-center text-[10px] font-medium uppercase text-muted-foreground"
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
                className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border last:border-b-0"
              >
                <div className="flex items-start justify-center border-r border-border p-2 text-[10px] font-medium text-muted-foreground">
                  {weekNum}
                </div>
                {week.map((day, dayIdx) => {
                  const dateKey = day.toISOString().slice(0, 10);
                  const dayPosts = postsByDate.get(dateKey) ?? [];
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "min-h-[120px] border-l border-border p-1.5 transition-colors",
                        !isCurrentMonth && "bg-muted/20",
                        isToday(day) && "bg-primary/5",
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
      )}

      {view === "week" && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div className="p-2" />
            {weekDays.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "border-l border-border p-2 text-center",
                  isToday(day) && "bg-primary/5",
                )}
              >
                <div className="text-[10px] font-medium uppercase text-muted-foreground">
                  {DAY_NAMES[i]}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-lg font-semibold",
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
                className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border/50 last:border-b-0"
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
                      {hourPosts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setSelectedPost(post)}
                          className={cn(
                            "mb-0.5 w-full rounded border p-1.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80 cursor-pointer",
                            channelColor[post.channel],
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <span
                              className={cn("size-1.5 rounded-full", channelDot[post.channel])}
                            />
                            <span className="font-medium capitalize">{post.channel}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-foreground/70">
                            {post.text.slice(0, 60)}...
                          </p>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-facebook" /> Facebook
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-instagram" /> Instagram
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-linkedin" /> LinkedIn
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
