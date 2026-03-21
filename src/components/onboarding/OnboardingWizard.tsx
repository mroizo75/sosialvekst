"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox, Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { MediaMode, SocialChannel, TopicWindow } from "@/lib/types";

type WizardPayload = {
  companyName: string;
  fullName: string;
  countryCode: string;
  targetAudience: string;
  brandVoice: string;
  keyMessages: string[];
  logoUrl?: string;
  mediaMode: MediaMode;
  channels: SocialChannel[];
};

type ScrapeResult = {
  companyDescription: string;
  products: string[];
  uniqueSellingPoints: string[];
  websiteTitle?: string;
};

const STEPS = [
  "Analyser nettside",
  "Branding og logo",
  "Medieopplasting",
  "Generer innhold",
] as const;

const DEFAULT_CHANNELS: SocialChannel[] = ["facebook", "instagram", "linkedin"];
const TOPIC_WINDOWS_STORAGE_KEY = "onboarding_topic_windows_v1";

const Stepper = ({ currentStep }: { currentStep: number }) => (
  <nav className="mb-8 flex items-center justify-center gap-2">
    {STEPS.map((label, index) => {
      const stepNumber = index + 1;
      const isActive = stepNumber === currentStep;
      const isCompleted = stepNumber < currentStep;
      return (
        <div key={label} className="flex items-center gap-2">
          {index > 0 && (
            <div
              className={cn(
                "h-px w-8 sm:w-12",
                isCompleted ? "bg-primary" : "bg-border",
              )}
            />
          )}
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                isActive && "bg-primary text-primary-foreground",
                isCompleted && "bg-primary/20 text-primary",
                !isActive && !isCompleted && "bg-muted text-muted-foreground",
              )}
            >
              {isCompleted ? "\u2713" : stepNumber}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:block",
                isActive ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        </div>
      );
    })}
  </nav>
);

