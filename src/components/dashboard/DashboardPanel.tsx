"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ContentPlanDialog } from "@/components/dashboard/ContentPlanDialog";
import type { GenerateConfig } from "@/components/dashboard/ContentPlanDialog";
import { cn } from "@/lib/utils";
import type { MediaMode, SocialChannel } from "@/lib/types";

type OverviewResponse = {
  summary: {
    totalPosts: number;
    approvedPosts: number;
    scheduledPosts: number;
    publishedPosts: number;
    needsReviewPosts: number;
    queuedJobs: number;
    failedJobs: number;
    latestScheduledAt: string | null;
  };
  mediaMode: MediaMode;
  subscription: {
    active: boolean;
    status: string;
    planCode: string;
    extraPostsPerWeek: number;
    postsPerWeekAllowance: number;
  };
};

type RecoveryStatus = {
  stuckCount: number;
  failedRecoverableCount: number;
  failedPermanentCount: number;
  activelyGeneratingCount: number;
  totalProblematic: number;
};

type SocialAccountsResponse = {
  connected: Array<{
    channel: "facebook" | "instagram" | "linkedin" | "tiktok";
    account_id: string;
    updated_at: string;
  }>;
};

const SUBSCRIPTION_STATUS_LABEL_NO: Record<string, string> = {
  active: "Aktiv",
  trialing: "Prøveperiode",
  past_due: "Forfalt",
  canceled: "Avsluttet",
  inactive: "Ikke aktiv",
};

const SOCIAL_CONNECT_MESSAGE_NO: Record<string, string> = {
  meta_connected: "Facebook og Instagram er nå koblet til!",
  meta_connected_no_instagram: "Facebook er koblet til! Instagram ble ikke funnet — sjekk at kontoen er en profesjonell konto koblet til Facebook-siden din.",
  meta_invalid_state: "Noe gikk galt med Meta-innloggingen. Prøv igjen.",
  meta_token_failed: "Kunne ikke koble til Meta. Prøv igjen.",
  meta_no_pages: "Vi fant ingen Facebook-sider på kontoen din.",
  meta_save_failed: "Fant kontoen, men kunne ikke lagre den. Prøv igjen.",
  meta_callback_failed: "Noe gikk galt. Prøv igjen.",
  linkedin_connected: "LinkedIn er nå koblet til!",
  linkedin_invalid_state: "Noe gikk galt med LinkedIn-innloggingen. Prøv igjen.",
  linkedin_token_failed: "Kunne ikke koble til LinkedIn. Prøv igjen.",
  linkedin_profile_failed: "Kunne ikke hente LinkedIn-profil. Prøv igjen.",
  linkedin_save_failed: "Fant kontoen, men kunne ikke lagre den. Prøv igjen.",
  linkedin_callback_failed: "Noe gikk galt. Prøv igjen.",
  tiktok_connected: "TikTok er nå koblet til!",
  tiktok_auth_denied: "Du avbrøt TikTok-innloggingen. Prøv igjen.",
  tiktok_invalid_state: "Noe gikk galt med TikTok-innloggingen. Prøv igjen.",
  tiktok_token_failed: "Kunne ikke koble til TikTok. Prøv igjen.",
  tiktok_save_failed: "Fant kontoen, men kunne ikke lagre den. Prøv igjen.",
  tiktok_callback_failed: "Noe gikk galt. Prøv igjen.",
};

const POLL_INTERVAL_MS = 15_000;

