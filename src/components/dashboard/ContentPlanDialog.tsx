"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { MediaMode, SocialChannel, TopicWindow } from "@/lib/types";

type DayConfig = {
  dayOffset: number;
  label: string;
  shortLabel: string;
  enabled: boolean;
  hour: number;
  minute: number;
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
  startDate?: string;
  topicWindows: TopicWindow[];
  mediaMode: MediaMode;
};

const RECOMMENDED_HOURS: Record<number, number> = {
  0: 8,
  1: 11,
  2: 14,
  3: 11,
  4: 17,
  5: 10,
  6: 12,
};

const INITIAL_DAYS: DayConfig[] = [
  { dayOffset: 0, label: "Mandag", shortLabel: "Man", enabled: true, hour: 8, minute: 0 },
  { dayOffset: 1, label: "Tirsdag", shortLabel: "Tir", enabled: false, hour: 11, minute: 0 },
  { dayOffset: 2, label: "Onsdag", shortLabel: "Ons", enabled: true, hour: 14, minute: 0 },
  { dayOffset: 3, label: "Torsdag", shortLabel: "Tor", enabled: false, hour: 11, minute: 0 },
  { dayOffset: 4, label: "Fredag", shortLabel: "Fre", enabled: true, hour: 17, minute: 0 },
  { dayOffset: 5, label: "Lørdag", shortLabel: "Lør", enabled: false, hour: 10, minute: 0 },
  { dayOffset: 6, label: "Søndag", shortLabel: "Søn", enabled: false, hour: 12, minute: 0 },
];

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

const MEDIA_MODE_LABELS: Record<MediaMode, string> = {
  ai_only: "La AI lage alle bilder",
  hybrid: "Egne + AI-bilder",
  owned_only: "Kun egne bilder",
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

  const [focusTopic, setFocusTopic] = useState("");
  const [focusProduct, setFocusProduct] = useState("");
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setMediaMode(savedMediaMode);
    const load = async () => {
      try {
        const res = await fetch("/api/onboarding/load");
        if (!res.ok) return;
        const data = (await res.json()) as { products?: string[]; services?: string[] };
        setAvailableProducts(data.products ?? []);
        setAvailableServices(data.services ?? []);
      } catch { /* ignorer */ }
    };
    void load();
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

  const updateTime = (dayOffset: number, timeStr: string) => {
    const { hour, minute } = parseTimeString(timeStr);
    setDays((prev) =>
      prev.map((d) => (d.dayOffset === dayOffset ? { ...d, hour, minute } : d)),
    );
  };

  const resetToRecommended = () => {
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        hour: RECOMMENDED_HOURS[d.dayOffset] ?? 11,
        minute: 0,
      })),
    );
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
    const postingHours = enabledDays.map((d) => d.hour);

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
      startDate,
      topicWindows,
      mediaMode,
    });
  };

  if (!open) return null;

  const effectiveWeeks = fillMode === "fill" ? fillWeeks : totalWeeks;
  const totalPosts = postsPerWeek * effectiveWeeks * selectedChannels.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl sm:mx-4">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h2 className="text-base font-bold">Planlegg innhold</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {postsPerWeekAllowance} poster/uke tilgjengelig
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
                <span className="block text-xs font-medium text-foreground">Fyll opp nå</span>
                <span className="block text-[10px] text-muted-foreground">Ekstra poster denne perioden</span>
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
                <span className="block text-xs font-medium text-foreground">Ny periode</span>
                <span className="block text-[10px] text-muted-foreground">{postsPerWeekAllowance} poster/uke fremover</span>
              </button>
            </div>
          )}

          {fillMode === "fill" && (
            <div className="rounded-lg bg-primary-light border border-primary/20 px-3 py-2">
              <p className="text-xs text-foreground">
                Du har oppgradert til {postsPerWeekAllowance} poster/uke.
                Legg til de ekstra postene i inneværende periode ({fillWeeks} {fillWeeks === 1 ? "uke" : "uker"} igjen).
                Velg dager som ikke allerede har innhold.
              </p>
            </div>
          )}

          {(availableProducts.length > 0 || availableServices.length > 0) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Produkt / tjeneste</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFocusProduct("")}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    !focusProduct
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  Alle
                </button>
                {[...availableProducts, ...availableServices].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFocusProduct(focusProduct === item ? "" : item)}
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
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Fokusemne</label>
            <input
              type="text"
              value={focusTopic}
              onChange={(e) => setFocusTopic(e.target.value)}
              placeholder="F.eks. Sommerkampanje, Nyttårssalg, Kundeopplevelser..."
              className="flex h-8 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">
              Valgfritt. La stå tomt for variert innhold basert på brandprofilen.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Bilder i innlegg</label>
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
                  {MEDIA_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Dager ({postsPerWeek}/{postsPerWeekAllowance})
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
                  {day.shortLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Klokkeslett</label>
              <button
                type="button"
                onClick={resetToRecommended}
                className="text-[11px] text-primary hover:underline"
              >
                Nullstill
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {days.filter((d) => d.enabled).map((day) => (
                <div key={day.dayOffset} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
                  <span className="text-xs font-medium text-foreground w-7">{day.shortLabel}</span>
                  <input
                    type="time"
                    value={formatHourMinute(day.hour, day.minute)}
                    onChange={(e) => updateTime(day.dayOffset, e.target.value)}
                    className="h-6 flex-1 min-w-0 rounded border-0 bg-transparent text-xs focus-visible:outline-none"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Anbefalt: {enabledDays.map((d) => `${d.shortLabel} ${formatHourMinute(RECOMMENDED_HOURS[d.dayOffset] ?? 11, 0)}`).join(", ")}
            </p>
          </div>

          {connectedChannels.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Kanaler</label>
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
                <label className="text-xs font-medium text-foreground">Uker</label>
                <select
                  value={totalWeeks}
                  onChange={(e) => setTotalWeeks(Number(e.target.value))}
                  className="mt-1 flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value={1}>1 uke</option>
                  <option value={2}>2 uker</option>
                  <option value={4}>4 uker</option>
                  <option value={8}>8 uker</option>
                  <option value={12}>12 uker</option>
                </select>
              </div>
            ) : (
              <div className="flex-1">
                <label className="text-xs font-medium text-foreground">Uker</label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fillWeeks} {fillWeeks === 1 ? "uke" : "uker"} (automatisk)
                </p>
              </div>
            )}
            <div className="flex-1 rounded-lg bg-muted/30 px-3 py-2 mt-4">
              <p className="text-xs text-muted-foreground">
                Totalt <strong className="text-foreground">{totalPosts}</strong> poster
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Avbryt
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={loading || postsPerWeek === 0 || selectedChannels.length === 0}
          >
            {loading ? "Lager innhold..." : fillMode === "fill" ? "Fyll opp perioden" : "Start generering"}
          </Button>
        </div>
      </div>
    </div>
  );
};
