import type { BrandColors } from "@/lib/types";

const BRAND_VARIABLE = /--[a-z0-9-]*(primary|brand|accent|secondary|main|theme)[a-z0-9-]*\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi;
const ANY_COLOR = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}[^)]*\)/gi;
const BRAND_VARIABLE_WEIGHT = 25;
const THEME_COLOR_WEIGHT = 50;
const MIN_DISTANCE = 60;

type Rgb = [number, number, number];

const toRgb = (value: string): Rgb | undefined => {
  const color = value.trim().toLowerCase();
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex.slice(0, 6);
    if (!/^[0-9a-f]{6}$/.test(full)) return undefined;
    return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as Rgb;
  }
  const parts = color.match(/\d{1,3}/g)?.slice(0, 3).map(Number);
  if (!parts || parts.length < 3 || parts.some((part) => part > 255)) return undefined;
  if (/rgba/.test(color)) {
    const alpha = Number(color.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? "1");
    if (alpha < 0.6) return undefined;
  }
  return parts as Rgb;
};

const toHex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;

const isBrandLike = ([r, g, b]: Rgb): boolean => {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return saturation >= 0.4 && lightness >= 0.12 && lightness <= 0.82;
};

const distance = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const addScore = (scores: Map<string, { rgb: Rgb; score: number }>, value: string, weight: number): void => {
  const rgb = toRgb(value);
  if (!rgb || !isBrandLike(rgb)) return;
  const hex = toHex(rgb);
  const current = scores.get(hex);
  scores.set(hex, { rgb, score: (current?.score ?? 0) + weight });
};

export const pickBrandColors = (themeColor: string | undefined, cssTexts: string[]): BrandColors | undefined => {
  const scores = new Map<string, { rgb: Rgb; score: number }>();
  if (themeColor) addScore(scores, themeColor, THEME_COLOR_WEIGHT);
  for (const css of cssTexts) {
    for (const match of css.matchAll(BRAND_VARIABLE)) addScore(scores, match[2] ?? "", BRAND_VARIABLE_WEIGHT);
    for (const match of css.matchAll(ANY_COLOR)) addScore(scores, match[0], 1);
  }

  const picked: Array<{ hex: string; rgb: Rgb }> = [];
  for (const [hex, { rgb }] of [...scores.entries()].sort((a, b) => b[1].score - a[1].score)) {
    if (picked.every((item) => distance(item.rgb, rgb) >= MIN_DISTANCE)) picked.push({ hex, rgb });
    if (picked.length === 3) break;
  }
  if (picked.length === 0) return undefined;

  const [primary, secondary, accent] = picked.map((item) => item.hex);
  return { primary, ...(secondary ? { secondary } : {}), ...(accent ? { accent } : {}) };
};
