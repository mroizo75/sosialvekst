"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";

type OverviewResponse = {
  summary: {
    totalPosts: number;
    approvedPosts: number;
    scheduledPosts: number;
    publishedPosts: number;
    needsReviewPosts: number;
    queuedJobs: number;
    failedJobs: number;
    nextMonthPlanned: number;
  };
  subscription: {
    active: boolean;
    status: string;
    planCode: string;
    extraPostsPerWeek: number;
    postsPerWeekAllowance: number;
  };
};

const SUBSCRIPTION_STATUS_LABEL_NO: Record<string, string> = {
  active: "Aktiv",
  trialing: "Prøveperiode",
  past_due: "Forfalt",
  canceled: "Avsluttet",
  inactive: "Inaktiv",
};

const firstDayOfNextMonthIso = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0).toISOString();
};

export const DashboardPanel = () => {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [billingRequired, setBillingRequired] = useState(false);

  const refresh = async (options?: { quiet?: boolean; billingRequired?: boolean }) => {
    if (!options?.quiet) {
      setLoading(true);
    }
    if (typeof options?.billingRequired === "boolean") {
      setBillingRequired(options.billingRequired);
    }
    try {
      const response = await fetch("/api/dashboard/overview");
      if (!response.ok) {
        setError("Kunne ikke hente dashboard-data.");
        setStatus("Prøv igjen om noen sekunder.");
        return;
      }
      const data = (await response.json()) as OverviewResponse;
      setOverview(data);
      setError("");
    } catch {
      setError("Nettverksfeil ved henting av dashboard-data.");
      setStatus("Sjekk nettverk og prøv igjen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    void refresh({ billingRequired: url.searchParams.get("billing") === "required" });
  }, []);

  const canPublish = overview?.subscription.active ?? false;
  const planLabel = useMemo(() => {
    if (!overview) return "Ingen plan";
    return `${overview.subscription.planCode} (${overview.subscription.postsPerWeekAllowance} poster/uke)`;
  }, [overview]);
  const subscriptionLabel = useMemo(() => {
    if (!overview) return "Ukjent";
    return SUBSCRIPTION_STATUS_LABEL_NO[overview.subscription.status] ?? overview.subscription.status;
  }, [overview]);

  const createExtraPostsCheckout = async () => {
    try {
      setStatus("Oppretter betaling for tilleggspakke...");
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
      setStatus("Betaling klar. Klikk «Åpne Stripe Checkout».");
    } catch {
      setStatus("Nettverksfeil ved oppretting av betaling.");
    }
  };

  const planNextMonth = async () => {
    try {
      setStatus("Planlegger neste måned...");
      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postsPerWeek: 3,
          totalWeeks: 4,
          channels: ["facebook", "instagram", "linkedin"],
          mediaMode: "hybrid",
          countryCode: "NO",
          topicWindows: [],
          startDate: firstDayOfNextMonthIso(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setStatus(data.message ?? "Kunne ikke planlegge neste måned.");
        return;
      }
      setStatus("Neste måned er lagt til i planleggingen.");
      await refresh({ quiet: true });
    } catch {
      setStatus("Nettverksfeil ved planlegging av neste måned.");
    }
  };

  const queuePublishing = async () => {
    try {
      setStatus("Legger godkjente poster i publiseringskø...");
      const response = await fetch("/api/publish/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as { queued?: number; message?: string };
      if (!response.ok) {
        setStatus(data.message ?? "Kunne ikke opprette publiseringskø.");
        return;
      }
      setStatus(`${data.queued ?? 0} poster er lagt i kø.`);
      await refresh({ quiet: true });
    } catch {
      setStatus("Nettverksfeil ved køing av poster.");
    }
  };

  const runPublishing = async () => {
    try {
      setStatus("Kjører publisering...");
      const response = await fetch("/api/publish/run", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        processed?: number;
        published?: number;
        failed?: number;
        message?: string;
      };
      if (!response.ok) {
        setStatus(data.message ?? "Kunne ikke kjøre publisering.");
        return;
      }
      setStatus(
        `Publisering ferdig: ${data.published ?? 0} publisert, ${data.failed ?? 0} feilet av ${data.processed ?? 0}.`,
      );
      await refresh({ quiet: true });
    } catch {
      setStatus("Nettverksfeil ved kjøring av publisering.");
    }
  };

  if (loading && !overview) {
    return <p className="text-sm text-muted-foreground">Laster dashboard...</p>;
  }

  if (!overview) {
    return (
      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error || "Kunne ikke laste dashboard."}</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          Prøv igjen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {billingRequired && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          Du ble sendt hit fordi abonnement mangler. Aktivt abonnement kreves for AI-generering og automatisk publisering.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Totale poster" value={overview.summary.totalPosts} />
        <StatCard label="Godkjente" value={overview.summary.approvedPosts} />
        <StatCard label="I publiseringskø" value={overview.summary.queuedJobs} />
        <StatCard label="Publisert" value={overview.summary.publishedPosts} />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-base font-semibold">Abonnement og kapasitet</h2>
        <p className="text-sm text-muted-foreground">
          Status: <span className={canPublish ? "text-success" : "text-warning-foreground"}>{subscriptionLabel}</span>{" "}
          · Plan: {planLabel}
        </p>
        {!canPublish ? (
          <p className="text-xs text-warning-foreground">
            Kjøp eller aktiver abonnement for å låse opp generering og publisering.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Alt er klart for både planlegging, køing og publisering.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void createExtraPostsCheckout()}>
            Kjøp tilleggspakke (flere poster)
          </Button>
          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              Åpne Stripe Checkout
            </a>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-base font-semibold">Neste måned og publisering</h2>
        <p className="text-sm text-muted-foreground">
          Neste måned planlagt: {overview.summary.nextMonthPlanned} poster. Kjør planlegging først, deretter legg godkjente poster i kø.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void planNextMonth()} disabled={!canPublish}>
            Planlegg neste måned
          </Button>
          <Button size="sm" onClick={() => void queuePublishing()} disabled={!canPublish}>
            Legg godkjente i kø
          </Button>
          <Button variant="outline" size="sm" onClick={() => void runPublishing()} disabled={!canPublish}>
            Kjør publisering nå
          </Button>
        </div>
      </section>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : status ? (
        <p className="text-sm text-muted-foreground">{status}</p>
      ) : null}
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-border bg-card p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
  </div>
);

