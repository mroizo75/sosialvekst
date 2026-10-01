"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { MIN_PROFILE_SAMPLES } from "@/lib/metrics/constants";
import { cn } from "@/lib/utils";
import type { SocialChannel } from "@/lib/types";

type OverviewPost = {
  postId: string;
  channel: SocialChannel;
  publishedAt: string;
  title: string;
  formatLabel: string | null;
  mediaFormat: "reel" | "image";
  imageUrl: string | null;
  hasMeta: boolean;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  relative: number;
};

type OverviewProfile = {
  channel: SocialChannel;
  sampleSize: number;
  ready: boolean;
  bestFormats: Array<{ key: string; weight: number; label: string }>;
  bestHours: number[];
  reelVsImage: { reel: number | null; image: number | null; reelCount: number; imageCount: number };
};

type Overview = {
  setupMissing: boolean;
  recommendedHours: number[];
  accounts: Array<{ channel: SocialChannel; metricsStatus: string }>;
  profiles: OverviewProfile[];
  posts: OverviewPost[];
  nextDraftByChannel: Partial<Record<SocialChannel, string | null>>;
};

const CHANNEL_LABELS: Record<SocialChannel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

const RECONNECT_HREF: Record<SocialChannel, string> = {
  facebook: "/api/social/oauth/meta/start?returnTo=/statistikk",
  instagram: "/api/social/oauth/meta/start?returnTo=/statistikk",
  linkedin: "/api/social/oauth/linkedin/start?returnTo=/statistikk",
  tiktok: "/api/social/oauth/tiktok/start?returnTo=/statistikk",
};

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const hourLabel = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

const readError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  return payload.message ?? `Noe gikk galt (HTTP ${response.status}).`;
};