const SOCIAL_PLATFORMS = [
  {
    channel: "facebook" as const,
    label: "Facebook",
    connectLabel: "Koble Facebook + Instagram",
    href: "/api/social/oauth/meta/start",
    gradient: "from-[#1877F2] to-[#0C63D4]",
    bgLight: "bg-[#1877F2]/5",
    borderLight: "border-[#1877F2]/20",
    textColor: "text-[#1877F2]",
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    channel: "instagram" as const,
    label: "Instagram",
    connectLabel: "Inkludert med Facebook",
    href: null,
    gradient: "from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    bgLight: "bg-[#DD2A7B]/5",
    borderLight: "border-[#DD2A7B]/20",
    textColor: "text-[#DD2A7B]",
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    channel: "linkedin" as const,
    label: "LinkedIn",
    connectLabel: "Koble LinkedIn",
    href: "/api/social/oauth/linkedin/start",
    gradient: "from-[#0A66C2] to-[#004182]",
    bgLight: "bg-[#0A66C2]/5",
    borderLight: "border-[#0A66C2]/20",
    textColor: "text-[#0A66C2]",
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
    extraLinks: [
      { label: "Koble LinkedIn Bedriftsside", href: "/api/social/oauth/linkedin/start?type=organization" },
    ],
  },
  {
    channel: "tiktok" as const,
    label: "TikTok",
    connectLabel: "Koble TikTok",
    href: "/api/social/oauth/tiktok/start",
    gradient: "from-[#000000] to-[#25F4EE]",
    bgLight: "bg-[#000000]/5",
    borderLight: "border-[#000000]/15",
    textColor: "text-foreground",
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
      </svg>
    ),
  },
] satisfies ReadonlyArray<{
  channel: "facebook" | "instagram" | "linkedin" | "tiktok";
  label: string;
  connectLabel: string;
  href: string | null;
  gradient: string;
  bgLight: string;
  borderLight: string;
  textColor: string;
  icon: React.ReactNode;
  extraLinks?: ReadonlyArray<{ label: string; href: string }>;
}>;

