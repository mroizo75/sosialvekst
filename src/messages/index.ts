import type { Locale } from "@/lib/i18n/config";
import { en } from "@/messages/en";
import { nb } from "@/messages/nb";

export { en, nb };

export const getMessages = (locale: Locale) => {
  return locale === "en" ? en : nb;
};
