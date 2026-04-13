"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox, Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { BrandColors, MediaMode, ProductImage, SocialChannel, TopicWindow } from "@/lib/types";

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
  industry: string;
  foundedYear: string;
  teamDescription: string;
  coreValues: string[];
  customerPainPoints: string[];
  customerSuccessStories: string[];
  services: string[];
  priceRange: string;
  brandPersonality: string;
  brandDosAndDonts: string;
  competitorDifferentiators: string;
  commonQuestions: string[];
  seasonalFocus: string;
  tagline: string;
  slogan: string;
  brandColors: BrandColors;
  fontStyle: string;
};

type ScrapeResult = {
  companyDescription: string;
  products: string[];
  uniqueSellingPoints: string[];
  websiteTitle?: string;
};

const WIZARD_STEPS = [
  { label: "Om bedriften", description: "Vi henter info fra nettsiden din" },
  { label: "Stil og tone", description: "Hvordan skal innleggene se ut?" },
  { label: "Oppsett", description: "Velg kanaler og medier" },
  { label: "Lag innhold", description: "Vi lager poster for deg" },
] as const;

const CHANNEL_OPTIONS: Array<{ value: SocialChannel; label: string }> = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
];

const MEDIA_MODE_OPTIONS: Array<{ value: MediaMode; label: string; description: string }> = [
  { value: "ai_only", label: "AI-bilder", description: "AI lager alle bilder for deg" },
  { value: "hybrid", label: "Mine + AI-bilder", description: "Kombinasjon av dine bilder og AI" },
  { value: "owned_only", label: "Mine egne", description: "Bare dine egne bilder og videoer" },
];

const TOPIC_WINDOWS_STORAGE_KEY = "onboarding_topic_windows_v1";

