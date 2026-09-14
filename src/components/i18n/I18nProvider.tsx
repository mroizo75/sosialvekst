"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { Locale } from "@/lib/i18n/config";
import {
  createTranslator,
  type Dictionary,
  type Translator,
  type TranslatorVars,
} from "@/lib/i18n/dictionary";

type I18nContextValue = {
  locale: Locale;
  dictionary: Dictionary;
  t: Translator;
  setLocale: (locale: Locale) => Promise<void>;
  isPending: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
};

export const I18nProvider = ({ locale, dictionary, children }: I18nProviderProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const t = useMemo(() => createTranslator(dictionary), [dictionary]);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (next === locale) return;
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) return;
      startTransition(() => {
        router.refresh();
      });
    },
    [locale, router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dictionary,
      t,
      setLocale,
      isPending,
    }),
    [locale, dictionary, t, setLocale, isPending],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
};

export const useT = (): ((path: string, vars?: TranslatorVars) => string) => {
  return useI18n().t;
};
