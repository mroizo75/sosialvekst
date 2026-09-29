import sharp from "sharp";

import { overlaySentence, type SocialDesign } from "@/lib/ai/slideDesign";
import { logger } from "@/lib/logger";
import type { SocialChannel } from "@/lib/types";

export type SlideLayout = "photo" | "card" | "single";

export const solidSlideBackground = (color = "#E7E1D6"): Promise<Buffer> =>
  sharp({
    create: { width: 1080, height: 1350, channels: 3, background: color },
  }).jpeg().toBuffer();

export const resolveSlideLayout = (
  channel: SocialChannel,
  mode: SocialDesign["mode"],
  slideIndex: number,
  onPhoto = false,
): SlideLayout => {
  if (onPhoto) return "photo";
  if (slideIndex > 0 && mode === "guide" && channel !== "tiktok") return "card";
  return "single";
};

type ComposeInput = {
  photo: Buffer;
  design: SocialDesign;
  slideIndex: number;
  layout: SlideLayout;
  logo?: Buffer;
  companyName?: string;
  credit?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
};

const WIDTH = 1080;
const HEIGHT = 1350;

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const wrapWords = (value: string, maxChars: number): string[] => {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const wrap = (value: string, maxChars: number, maxLines: number): string[] =>
  wrapWords(value, maxChars).slice(0, maxLines);

const fitSubline = (value: string): { lines: string[]; font: number } => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return { lines: [], font: 50 };
  for (let font = 50; font >= 32; font -= 2) {
    const chars = Math.max(12, Math.floor((WIDTH - 200) / (font * 0.6)));
    const lines = wrapWords(clean, chars);
    if (lines.length <= 2) return { lines, font };
  }
  const words = clean.split(" ").filter(Boolean);
  const mid = Math.ceil(words.length / 2);
  return {
    lines: [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean),
    font: 32,
  };
};