export const DashboardPanel = () => {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountsResponse["connected"]>([]);
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [billingRequired, setBillingRequired] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planGenerating, setPlanGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkRecoveryStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/posts/recover");
      if (response.ok) {
        const data = (await response.json()) as RecoveryStatus;
        setRecovery(data);
        return data;
      }
    } catch {
      /* nettverksfeil ignoreres for polling */
    }
    return null;
  }, []);

  const refresh = useCallback(async (options?: { quiet?: boolean; billingRequired?: boolean }) => {
    if (!options?.quiet) setLoading(true);
    if (typeof options?.billingRequired === "boolean") setBillingRequired(options.billingRequired);
    try {
      const [overviewResponse, socialResponse] = await Promise.all([
        fetch("/api/dashboard/overview"),
        fetch("/api/social/accounts"),
      ]);
      if (!overviewResponse.ok) {
        setError("Kunne ikke hente data. Prøv igjen om litt.");
        return;
      }
      const data = (await overviewResponse.json()) as OverviewResponse;
      setOverview(data);
      if (socialResponse.ok) {
        const socialData = (await socialResponse.json()) as SocialAccountsResponse;
        setSocialAccounts(socialData.connected ?? []);
      }
      setError("");
      await checkRecoveryStatus();
    } catch {
      setError("Nettverksfeil. Sjekk tilkoblingen og prøv igjen.");
    } finally {
      setLoading(false);
    }
  }, [checkRecoveryStatus]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const payment = url.searchParams.get("payment");
    const sessionId = url.searchParams.get("session_id");
    const socialConnectStatus = url.searchParams.get("social_connect");

    const run = async () => {
      await refresh({ billingRequired: url.searchParams.get("billing") === "required" });

      if (payment === "cancel") setStatus("Betaling ble avbrutt.");

      if (socialConnectStatus && SOCIAL_CONNECT_MESSAGE_NO[socialConnectStatus]) {
        setStatus(SOCIAL_CONNECT_MESSAGE_NO[socialConnectStatus]);
      }

      if (payment === "success" && sessionId) {
        setStatus("Bekrefter betaling...");
        const confirmResponse = await fetch("/api/stripe/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const confirmData = (await confirmResponse.json().catch(() => ({}))) as { message?: string };
        if (!confirmResponse.ok) {
          setStatus(confirmData.message ?? "Betaling gjennomført, men noe gikk galt.");
        } else {
          setStatus("Betaling bekreftet! Abonnementet er aktivt.");
          await refresh({ quiet: true });
        }
      }

      if (payment || sessionId || socialConnectStatus) {
        url.searchParams.delete("payment");
        url.searchParams.delete("session_id");
        url.searchParams.delete("social_connect");
        window.history.replaceState({}, "", url.toString());
      }
    };

    void run();
  }, [refresh]);

  const autoRecoveryTriggered = useRef(false);

  useEffect(() => {
    const hasActiveWork =
      (recovery?.activelyGeneratingCount ?? 0) > 0 ||
      (recovery?.stuckCount ?? 0) > 0;

    if (hasActiveWork && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void refresh({ quiet: true });
      }, POLL_INTERVAL_MS);
    }

    if (!hasActiveWork && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (
      (recovery?.stuckCount ?? 0) > 0 &&
      !autoRecoveryTriggered.current &&
      !recovering
    ) {
      autoRecoveryTriggered.current = true;
      void recoverPosts();
    }

    if ((recovery?.stuckCount ?? 0) === 0 && (recovery?.failedRecoverableCount ?? 0) === 0) {
      autoRecoveryTriggered.current = false;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [recovery, refresh, recovering]);

  const canPublish = overview?.subscription.active ?? false;
  const connectedChannels = useMemo(
    () => new Set(socialAccounts.map((a) => a.channel)),
    [socialAccounts],
  );
  const subscriptionLabel = useMemo(() => {
    if (!overview) return "Ukjent";
    return SUBSCRIPTION_STATUS_LABEL_NO[overview.subscription.status] ?? overview.subscription.status;
  }, [overview]);

  const createExtraPostsCheckout = async () => {
    try {
      setStatus("Oppretter betaling...");
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "extra_posts", returnPath: "/dashboard" }),
      });
      const data = (await response.json()) as { url?: string; message?: string };
      if (!response.ok || !data.url) {
        setStatus(data.message ?? "Kunne ikke opprette betaling.");
        return;
      }
      setCheckoutUrl(data.url);
      setStatus("");
    } catch {
      setStatus("Nettverksfeil.");
    }
  };

  const createBaseCheckout = async () => {
    try {
      setStatus("Sender deg til betaling...");
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "base", returnPath: "/dashboard" }),
      });
      const data = (await response.json()) as { url?: string; message?: string };
      if (!response.ok || !data.url) {
        setStatus(data.message ?? "Kunne ikke opprette betaling.");
        return;
      }
      setCheckoutUrl(data.url);
      setStatus("");
    } catch {
      setStatus("Nettverksfeil.");
    }
  };

  const recoverPosts = async () => {
    try {
      setRecovering(true);
      setStatus("Gjenoppretter feilede poster...");
      const response = await fetch("/api/posts/recover", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        recovered?: number;
        failed?: number;
        message?: string;
      };
      if (!response.ok) {
        setStatus(data.message ?? "Gjenoppretting feilet.");
        return;
      }
      const r = data.recovered ?? 0;
      const f = data.failed ?? 0;
      if (r > 0 && f === 0) {
        setStatus(`${r} poster gjenopprettet!`);
      } else if (r > 0 && f > 0) {
        setStatus(`${r} poster gjenopprettet, ${f} feilet fortsatt.`);
      } else {
        setStatus("Ingen poster kunne gjenopprettes akkurat nå. Prøv igjen om litt.");
      }
      await refresh({ quiet: true });
    } catch {
      setStatus("Nettverksfeil under gjenoppretting.");
    } finally {
      setRecovering(false);
    }
  };

  const handlePlanGenerate = async (config: GenerateConfig) => {
    try {
      setPlanGenerating(true);
      setStatus("Lager innhold — dette tar ca. 1–2 minutter...");

      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postsPerWeek: config.postsPerWeek,
          totalWeeks: config.totalWeeks,
          channels: config.channels,
          mediaMode: config.mediaMode,
          countryCode: "NO",
          topicWindows: config.topicWindows,
          startDate: config.startDate,
          postingDays: config.postingDays,
          postingHours: config.postingHours,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setStatus(data.message ?? "Kunne ikke lage innhold for neste periode.");
        return;
      }
      setPlanDialogOpen(false);
      setStatus("Innholdsplan opprettet! Postene genereres i bakgrunnen.");
      await refresh({ quiet: true });
    } catch {
      setStatus("Nettverksfeil.");
    } finally {
      setPlanGenerating(false);
    }
  };

  const queuePublishing = async () => {
    try {
      setStatus("Legger poster i publiseringskø...");
      const response = await fetch("/api/publish/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as {
        queued?: number;
        skipped?: number;
        skippedChannels?: string[];
        message?: string;
      };
      if (!response.ok) {
        setStatus(data.message ?? "Noe gikk galt.");
        return;
      }
      const parts: string[] = [`${data.queued ?? 0} poster lagt i kø.`];
      if (data.skipped && data.skipped > 0 && data.skippedChannels) {
        parts.push(
          `${data.skipped} poster hoppet over (${data.skippedChannels.join(", ")} er ikke koblet til).`,
        );
      }
      setStatus(parts.join(" "));
      await refresh({ quiet: true });
    } catch {
      setStatus("Nettverksfeil.");
    }
  };

  const runPublishing = async () => {
    try {
      setStatus("Publiserer...");
      const response = await fetch("/api/publish/run", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        processed?: number;
        published?: number;
        failed?: number;
        message?: string;
      };
      if (!response.ok) {
        setStatus(data.message ?? "Noe gikk galt med publiseringen.");
        return;
      }
      setStatus(
        `Ferdig! ${data.published ?? 0} publisert, ${data.failed ?? 0} feilet.`,
      );
      await refresh({ quiet: true });
    } catch {
      setStatus("Nettverksfeil.");
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-12">
            <div className="absolute inset-0 rounded-full border-[3px] border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-primary" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Laster oversikt...</p>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/20 bg-gradient-to-b from-destructive/5 to-transparent p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-foreground">Kunne ikke laste oversikt</p>
          <p className="mt-1 text-sm text-muted-foreground">{error || "Noe gikk galt. Sjekk tilkoblingen og prøv igjen."}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          Prøv igjen
        </Button>
      </div>
    );
  }

  const totalContent = overview.summary.totalPosts;
  const publishedPercent = totalContent > 0
    ? Math.round((overview.summary.publishedPosts / totalContent) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Status toast */}
      {(error || status) && (
        <div className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-sm animate-slide-up",
          error
            ? "border border-destructive/20 bg-destructive/5 text-destructive"
            : "border border-primary/20 bg-primary/5 text-foreground",
        )}>
          {error ? (
            <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          ) : (
            <svg className="size-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{error || status}</span>
        </div>
      )}

      {/* Billing required banner */}
      {billingRequired && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-5">
          <div className="absolute -right-8 -top-8 size-32 rounded-full bg-primary/5 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <svg className="size-5 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-foreground">Du trenger et aktivt abonnement</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Aktiver abonnement for å bruke AI-generering og automatisk publisering.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Generating banner */}
      {(recovery?.activelyGeneratingCount ?? 0) > 0 && (
        <div className="flex items-center gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4">
          <div className="relative size-10 shrink-0">
            <div className="absolute inset-0 rounded-full border-[3px] border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              Genererer {recovery?.activelyGeneratingCount} poster...
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Siden oppdateres automatisk når postene er klare.
            </p>
          </div>
        </div>
      )}

      {/* Recovery banner */}
      {(recovery?.totalProblematic ?? 0) > 0 && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-warning/20 bg-gradient-to-r from-warning/5 to-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/10">
              <svg className="size-5 text-warning-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {recovery!.totalProblematic} poster trenger oppmerksomhet
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {recovery!.stuckCount > 0 && `${recovery!.stuckCount} fastlåst. `}
                {recovery!.failedRecoverableCount > 0 && `${recovery!.failedRecoverableCount} kan prøves igjen.`}
                {(recovery?.failedPermanentCount ?? 0) > 0 && ` ${recovery!.failedPermanentCount} feilet permanent.`}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => void recoverPosts()} disabled={recovering}>
            {recovering ? "Gjenoppretter..." : "Prøv igjen"}
          </Button>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Totalt innhold"
          value={overview.summary.totalPosts}
          icon={
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
          delay={0}
        />
        <StatCard
          label="Godkjent"
          value={overview.summary.approvedPosts}
          accent="success"
          icon={
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          delay={1}
        />
        <StatCard
          label="I kø"
          value={overview.summary.queuedJobs}
          accent="primary"
          icon={
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          delay={2}
        />
        <StatCard
          label="Publisert"
          value={overview.summary.publishedPosts}
          accent="success"
          icon={
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          }
          delay={3}
        />
      </div>

      {/* Progress bar */}
      {totalContent > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Publiseringsfremdrift</span>
            <span className="text-sm font-bold tabular-nums text-primary">{publishedPercent}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary-hover transition-all duration-700 ease-out"
              style={{ width: `${publishedPercent}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>{overview.summary.publishedPosts} publisert</span>
            <span>{overview.summary.queuedJobs} i kø</span>
            <span>{overview.summary.approvedPosts} godkjent</span>
            <span>{overview.summary.needsReviewPosts} trenger gjennomgang</span>
          </div>
        </div>
      )}

      {/* Main action cards - 2 column */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Subscription card */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute -right-12 -top-12 size-40 rounded-full bg-primary/3 blur-3xl transition-opacity group-hover:opacity-100 opacity-0" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                <svg className="size-5 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Abonnement</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    canPublish
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning-foreground",
                  )}>
                    {subscriptionLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {overview.subscription.postsPerWeekAllowance} poster/uke
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!canPublish && (
                <Button size="sm" onClick={() => void createBaseCheckout()}>
                  Aktiver abonnement
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void createExtraPostsCheckout()}>
                Legg til flere poster
              </Button>
              {checkoutUrl && (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover transition-colors"
                >
                  Gå til betaling &rarr;
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Content planning card */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute -right-12 -top-12 size-40 rounded-full bg-accent/30 blur-3xl transition-opacity group-hover:opacity-100 opacity-0" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent">
                <svg className="size-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Planlegg innhold</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {overview.summary.latestScheduledAt
                    ? `Sist planlagt: ${new Date(overview.summary.latestScheduledAt).toLocaleDateString("nb-NO", { day: "numeric", month: "long" })}`
                    : "Lag AI-innhold for kommende uker"}
                </p>
              </div>
            </div>
            <div className="mt-4">
              {!canPublish ? (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Aktiver abonnement for å planlegge innhold.
                </p>
              ) : connectedChannels.size === 0 ? (
                <p className="rounded-lg bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
                  Koble til minst én sosial konto først.
                </p>
              ) : (
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={() => setPlanDialogOpen(true)}>
                    Planlegg innhold
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {overview.subscription.postsPerWeekAllowance} poster/uke
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Publishing section */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success/10">
            <svg className="size-5 text-success" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Publisering</h2>
            <p className="text-xs text-muted-foreground">
              Poster publiseres automatisk til planlagt tidspunkt.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => void queuePublishing()}
            disabled={!canPublish || overview.summary.approvedPosts === 0}
          >
            Legg godkjente i kø
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void runPublishing()}
            disabled={!canPublish || overview.summary.queuedJobs === 0}
          >
            Publiser forfalne nå
          </Button>
          {overview.summary.queuedJobs > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {overview.summary.queuedJobs} i kø
            </span>
          )}
        </div>
      </div>

      {/* Product images */}
      <ProductImageStatus />

      {/* Social accounts */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-secondary">
            <svg className="size-5 text-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.37a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Sosiale kontoer</h2>
            <p className="text-xs text-muted-foreground">
              {connectedChannels.size} av {SOCIAL_PLATFORMS.length} plattformer koblet til
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((platform) => {
            const isConnected = connectedChannels.has(platform.channel);
            return (
              <div
                key={platform.channel}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl border p-3.5 transition-all",
                  isConnected
                    ? `${platform.borderLight} ${platform.bgLight}`
                    : "border-border bg-card hover:border-border/80",
                )}
              >
                <div className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  isConnected
                    ? `bg-gradient-to-br ${platform.gradient} text-white`
                    : "bg-secondary text-muted-foreground",
                )}>
                  {platform.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{platform.label}</span>
                    {isConnected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        <span className="size-1 rounded-full bg-success" />
                        Koblet
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {platform.href && (
                      <a
                        href={platform.href}
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                          isConnected
                            ? "bg-secondary/80 text-muted-foreground hover:bg-secondary"
                            : `${platform.bgLight} ${platform.textColor} hover:opacity-80`,
                        )}
                      >
                        {isConnected ? "Koble på nytt" : platform.connectLabel}
                      </a>
                    )}
                    {platform.extraLinks?.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        className="inline-flex items-center rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
                      >
                        {link.label}
                      </a>
                    ))}
                    {!platform.href && !isConnected && (
                      <span className="text-[11px] text-muted-foreground">{platform.connectLabel}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ContentPlanDialog
        open={planDialogOpen}
        onClose={() => setPlanDialogOpen(false)}
        onGenerate={(config) => void handlePlanGenerate(config)}
        postsPerWeekAllowance={overview?.subscription.postsPerWeekAllowance ?? 3}
        connectedChannels={Array.from(connectedChannels) as SocialChannel[]}
        loading={planGenerating}
        latestScheduledAt={overview?.summary.latestScheduledAt ?? null}
        savedMediaMode={overview?.mediaMode ?? "hybrid"}
      />
    </div>
  );
};

type ProductImageItem = {
  id: string;
  productName: string;
  imageUrl: string;
  sortOrder: number;
};

const ProductImageStatus = () => {
  const [items, setItems] = useState<ProductImageItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/products/images");
        if (!response.ok) return;
        const data = (await response.json()) as { items: ProductImageItem[] };
        setItems(data.items ?? []);
      } catch {
        /* ignorer */
      } finally {
        setLoaded(true);
      }
    };
    void load();
  }, []);

  if (!loaded) return null;

  const uniqueProducts = new Set(items.map((i) => i.productName));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent">
          <svg className="size-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Produktbilder</h2>
          <p className="text-xs text-muted-foreground">
            {items.length === 0
              ? "Ingen bilder lastet opp — AI lager generiske bilder"
              : `${uniqueProducts.size} produkt${uniqueProducts.size !== 1 ? "er" : ""}, ${items.length} referansebilde${items.length !== 1 ? "r" : ""}`}
          </p>
        </div>
      </div>
      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="group relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.productName}
                className="size-14 object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-3">
                <span className="text-[9px] font-medium leading-none text-white">{item.productName}</span>
              </div>
            </div>
          ))}
          {items.length > 8 && (
            <div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground">
              +{items.length - 8}
            </div>
          )}
        </div>
      )}
      <a
        href="/onboarding"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
      >
        {items.length === 0 ? "Last opp produktbilder" : "Administrer bilder"}
        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </a>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  accent,
  icon,
  delay = 0,
}: {
  label: string;
  value: number;
  accent?: "primary" | "success";
  icon: React.ReactNode;
  delay?: number;
}) => (
  <div
    className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md animate-slide-up"
    style={{ animationDelay: `${delay * 80}ms`, animationFillMode: "both" }}
  >
    <div className="absolute -right-6 -top-6 size-20 rounded-full bg-primary/3 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
    <div className="relative">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          accent === "success" && value > 0 ? "bg-success/10 text-success" :
          accent === "primary" && value > 0 ? "bg-primary/10 text-primary" :
          "bg-secondary text-muted-foreground",
        )}>
          {icon}
        </div>
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tabular-nums tracking-tight",
          accent === "success" && value > 0 && "text-success",
          accent === "primary" && value > 0 && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  </div>
);