export const OnboardingWizard = () => {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [keyMessagesText, setKeyMessagesText] = useState("");

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [scrapeConsent, setScrapeConsent] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [editableDescription, setEditableDescription] = useState("");
  const [editableProducts, setEditableProducts] = useState("");
  const [editableUsps, setEditableUsps] = useState("");

  const [topicWindows, setTopicWindows] = useState<TopicWindow[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [newStartWeek, setNewStartWeek] = useState(1);
  const [newEndWeek, setNewEndWeek] = useState(2);

  const [form, setForm] = useState<WizardPayload>({
    companyName: "",
    fullName: "",
    countryCode: "NO",
    targetAudience: "",
    brandVoice: "",
    keyMessages: [],
    logoUrl: "",
    mediaMode: "hybrid",
    channels: DEFAULT_CHANNELS,
  });

  const [initialLoading, setInitialLoading] = useState(true);

  const update = <K extends keyof WizardPayload>(key: K, value: WizardPayload[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  type LoadedData = {
    exists: boolean;
    companyName: string;
    fullName: string;
    countryCode: string;
    targetAudience: string;
    brandVoice: string;
    keyMessages: string[];
    logoUrl: string;
    websiteUrl: string;
    companyDescription: string;
    products: string[];
    uniqueSellingPoints: string[];
  };

  const loadExistingData = useCallback(async () => {
    const response = await fetch("/api/onboarding/load");
    if (!response.ok) {
      setInitialLoading(false);
      return;
    }

    const data = (await response.json()) as LoadedData;
    if (!data.exists) {
      setInitialLoading(false);
      return;
    }

    setForm({
      companyName: data.companyName,
      fullName: data.fullName,
      countryCode: data.countryCode || "NO",
      targetAudience: data.targetAudience,
      brandVoice: data.brandVoice,
      keyMessages: data.keyMessages,
      logoUrl: data.logoUrl,
      mediaMode: "hybrid",
      channels: DEFAULT_CHANNELS,
    });
    setKeyMessagesText(data.keyMessages.join(", "));

    if (data.websiteUrl) {
      setWebsiteUrl(data.websiteUrl);
      setScrapeConsent(true);
    }
    if (data.companyDescription) {
      setEditableDescription(data.companyDescription);
      setScrapeResult({
        companyDescription: data.companyDescription,
        products: data.products,
        uniqueSellingPoints: data.uniqueSellingPoints,
      });
      setEditableProducts(data.products.join(", "));
      setEditableUsps(data.uniqueSellingPoints.join(", "));
    }

    if (data.targetAudience && data.brandVoice) {
      setStep(4);
    } else if (data.companyName) {
      setStep(2);
    }

    setInitialLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadExistingData(), 0);
    return () => clearTimeout(timer);
  }, [loadExistingData]);

  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/subscription/status");
      if (!response.ok) {
        setSubscriptionActive(false);
        return;
      }
      const data = (await response.json()) as { active: boolean };
      setSubscriptionActive(Boolean(data.active));
    } catch {
      setSubscriptionActive(false);
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptionStatus();
  }, [loadSubscriptionStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedStep = Number(params.get("step") ?? "");
    if (Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 4) {
      setStep(requestedStep);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sessionId = params.get("session_id");
    if (payment !== "success" || !sessionId) {
      return;
    }

    let cancelled = false;
    const confirmPayment = async () => {
      setStatus("Verifiserer betaling...");
      const response = await fetch("/api/stripe/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setStatus(data.message ?? "Betaling ble fullført, men abonnement ble ikke aktivert.");
        return;
      }
      setStatus("Baseplan aktivert. Du kan nå generere innholdsplan.");
      await loadSubscriptionStatus();
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    };

    void confirmPayment();
    return () => {
      cancelled = true;
    };
  }, [loadSubscriptionStatus]);

  useEffect(() => {
    const stored = sessionStorage.getItem(TOPIC_WINDOWS_STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as TopicWindow[];
      const valid = parsed
        .filter(
          (item) =>
            typeof item.topic === "string" &&
            item.topic.trim().length > 0 &&
            Number.isInteger(item.startWeek) &&
            Number.isInteger(item.endWeek) &&
            item.startWeek >= 1 &&
            item.endWeek <= 4 &&
            item.startWeek <= item.endWeek,
        )
        .map((item) => ({
          topic: item.topic.trim(),
          startWeek: item.startWeek,
          endWeek: item.endWeek,
        }));
      if (valid.length > 0) {
        setTopicWindows(valid);
      }
    } catch {
      sessionStorage.removeItem(TOPIC_WINDOWS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(TOPIC_WINDOWS_STORAGE_KEY, JSON.stringify(topicWindows));
  }, [topicWindows]);

  const parseKeyMessages = (value: string): string[] => {
    return value
      .split(/[,\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const addTopicWindow = () => {
    if (!newTopic.trim()) return;
    if (newStartWeek < 1 || newStartWeek > 4 || newEndWeek < 1 || newEndWeek > 4) {
      setStatus("Uke må være mellom 1 og 4.");
      return;
    }
    if (newStartWeek > newEndWeek) {
      setStatus("Fra uke kan ikke være etter til uke.");
      return;
    }
    setTopicWindows((prev) => [
      ...prev,
      { topic: newTopic.trim(), startWeek: newStartWeek, endWeek: newEndWeek },
    ]);
    setStatus("");
    setNewTopic("");
    setNewStartWeek(Math.min(newEndWeek + 1, 4));
    setNewEndWeek(Math.min(newEndWeek + 2, 4));
  };

  const removeTopicWindow = (index: number) => {
    setTopicWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const analyzeWebsite = async () => {
    if (!websiteUrl || !scrapeConsent) return;
    setLoading(true);
    setStatus("Analyserer nettside...");

    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: websiteUrl, companyName: form.companyName || "Bedrift" }),
    });

    if (!response.ok) {
      setStatus("Kunne ikke analysere nettsiden. Sjekk URL og prøv igjen.");
      setLoading(false);
      return;
    }

    const data = (await response.json()) as ScrapeResult;
    setScrapeResult(data);
    setEditableDescription(data.companyDescription);
    setEditableProducts(data.products.join(", "));
    setEditableUsps(data.uniqueSellingPoints.join(", "));
    setStatus("Analyse fullført! Rediger resultatene under om nødvendig.");
    setLoading(false);
  };

  const save = async () => {
    setLoading(true);
    setStatus("Lagrer...");
    const parsedKeyMessages = parseKeyMessages(keyMessagesText);
    const parsedProducts = parseKeyMessages(editableProducts);
    const parsedUsps = parseKeyMessages(editableUsps);
    const response = await fetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step,
        ...form,
        keyMessages: parsedKeyMessages,
        websiteUrl,
        companyDescription: editableDescription,
        products: parsedProducts,
        uniqueSellingPoints: parsedUsps,
      }),
    });

    if (!response.ok) {
      setStatus("Kunne ikke lagre steg");
      setLoading(false);
      return;
    }

    setStatus("");
    setLoading(false);
    setStep((v) => Math.min(v + 1, 4));
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    setStatus("Laster opp logo...");
    const payload = new FormData();
    payload.append("file", file);
    payload.append("mediaKind", "logo");

    const uploadResponse = await fetch("/api/media/upload", {
      method: "POST",
      body: payload,
    });

    if (!uploadResponse.ok) {
      setStatus("Logo-opplasting feilet");
      setUploadingLogo(false);
      return;
    }

    const data = (await uploadResponse.json()) as { publicUrl: string };
    update("logoUrl", data.publicUrl);
    setStatus("Logo lastet opp");
    setUploadingLogo(false);
  };

  const generateContentPlan = async () => {
    if (!subscriptionActive) {
      setStatus("Aktiv baseplan kreves før du kan generere innhold.");
      return;
    }
    setLoading(true);
    setStatus("Starter generering...");
    const response = await fetch("/api/content/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postsPerWeek: 3,
        totalWeeks: 4,
        channels: form.channels,
        mediaMode: form.mediaMode,
        countryCode: form.countryCode,
        topicWindows,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string; code?: string; details?: { message?: string; code?: string } }
        | null;
      const subscriptionError =
        data?.code === "SUBSCRIPTION_REQUIRED" || data?.details?.code === "SUBSCRIPTION_REQUIRED";
      if (subscriptionError) {
        setStatus("Aktiv baseplan kreves før du kan generere innhold.");
      } else {
        setStatus(data?.message ?? data?.details?.message ?? "Generering feilet.");
      }
      setLoading(false);
      return;
    }
    const result = await response.json() as { posts?: Array<{ id: string; channel: string; status: string; scheduledAt: string; text: string }> };
    if (result.posts) {
      sessionStorage.setItem("pendingPosts", JSON.stringify(result.posts));
    }
    sessionStorage.removeItem(TOPIC_WINDOWS_STORAGE_KEY);
    window.location.href = "/kalender";
  };

  const startBaseCheckout = async () => {
    try {
      setCheckoutLoading(true);
      setStatus("Oppretter betaling for baseplan...");
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "base", returnPath: "/onboarding?step=4" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
        details?: { message?: string };
      };
      if (!response.ok || !data.url) {
        setStatus(data.message ?? data.details?.message ?? "Kunne ikke starte betaling for baseplan.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setStatus("Nettverksfeil ved oppretting av baseplan-betaling.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const deleteAccount = async () => {
    const confirmed = window.confirm(
      "Er du sikker på at du vil slette konto? Alle filer og data blir slettet permanent.",
    );
    if (!confirmed) return;

    setStatus("Sletter konto...");
    const response = await fetch("/api/account/delete", { method: "DELETE" });
    if (!response.ok) {
      setStatus("Kunne ikke slette konto");
      return;
    }
    window.location.href = "/register";
  };

  if (initialLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">Laster inn data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Kom i gang med SosialVekst</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fyll ut informasjon om bedriften din slik at AI kan lage tilpasset innhold.
        </p>
      </div>

      <Stepper currentStep={step} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Analyser nettsiden din</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Oppgi nettsiden til bedriften din slik at vi kan hente informasjon om produkter,
              tjenester og unike salgsargumenter. Dette gjør AI-innholdet mye mer relevant.
            </p>

            <Input
              label="Firmanavn"
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="Mitt Firma AS"
            />

            <Input
              label="Nettside-URL"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://www.mittfirma.no"
            />

            <Checkbox
              label="Jeg godkjenner at SosialVekst analyserer nettsiden min"
              checked={scrapeConsent}
              onChange={(e) => setScrapeConsent(e.target.checked)}
            />

            <div className="flex gap-3">
              <Button
                onClick={() => void analyzeWebsite()}
                disabled={!websiteUrl || !scrapeConsent || loading}
              >
                {loading ? "Analyserer..." : "Analyser nettside"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep(2)}
              >
                Hopp over
              </Button>
            </div>

            {scrapeResult && (
              <div className="mt-4 space-y-4 rounded-lg border border-border bg-muted/50 p-4">
                <h4 className="text-sm font-semibold">Analyseresultat</h4>
                <Textarea
                  label="Bedriftsbeskrivelse"
                  value={editableDescription}
                  onChange={(e) => setEditableDescription(e.target.value)}
                  rows={3}
                />
                <Input
                  label="Produkter / tjenester (kommaseparert)"
                  value={editableProducts}
                  onChange={(e) => setEditableProducts(e.target.value)}
                />
                <Input
                  label="Unike salgsargumenter (kommaseparert)"
                  value={editableUsps}
                  onChange={(e) => setEditableUsps(e.target.value)}
                />
                <Button onClick={() => setStep(2)}>Godkjenn og gå videre</Button>
              </div>
            )}

            {status && (
              <p className="text-sm text-muted-foreground">{status}</p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Branding og logo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Fullt navn"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="Ola Nordmann"
            />

            {!form.companyName && (
              <Input
                label="Firmanavn"
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder="Mitt Firma AS"
              />
            )}

            <Input
              label="Målgruppe"
              value={form.targetAudience}
              onChange={(e) => update("targetAudience", e.target.value)}
              placeholder="Småbedrifter i Norge"
            />

            <Textarea
              label="Hvordan vil du at innleggene skal skrives?"
              value={form.brandVoice}
              onChange={(e) => update("brandVoice", e.target.value)}
              rows={4}
              placeholder="Eksempel: Vennlig og profesjonell. Enkelt språk. Konkrete tips."
            />
            <p className="text-xs text-muted-foreground -mt-2">
              Beskriv skrivestilen til AI: tone, ordvalg og hvordan budskapet formidles.
            </p>

            <Input
              label="Viktige budskap (kommaseparert)"
              value={keyMessagesText}
              onChange={(e) => setKeyMessagesText(e.target.value)}
              placeholder="Kvalitet først, lokal ekspertise, personlig service"
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Logo</label>
              {form.logoUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={form.logoUrl}
                    alt="Logo"
                    className="size-16 rounded-md border border-border object-contain"
                  />
                  <span className="text-xs text-muted-foreground">Logo lastet opp</span>
                </div>
              ) : null}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (!selected) return;
                  void uploadLogo(selected);
                  e.target.value = "";
                }}
                className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary-hover"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Tilbake
              </Button>
              <Button onClick={() => void save()} disabled={loading}>
                {loading ? "Lagrer..." : "Lagre og gå videre"}
              </Button>
            </div>

            {status && (
              <p className="text-sm text-muted-foreground">{status}</p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Medieopplasting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mediepreferanse</label>
              <select
                value={form.mediaMode}
                onChange={(e) => update("mediaMode", e.target.value as MediaMode)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ai_only">Kun AI-genererte bilder</option>
                <option value="hybrid">Egne bilder + AI-bilder</option>
                <option value="owned_only">Kun egne bilder/videoer</option>
              </select>
            </div>

            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                Du kan laste opp flere bilder og videoer i{" "}
                <Link href="/media" className="font-medium text-primary hover:underline">
                  mediebiblioteket
                </Link>{" "}
                når som helst.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Testmodus: kobling til sosiale kontoer hoppes over.
            </p>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Tilbake
              </Button>
              <Button onClick={() => setStep(4)}>
                Gå videre
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Generer innholdsplan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className={cn(
                "rounded-md border p-4",
                subscriptionActive
                  ? "border-success/30 bg-success/10"
                  : "border-warning/30 bg-warning/10",
              )}
            >
              <p className="text-sm font-medium">
                {subscriptionLoading
                  ? "Sjekker abonnement..."
                  : subscriptionActive
                    ? "Baseplan er aktiv."
                    : "Baseplan er ikke aktiv enda."}
              </p>
              {!subscriptionLoading && !subscriptionActive && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => void startBaseCheckout()} disabled={checkoutLoading}>
                    {checkoutLoading ? "Sender til betaling..." : "Aktiver baseplan"}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-4">
              <h4 className="text-sm font-semibold">Oppsummering</h4>
              <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div className="flex gap-2">
                  <dt className="font-medium text-foreground">Bedrift:</dt>
                  <dd>{form.companyName || "Ikke oppgitt"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-foreground">Målgruppe:</dt>
                  <dd>{form.targetAudience || "Ikke oppgitt"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-foreground">Kanaler:</dt>
                  <dd>{form.channels.join(", ")}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-foreground">Mediepreferanse:</dt>
                  <dd>{form.mediaMode}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Fokusemner (valgfritt)</h4>
              <p className="text-xs text-muted-foreground">
                Bestem hvilke emner postene skal fokusere på i bestemte uker.
                Uker uten emne får automatisk generelt innhold om bedriften.
              </p>

              {topicWindows.length > 0 && (
                <div className="space-y-2">
                  {topicWindows.map((tw, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                    >
                      <div className="text-sm">
                        <span className="font-medium">{tw.topic}</span>
                        <span className="ml-2 text-muted-foreground">
                          Uke {tw.startWeek}{tw.startWeek !== tw.endWeek ? `–${tw.endWeek}` : ""}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTopicWindow(index)}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      >
                        Fjern
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
                <div className="flex-1 min-w-[140px]">
                  <Input
                    label="Emne"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="F.eks. Salg, Bærekraft, Nytt produkt"
                  />
                </div>
                <div className="w-20">
                  <Input
                    label="Fra uke"
                    type="number"
                    min={1}
                    max={4}
                    value={newStartWeek}
                    onChange={(e) => setNewStartWeek(Number(e.target.value))}
                  />
                </div>
                <div className="w-20">
                  <Input
                    label="Til uke"
                    type="number"
                    min={1}
                    max={4}
                    value={newEndWeek}
                    onChange={(e) => setNewEndWeek(Number(e.target.value))}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTopicWindow}
                  disabled={!newTopic.trim()}
                  className="h-10"
                >
                  Legg til
                </Button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Vi genererer 3 poster per uke i 4 uker, for hver kanal du har valgt.
              Postene plasseres på mandag, onsdag og fredag.
            </p>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                Tilbake
              </Button>
              <Button
                onClick={() => void generateContentPlan()}
                disabled={loading || subscriptionLoading || !subscriptionActive}
              >
                {loading ? "Genererer..." : "Generer 4-ukers plan"}
              </Button>
            </div>

            {status && (
              <p className="mt-2 text-sm text-muted-foreground">{status}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
        <Link
          href={`/media?returnTo=${encodeURIComponent(`/onboarding?step=${step}`)}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Mediebibliotek
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void deleteAccount()}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          Slett konto
        </Button>
      </div>
    </div>
  );
};