const palette = (primary?: string): { panel: string; ink: string; muted: string } => {
  const hex = primary?.trim().match(/^#?[0-9a-fA-F]{6}$/)?.[0];
  if (!hex) {
    return { panel: "#102833", ink: "#FFFFFF", muted: "#E7EEF2" };
  }
  const normalized = hex.startsWith("#") ? hex : `#${hex}`;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
  return {
    panel: normalized,
    ink: light ? "#142018" : "#FFFFFF",
    muted: light ? "#243028" : "#E7EEF2",
  };
};

type Rgb = { r: number; g: number; b: number };

const parseHex = (value?: string): Rgb | null => {
  const hex = value?.trim().match(/^#?([0-9a-fA-F]{6})$/)?.[1];
  if (!hex) return null;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
};

const luminance = (color: Rgb): number => (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;

const toHex = (color: Rgb): string =>
  `#${[color.r, color.g, color.b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

const lighten = (color: Rgb, amount: number): Rgb => ({
  r: color.r + (255 - color.r) * amount,
  g: color.g + (255 - color.g) * amount,
  b: color.b + (255 - color.b) * amount,
});

export const photoTextColors = (colors: {
  primary?: string;
  secondary?: string;
  accent?: string;
}): { title: string; accent: string } => {
  const ranked = [colors.accent, colors.secondary, colors.primary]
    .map(parseHex)
    .filter((color): color is Rgb => color !== null);
  const primary = parseHex(colors.primary);
  const title = primary && luminance(primary) > 0.72 ? toHex(primary) : "#FFFFFF";
  const readable = ranked.find((color) => luminance(color) >= 0.55);
  if (readable) return { title, accent: toHex(readable) };
  const base = ranked[0];
  if (!base) return { title, accent: "#E8EEF2" };
  let mix = 0.35;
  let next = lighten(base, mix);
  while (luminance(next) < 0.62 && mix < 0.8) {
    mix += 0.1;
    next = lighten(base, mix);
  }
  return { title, accent: toHex(next) };
};

const fitAttrs = (line: string, font: number, maxPx: number): string => {
  if (line.length * font * 0.62 <= maxPx) return "";
  return ` textLength="${maxPx}" lengthAdjust="spacingAndGlyphs"`;
};

const photoOverlaySvg = (
  title: string,
  subline: string,
  colors: { primary?: string; secondary?: string; accent?: string },
  credit?: string,
  brandLabel?: string,
): string => {
  const font = "Segoe UI, Arial, Helvetica, sans-serif";
  const ink = photoTextColors(colors);
  const panelTop = 700;
  const textX = 56;
  const maxPx = WIDTH - textX - 56;
  const titleLines = wrapWords(title, 18).slice(0, 3);
  const titleFont = titleLines.length > 2 ? 84 : titleLines.length > 1 ? 104 : 156;
  const fitted = fitSubline(subline);
  const subFont = Math.max(fitted.font, 40);
  const subLines = fitted.lines.slice(0, 2);
  const creditLine = credit?.trim() ?? "";
  const brand = brandLabel?.trim() ?? "";
  const titleStart = panelTop + (brand ? 150 : 120);
  const titleSvg = titleLines.map((line, index) =>
    `<text x="${textX}" y="${titleStart + index * (titleFont + 8)}" fill="#FFFFFF" font-family="${font}" font-size="${titleFont}" font-weight="800"${fitAttrs(line, titleFont, maxPx)}>${escapeXml(line)}</text>`,
  ).join("");
  const subStart = titleStart + titleLines.length * (titleFont + 8) + 24;
  const subSvg = subLines.map((line, index) =>
    `<text x="${textX}" y="${subStart + index * (subFont + 18)}" fill="#FFFFFF" font-family="${font}" font-size="${subFont}" font-weight="700"${fitAttrs(line, subFont, maxPx)}>${escapeXml(line)}</text>`,
  ).join("");
  const creditSvg = creditLine
    ? `<text x="${textX}" y="${HEIGHT - 36}" fill="#FFFFFF" font-family="${font}" font-size="26" font-weight="600"${fitAttrs(creditLine, 26, maxPx)}>${escapeXml(creditLine)}</text>`
    : "";
  const brandSvg = brand
    ? `<text x="${textX}" y="${panelTop + 72}" fill="${ink.accent}" font-family="${font}" font-size="36" font-weight="800">${escapeXml(brand)}</text>`
    : "";
  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.42" stop-color="rgba(0,0,0,0)"/>
        <stop offset="1" stop-color="rgba(0,0,0,0.2)"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="0" y="${panelTop}" width="${WIDTH}" height="${HEIGHT - panelTop}" fill="rgba(8,16,24,0.9)"/>
    <rect x="0" y="${panelTop}" width="18" height="${HEIGHT - panelTop}" fill="${ink.accent}"/>
    ${brandSvg}
    ${titleSvg}
    ${subSvg}
    ${creditSvg}
  </svg>`;
};

export const buildSlideSvg = (input: ComposeInput): string => {
  const colors = palette(input.primaryColor);
  const font = "Segoe UI, Arial, Helvetica, sans-serif";
  if (input.layout === "photo") {
    const card = input.slideIndex > 0 ? input.design.cards[input.slideIndex - 1] : undefined;
    const subline = card
      ? overlaySentence(card.summary, card.slideLine)
      : overlaySentence(input.design.coverSubline, input.design.hook);
    return photoOverlaySvg(
      card?.title ?? input.design.coverTitle,
      subline,
      { primary: input.primaryColor, secondary: input.secondaryColor, accent: input.accentColor },
      input.credit,
      input.logo ? undefined : input.companyName,
    );
  }
  if (input.layout === "card") {
    const card = input.design.cards[input.slideIndex - 1];
    const title = escapeXml(card?.title ?? input.design.coverTitle);
    const summary = wrap(card?.summary ?? input.design.coverSubline, 34, 2).map(escapeXml);
    const bullets = (card?.bullets ?? []).slice(0, 3);
    const panelY = 760;
    const bulletRows = bullets.map((bullet, index) => {
      const y = 1040 + index * 78;
      return `<circle cx="84" cy="${y - 10}" r="8" fill="${colors.ink}"/><text x="112" y="${y}" fill="${colors.ink}" font-family="${font}" font-size="34" font-weight="600">${escapeXml(bullet)}</text>`;
    }).join("");
    const summarySvg = summary.map((line, index) =>
      `<text x="64" y="${930 + index * 48}" fill="${colors.muted}" font-family="${font}" font-size="32">${line}</text>`,
    ).join("");
    return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${panelY}" width="${WIDTH}" height="${HEIGHT - panelY}" fill="${colors.panel}"/>
      <text x="64" y="860" fill="${colors.ink}" font-family="${font}" font-size="64" font-weight="700">${title}</text>
      ${summarySvg}
      ${bulletRows}
    </svg>`;
  }

  const titleLines = wrap(input.design.coverTitle, 24, 2).map(escapeXml);
  const sublines = wrap(input.design.coverSubline, 32, 2).map(escapeXml);
  const panelY = 760;
  const titleSvg = titleLines.map((line, index) =>
    `<text x="64" y="${860 + index * 72}" fill="${colors.ink}" font-family="${font}" font-size="56" font-weight="700">${line}</text>`,
  ).join("");
  const sublineSvg = sublines.map((line, index) =>
    `<text x="64" y="${1040 + index * 44}" fill="${colors.muted}" font-family="${font}" font-size="32">${line}</text>`,
  ).join("");
  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${panelY}" width="${WIDTH}" height="${HEIGHT - panelY}" fill="${colors.panel}"/>
    ${titleSvg}
    ${sublineSvg}
  </svg>`;
};

const isSvg = (logo: Buffer): boolean =>
  logo.subarray(0, 300).toString("utf8").includes("<svg");

const fitLogo = async (logo: Buffer): Promise<Buffer> => {
  const base = sharp(logo, isSvg(logo) ? { density: 300 } : undefined);
  const trimmed = await base.trim({ threshold: 12 }).png().toBuffer().catch(() => logo);
  return sharp(trimmed)
    .resize({ width: 520, height: 180, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
};

export const contrastPlateFill = async (png: Buffer): Promise<string> => {
  try {
    const stats = await sharp(png).ensureAlpha().stats();
    const [red, green, blue] = stats.channels;
    const luminance = ((red?.mean ?? 0) + (green?.mean ?? 0) + (blue?.mean ?? 0)) / 3;
    if (luminance > 210) return "rgba(20,24,28,0.92)";
  } catch (error) {
    logger.warn("Kunne ikke måle logokontrast", {
      error: error instanceof Error ? error.message : "ukjent",
      bytes: png.byteLength,
    });
  }
  return "rgba(255,255,255,0.96)";
};

export const composeDesignedSlide = async (input: ComposeInput): Promise<Buffer> => {
  const onPhoto = input.layout === "photo";
  const photo = await sharp(input.photo)
    .resize(WIDTH, onPhoto ? HEIGHT : 760, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  const base = onPhoto
    ? photo
    : await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: palette(input.primaryColor).panel },
    }).png().composite([{ input: photo, top: 0, left: 0 }]).png().toBuffer();
  const overlay = Buffer.from(buildSlideSvg(input));
  const layers: sharp.OverlayOptions[] = [{ input: overlay, top: 0, left: 0 }];

  if (input.logo) {
    const logo = await fitLogo(input.logo);
    const meta = await sharp(logo).metadata();
    const logoW = meta.width ?? 168;
    const logoH = meta.height ?? 168;
    const left = onPhoto ? 48 : WIDTH - logoW - 48;
    const top = onPhoto ? 48 : 792;
    const platePad = 14;
    const plateFill = await contrastPlateFill(logo);
    const plate = Buffer.from(
      `<svg width="${logoW + platePad * 2}" height="${logoH + platePad * 2}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="22" fill="${plateFill}"/></svg>`,
    );
    logger.info("Logo komponeres på slide", {
      bytes: input.logo.byteLength,
      logoW,
      logoH,
      left,
      top,
      plateFill,
      layout: input.layout,
    });
    layers.push({ input: plate, left: left - platePad, top: top - platePad });
    layers.push({ input: logo, left, top });
  }

  return sharp(base).composite(layers).jpeg({ quality: 92 }).toBuffer();
};
