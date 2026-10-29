"use client";

import { useEffect, useState } from "react";

import { useProducts } from "@/components/products/useProducts";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Checkbox } from "@/components/ui/Input";
import { postingTimeFor, type PostingTime } from "@/lib/schedule/audienceTime";
import { cn } from "@/lib/utils";
import type { MediaMode, SocialChannel, TopicWindow } from "@/lib/types";

type DayConfig = {
  dayOffset: number;
  label: string;
  shortLabel: string;
  enabled: boolean;
  channelTimes: Partial<Record<SocialChannel, PostingTime>>;
};

type ContentPlanDialogProps = {
  open: boolean;
  onClose: () => void;
  onGenerate: (config: GenerateConfig) => void;
  postsPerWeekAllowance: number;
  connectedChannels: SocialChannel[];
  loading: boolean;
  latestScheduledAt: string | null;
  savedMediaMode: MediaMode;
};

export type GenerateConfig = {
  postsPerWeek: number;
  totalWeeks: number;
  channels: SocialChannel[];
  postingDays: number[];
  postingHours: number[];
  postingSchedule: Array<{ day: number; channel: SocialChannel; hour: number; minute: number }>;
  countryCode: string;
  startDate?: string;
  topicWindows: TopicWindow[];
  mediaMode: MediaMode;
  productId?: string;
};

const CHANNEL_LABEL: Record<SocialChannel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

const INITIAL_DAYS: DayConfig[] = [0, 1, 2, 3, 4, 5, 6].map((dayOffset) => ({
  dayOffset,
  label: "",
  shortLabel: "",
  enabled: dayOffset === 0 || dayOffset === 2 || dayOffset === 4,
  channelTimes: {},
}));

const dayAfterDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
};

const nextMondayFromNow = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(9, 0, 0, 0);
  return monday.toISOString();
};

const currentWeekMonday = (): string => {
  const now = new Date();
  const day = now.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMonday);
  monday.setHours(9, 0, 0, 0);
  return monday.toISOString();
};

const weeksUntil = (isoDate: string): number => {
  const now = new Date();
  const target = new Date(isoDate);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
};

