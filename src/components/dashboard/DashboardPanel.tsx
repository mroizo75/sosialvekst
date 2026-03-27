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
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Laster oversikt...</p>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="text-sm text-destructive">{error || "Kunne ikke laste oversikt."}</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          Prøv igjen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {billingRequired && (
        <div className="rounded-2xl border border-primary/30 bg-primary-light px-5 py-4 text-sm">
          <p className="font-medium text-foreground">Du trenger et aktivt abonnement</p>
          <p className="mt-1 text-muted-foreground">
            Aktiver abonnement for å bruke AI-generering og automatisk publisering.
          </p>
        </div>
      )}

      {(recovery?.activelyGeneratingCount ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-light px-5 py-4 text-sm">
          <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div>
            <p className="font-medium text-foreground">
              Genererer {recovery?.activelyGeneratingCount} poster...
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Siden oppdateres automatisk når postene er klare.
            </p>
          </div>
        </div>
      )}

      {(recovery?.totalProblematic ?? 0) > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 px-5 py-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">
                {recovery!.totalProblematic} poster trenger oppmerksomhet
              </p>
              <p className="mt-1 text-muted-foreground">
                {recovery!.stuckCount > 0 && `${recovery!.stuckCount} fastlåst under generering. `}
                {recovery!.failedRecoverableCount > 0 && `${recovery!.failedRecoverableCount} feilet og kan prøves igjen.`}
                {(recovery?.failedPermanentCount ?? 0) > 0 && ` ${recovery!.failedPermanentCount} feilet permanent.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void recoverPosts()}
              disabled={recovering}
            >
              {recovering ? "Gjenoppretter..." : "Prøv igjen"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard label="Totalt" value={overview.summary.totalPosts} />
        <StatCard label="Godkjent" value={overview.summary.approvedPosts} accent="success" />
        <StatCard label="I kø" value={overview.summary.queuedJobs} accent="primary" />
        <StatCard label="Publisert" value={overview.summary.publishedPosts} accent="success" />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 sm:space-y-4">
        <div>
          <h2 className="text-base font-bold">Abonnement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Status:{" "}
            <span className={canPublish ? "text-success font-medium" : "text-warning-foreground font-medium"}>
              {subscriptionLabel}
            </span>
            {" · "}
            {overview.subscription.postsPerWeekAllowance} poster per uke
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!canPublish && (
            <Button size="sm" onClick={() => void createBaseCheckout()}>
              Aktiver abonnement
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void createExtraPostsCheckout()}>
            Legg til flere poster
          </Button>
          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-secondary transition-colors"
            >
              Gå til betaling
            </a>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 sm:space-y-4">
        <div>
          <h2 className="text-base font-bold">Planlegg fremover</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {overview.summary.latestScheduledAt
              ? `Siste planlagte post: ${new Date(overview.summary.latestScheduledAt).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}.`
              : "Lag innhold for kommende uker. Du kan planlegge opptil 1 år fremover."}
          </p>
          {connectedChannels.size > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Kanaler: {Array.from(connectedChannels).map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")}
            </p>
          )}
        </div>
        {!canPublish ? (
          <div className="rounded-xl bg-primary-light border border-primary/20 px-4 py-3 text-sm text-foreground">
            <p className="font-medium">Betaling kreves</p>
            <p className="mt-1 text-muted-foreground">
              Aktiver abonnement for å planlegge og publisere innhold.
            </p>
          </div>
        ) : connectedChannels.size === 0 ? (
          <div className="rounded-xl bg-warning/10 border border-warning/20 px-4 py-3 text-sm text-foreground">
            <p className="font-medium">Ingen kontoer koblet til</p>
            <p className="mt-1 text-muted-foreground">
              Koble til minst én sosial konto (Facebook, Instagram, LinkedIn eller TikTok) før du planlegger innhold.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => setPlanDialogOpen(true)}>
              Planlegg innhold
            </Button>
            <span className="text-xs text-muted-foreground">
              Opptil {overview.subscription.postsPerWeekAllowance} poster per uke
            </span>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 sm:space-y-4">
        <div>
          <h2 className="text-base font-bold">Publisering</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Poster publiseres automatisk på planlagt dato og tidspunkt.
            Legg godkjente poster i kø så håndteres resten.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void queuePublishing()} disabled={!canPublish || overview.summary.approvedPosts === 0}>
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
          {overview && overview.summary.queuedJobs > 0 && (
            <p className="text-xs text-muted-foreground">
              {overview.summary.queuedJobs} poster venter i kø
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Poster publiseres automatisk til planlagt tidspunkt via cron.
          Bruk knappen for å trigge forfalne poster manuelt.
        </p>
      </section>

      <ProductImageStatus />

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 sm:space-y-4">
        <div>
          <h2 className="text-base font-bold">Sosiale kontoer</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Koble til kontoene du vil publisere til.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/social/oauth/meta/start"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Koble Facebook + Instagram
          </a>
          <a
            href="/api/social/oauth/linkedin/start"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Koble LinkedIn
          </a>
          <a
            href="/api/social/oauth/tiktok/start"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Koble TikTok
          </a>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <ChannelStatus label="Facebook" connected={connectedChannels.has("facebook")} />
          <ChannelStatus label="Instagram" connected={connectedChannels.has("instagram")} />
          <ChannelStatus label="LinkedIn" connected={connectedChannels.has("linkedin")} />
          <ChannelStatus label="TikTok" connected={connectedChannels.has("tiktok")} />
        </div>
      </section>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : status ? (
        <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
          {status}
        </div>
      ) : null}

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
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 sm:space-y-4">
      <div>
        <h2 className="text-base font-bold">Produktbilder</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length === 0
            ? "Ingen produktbilder lastet opp. AI lager generiske bilder uten produktreferanser."
            : `${uniqueProducts.size} produkt${uniqueProducts.size !== 1 ? "er" : ""} med ${items.length} referansebilde${items.length !== 1 ? "r" : ""}. AI bruker disse i genererte bilder.`}
        </p>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/20 px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.productName}
                className="size-6 rounded object-cover"
              />
              <span className="text-xs font-medium text-foreground">{item.productName}</span>
            </div>
          ))}
          {items.length > 8 && (
            <span className="flex items-center text-xs text-muted-foreground">
              +{items.length - 8} til
            </span>
          )}
        </div>
      )}
      <a
        href="/onboarding"
        className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-secondary transition-colors"
      >
        {items.length === 0 ? "Last opp produktbilder" : "Administrer produktbilder"}
      </a>
    </section>
  );
};

const StatCard = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "primary" | "success";
}) => (
  <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
    <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">{label}</p>
    <p
      className={cn(
        "mt-1 sm:mt-1.5 text-2xl sm:text-3xl font-bold tabular-nums",
        accent === "success" && value > 0 && "text-success",
        accent === "primary" && value > 0 && "text-primary",
      )}
    >
      {value}
    </p>
  </div>
);

const ChannelStatus = ({ label, connected }: { label: string; connected: boolean }) => (
  <span className="flex items-center gap-1.5">
    <span
      className={cn(
        "size-2 rounded-full",
        connected ? "bg-success" : "bg-border",
      )}
    />
    <span className={connected ? "text-foreground font-medium" : "text-muted-foreground"}>
      {label}
    </span>
    <span className="text-xs text-muted-foreground">
      {connected ? "Koblet" : "Ikke koblet"}
    </span>
  </span>
);