const Stepper = ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => (
  <nav className="mb-8">
    <div className="flex items-center justify-center gap-0">
      {WIZARD_STEPS.slice(0, totalSteps).map((step, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;
        return (
          <div key={step.label} className="flex items-center">
            {index > 0 && (
              <div
                className={cn(
                  "h-0.5 w-8 sm:w-16 transition-colors",
                  isCompleted ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl text-sm font-bold transition-all",
                  isActive && "bg-primary text-primary-foreground shadow-md scale-110",
                  isCompleted && "bg-primary/15 text-primary",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? "\u2713" : stepNumber}
              </div>
              <span
                className={cn(
                  "block text-xs font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  </nav>
);

type ConnectedAccount = {
  channel: SocialChannel;
  account_id: string;
  tokenStatus?: "valid" | "expired" | "missing";
};

export const OnboardingWizard = () => {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"loading" | "wizard" | "settings">("loading");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [postsPerWeekAllowance, setPostsPerWeekAllowance] = useState(3);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [keyMessagesText, setKeyMessagesText] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);

  const accountStatusMap = new Map(connectedAccounts.map((a) => [a.channel, a.tokenStatus ?? "valid"]));
  const connectedChannels = new Set(
    connectedAccounts.filter((a) => !a.tokenStatus || a.tokenStatus === "valid").map((a) => a.channel),
  );

  const getChannelStatusLabel = (channel: SocialChannel): { text: string; className: string } => {
    const status = accountStatusMap.get(channel);
    if (!status) return { text: "Ikke koblet", className: "text-muted-foreground" };
    if (status === "valid") return { text: "Koblet", className: "text-success" };
    if (status === "expired") return { text: "Utløpt", className: "text-warning-foreground" };
    return { text: "Ugyldig", className: "text-destructive" };
  };

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
    channels: [],
    industry: "",
    foundedYear: "",
    teamDescription: "",
    coreValues: [],
    customerPainPoints: [],
    customerSuccessStories: [],
    services: [],
    priceRange: "",
    brandPersonality: "",
    brandDosAndDonts: "",
    competitorDifferentiators: "",
    commonQuestions: [],
    seasonalFocus: "",
    tagline: "",
    slogan: "",
    brandColors: {},
    fontStyle: "",
  });

  const update = <K extends keyof WizardPayload>(key: K, value: WizardPayload[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const toggleChannel = (channel: SocialChannel) => {
    setForm((previous) => {
      const exists = previous.channels.includes(channel);
      if (exists) {
        if (previous.channels.length === 1) return previous;
        return { ...previous, channels: previous.channels.filter((v) => v !== channel) };
      }
      return { ...previous, channels: [...previous.channels, channel] };
    });
  };

  type LoadedData = {
    exists: boolean;
    hasBrandProfile: boolean;
    hasContentPlan: boolean;
    workspaceName: string;
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
    industry: string;
    foundedYear: string;
    teamDescription: string;
    coreValues: string[];
    customerPainPoints: string[];
    customerSuccessStories: string[];
    services: string[];
    priceRange: string;
    brandPersonality: string;
    brandDosAndDonts: string;
    competitorDifferentiators: string;
    commonQuestions: string[];
    seasonalFocus: string;
    tagline: string;
    slogan: string;
    brandColors: BrandColors;
    fontStyle: string;
    mediaMode: MediaMode;
    channels: SocialChannel[];
  };

  const [coreValuesText, setCoreValuesText] = useState("");
  const [customerPainPointsText, setCustomerPainPointsText] = useState("");
  const [customerSuccessStoriesText, setCustomerSuccessStoriesText] = useState("");
  const [servicesText, setServicesText] = useState("");
  const [commonQuestionsText, setCommonQuestionsText] = useState("");

  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [productImageName, setProductImageName] = useState("");
  const [uploadingProductImage, setUploadingProductImage] = useState(false);

  const fetchConnectedAccounts = useCallback(async (): Promise<SocialChannel[]> => {
    try {
      const response = await fetch("/api/social/accounts");
      if (!response.ok) return [];
      const data = (await response.json()) as { connected?: ConnectedAccount[] };
      const accounts = data.connected ?? [];
      setConnectedAccounts(accounts);
      return accounts.map((a) => a.channel);
    } catch {
      return [];
    }
  }, []);

  const fetchProductImages = useCallback(async () => {
    try {
      const response = await fetch("/api/products/images");
      if (!response.ok) return;
      const data = (await response.json()) as { items: ProductImage[] };
      setProductImages(data.items ?? []);
    } catch {
      /* ignorerer nettverksfeil */
    }
  }, []);

  const uploadProductImage = async (file: File) => {
    if (!productImageName.trim()) {
      setStatus("Skriv inn produktnavn først.");
      return;
    }
    setUploadingProductImage(true);
    setStatus("Laster opp produktbilde...");

    const payload = new FormData();
    payload.append("file", file);
    payload.append("mediaKind", "image");

    const uploadResponse = await fetch("/api/media/upload", {
      method: "POST",
      body: payload,
    });

    if (!uploadResponse.ok) {
      setStatus("Kunne ikke laste opp bildet. Prøv igjen.");
      setUploadingProductImage(false);
      return;
    }

    const uploadData = (await uploadResponse.json()) as { publicUrl: string };

    const saveResponse = await fetch("/api/products/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: productImageName.trim(),
        imageUrl: uploadData.publicUrl,
        sortOrder: productImages.filter((pi) => pi.productName === productImageName.trim()).length,
      }),
    });

    if (!saveResponse.ok) {
      setStatus("Bildet ble lastet opp, men kunne ikke lagres som produktbilde.");
      setUploadingProductImage(false);
      return;
    }

    setStatus("Produktbilde lagt til!");
    setUploadingProductImage(false);
    await fetchProductImages();
  };

  const deleteProductImage = async (id: string) => {
    const response = await fetch("/api/products/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (response.ok) {
      setProductImages((prev) => prev.filter((pi) => pi.id !== id));
    }
  };

  const loadExistingData = useCallback(async () => {
    const [response, liveChannels] = await Promise.all([
      fetch("/api/onboarding/load"),
      fetchConnectedAccounts(),
      fetchProductImages(),
    ]);

    if (!response.ok) {
      setForm((prev) => ({ ...prev, channels: liveChannels }));
      setStatus("Kunne ikke laste lagret data. Du kan fylle ut skjemaet på nytt.");
      setMode("wizard");
      return;
    }

    const data = (await response.json()) as LoadedData;
    if (!data.exists && !data.hasBrandProfile) {
      setForm((prev) => ({
        ...prev,
        companyName: data.workspaceName || prev.companyName,
        channels: liveChannels,
      }));
      setMode("wizard");
      return;
    }

    const resolvedChannels = liveChannels.length > 0 ? liveChannels : (data.channels ?? []);

    setForm({
      companyName: data.companyName,
      fullName: data.fullName,
      countryCode: data.countryCode || "NO",
      targetAudience: data.targetAudience,
      brandVoice: data.brandVoice,
      keyMessages: data.keyMessages,
      logoUrl: data.logoUrl,
      mediaMode: data.mediaMode ?? "hybrid",
      channels: resolvedChannels,
      industry: data.industry ?? "",
      foundedYear: data.foundedYear ?? "",
      teamDescription: data.teamDescription ?? "",
      coreValues: data.coreValues ?? [],
      customerPainPoints: data.customerPainPoints ?? [],
      customerSuccessStories: data.customerSuccessStories ?? [],
      services: data.services ?? [],
      priceRange: data.priceRange ?? "",
      brandPersonality: data.brandPersonality ?? "",
      brandDosAndDonts: data.brandDosAndDonts ?? "",
      competitorDifferentiators: data.competitorDifferentiators ?? "",
      commonQuestions: data.commonQuestions ?? [],
      seasonalFocus: data.seasonalFocus ?? "",
      tagline: data.tagline ?? "",
      slogan: data.slogan ?? "",
      brandColors: data.brandColors ?? {},
      fontStyle: data.fontStyle ?? "",
    });
    setKeyMessagesText(data.keyMessages.join(", "));
    setCoreValuesText((data.coreValues ?? []).join(", "));
    setCustomerPainPointsText((data.customerPainPoints ?? []).join("\n"));
    setCustomerSuccessStoriesText((data.customerSuccessStories ?? []).join("\n"));
    setServicesText((data.services ?? []).join(", "));
    setCommonQuestionsText((data.commonQuestions ?? []).join("\n"));

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

    const onboardingComplete = data.hasContentPlan && data.hasBrandProfile && Boolean(data.targetAudience) && Boolean(data.brandVoice);
    if (onboardingComplete) {
      setMode("settings");
    } else if (data.hasBrandProfile && Boolean(data.targetAudience) && Boolean(data.brandVoice)) {
      setStep(3);
      setMode("wizard");
    } else if (data.hasBrandProfile && data.companyName) {
      setStep(2);
      setMode("wizard");
    } else {
      setMode("wizard");
    }
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
      const data = (await response.json()) as { active: boolean; postsPerWeekAllowance?: number };
      setSubscriptionActive(Boolean(data.active));
      const allowance = data.postsPerWeekAllowance ?? 3;
      setPostsPerWeekAllowance(allowance);
      setPostsPerWeek(allowance);
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
    if (mode !== "wizard") return;
    const params = new URLSearchParams(window.location.search);
    const requestedStep = Number(params.get("step") ?? "");
    if (Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 4) {
      setStep(requestedStep);
    }
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sessionId = params.get("session_id");
    if (payment !== "success" || !sessionId) return;

    let cancelled = false;
    const confirmPayment = async () => {
      setStatus("Bekrefter betaling...");
      const response = await fetch("/api/stripe/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        details?: { message?: string };
      };
      if (cancelled) return;
      if (!response.ok) {
        setStatus(data.message ?? data.details?.message ?? "Betaling fullført, men noe gikk galt.");
      } else {
        setStatus("Abonnement aktivert! Du kan nå lage innhold.");
      }
      await loadSubscriptionStatus();
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    };

    void confirmPayment();
    return () => { cancelled = true; };
  }, [loadSubscriptionStatus]);

  useEffect(() => {
    if (mode !== "wizard") return;
    const stored = sessionStorage.getItem(TOPIC_WINDOWS_STORAGE_KEY);
    if (!stored) return;
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
      if (valid.length > 0) setTopicWindows(valid);
    } catch {
      sessionStorage.removeItem(TOPIC_WINDOWS_STORAGE_KEY);
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "wizard") {
      sessionStorage.setItem(TOPIC_WINDOWS_STORAGE_KEY, JSON.stringify(topicWindows));
    }
  }, [topicWindows, mode]);

  const parseKeyMessages = (value: string): string[] => {
    return value.split(/[,\n;]+/).map((item) => item.trim()).filter(Boolean);
  };

  const addTopicWindow = () => {
    if (!newTopic.trim()) return;
    if (newStartWeek < 1 || newStartWeek > 4 || newEndWeek < 1 || newEndWeek > 4) {
      setStatus("Uke må være mellom 1 og 4.");
      return;
    }
    if (newStartWeek > newEndWeek) {
      setStatus("Fra-uke kan ikke være etter til-uke.");
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
    setStatus("Analyserer nettsiden din...");

    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: websiteUrl, companyName: form.companyName || "Bedrift" }),
    });

    if (!response.ok) {
      setStatus("Kunne ikke analysere nettsiden. Sjekk adressen og prøv igjen.");
      setLoading(false);
      return;
    }

    const data = (await response.json()) as ScrapeResult;
    setScrapeResult(data);
    setEditableDescription(data.companyDescription);
    setEditableProducts(data.products.join(", "));
    setEditableUsps(data.uniqueSellingPoints.join(", "));
    setStatus("Ferdig! Se over resultatene og rett opp om noe ikke stemmer.");
    setLoading(false);
  };

  const parseLines = (value: string): string[] => {
    return value.split(/[\n;]+/).map((item) => item.trim()).filter(Boolean);
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
        step: mode === "settings" ? 2 : step,
        ...form,
        keyMessages: parsedKeyMessages,
        websiteUrl,
        companyDescription: editableDescription,
        products: parsedProducts,
        uniqueSellingPoints: parsedUsps,
        coreValues: parseKeyMessages(coreValuesText),
        customerPainPoints: parseLines(customerPainPointsText),
        customerSuccessStories: parseLines(customerSuccessStoriesText),
        services: parseKeyMessages(servicesText),
        commonQuestions: parseLines(commonQuestionsText),
        tagline: form.tagline,
        slogan: form.slogan,
        brandColors: form.brandColors,
        fontStyle: form.fontStyle,
      }),
    });

    if (!response.ok) {
      setStatus("Kunne ikke lagre. Prøv igjen.");
      setLoading(false);
      return;
    }

    setStatus("");
    setLoading(false);

    if (mode === "settings") {
      setSavedMessage("Endringene er lagret! Alt fremtidig innhold bruker den nye informasjonen.");
      setTimeout(() => setSavedMessage(""), 4000);
    } else {
      setStep((v) => Math.min(v + 1, 4));
    }
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
      setStatus("Kunne ikke laste opp logoen. Prøv igjen.");
      setUploadingLogo(false);
      return;
    }

    const data = (await uploadResponse.json()) as { publicUrl: string };
    update("logoUrl", data.publicUrl);
    setStatus("Logo lastet opp!");
    setUploadingLogo(false);
  };

  const generateContentPlan = async () => {
    if (!subscriptionActive) {
      setStatus("Du må aktivere abonnement før du kan lage innhold.");
      return;
    }

    const validChannels = form.channels.filter((ch) => connectedChannels.has(ch));
    if (validChannels.length === 0) {
      setStatus("Koble til minst én sosial konto før du kan generere innhold.");
      return;
    }

    setLoading(true);
    setStatus("Lager innholdsplan — dette tar ca. 1–2 minutter...");
    const response = await fetch("/api/content/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postsPerWeek,
        totalWeeks: 4,
        channels: validChannels,
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
        setStatus("Du må aktivere abonnement først.");
      } else {
        setStatus(data?.message ?? data?.details?.message ?? "Noe gikk galt. Prøv igjen.");
      }
      setLoading(false);
      return;
    }
    const result = (await response.json()) as {
      posts?: Array<{ id: string; channel: string; status: string; scheduledAt: string; text: string }>;
    };
    if (result.posts) {
      sessionStorage.setItem("pendingPosts", JSON.stringify(result.posts));
    }
    sessionStorage.removeItem(TOPIC_WINDOWS_STORAGE_KEY);
    window.location.href = "/kalender";
  };

  const startBaseCheckout = async () => {
    try {
      setCheckoutLoading(true);
      setStatus("Sender deg til betaling...");
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
        setStatus(data.message ?? data.details?.message ?? "Kunne ikke starte betaling.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setStatus("Nettverksfeil. Sjekk tilkoblingen og prøv igjen.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const deleteAccount = async () => {
    const confirmed = window.confirm(
      "Er du sikker? Alt innhold og alle filer blir slettet permanent.",
    );
    if (!confirmed) return;

    setStatus("Sletter konto...");
    const response = await fetch("/api/account/delete", { method: "DELETE" });
    if (!response.ok) {
      setStatus("Kunne ikke slette kontoen. Prøv igjen.");
      return;
    }
    window.location.href = "/register";
  };

  if (mode === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-3 sm:px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center justify-center gap-3 py-12 sm:py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Henter informasjonen din...</p>
        </div>
      </div>
    );
  }

  if (mode === "settings") {
    return (
      <div className="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Min bedrift</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Jo mer AI-en vet om bedriften din, desto bedre innhold lager den.
            Fyll ut det du kan — du kan alltid komme tilbake og legge til mer.
          </p>
        </div>

        {savedMessage && (
          <div className="mb-6 rounded-xl bg-success/10 border border-success/20 px-4 py-3 text-sm font-medium text-success animate-[slide-up_0.3s_ease-out]">
            {savedMessage}
          </div>
        )}

        <div className="space-y-6">

          <Card>
            <CardHeader>
              <CardTitle>Hvem er dere?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Bedriftsnavn"
                  value={form.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  placeholder="Mitt Firma AS"
                />
                <Input
                  label="Ditt navn"
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  placeholder="Ola Nordmann"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Bransje"
                  value={form.industry}
                  onChange={(e) => update("industry", e.target.value)}
                  placeholder="F.eks. regnskap, restaurant, bygg..."
                />
                <Input
                  label="Grunnlagt"
                  value={form.foundedYear}
                  onChange={(e) => update("foundedYear", e.target.value)}
                  placeholder="F.eks. 2018"
                />
              </div>
              <Input
                label="Nettside"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://www.mittfirma.no"
              />
              <Textarea
                label="Kort beskrivelse av bedriften"
                value={editableDescription}
                onChange={(e) => setEditableDescription(e.target.value)}
                rows={3}
                placeholder="Hva gjør bedriften din? Skriv det som om du forklarer til en ny kunde."
                hint="AI bruker dette som grunnlag for alt innhold."
              />
              <Textarea
                label="Om teamet"
                value={form.teamDescription}
                onChange={(e) => update("teamDescription", e.target.value)}
                rows={2}
                placeholder="F.eks. 5 ansatte med lang erfaring innen..."
                hint="Valgfritt. Gjør innholdet mer personlig."
              />

              {!editableDescription && websiteUrl && (
                <div className="flex gap-3 pt-1">
                  <Checkbox
                    label="Hent informasjon fra nettsiden min"
                    checked={scrapeConsent}
                    onChange={(e) => setScrapeConsent(e.target.checked)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void analyzeWebsite()}
                    disabled={!websiteUrl || !scrapeConsent || loading}
                  >
                    {loading ? "Henter..." : "Hent fra nettside"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hva tilbyr dere?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Produkter"
                value={editableProducts}
                onChange={(e) => setEditableProducts(e.target.value)}
                placeholder="F.eks. nettsider, regnskap, catering..."
                hint="Skriv flere med komma mellom."
              />
              <Input
                label="Tjenester"
                value={servicesText}
                onChange={(e) => setServicesText(e.target.value)}
                placeholder="F.eks. rådgivning, installasjon, support..."
                hint="Skriv flere med komma mellom."
              />
              <Input
                label="Prisnivå"
                value={form.priceRange}
                onChange={(e) => update("priceRange", e.target.value)}
                placeholder="F.eks. fra 5 000 kr, gratis prøveperiode, fastpris..."
                hint="Valgfritt. Hjelper AI å lage relevante CTA-er."
              />
              <Input
                label="Det som gjør dere unike"
                value={editableUsps}
                onChange={(e) => setEditableUsps(e.target.value)}
                placeholder="F.eks. raskest levering, personlig oppfølging..."
                hint="Hva skiller dere fra konkurrentene?"
              />
              <Textarea
                label="Konkurransefortrinn"
                value={form.competitorDifferentiators}
                onChange={(e) => update("competitorDifferentiators", e.target.value)}
                rows={2}
                placeholder="F.eks. Vi er de eneste i regionen som... Til forskjell fra store kjeder..."
                hint="Valgfritt. Hjelper AI å posisjonere innholdet."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produktbilder for AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Last opp bilder av produktene dine. AI bruker disse som referanse for å generere
                innhold der produktet er synlig og gjenkjennelig.
              </p>

              {productImages.length > 0 && (
                <div className="space-y-3">
                  {Object.entries(
                    productImages.reduce<Record<string, ProductImage[]>>((acc, pi) => {
                      const key = pi.productName;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(pi);
                      return acc;
                    }, {}),
                  ).map(([name, images]) => (
                    <div key={name} className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-sm font-medium text-foreground mb-2">{name}</p>
                      <div className="flex flex-wrap gap-2">
                        {images.map((pi) => (
                          <div key={pi.id} className="group relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pi.imageUrl}
                              alt={pi.productName}
                              className="size-16 rounded-lg border border-border object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => void deleteProductImage(pi.id)}
                              className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white group-hover:flex"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
                <Input
                  label="Produktnavn"
                  value={productImageName}
                  onChange={(e) => setProductImageName(e.target.value)}
                  placeholder="F.eks. Glow Serum, Premium Kaffe..."
                  hint="Skriv navnet på produktet bildet viser."
                />
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingProductImage || !productImageName.trim()}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (!selected) return;
                    void uploadProductImage(selected);
                    e.target.value = "";
                  }}
                  className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary-hover file:cursor-pointer disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  Last opp flere bilder fra ulike vinkler for best resultat. Bildet bør vise produktet tydelig
                  mot en ren bakgrunn.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kundene deres</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Hvem er kundene dine?"
                value={form.targetAudience}
                onChange={(e) => update("targetAudience", e.target.value)}
                placeholder="F.eks. småbedrifter i Oslo, familier med barn..."
              />
              <Textarea
                label="Typiske utfordringer hos kundene"
                value={customerPainPointsText}
                onChange={(e) => setCustomerPainPointsText(e.target.value)}
                rows={3}
                placeholder={"F.eks.\nMange sliter med å holde orden på regnskapet\nDe vet ikke hvilken løsning som passer dem"}
                hint="Skriv én per linje. AI bruker dette til å lage innhold som treffer."
              />
              <Textarea
                label="Vanlige spørsmål fra kunder"
                value={commonQuestionsText}
                onChange={(e) => setCommonQuestionsText(e.target.value)}
                rows={3}
                placeholder={"F.eks.\nHva koster det?\nHvor lang tid tar leveransen?\nHar dere garanti?"}
                hint="Skriv ett spørsmål per linje. AI kan lage poster som svarer på disse."
              />
              <Textarea
                label="Kundehistorier og referanser"
                value={customerSuccessStoriesText}
                onChange={(e) => setCustomerSuccessStoriesText(e.target.value)}
                rows={3}
                placeholder={"F.eks.\nRestaurant Havgløtt økte omsetningen med 30% etter ny nettside\nFamilien Hansen sparte 50 000 kr på energioppgradering"}
                hint="Skriv én per linje. AI kan referere til disse (anonymisert om ønsket)."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Merkevare og stemme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                label="Skrivestil"
                value={form.brandVoice}
                onChange={(e) => update("brandVoice", e.target.value)}
                rows={3}
                placeholder="F.eks. vennlig og uformell, korte setninger, konkrete tips. Unngå fagspråk."
                hint="Beskriv hvordan innleggene skal høres ut. AI skriver i denne stemmen."
              />
              <Textarea
                label="Personlighet"
                value={form.brandPersonality}
                onChange={(e) => update("brandPersonality", e.target.value)}
                rows={2}
                placeholder="F.eks. Som en hjelpsom nabo som tilfeldigvis er ekspert. Aldri arrogant."
                hint="Valgfritt. Gir innholdet en tydelig karakter."
              />
              <Input
                label="Tagline"
                value={form.tagline}
                onChange={(e) => update("tagline", e.target.value)}
                placeholder="F.eks. Vi bygger fremtiden, stein for stein"
                hint="Kort setning som oppsummerer merkevaren. Brukes i alt innhold."
              />
              <Input
                label="Slagord"
                value={form.slogan}
                onChange={(e) => update("slogan", e.target.value)}
                placeholder="F.eks. Kvalitet du kan stole på"
                hint="Valgfritt. Kan brukes i tillegg til tagline."
              />
              <Textarea
                label="Gjør og ikke gjør"
                value={form.brandDosAndDonts}
                onChange={(e) => update("brandDosAndDonts", e.target.value)}
                rows={3}
                placeholder={"F.eks.\nGJØR: Bruk humor, del konkrete tall, nevn lokalmiljøet\nIKKE GJØR: Snakk negativt om konkurrenter, bruk engelske ord"}
                hint="Valgfritt. Klare retningslinjer for hva AI bør og ikke bør gjøre."
              />
              <Input
                label="Kjerneverdier"
                value={coreValuesText}
                onChange={(e) => setCoreValuesText(e.target.value)}
                placeholder="F.eks. kvalitet, ærlighet, bærekraft, lokal"
                hint="Verdier som skal prege alt innhold. Skriv flere med komma."
              />
              <Input
                label="Viktige budskap"
                value={keyMessagesText}
                onChange={(e) => setKeyMessagesText(e.target.value)}
                placeholder="Kvalitet, lokal ekspertise, personlig service"
                hint="Budskap som alltid bør komme frem. Skriv flere med komma."
              />
              <Input
                label="Sesongfokus"
                value={form.seasonalFocus}
                onChange={(e) => update("seasonalFocus", e.target.value)}
                placeholder="F.eks. jul-kampanje i desember, sommertilbud i juni..."
                hint="Valgfritt. Brukes til å tilpasse innhold til sesongen."
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Merkevarefarger</label>
                <p className="text-xs text-muted-foreground">
                  AI bruker disse fargene som referanse i bilder og visuelt innhold.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.brandColors.primary || "#000000"}
                      onChange={(e) => update("brandColors", { ...form.brandColors, primary: e.target.value })}
                      className="size-10 cursor-pointer rounded-lg border border-border bg-background p-0.5"
                    />
                    <div className="flex-1">
                      <Input
                        label="Primær"
                        value={form.brandColors.primary ?? ""}
                        onChange={(e) => update("brandColors", { ...form.brandColors, primary: e.target.value })}
                        placeholder="#1a2b3c"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.brandColors.secondary || "#000000"}
                      onChange={(e) => update("brandColors", { ...form.brandColors, secondary: e.target.value })}
                      className="size-10 cursor-pointer rounded-lg border border-border bg-background p-0.5"
                    />
                    <div className="flex-1">
                      <Input
                        label="Sekundær"
                        value={form.brandColors.secondary ?? ""}
                        onChange={(e) => update("brandColors", { ...form.brandColors, secondary: e.target.value })}
                        placeholder="#4a5b6c"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.brandColors.accent || "#000000"}
                      onChange={(e) => update("brandColors", { ...form.brandColors, accent: e.target.value })}
                      className="size-10 cursor-pointer rounded-lg border border-border bg-background p-0.5"
                    />
                    <div className="flex-1">
                      <Input
                        label="Aksent"
                        value={form.brandColors.accent ?? ""}
                        onChange={(e) => update("brandColors", { ...form.brandColors, accent: e.target.value })}
                        placeholder="#ff6b2d"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Input
                label="Font-stil"
                value={form.fontStyle}
                onChange={(e) => update("fontStyle", e.target.value)}
                placeholder="F.eks. moderne og ren, klassisk serif, avrundet og vennlig"
                hint="Valgfritt. Beskriv den visuelle stilen for tekst i bilder."
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Logo</label>
                {form.logoUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.logoUrl}
                      alt="Logo"
                      className="size-14 rounded-xl border border-border object-contain"
                    />
                    <span className="text-xs text-success font-medium">Lastet opp</span>
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
                  className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary-hover file:cursor-pointer"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kanaler og medier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Bilder i innlegg</label>
                <div className="grid gap-2">
                  {MEDIA_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => update("mediaMode", option.value)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                        form.mediaMode === option.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        form.mediaMode === option.value
                          ? "border-primary bg-primary"
                          : "border-border",
                      )}>
                        {form.mediaMode === option.value && (
                          <div className="size-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Publiseringskanaler</label>
                <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
                  {CHANNEL_OPTIONS.map((option) => {
                    const isConnected = connectedChannels.has(option.value);
                    const statusLabel = getChannelStatusLabel(option.value);
                    return (
                      <div key={option.value} className="flex items-center justify-between">
                        <Checkbox
                          checked={form.channels.includes(option.value)}
                          onChange={() => toggleChannel(option.value)}
                          label={option.label}
                          disabled={!isConnected}
                        />
                        <span className={cn("text-xs font-medium", statusLabel.className)}>
                          {statusLabel.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {connectedChannels.size === 0 && (
                  <p className="text-xs text-warning-foreground">
                    Ingen kontoer er koblet til. Koble til fra{" "}
                    <Link href="/dashboard" className="font-semibold text-primary hover:underline">dashboardet</Link>.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-primary-light border border-primary/20 px-5 py-4">
            <p className="text-sm text-foreground">
              <strong>Tips:</strong> Jo mer du fyller ut, desto bedre blir innholdet.
              Du kan alltid komme tilbake og legge til mer informasjon etter hvert.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Button onClick={() => void save()} disabled={loading} size="lg">
              {loading ? "Lagrer..." : "Lagre endringer"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void deleteAccount()}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Slett konto
            </Button>
          </div>

          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-8">
      <div className="mb-5 sm:mb-6 text-center">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          {step === 1 && "Fortell oss om bedriften din"}
          {step === 2 && "Hvordan vil du bli oppfattet?"}
          {step === 3 && "Velg kanaler og medier"}
          {step === 4 && "Alt klart — lag innhold!"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {step === 1 && "Vi bruker dette for å lage innhold som passer for deg."}
          {step === 2 && "Beskriv stilen du ønsker, så tilpasser vi alt innhold."}
          {step === 3 && "Velg hvor du vil publisere og hva slags bilder du vil bruke."}
          {step === 4 && "Vi lager 4 uker med poster — klar til publisering."}
        </p>
      </div>

      <Stepper currentStep={step} totalSteps={4} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Om bedriften</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Bedriftsnavn"
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="Mitt Firma AS"
            />

            <Input
              label="Nettside"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://www.mittfirma.no"
              hint="Vi henter info om bedriften din herfra. Du kan redigere alt etterpå."
            />

            <Checkbox
              label="Ja, hent informasjon fra nettsiden min"
              checked={scrapeConsent}
              onChange={(e) => setScrapeConsent(e.target.checked)}
            />

            <div className="flex gap-3">
              <Button
                onClick={() => void analyzeWebsite()}
                disabled={!websiteUrl || !scrapeConsent || loading}
              >
                {loading ? "Henter info..." : "Hent fra nettside"}
              </Button>
              <Button variant="ghost" onClick={() => void save()} disabled={loading}>
                {loading ? "Lagrer..." : "Hopp over"}
              </Button>
            </div>

            {scrapeResult && (
              <div className="mt-4 space-y-4 rounded-xl border border-border bg-muted/30 p-5 animate-[slide-up_0.3s_ease-out]">
                <p className="text-sm font-medium text-foreground">
                  Her er det vi fant — rett opp om noe ikke stemmer:
                </p>
                <Textarea
                  label="Beskrivelse av bedriften"
                  value={editableDescription}
                  onChange={(e) => setEditableDescription(e.target.value)}
                  rows={3}
                />
                <Input
                  label="Produkter eller tjenester"
                  value={editableProducts}
                  onChange={(e) => setEditableProducts(e.target.value)}
                  hint="Skriv flere med komma mellom."
                />
                <Input
                  label="Det som gjør dere unike"
                  value={editableUsps}
                  onChange={(e) => setEditableUsps(e.target.value)}
                  hint="Hva skiller dere fra konkurrentene?"
                />
                <Button onClick={() => void save()} disabled={loading}>
                  {loading ? "Lagrer..." : "Ser bra ut — gå videre"}
                </Button>
              </div>
            )}

            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Stil og tone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Ditt navn"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="Ola Nordmann"
            />

            {!form.companyName && (
              <Input
                label="Bedriftsnavn"
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder="Mitt Firma AS"
              />
            )}

            <Input
              label="Hvem er kundene dine?"
              value={form.targetAudience}
              onChange={(e) => update("targetAudience", e.target.value)}
              placeholder="F.eks. småbedrifter, privatpersoner, restauranter..."
            />

            <Textarea
              label="Hvordan skal innleggene høres ut?"
              value={form.brandVoice}
              onChange={(e) => update("brandVoice", e.target.value)}
              rows={4}
              placeholder="F.eks. vennlig og uformell, korte setninger, konkrete tips..."
              hint="Beskriv tonen og stilen. AI bruker dette til å skrive i din stemme."
            />

            <Input
              label="Viktige budskap"
              value={keyMessagesText}
              onChange={(e) => setKeyMessagesText(e.target.value)}
              placeholder="Kvalitet, lokal ekspertise, personlig service"
              hint="Ting som alltid bør komme frem i innleggene. Skriv flere med komma."
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Logo</label>
              {form.logoUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.logoUrl}
                    alt="Logo"
                    className="size-14 rounded-xl border border-border object-contain"
                  />
                  <span className="text-xs text-success font-medium">Lastet opp</span>
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
                className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary-hover file:cursor-pointer"
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

            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Kanaler og medier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Bilder i innlegg</label>
              <div className="grid gap-2">
                {MEDIA_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update("mediaMode", option.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                      form.mediaMode === option.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      form.mediaMode === option.value
                        ? "border-primary bg-primary"
                        : "border-border",
                    )}>
                      {form.mediaMode === option.value && (
                        <div className="size-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Du kan alltid endre bilder på enkeltposter etterpå.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Hvor vil du publisere?</label>
              {connectedChannels.size === 0 ? (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">Ingen kontoer er koblet til ennå</p>
                  <p className="text-xs text-muted-foreground">
                    Koble til minst én konto for å generere innhold. Du kan koble til kontoer fra dashboardet.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/dashboard/koble-meta"
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      Koble Facebook + Instagram
                    </a>
                    <a
                      href={`/api/social/oauth/linkedin/start?returnTo=${encodeURIComponent("/onboarding?step=3")}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      Koble LinkedIn
                    </a>
                    <a
                      href={`/api/social/oauth/tiktok/start?returnTo=${encodeURIComponent("/onboarding?step=3")}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      Koble TikTok
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
                  {CHANNEL_OPTIONS.map((option) => {
                    const isConnected = connectedChannels.has(option.value);
                    const statusLabel = getChannelStatusLabel(option.value);
                    return (
                      <div key={option.value} className="flex items-center justify-between">
                        <Checkbox
                          checked={form.channels.includes(option.value)}
                          onChange={() => toggleChannel(option.value)}
                          label={option.label}
                          disabled={!isConnected}
                        />
                        <span className={cn("text-xs font-medium", statusLabel.className)}>
                          {statusLabel.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-primary-light p-4">
              <p className="text-sm text-foreground">
                Du kan laste opp egne bilder og videoer i{" "}
                <Link href="/media" className="font-semibold text-primary hover:underline">
                  Bilder og video
                </Link>{" "}
                når som helst.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Tilbake
              </Button>
              <Button onClick={() => void save()} disabled={loading || form.channels.length === 0}>
                {loading ? "Lagrer..." : "Lagre og gå videre"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Lag din første innholdsplan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className={cn(
                "rounded-xl border p-4",
                subscriptionActive
                  ? "border-success/30 bg-success/5"
                  : "border-primary/30 bg-primary-light",
              )}
            >
              {subscriptionLoading ? (
                <p className="text-sm text-muted-foreground">Sjekker abonnement...</p>
              ) : subscriptionActive ? (
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-success text-xs text-white font-bold">
                    ✓
                  </span>
                  <p className="text-sm font-medium text-success">Abonnement er aktivt</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Aktiver abonnement for å lage innhold
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aktiver abonnement for å lage innhold for dine kanaler.
                  </p>
                  <Button onClick={() => void startBaseCheckout()} disabled={checkoutLoading}>
                    {checkoutLoading ? "Sender til betaling..." : "Aktiver abonnement"}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <h4 className="text-sm font-semibold text-foreground">Oppsummering</h4>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Bedrift</dt>
                  <dd className="font-medium">{form.companyName || "Ikke oppgitt"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Kunder</dt>
                  <dd className="font-medium">{form.targetAudience || "Ikke oppgitt"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Kanaler</dt>
                  <dd className="font-medium capitalize">{form.channels.join(", ")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Bilder</dt>
                  <dd className="font-medium">
                    {form.mediaMode === "ai_only" && "AI-bilder"}
                    {form.mediaMode === "hybrid" && "Egne + AI"}
                    {form.mediaMode === "owned_only" && "Egne bilder"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Poster per uke</dt>
                  <dd>
                    <select
                      value={postsPerWeek}
                      onChange={(e) => setPostsPerWeek(Number(e.target.value))}
                      className="h-7 rounded-md border border-border bg-background px-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {Array.from(
                        { length: postsPerWeekAllowance },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Fokusemner (valgfritt)</h4>
              <p className="text-xs text-muted-foreground">
                Vil du at postene skal handle om noe spesielt i visse uker?
                Uker uten emne får automatisk innhold om bedriften din.
              </p>

              {topicWindows.length > 0 && (
                <div className="space-y-2">
                  {topicWindows.map((tw, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
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
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        Fjern
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
                <div className="flex-1 min-w-[140px]">
                  <Input
                    label="Emne"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="F.eks. juletilbud, nytt produkt..."
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

            <div className="rounded-xl bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                Vi lager <strong className="text-foreground">{postsPerWeek} poster per uke i 4 uker</strong> for
                hver kanal du har valgt.
                {postsPerWeek <= 3 && " Postene legges på mandag, onsdag og fredag."}
                {postsPerWeek > 3 && " Postene fordeles jevnt utover uken."}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                Tilbake
              </Button>
              <Button
                size="lg"
                onClick={() => void generateContentPlan()}
                disabled={loading || subscriptionLoading || !subscriptionActive || form.channels.length === 0}
              >
                {loading ? "Lager innhold..." : "Lag 4 ukers innholdsplan"}
              </Button>
            </div>

            {status && <p className="mt-2 text-sm text-muted-foreground">{status}</p>}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
        <Link
          href={`/media?returnTo=${encodeURIComponent(`/onboarding?step=${step}`)}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Bilder og video
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
