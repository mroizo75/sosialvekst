"use client";

import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/config";
import { useI18n } from "@/components/i18n/I18nProvider";

type LanguageSwitcherProps = {
  variant?: "marketing" | "app";
  className?: string;
};

export const LanguageSwitcher = ({
  variant = "app",
  className,
}: LanguageSwitcherProps) => {
  const { locale, setLocale, isPending } = useI18n();

  const options: Locale[] = ["nb", "en"];

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center rounded-lg p-0.5 text-xs font-semibold",
        variant === "marketing"
          ? "border border-white/15 bg-white/5"
          : "border border-border bg-secondary/60",
        className,
      )}
    >
      {options.map((option) => {
        const active = locale === option;
        return (
          <button
            key={option}
            type="button"
            disabled={isPending}
            onClick={() => void setLocale(option)}
            className={cn(
              "rounded-md px-2.5 py-1 transition-colors cursor-pointer disabled:opacity-60",
              variant === "marketing"
                ? active
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:text-white/90"
                : active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
};
