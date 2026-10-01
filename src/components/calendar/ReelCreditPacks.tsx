"use client";

import { useState } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";
import { cn } from "@/lib/utils";

const REEL_CREDIT_PACKS = [
  { mode: "video_credits_10", labelKey: "calendar.reelPack10", priceKey: "calendar.reelPack10Price" },
  { mode: "video_credits_30", labelKey: "calendar.reelPack30", priceKey: "calendar.reelPack30Price" },
  { mode: "video_credits_100", labelKey: "calendar.reelPack100", priceKey: "calendar.reelPack100Price" },
] as const;

type ReelCreditPacksProps = {
  className?: string;
};

export const ReelCreditPacks = ({ className }: ReelCreditPacksProps) => {
  const { t } = useI18n();
  const [loadingMode, setLoadingMode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const startCheckout = async (mode: string) => {
    setLoadingMode(mode);
    setFailed(false);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, returnPath: "/kalender" }),
      });
      const data = (await response.json()) as { url?: string };
      if (!response.ok || !data.url) {
        setFailed(true);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {REEL_CREDIT_PACKS.map((pack) => (
        <button
          key={pack.mode}
          type="button"
          onClick={() => void startCheckout(pack.mode)}
          disabled={loadingMode !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-transparent px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary/10 disabled:opacity-50 cursor-pointer"
        >
          {loadingMode === pack.mode ? t("calendar.openingPayment") : t(pack.labelKey)}
          <span className="text-primary">{t(pack.priceKey)}</span>
        </button>
      ))}
      {failed && <span className="text-xs text-destructive">{t("calendar.paymentFailed")}</span>}
    </div>
  );
};
