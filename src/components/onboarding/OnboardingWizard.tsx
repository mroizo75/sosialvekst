"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox, Input, Textarea } from "@/components/ui/Input";
import { localeToPreferredLanguage } from "@/lib/i18n/config";
import type { BrandColors, MediaMode, ProductImage, SocialChannel, TopicWindow } from "@/lib/types";
import { cn } from "@/lib/utils";

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

const CHANNEL_OPTIONS: Array<{ value: SocialChannel; label: string }> = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
];

const MEDIA_MODE_VALUES: MediaMode[] = ["ai_only", "hybrid", "owned_only"];

const TOPIC_WINDOWS_STORAGE_KEY = "onboarding_topic_windows_v1";

const Stepper = ({
  currentStep,
  totalSteps,
  steps,
}: {
  currentStep: number;
  totalSteps: number;
  steps: Array<{ label: string; description: string }>;
}) => (
  <nav className="mb-8">
    <div className="flex items-center justify-center gap-0">
      {steps.slice(0, totalSteps).map((step, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;
        return (
          <div key={`${step.label}-${index}`} className="flex items-center">
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
  const { t, dictionary, locale } = useI18n();
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

  const wizardSteps = dictionary.onboarding.steps;
  const mediaModeOptions = MEDIA_MODE_VALUES.map((value) => ({
    value,
    label: dictionary.onboarding.mediaModes[value].label,
    description: dictionary.onboarding.mediaModes[value].description,
  }));

  const accountStatusMap = new Map(connectedAccounts.map((a) => [a.channel, a.tokenStatus ?? "valid"]));
  const connectedChannels = new Set(
    connectedAccounts.filter((a) => !a.tokenStatus || a.tokenStatus === "valid").map((a) => a.channel),
  );

  const getChannelStatusLabel = (channel: SocialChannel): { text: string; className: string } => {
    const channelStatus = accountStatusMap.get(channel);
    if (!channelStatus) {
      return { text: dictionary.onboarding.channelStatus.notConnected, className: "text-muted-foreground" };
    }
    if (channelStatus === "valid") {
      return { text: dictionary.onboarding.channelStatus.connected, className: "text-success" };
    }
    if (channelStatus === "expired") {
      return { text: dictionary.onboarding.channelStatus.expired, className: "text-warning-foreground" };
    }
    return { text: dictionary.onboarding.channelStatus.invalid, className: "text-destructive" };
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
      setStatus(t("onboarding.enterProductName"));
      return;
    }
    setUploadingProductImage(true);
    setStatus(t("onboarding.uploadingProductImage"));

    const payload = new FormData();
    payload.append("file", file);
    payload.append("mediaKind", "image");

    const uploadResponse = await fetch("/api/media/upload", {
      method: "POST",
      body: payload,
    });

    if (!uploadResponse.ok) {
      setStatus(t("onboarding.uploadImageFailed"));
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
      setStatus(t("onboarding.productImageSaveFailed"));
      setUploadingProductImage(false);
      return;
    }

    setStatus(t("onboarding.productImageAdded"));
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
      setStatus(t("onboarding.loadFailed"));
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
  }, [fetchConnectedAccounts, fetchProductImages, t]);

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
      setStatus(t("onboarding.confirmingPayment"));
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
        setStatus(data.message ?? data.details?.message ?? t("onboarding.paymentDoneButFailed"));
      } else {
        setStatus(t("onboarding.subscriptionActivated"));
      }
      await loadSubscriptionStatus();
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    };

    void confirmPayment();
    return () => { cancelled = true; };
  }, [loadSubscriptionStatus, t]);

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
      setStatus(t("onboarding.weekRangeInvalid"));
      return;
    }
    if (newStartWeek > newEndWeek) {
      setStatus(t("onboarding.weekOrderInvalid"));
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
    setStatus(t("onboarding.analyzing"));

    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: websiteUrl,
        companyName: form.companyName || t("onboarding.companyFallback"),
      }),
    });

    if (!response.ok) {
      setStatus(t("onboarding.analyzeFailed"));
      setLoading(false);
      return;
    }

    const data = (await response.json()) as ScrapeResult;
    setScrapeResult(data);
    setEditableDescription(data.companyDescription);
    setEditableProducts(data.products.join(", "));
    setEditableUsps(data.uniqueSellingPoints.join(", "));
    if (data.websiteTitle && !form.companyName.trim()) {
      update("companyName", data.websiteTitle);
    }
    setStatus(t("onboarding.analyzeDone"));
    setLoading(false);
  };

  const parseLines = (value: string): string[] => {
    return value.split(/[\n;]+/).map((item) => item.trim()).filter(Boolean);
  };

  const save = async () => {
    setLoading(true);
    setStatus(t("onboarding.saving"));
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
        preferredLanguage: localeToPreferredLanguage[locale],
      }),
    });

    if (!response.ok) {
      setStatus(t("onboarding.saveFailed"));
      setLoading(false);
      return;
    }

    setStatus("");
    setLoading(false);

    if (mode === "settings") {
      setSavedMessage(t("onboarding.savedMessage"));
      setTimeout(() => setSavedMessage(""), 4000);
    } else {
      setStep((v) => Math.min(v + 1, 4));
    }
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    setStatus(t("onboarding.uploadLogo"));
    const payload = new FormData();
    payload.append("file", file);
    payload.append("mediaKind", "logo");

    const uploadResponse = await fetch("/api/media/upload", {
      method: "POST",
      body: payload,
    });

    if (!uploadResponse.ok) {
      setStatus(t("onboarding.uploadLogoFailed"));
      setUploadingLogo(false);
      return;
    }

    const data = (await uploadResponse.json()) as { publicUrl: string };
    update("logoUrl", data.publicUrl);
    setStatus(t("onboarding.logoUploaded"));
    setUploadingLogo(false);
  };

  const generateContentPlan = async () => {
    if (!subscriptionActive) {
      setStatus(t("onboarding.subscriptionRequired"));
      return;
    }

    const validChannels = form.channels.filter((ch) => connectedChannels.has(ch));
    if (validChannels.length === 0) {
      setStatus(t("onboarding.connectRequired"));
      return;
    }

    setLoading(true);
    setStatus(t("onboarding.generatingPlan"));
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
        setStatus(t("onboarding.activateFirst"));
      } else {
        setStatus(data?.message ?? data?.details?.message ?? t("common.error"));
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
      setStatus(t("onboarding.sendingToPayment"));
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
        setStatus(data.message ?? data.details?.message ?? t("onboarding.couldNotStartPayment"));
        return;
      }
      window.location.assign(data.url);
    } catch {
      setStatus(t("onboarding.networkError"));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const deleteAccount = async () => {
    const confirmed = window.confirm(t("onboarding.deleteConfirm"));
    if (!confirmed) return;

    setStatus(t("onboarding.deletingAccount"));
    const response = await fetch("/api/account/delete", { method: "DELETE" });
    if (!response.ok) {
      setStatus(t("onboarding.couldNotDeleteAccount"));
      return;
    }
    window.location.href = "/register";
  };

  if (mode === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-3 sm:px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center justify-center gap-3 py-12 sm:py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t("onboarding.loading")}</p>
        </div>
      </div>
    );
  }

  if (mode === "settings") {
    return (
      <div className="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("onboarding.settingsTitle")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("onboarding.settingsSubtitle")}
          </p>
        </div>

        {savedMessage && (
          <div className="mb-6 rounded-xl bg-success/10 border border-success/20 px-4 py-3 text-sm font-medium text-success animate-[slide-up_0.3s_ease-out]">
            {savedMessage}
          </div>
        )}

        <div className="space-y-6">

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
            <span className="text-sm font-medium text-foreground">{t("common.language")}</span>
            <LanguageSwitcher variant="app" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.whoAreYou")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t("onboarding.companyName")}
                  value={form.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  placeholder={t("onboarding.companyNamePlaceholder")}
                />
                <Input
                  label={t("onboarding.yourName")}
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  placeholder={t("onboarding.yourNamePlaceholder")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t("onboarding.industry")}
                  value={form.industry}
                  onChange={(e) => update("industry", e.target.value)}
                  placeholder={t("onboarding.industryPlaceholder")}
                />
                <Input
                  label={t("onboarding.founded")}
                  value={form.foundedYear}
                  onChange={(e) => update("foundedYear", e.target.value)}
                  placeholder={t("onboarding.foundedPlaceholder")}
                />
              </div>
              <Input
                label={t("onboarding.website")}
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder={t("onboarding.websitePlaceholder")}
              />
              <Textarea
                label={t("onboarding.shortDescription")}
                value={editableDescription}
                onChange={(e) => setEditableDescription(e.target.value)}
                rows={3}
                placeholder={t("onboarding.shortDescriptionPlaceholder")}
                hint={t("onboarding.shortDescriptionHint")}
              />
              <Textarea
                label={t("onboarding.aboutTeam")}
                value={form.teamDescription}
                onChange={(e) => update("teamDescription", e.target.value)}
                rows={2}
                placeholder={t("onboarding.aboutTeamPlaceholder")}
                hint={t("onboarding.aboutTeamHint")}
              />

              {!editableDescription && websiteUrl && (
                <div className="flex gap-3 pt-1">
                  <Checkbox
                    label={t("onboarding.scrapeConsent")}
                    checked={scrapeConsent}
                    onChange={(e) => setScrapeConsent(e.target.checked)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void analyzeWebsite()}
                    disabled={!websiteUrl || !scrapeConsent || loading}
                  >
                    {loading ? t("onboarding.scrapeLoading") : t("onboarding.scrapeFromWebsite")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.whatYouOffer")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label={t("onboarding.products")}
                value={editableProducts}
                onChange={(e) => setEditableProducts(e.target.value)}
                placeholder={t("onboarding.productsPlaceholder")}
                hint={t("onboarding.commaHint")}
              />
              <Input
                label={t("onboarding.services")}
                value={servicesText}
                onChange={(e) => setServicesText(e.target.value)}
                placeholder={t("onboarding.servicesPlaceholder")}
                hint={t("onboarding.commaHint")}
              />
              <Input
                label={t("onboarding.priceLevel")}
                value={form.priceRange}
                onChange={(e) => update("priceRange", e.target.value)}
                placeholder={t("onboarding.priceLevelPlaceholder")}
                hint={t("onboarding.priceLevelHint")}
              />
              <Input
                label={t("onboarding.uniqueSelling")}
                value={editableUsps}
                onChange={(e) => setEditableUsps(e.target.value)}
                placeholder={t("onboarding.uniqueSellingPlaceholder")}
                hint={t("onboarding.uniqueSellingHint")}
              />
              <Textarea
                label={t("onboarding.competitiveAdvantage")}
                value={form.competitorDifferentiators}
                onChange={(e) => update("competitorDifferentiators", e.target.value)}
                rows={2}
                placeholder={t("onboarding.competitiveAdvantagePlaceholder")}
                hint={t("onboarding.competitiveAdvantageHint")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.productImagesTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("onboarding.productImagesBody")}
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
                  label={t("onboarding.productImagesSection.productNameLabel")}
                  value={productImageName}
                  onChange={(e) => setProductImageName(e.target.value)}
                  placeholder={t("onboarding.productImagesSection.productNamePlaceholder")}
                  hint={t("onboarding.productImagesSection.productNameHint")}
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
                  {t("onboarding.productImagesBody")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.customerSection.targetAudienceLabel")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label={t("onboarding.customerSection.targetAudienceLabel")}
                value={form.targetAudience}
                onChange={(e) => update("targetAudience", e.target.value)}
                placeholder={t("onboarding.customerSection.targetAudiencePlaceholder")}
              />
              <Textarea
                label={t("onboarding.customerSection.painPointsLabel")}
                value={customerPainPointsText}
                onChange={(e) => setCustomerPainPointsText(e.target.value)}
                rows={3}
                placeholder={"F.eks.\nMange sliter med å holde orden på regnskapet\nDe vet ikke hvilken løsning som passer dem"}
                hint="Skriv én per linje. AI bruker dette til å lage innhold som treffer."
              />
              <Textarea
                label={t("onboarding.customerSection.questionsLabel")}
                value={commonQuestionsText}
                onChange={(e) => setCommonQuestionsText(e.target.value)}
                rows={3}
                placeholder={"F.eks.\nHva koster det?\nHvor lang tid tar leveransen?\nHar dere garanti?"}
                hint={t("onboarding.customerSection.questionsHint")}
              />
              <Textarea
                label={t("onboarding.customerSection.storiesLabel")}
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
              <CardTitle>{t("onboarding.brandSection.voiceLabel")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                label={t("onboarding.brandSection.voiceLabel")}
                value={form.brandVoice}
                onChange={(e) => update("brandVoice", e.target.value)}
                rows={3}
                placeholder={t("onboarding.brandSection.voicePlaceholder")}
                hint={t("onboarding.brandSection.voiceHint")}
              />
              <Textarea
                label={t("onboarding.brandSection.personalityLabel")}
                value={form.brandPersonality}
                onChange={(e) => update("brandPersonality", e.target.value)}
                rows={2}
                placeholder={t("onboarding.brandSection.personalityPlaceholder")}
                hint={t("onboarding.brandSection.personalityHint")}
              />
              <Input
                label={t("onboarding.brandSection.taglineLabel")}
                value={form.tagline}
                onChange={(e) => update("tagline", e.target.value)}
                placeholder={t("onboarding.brandSection.taglinePlaceholder")}
                hint={t("onboarding.brandSection.taglineHint")}
              />
              <Input
                label={t("onboarding.brandSection.sloganLabel")}
                value={form.slogan}
                onChange={(e) => update("slogan", e.target.value)}
                placeholder={t("onboarding.brandSection.sloganPlaceholder")}
                hint={t("onboarding.brandSection.sloganHint")}
              />
              <Textarea
                label={t("onboarding.brandSection.dosAndDontsLabel")}
                value={form.brandDosAndDonts}
                onChange={(e) => update("brandDosAndDonts", e.target.value)}
                rows={3}
                placeholder={t("onboarding.brandSection.dosAndDontsPlaceholder")}
                hint={t("onboarding.brandSection.dosAndDontsHint")}
              />
              <Input
                label={t("onboarding.brandSection.coreValuesLabel")}
                value={coreValuesText}
                onChange={(e) => setCoreValuesText(e.target.value)}
                placeholder={t("onboarding.brandSection.coreValuesPlaceholder")}
                hint={t("onboarding.brandSection.coreValuesHint")}
              />
              <Input
                label={t("onboarding.brandSection.keyMessagesLabel")}
                value={keyMessagesText}
                onChange={(e) => setKeyMessagesText(e.target.value)}
                placeholder={t("onboarding.brandSection.keyMessagesPlaceholder")}
                hint={t("onboarding.brandSection.keyMessagesHint")}
              />
              <Input
                label={t("onboarding.brandSection.seasonalLabel")}
                value={form.seasonalFocus}
                onChange={(e) => update("seasonalFocus", e.target.value)}
                placeholder={t("onboarding.brandSection.seasonalPlaceholder")}
                hint={t("onboarding.brandSection.seasonalHint")}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("onboarding.brandSection.colorsTitle")}</label>
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
                        label={t("onboarding.brandSection.colorPrimary")}
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
                        label={t("onboarding.brandSection.colorSecondary")}
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
                        label={t("onboarding.brandSection.colorAccent")}
                        value={form.brandColors.accent ?? ""}
                        onChange={(e) => update("brandColors", { ...form.brandColors, accent: e.target.value })}
                        placeholder="#ff6b2d"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Input
                label={t("onboarding.brandSection.fontStyleLabel")}
                value={form.fontStyle}
                onChange={(e) => update("fontStyle", e.target.value)}
                placeholder={t("onboarding.brandSection.fontStylePlaceholder")}
                hint={t("onboarding.brandSection.fontStyleHint")}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Logo</label>
                {form.logoUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.logoUrl}
                      alt={t("onboarding.brandSection.logoAlt")}
                      className="size-14 rounded-xl border border-border object-contain"
                    />
                    <span className="text-xs text-success font-medium">{t("onboarding.logoUploaded")}</span>
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
              <CardTitle>{t("onboarding.step3Title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("contentPlan.imagesInPosts")}</label>
                <div className="grid gap-2">
                  {mediaModeOptions.map((option) => (
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
                <label className="text-sm font-medium text-foreground">{t("contentPlan.channels")}</label>
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
                    {t("dashboard.connectAccountFirst")}{" "}
                    <Link href="/dashboard" className="font-semibold text-primary hover:underline">{t("nav.overview")}</Link>.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-primary-light border border-primary/20 px-5 py-4">
            <p className="text-sm text-foreground">
              {t("onboarding.settingsSubtitle")}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Button onClick={() => void save()} disabled={loading} size="lg">
              {loading ? t("onboarding.saving") : t("onboarding.saveChanges")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void deleteAccount()}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {t("common.delete")}
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
          {step === 1 && t("onboarding.step1Title")}
          {step === 2 && t("onboarding.step2Title")}
          {step === 3 && t("onboarding.step3Title")}
          {step === 4 && wizardSteps[3]?.label}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {step === 1 && t("onboarding.step1Desc")}
          {step === 2 && t("onboarding.step2Desc")}
          {step === 3 && t("onboarding.step3Desc")}
          {step === 4 && wizardSteps[3]?.description}
        </p>
      </div>

      <Stepper currentStep={step} totalSteps={4} steps={wizardSteps} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{wizardSteps[0]?.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={t("onboarding.companyName")}
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder={t("onboarding.companyNamePlaceholder")}
            />

            <Input
              label={t("onboarding.website")}
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder={t("onboarding.websitePlaceholder")}
              hint={t("onboarding.websiteHint")}
            />

            <Checkbox
              label={t("onboarding.scrapeConsent")}
              checked={scrapeConsent}
              onChange={(e) => setScrapeConsent(e.target.checked)}
            />

            <div className="flex gap-3">
              <Button
                onClick={() => void analyzeWebsite()}
                disabled={!websiteUrl || !scrapeConsent || loading}
              >
                {loading ? t("onboarding.scrapeLoading") : t("onboarding.scrapeFromWebsite")}
              </Button>
              <Button variant="ghost" onClick={() => void save()} disabled={loading}>
                {loading ? t("onboarding.saving") : t("onboarding.skipButton")}
              </Button>
            </div>

            {scrapeResult && (
              <div className="mt-4 space-y-4 rounded-xl border border-border bg-muted/30 p-5 animate-[slide-up_0.3s_ease-out]">
                <p className="text-sm font-medium text-foreground">
                  Her er det vi fant — rett opp om noe ikke stemmer:
                </p>
                <Textarea
                  label={t("onboarding.shortDescription")}
                  value={editableDescription}
                  onChange={(e) => setEditableDescription(e.target.value)}
                  rows={3}
                />
                <Input
                  label={t("onboarding.products")}
                  value={editableProducts}
                  onChange={(e) => setEditableProducts(e.target.value)}
                  hint={t("onboarding.commaHint")}
                />
                <Input
                  label={t("onboarding.uniqueSelling")}
                  value={editableUsps}
                  onChange={(e) => setEditableUsps(e.target.value)}
                  hint={t("onboarding.uniqueSellingHint")}
                />
                <Button onClick={() => void save()} disabled={loading}>
                  {loading ? t("onboarding.saving") : t("onboarding.saveAndContinue")}
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
            <CardTitle>{wizardSteps[1]?.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={t("onboarding.yourName")}
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder={t("onboarding.yourNamePlaceholder")}
            />

            {!form.companyName && (
              <Input
                label={t("onboarding.companyName")}
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder={t("onboarding.companyNamePlaceholder")}
              />
            )}

            <Input
              label={t("onboarding.customerSection.targetAudienceLabel")}
              value={form.targetAudience}
              onChange={(e) => update("targetAudience", e.target.value)}
              placeholder={t("onboarding.targetAudiencePlaceholder")}
            />

            <Textarea
              label={t("onboarding.brandSection.voiceLabel")}
              value={form.brandVoice}
              onChange={(e) => update("brandVoice", e.target.value)}
              rows={4}
              placeholder={t("onboarding.brandVoicePlaceholder")}
              hint={t("onboarding.brandVoiceHint")}
            />

            <Input
              label={t("onboarding.keyMessagesLabel")}
              value={keyMessagesText}
              onChange={(e) => setKeyMessagesText(e.target.value)}
              placeholder={t("onboarding.keyMessagesPlaceholder")}
              hint={t("onboarding.keyMessagesHint")}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Logo</label>
              {form.logoUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.logoUrl}
                    alt={t("onboarding.brandSection.logoAlt")}
                    className="size-14 rounded-xl border border-border object-contain"
                  />
                  <span className="text-xs text-success font-medium">{t("onboarding.logoUploaded")}</span>
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
                {t("common.back")}
              </Button>
              <Button onClick={() => void save()} disabled={loading}>
                {loading ? t("onboarding.saving") : t("onboarding.saveAndContinue")}
              </Button>
            </div>

            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>{wizardSteps[2]?.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t("contentPlan.imagesInPosts")}</label>
              <div className="grid gap-2">
                {mediaModeOptions.map((option) => (
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
              <label className="text-sm font-medium text-foreground">{t("contentPlan.channels")}</label>
              {connectedChannels.size === 0 ? (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">{t("dashboard.connectAccountFirst")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("onboarding.connectRequired")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/dashboard/koble-meta"
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      {t("dashboard.connect.facebook")}
                    </a>
                    <a
                      href={`/api/social/oauth/linkedin/start?returnTo=${encodeURIComponent("/onboarding?step=3")}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      {t("dashboard.connect.linkedin")}
                    </a>
                    <a
                      href={`/api/social/oauth/tiktok/start?returnTo=${encodeURIComponent("/onboarding?step=3")}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      {t("dashboard.connect.tiktok")}
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
                  {t("nav.media")}
                </Link>{" "}
                når som helst.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                {t("common.back")}
              </Button>
              <Button onClick={() => void save()} disabled={loading || form.channels.length === 0}>
                {loading ? t("onboarding.saving") : t("onboarding.saveAndContinue")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>{wizardSteps[3]?.label}</CardTitle>
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
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : subscriptionActive ? (
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-success text-xs text-white font-bold">
                    ✓
                  </span>
                  <p className="text-sm font-medium text-success">{t("onboarding.subscriptionActivated")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {t("onboarding.activateSubscription")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("onboarding.subscriptionRequired")}
                  </p>
                  <Button onClick={() => void startBaseCheckout()} disabled={checkoutLoading}>
                    {checkoutLoading ? t("onboarding.sendingToPayment") : t("onboarding.activateSubscription")}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <h4 className="text-sm font-semibold text-foreground">{wizardSteps[3]?.label}</h4>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("onboarding.companyFallback")}</dt>
                  <dd className="font-medium">{form.companyName || t("onboarding.notSpecified")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("onboarding.customerSection.targetAudienceLabel")}</dt>
                  <dd className="font-medium">{form.targetAudience || t("onboarding.notSpecified")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("contentPlan.channels")}</dt>
                  <dd className="font-medium capitalize">{form.channels.join(", ")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("contentPlan.imagesInPosts")}</dt>
                  <dd className="font-medium">
                    {dictionary.onboarding.mediaModes[form.mediaMode].label}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("dashboard.postsPerWeek", { count: postsPerWeek })}</dt>
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
              <h4 className="text-sm font-semibold">{t("contentPlan.focusTopic")}</h4>
              <p className="text-xs text-muted-foreground">
                {t("contentPlan.focusTopicHint")}
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
                          {t("calendar.weekLabel", { week: tw.startWeek !== tw.endWeek ? `${tw.startWeek}–${tw.endWeek}` : String(tw.startWeek) })}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTopicWindow(index)}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {t("common.delete")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
                <div className="flex-1 min-w-[140px]">
                  <Input
                    label={t("onboarding.topicLabel")}
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder={t("onboarding.topicPlaceholder")}
                  />
                </div>
                <div className="w-20">
                  <Input
                    label={t("onboarding.fromWeek")}
                    type="number"
                    min={1}
                    max={4}
                    value={newStartWeek}
                    onChange={(e) => setNewStartWeek(Number(e.target.value))}
                  />
                </div>
                <div className="w-20">
                  <Input
                    label={t("onboarding.toWeek")}
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
                  {t("common.create")}
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
                {t("common.back")}
              </Button>
              <Button
                size="lg"
                onClick={() => void generateContentPlan()}
                disabled={loading || subscriptionLoading || !subscriptionActive || form.channels.length === 0}
              >
                {loading ? t("onboarding.generatingPlan") : t("onboarding.generateContent")}
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
          {t("nav.media")}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void deleteAccount()}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {t("common.delete")}
        </Button>
      </div>
    </div>
  );
};
