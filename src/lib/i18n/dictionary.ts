import type { Locale } from "@/lib/i18n/config";
import { en } from "@/messages/en";
import { nb } from "@/messages/nb";

type DeepStringify<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? DeepStringify<U>[]
    : T extends object
      ? { [K in keyof T]: DeepStringify<T[K]> }
      : T;

export type Dictionary = DeepStringify<typeof nb>;

export type TranslatorVars = Record<string, string | number>;

const getByPath = (root: unknown, path: string): unknown => {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

export const getDictionary = (locale: Locale): Dictionary => {
  return (locale === "en" ? en : nb) as Dictionary;
};

export const createTranslator = (dict: Dictionary) => {
  const t = (path: string, vars?: TranslatorVars): string => {
    const value = getByPath(dict, path);
    if (typeof value !== "string") return path;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (_match, key: string) => {
      const replacement = vars[key];
      return replacement !== undefined ? String(replacement) : `{${key}}`;
    });
  };

  return t;
};

export type Translator = ReturnType<typeof createTranslator>;