const formatHourMinute = (hour: number, minute: number): string => {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const parseTimeString = (value: string): { hour: number; minute: number } => {
  const [h, m] = value.split(":").map(Number);
  return { hour: h ?? 8, minute: m ?? 0 };
};

export const ContentPlanDialog = ({
  open,
  onClose,
  onGenerate,
  postsPerWeekAllowance,
  connectedChannels,
  loading,
  latestScheduledAt,
  savedMediaMode,
}: ContentPlanDialogProps) => {
  const { dictionary } = useI18n();
  const cp = dictionary.contentPlan;

  const mediaModeLabels: Record<MediaMode, string> = {
    ai_only: cp.mediaAiOnly,
    hybrid: cp.mediaHybrid,
    owned_only: cp.mediaOwnedOnly,
  };

  const hasExistingPlan = !!latestScheduledAt;
  const defaultFill = hasExistingPlan && postsPerWeekAllowance > 3;
  const [fillMode, setFillMode] = useState<"new" | "fill">(defaultFill ? "fill" : "new");
  const [mediaMode, setMediaMode] = useState<MediaMode>(savedMediaMode);

  const [days, setDays] = useState<DayConfig[]>(() => {
    if (defaultFill) {
      const gapDayIndexes = [1, 3, 5, 6];
      const extraCount = Math.max(1, postsPerWeekAllowance - 3);
      const copy = INITIAL_DAYS.map((d) => ({ ...d, enabled: false }));
      for (let i = 0; i < Math.min(extraCount, gapDayIndexes.length); i++) {
        copy[gapDayIndexes[i]].enabled = true;
      }
      return copy;
    }
    if (postsPerWeekAllowance <= 3) return INITIAL_DAYS;
    const copy = INITIAL_DAYS.map((d) => ({ ...d }));
    if (postsPerWeekAllowance >= 4) copy[1].enabled = true;
    if (postsPerWeekAllowance >= 5) copy[3].enabled = true;
    if (postsPerWeekAllowance >= 6) copy[5].enabled = true;
    if (postsPerWeekAllowance >= 7) copy[6].enabled = true;
    return copy;
  });
  const [totalWeeks, setTotalWeeks] = useState(4);
  const [selectedChannels, setSelectedChannels] = useState<SocialChannel[]>(connectedChannels);

  const [countryCode, setCountryCode] = useState("NO");
  const [focusTopic, setFocusTopic] = useState("");
  const [focusProduct, setFocusProduct] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const { products: catalogProducts } = useProducts(open);
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [learnedHours, setLearnedHours] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setMediaMode(savedMediaMode);
    const load = async () => {
      try {
        const res = await fetch("/api/onboarding/load");
        if (!res.ok) return;
        const data = (await res.json()) as { products?: string[]; services?: string[]; countryCode?: string };
        setAvailableProducts(data.products ?? []);
        setAvailableServices(data.services ?? []);
        if (data.countryCode) setCountryCode(data.countryCode.toUpperCase());
      } catch { /* ignorer */ }
    };
    const loadLearnedHours = async () => {
      try {
        const res = await fetch("/api/metrics/overview");
        if (!res.ok) return;
        const data = (await res.json()) as { recommendedHours?: unknown };
        const hours = Array.isArray(data.recommendedHours)
          ? data.recommendedHours.filter((hour): hour is number => Number.isInteger(hour) && hour >= 0 && hour <= 23)
          : [];
        setLearnedHours(hours);
      } catch { /* statistikk er valgfritt */ }
    };
    void load();
    void loadLearnedHours();
  }, [open, savedMediaMode]);

  const fillWeeks = hasExistingPlan ? weeksUntil(latestScheduledAt) : 4;

  const switchToFillMode = () => {
    setFillMode("fill");
    const gapDayIndexes = [1, 3, 5, 6];
    const extraCount = Math.max(1, postsPerWeekAllowance - 3);
    setDays((prev) => {
      const copy = prev.map((d) => ({ ...d, enabled: false }));
      for (let i = 0; i < Math.min(extraCount, gapDayIndexes.length); i++) {
        copy[gapDayIndexes[i]].enabled = true;
      }
      return copy;
    });
  };

  const switchToNewMode = () => {
    setFillMode("new");
    setDays(() => {
      if (postsPerWeekAllowance <= 3) return INITIAL_DAYS.map((d) => ({ ...d }));
      const copy = INITIAL_DAYS.map((d) => ({ ...d }));
      if (postsPerWeekAllowance >= 4) copy[1].enabled = true;
      if (postsPerWeekAllowance >= 5) copy[3].enabled = true;
      if (postsPerWeekAllowance >= 6) copy[5].enabled = true;
      if (postsPerWeekAllowance >= 7) copy[6].enabled = true;
      return copy;
    });
  };

  const enabledDays = days.filter((d) => d.enabled);
  const postsPerWeek = enabledDays.length;

  const maxDays = postsPerWeekAllowance;

  const toggleDay = (dayOffset: number) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayOffset !== dayOffset) return d;
        const wouldDisable = d.enabled;
        if (wouldDisable && enabledDays.length <= 1) return d;
        if (!wouldDisable && enabledDays.length >= maxDays) return d;
        return { ...d, enabled: !d.enabled };
      }),
    );
  };

  const timeFor = (day: DayConfig, channel: SocialChannel, index: number): PostingTime =>
    day.channelTimes[channel] ?? postingTimeFor(countryCode, channel, index);

  const updateTime = (dayOffset: number, channel: SocialChannel, timeStr: string) => {
    const time = parseTimeString(timeStr);
    setDays((prev) =>
      prev.map((d) => (d.dayOffset === dayOffset
        ? { ...d, channelTimes: { ...d.channelTimes, [channel]: time } }
        : d)),
    );
  };

  const resetToRecommended = () => {
    setDays((prev) => prev.map((d) => ({ ...d, channelTimes: {} })));
  };

  const applyLearnedHours = () => {
    if (learnedHours.length === 0) return;
    setDays((prev) => {
      const enabledOffsets = prev.filter((d) => d.enabled).map((d) => d.dayOffset);
      return prev.map((d) => {
        const position = enabledOffsets.indexOf(d.dayOffset);
        if (position < 0) return d;
        const time = { hour: learnedHours[position % learnedHours.length], minute: 0 };
        const channelTimes = Object.fromEntries(selectedChannels.map((channel) => [channel, time]));
        return { ...d, channelTimes };
      });
    });
  };

  const toggleChannel = (ch: SocialChannel) => {
    setSelectedChannels((prev) => {
      if (prev.includes(ch)) {
        if (prev.length <= 1) return prev;
        return prev.filter((c) => c !== ch);
      }
      return [...prev, ch];
    });
  };

  const handleGenerate = () => {
    const postingDays = enabledDays.map((d) => d.dayOffset);
    const postingSchedule = enabledDays.flatMap((day, index) => selectedChannels.map((channel) => ({
      day: day.dayOffset,
      channel,
      ...timeFor(day, channel, index),
    })));
    const postingHours = enabledDays.map((day, index) => timeFor(day, selectedChannels[0] ?? "instagram", index).hour);

    const weeks = fillMode === "fill" ? fillWeeks : totalWeeks;

    let startDate: string;
    if (fillMode === "fill") {
      startDate = currentWeekMonday();
    } else if (latestScheduledAt) {
      startDate = dayAfterDate(latestScheduledAt);
    } else {
      startDate = nextMondayFromNow();
    }

    const topicParts = [focusProduct, focusTopic].filter(Boolean);
    const topicWindows: TopicWindow[] = topicParts.length > 0
      ? [{ topic: topicParts.join(" – "), startWeek: 1, endWeek: weeks }]
      : [];

    onGenerate({
      postsPerWeek,
      totalWeeks: weeks,
      channels: selectedChannels,
      postingDays,
      postingHours,
      postingSchedule,
      countryCode,
      startDate,
      topicWindows,
      mediaMode,
      productId: selectedProductId ?? undefined,
    });
  };

  if (!open) return null;

  const catalogNames = new Set(catalogProducts.map((product) => product.name.toLowerCase()));
  const topicOnlyItems = [...availableProducts, ...availableServices].filter(
    (item) => !catalogNames.has(item.toLowerCase()),
  );
  const nothingSelected = !focusProduct && !selectedProductId;

  const selectCatalogProduct = (productId: string) => {
    setFocusProduct("");
    setSelectedProductId(selectedProductId === productId ? null : productId);
  };

  const selectTopicItem = (item: string) => {
    setSelectedProductId(null);
    setFocusProduct(focusProduct === item ? "" : item);
  };

  const clearProductSelection = () => {
    setFocusProduct("");
    setSelectedProductId(null);
  };

  const effectiveWeeks = fillMode === "fill" ? fillWeeks : totalWeeks;
  const totalPosts = postsPerWeek * effectiveWeeks * selectedChannels.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl sm:mx-4">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h2 className="text-base font-bold">{cp.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {cp.postsPerWeekAvailable.replace("{count}", String(postsPerWeekAllowance))}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {hasExistingPlan && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={switchToFillMode}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  fillMode === "fill"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="block text-xs font-medium text-foreground">{cp.fillNow}</span>
                <span className="block text-[10px] text-muted-foreground">{cp.fillNowDesc}</span>
              </button>
              <button
                type="button"
                onClick={switchToNewMode}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  fillMode === "new"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="block text-xs font-medium text-foreground">{cp.newPeriod}</span>
                <span className="block text-[10px] text-muted-foreground">{cp.newPeriodDesc.replace("{count}", String(postsPerWeekAllowance))}</span>
              </button>
            </div>
          )}

          {fillMode === "fill" && (
            <div className="rounded-lg bg-primary-light border border-primary/20 px-3 py-2">
              <p className="text-xs text-foreground">
                {cp.fillUpgradeInfo
                  .replace("{count}", String(postsPerWeekAllowance))
                  .replace("{weeks}", String(fillWeeks))
                  .replace("{weekUnit}", fillWeeks === 1 ? cp.weekSingular : cp.weekPlural)}
              </p>
            </div>
          )}

          {(catalogProducts.length > 0 || topicOnlyItems.length > 0) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">{cp.productService}</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={clearProductSelection}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    nothingSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {cp.all}
                </button>
                {catalogProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectCatalogProduct(product.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      selectedProductId === product.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    ✦ {product.name}
                  </button>
                ))}
                {topicOnlyItems.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectTopicItem(item)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      focusProduct === item
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {catalogProducts.length > 0 && (
                <p className="text-[10px] text-muted-foreground">{cp.productHint}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{cp.focusTopic}</label>
            <input
              type="text"
              value={focusTopic}
              onChange={(e) => setFocusTopic(e.target.value)}
              placeholder={cp.focusTopicPlaceholder}
              className="flex h-8 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">
              {cp.focusTopicHint}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{cp.imagesInPosts}</label>
            <div className="flex flex-wrap gap-1.5">
              {(["ai_only", "hybrid", "owned_only"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMediaMode(mode)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    mediaMode === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {mediaModeLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {cp.days} ({postsPerWeek}/{postsPerWeekAllowance})
            </label>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => (
                <button
                  key={day.dayOffset}
                  type="button"
                  onClick={() => toggleDay(day.dayOffset)}
                  className={cn(
                    "rounded-lg border py-1.5 text-[11px] font-medium transition-colors",
                    day.enabled
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {cp.dayShortLabels[day.dayOffset]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">{cp.time}</label>
              <button
                type="button"
                onClick={resetToRecommended}
                className="text-[11px] text-primary hover:underline"
              >
                {cp.reset}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {enabledDays.map((day, index) => (
                <div key={day.dayOffset} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
                  <span className="text-xs font-medium text-foreground w-7">{cp.dayShortLabels[day.dayOffset]}</span>
                  {selectedChannels.map((channel) => {
                    const time = timeFor(day, channel, index);
                    return (
                      <label key={channel} className="flex items-center gap-1">
                        {selectedChannels.length > 1 && (
                          <span className="text-[10px] text-muted-foreground">{CHANNEL_LABEL[channel]}</span>
                        )}
                        <input
                          type="time"
                          value={formatHourMinute(time.hour, time.minute)}
                          onChange={(e) => updateTime(day.dayOffset, channel, e.target.value)}
                          className="h-6 w-[4.5rem] rounded border-0 bg-transparent text-xs focus-visible:outline-none"
                        />
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {cp.recommended}: {selectedChannels.map((channel) => {
                const time = postingTimeFor(countryCode, channel, 0);
                return `${CHANNEL_LABEL[channel]} ${formatHourMinute(time.hour, time.minute)}`;
              }).join(", ")}
            </p>
            {learnedHours.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
                <p className="text-[11px] text-foreground">
                  {cp.learnedHours.replace("{hours}", learnedHours.map((hour) => formatHourMinute(hour, 0)).join(", "))}
                </p>
                <button
                  type="button"
                  onClick={applyLearnedHours}
                  className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                >
                  {cp.useLearnedHours}
                </button>
              </div>
            )}
          </div>

          {connectedChannels.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">{cp.channels}</label>
              <div className="flex flex-wrap gap-2">
                {connectedChannels.map((ch) => (
                  <Checkbox
                    key={ch}
                    label={ch.charAt(0).toUpperCase() + ch.slice(1)}
                    checked={selectedChannels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {fillMode === "new" ? (
              <div className="flex-1">
                <label className="text-xs font-medium text-foreground">{cp.weeks}</label>
                <select
                  value={totalWeeks}
                  onChange={(e) => setTotalWeeks(Number(e.target.value))}
                  className="mt-1 flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {[1, 2, 4, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? cp.weekSingular : cp.weekPlural}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex-1">
                <label className="text-xs font-medium text-foreground">{cp.weeks}</label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fillWeeks} {fillWeeks === 1 ? cp.weekSingular : cp.weekPlural} ({cp.automatic})
                </p>
              </div>
            )}
            <div className="flex-1 rounded-lg bg-muted/30 px-3 py-2 mt-4">
              <p className="text-xs text-muted-foreground">
                {cp.totalPosts.split("{count}")[0]}
                <strong className="text-foreground">{totalPosts}</strong>
                {cp.totalPosts.split("{count}")[1]}
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {cp.cancel}
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={loading || postsPerWeek === 0 || selectedChannels.length === 0}
          >
            {loading ? cp.generating : fillMode === "fill" ? cp.fillPeriod : cp.startGeneration}
          </Button>
        </div>
      </div>
    </div>
  );
};
