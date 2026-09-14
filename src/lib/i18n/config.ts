export const locales = ["nb", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "nb";

export const LOCALE_COOKIE = "sv_locale";

export const localeToPreferredLanguage: Record<Locale, "nb-NO" | "en-US"> = {
  nb: "nb-NO",
  en: "en-US",
};

export const isLocale = (value: unknown): value is Locale =>
  value === "nb" || value === "en";
