import sharp from "sharp";

import type { SocialDesign } from "@/lib/ai/slideDesign";
import type { SocialChannel } from "@/lib/types";

export type SlideLayout = "photo" | "card" | "single";

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

const wrap = (value: string, maxChars: number, maxLines: number): string[] => {
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
  return lines.slice(0, maxLines);
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

const photoOverlaySvg = (
  title: string,
  subline: string,
  colors: { primary?: string; secondary?: string; accent?: string },
): string => {
  const font = "Segoe UI, Arial, Helvetica, sans-serif";
  const ink = photoTextColors(colors);
  const titleLines = wrap(title, 16, 2).map(escapeXml);
  const sub = escapeXml(wrap(subline, 32, 1)[0] ?? "");
  const titleStart = titleLines.length > 1 ? 980 : 1080;
  const titleSvg = titleLines.map((line, index) =>
    `<text x="64" y="${titleStart + index * 84}" fill="${ink.title}" font-family="${font}" font-size="72" font-weight="700">${line}</text>`,
  ).join("");
  const subY = titleStart + Math.max(titleLines.length - 1, 0) * 84 + 96;
  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="rgba(0,0,0,0)"/>
        <stop offset="1" stop-color="rgba(8,18,28,0.82)"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    ${titleSvg}
    <text x="64" y="${subY}" fill="${ink.accent}" font-family="${font}" font-size="40" font-weight="600">${sub}</text>
  </svg>`;
};

export const buildSlideSvg = (input: ComposeInput): string => {
  const colors = palette(input.primaryColor);
  const font = "Segoe UI, Arial, Helvetica, sans-serif";
  if (input.layout === "photo") {
    const card = input.slideIndex > 0 ? input.design.cards[input.slideIndex - 1] : undefined;
    return photoOverlaySvg(
      card?.title ?? input.design.coverTitle,
      card?.summary ?? input.design.coverSubline,
      { primary: input.primaryColor, secondary: input.secondaryColor, accent: input.accentColor },
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

const fitLogo = async (logo: Buffer): Promise<Buffer> =>
  sharp(logo).resize({ width: 168, height: 168, fit: "inside", withoutEnlargement: false }).png().toBuffer();

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
    const plate = Buffer.from(
      `<svg width="${logoW + platePad * 2}" height="${logoH + platePad * 2}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="22" fill="rgba(255,255,255,0.96)"/></svg>`,
    );
    layers.push({ input: plate, left: left - platePad, top: top - platePad });
    layers.push({ input: logo, left, top });
  }

  return sharp(base).composite(layers).jpeg({ quality: 92 }).toBuffer();
};