const RelativeBadge = ({ relative }: { relative: number }) => (
  <span
    className={cn(
      "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
      relative >= 1.2 && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
      relative < 1.2 && relative > 0.8 && "bg-muted text-muted-foreground",
      relative <= 0.8 && "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    )}
  >
    {relative.toFixed(1)}× snittet
  </span>
);

const ReelVsImage = ({ stats }: { stats: OverviewProfile["reelVsImage"] }) => {
  if (stats.reelCount === 0 || stats.imageCount === 0 || stats.reel === null || stats.image === null) {
    return stats.reelCount > 0
      ? <p className="text-xs text-muted-foreground">Reels målt: {stats.reelCount}. Sammenligning med bilde kommer når begge er målt.</p>
      : null;
  }
  const ratio = stats.image > 0 ? stats.reel / stats.image : 1;
  const verdict = ratio >= 1.1
    ? `Reels gir ${ratio.toFixed(1)}× engasjementet til bildeposter`
    : ratio <= 0.9
      ? `Bildeposter gir ${(1 / ratio).toFixed(1)}× engasjementet til reels`
      : "Reels og bildeposter gir omtrent like mye engasjement";
  return (
    <>
      <p className="text-xs text-muted-foreground">Reel mot bilde ({stats.reelCount} mot {stats.imageCount})</p>
      <p className="text-sm text-foreground">{verdict}</p>
    </>
  );
};

export const StatisticsPanel = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/metrics/overview", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      setOverview((await response.json()) as Overview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente statistikk.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const collectNow = async () => {
    setCollecting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/metrics/run", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { collected: number; missingPermission: number };
      setNotice(result.collected > 0
        ? `Hentet statistikk for ${result.collected} ${result.collected === 1 ? "post" : "poster"}.`
        : "Ingen poster har nådd et nytt målepunkt ennå. Statistikk hentes etter 24 timer, 3 dager og 7 dager.");
      await load();
    } catch (collectError) {
      setNotice(collectError instanceof Error ? collectError.message : "Kunne ikke hente statistikk.");
    } finally {
      setCollecting(false);
    }
  };

  const makeMoreLikeThis = async (post: OverviewPost) => {
    const draftId = overview?.nextDraftByChannel[post.channel];
    if (!draftId) return;
    setBusyPostId(post.postId);
    setNotice(null);
    try {
      const response = await fetch(`/api/posts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "more_like_this", sourcePostId: post.postId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setNotice(`Neste ${CHANNEL_LABELS[post.channel]}-utkast er laget på nytt i samme form. Se det i kalenderen.`);
      await load();
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : "Kunne ikke lage ny post.");
    } finally {
      setBusyPostId(null);
    }
  };

  if (loading && !overview) {
    return <p className="text-sm text-muted-foreground">Henter statistikk…</p>;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!overview) return null;

  const blocked = overview.accounts.filter((account) => account.metricsStatus === "missing_permission");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Statistikk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Se hva som gir engasjement. Nye poster lages mer i formen som fungerer, og noen prøver nye vinkler.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={collectNow} disabled={collecting}>
          {collecting ? "Henter…" : "Hent statistikk nå"}
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">{notice}</div>
      )}

      {overview.setupMissing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          Statistikk er ikke satt opp i databasen ennå. Kjør migrasjon 024.
        </div>
      )}

      {blocked.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Koble til på nytt for å hente statistikk
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Vi trenger tilgang til innsikt for disse kontoene. Koble til på nytt og godkjenn tilgangen til statistikk.
            </p>
            <div className="flex flex-wrap gap-2">
              {blocked.map((account) => (
                <Link key={account.channel} href={RECONNECT_HREF[account.channel]}>
                  <Button size="sm" variant="outline">Koble til {CHANNEL_LABELS[account.channel]} på nytt</Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {overview.profiles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview.profiles.map((profile) => (
            <Card key={profile.channel}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{CHANNEL_LABELS[profile.channel]}</p>
                  <span className="text-xs text-muted-foreground">{profile.sampleSize} målt</span>
                </div>
                {profile.ready ? (
                  <>
                    <p className="text-xs text-muted-foreground">Beste former</p>
                    <p className="text-sm text-foreground">
                      {profile.bestFormats.map((entry) => entry.label).join(", ") || "Ingen klar vinner ennå"}
                    </p>
                    <p className="text-xs text-muted-foreground">Beste tider</p>
                    <p className="text-sm text-foreground">
                      {profile.bestHours.length ? profile.bestHours.map(hourLabel).join(", ") : "Ingen klar vinner ennå"}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Læringen starter etter {MIN_PROFILE_SAMPLES} målte poster ({profile.sampleSize}/{MIN_PROFILE_SAMPLES}).
                  </p>
                )}
                <ReelVsImage stats={profile.reelVsImage} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {overview.posts.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Ingen statistikk ennå. Den første hentes 24 timer etter at en post er publisert.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {overview.posts.map((post) => {
            const draftId = overview.nextDraftByChannel[post.channel];
            const canRepeat = post.hasMeta && Boolean(draftId);
            return (
              <Card key={post.postId}>
                <CardContent className="flex gap-3 p-3">
                  {post.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.imageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="size-16 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{CHANNEL_LABELS[post.channel]}</span>
                      <span>{dateLabel(post.publishedAt)}</span>
                      {post.formatLabel && <span>{post.formatLabel}</span>}
                      {post.mediaFormat === "reel" && (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Reel</span>
                      )}
                      <RelativeBadge relative={post.relative} />
                    </div>
                    <p className="truncate text-sm font-medium text-foreground">{post.title || "Uten tittel"}</p>
                    <p className="text-xs text-muted-foreground">
                      {post.views} visninger · {post.reach} nådd · {post.likes} likes · {post.comments} kommentarer · {post.shares} delinger · {post.saves} lagringer
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canRepeat || busyPostId !== null}
                      title={canRepeat ? undefined : "Krever et kommende utkast på samme kanal og en post laget etter denne oppdateringen."}
                      onClick={() => makeMoreLikeThis(post)}
                    >
                      {busyPostId === post.postId ? "Lager…" : "Lag mer som dette"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
