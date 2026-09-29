import sharp from "sharp";

import type { SocialDesign } from "@/lib/ai/slideDesign";
import { renderTextBlock, type TextBlock } from "@/lib/ai/slideText";
import { logger } from "@/lib/logger";

export type SlideLayout = "cover" | "slide" | "card" | "cta";

export type SlideShape = "portrait" | "square";

export type ComposeInput = {
  photo?: Buffer;
  design: SocialDesign;
  slideIndex: number;
  layout: SlideLayout;
  shape?: SlideShape;
  carousel?: boolean;
  logo?: Buffer;
  companyName?: string;
  websiteUrl?: string;
  credit?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
};

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;
export const SQUARE_SLIDE_HEIGHT = 1080;
const PAD = 72;
const TEXT_WIDTH = SLIDE_WIDTH - PAD * 2;
const FOOTER = 120;

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

export const panelPalette = (primary?: string): { panel: string; ink: string; muted: string; light: boolean } => {
  const color = parseHex(primary);
  if (!color) return { panel: "#102833", ink: "#FFFFFF", muted: "#D9E3E8", light: false };
  const light = luminance(color) > 0.62;
  return {
    panel: toHex(color),
    ink: light ? "#142018" : "#FFFFFF",
    muted: light ? "#2B3830" : "#E4ECF0",
    light,
  };
};

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
  if (!base) return { title, accent: "#F2C94C" };
  let mix = 0.35;
  let next = lighten(base, mix);
  while (luminance(next) < 0.62 && mix < 0.8) {
    mix += 0.1;
    next = lighten(base, mix);
  }
  return { title, accent: toHex(next) };
};

const inkOn = (fill: string): string => {
  const color = parseHex(fill);
  return color && luminance(color) > 0.55 ? "#111111" : "#FFFFFF";
};

export const solidSlideBackground = (color = "#E7E1D6"): Promise<Buffer> =>
  sharp({
    create: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, channels: 3, background: color },
  }).jpeg().toBuffer();

export const slideHeight = (shape: SlideShape = "portrait"): number =>
  shape === "square" ? SQUARE_SLIDE_HEIGHT : SLIDE_HEIGHT;

const heightOf = (input: ComposeInput): number => slideHeight(input.shape);

const svg = (body: string, width = SLIDE_WIDTH, height = SLIDE_HEIGHT): Buffer =>
  Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

const pill = (width: number, height: number, fill: string): Buffer =>
  svg(`<rect width="${width}" height="${height}" rx="${Math.round(height / 2)}" fill="${fill}"/>`, width, height);

const photoShade = (textTop: number, height: number): Buffer => {
  const start = Math.max(0, textTop - 260);
  return svg(`
    <defs>
      <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000000" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000000" stop-opacity="0"/>
        <stop offset="0.35" stop-color="#000000" stop-opacity="0.6"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.9"/>
      </linearGradient>
    </defs>
    <rect width="${SLIDE_WIDTH}" height="260" fill="url(#top)"/>
    <rect y="${start}" width="${SLIDE_WIDTH}" height="${height - start}" fill="url(#bottom)"/>
  `, SLIDE_WIDTH, height);
};

const place = (block: TextBlock, left: number, top: number): sharp.OverlayOptions => ({
  input: block.image,
  left: Math.round(left),
  top: Math.round(Math.max(0, top)),
});

const websiteLabel = (url?: string): string =>
  (url ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");

const isSvgBuffer = (logo: Buffer): boolean =>
  logo.subarray(0, 300).toString("utf8").includes("<svg");

const fitLogo = async (logo: Buffer, maxWidth: number, maxHeight: number): Promise<Buffer> => {
  const base = sharp(logo, isSvgBuffer(logo) ? { density: 300 } : undefined);
  const trimmed = await base.trim({ threshold: 12 }).png().toBuffer().catch(() => logo);
  return sharp(trimmed)
    .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
};

export const contrastPlateFill = async (png: Buffer): Promise<string> => {
  try {
    const stats = await sharp(png).ensureAlpha().stats();
    const [red, green, blue] = stats.channels;
    const brightness = ((red?.mean ?? 0) + (green?.mean ?? 0) + (blue?.mean ?? 0)) / 3;
    if (brightness > 210) return "rgba(20,24,28,0.92)";
  } catch (error) {
    logger.warn("Kunne ikke måle logokontrast", {
      error: error instanceof Error ? error.message : "ukjent",
      bytes: png.byteLength,
    });
  }
  return "rgba(255,255,255,0.96)";
};

const logoLayers = async (
  logo: Buffer,
  box: { maxWidth: number; maxHeight: number },
  position: { left: number; top: number } | { centreTop: number },
): Promise<{ layers: sharp.OverlayOptions[]; bottom: number }> => {
  const fitted = await fitLogo(logo, box.maxWidth, box.maxHeight);
  const meta = await sharp(fitted).metadata();
  const width = meta.width ?? box.maxWidth;
  const height = meta.height ?? box.maxHeight;
  const platePad = 18;
  const left = "centreTop" in position ? Math.round((SLIDE_WIDTH - width) / 2) : position.left;
  const top = "centreTop" in position ? position.centreTop : position.top;
  const plateFill = await contrastPlateFill(fitted);
  const plate = svg(
    `<rect width="100%" height="100%" rx="24" fill="${plateFill}"/>`,
    width + platePad * 2,
    height + platePad * 2,
  );
  return {
    layers: [
      { input: plate, left: left - platePad, top: top - platePad },
      { input: fitted, left, top },
    ],
    bottom: top + height + platePad,
  };
};

const footerLayers = async (input: ComposeInput, color: string): Promise<sharp.OverlayOptions[]> => {
  const layers: sharp.OverlayOptions[] = [];
  const footerY = heightOf(input) - 52;
  const credit = input.credit?.trim();
  if (credit) {
    const block = await renderTextBlock({
      text: credit,
      weight: "medium",
      color,
      maxWidth: 620,
      maxHeight: 60,
      maxSize: 22,
      minSize: 16,
    });
    if (block) layers.push(place(block, PAD, footerY - block.height / 2));
  }
  if (input.carousel && input.layout === "cover") {
    const block = await renderTextBlock({
      text: "Sveip →",
      weight: "heavy",
      color,
      maxWidth: 260,
      maxHeight: 50,
      maxSize: 28,
      minSize: 22,
    });
    if (block) layers.push(place(block, SLIDE_WIDTH - PAD - block.width, footerY - block.height / 2));
  }
  return layers;
};

const accentFor = (input: ComposeInput): string =>
  photoTextColors({ primary: input.primaryColor, secondary: input.secondaryColor, accent: input.accentColor }).accent;

const labelPill = async (
  text: string,
  fill: string,
  bottom: number,
): Promise<{ layers: sharp.OverlayOptions[]; top: number } | null> => {
  const block = await renderTextBlock({
    text,
    weight: "heavy",
    color: inkOn(fill),
    maxWidth: TEXT_WIDTH - 56,
    maxHeight: 48,
    maxSize: 28,
    minSize: 20,
  });
  if (!block) return null;
  const height = block.height + 20;
  const top = bottom - height;
  return {
    layers: [
      { input: pill(block.width + 48, height, fill), left: PAD, top: Math.round(top) },
      place(block, PAD + 24, top + 10),
    ],
    top,
  };
};

const photoTextLayers = async (input: ComposeInput): Promise<{ layers: sharp.OverlayOptions[]; top: number }> => {
  const accent = accentFor(input);
  const card = input.slideIndex > 0 ? input.design.cards[input.slideIndex - 1] : undefined;
  const cover = input.layout === "cover";
  const titleOnly = input.shape === "square";
  const title = await renderTextBlock({
    text: card?.title ?? input.design.coverTitle,
    weight: "heavy",
    color: "#FFFFFF",
    maxWidth: TEXT_WIDTH,
    maxHeight: titleOnly ? (cover ? 440 : 320) : cover ? 470 : 280,
    maxSize: titleOnly ? (cover ? 156 : 112) : cover ? 124 : 84,
    minSize: cover ? 60 : 50,
  });
  const body = titleOnly
    ? null
    : await renderTextBlock({
      text: card?.summary ?? input.design.coverSubline,
      weight: "medium",
      color: "#F4F4F4",
      maxWidth: TEXT_WIDTH,
      maxHeight: cover ? 150 : 270,
      maxSize: cover ? 44 : 42,
      minSize: 30,
    });

  const layers: sharp.OverlayOptions[] = [];
  let y = heightOf(input) - FOOTER;
  if (body) {
    y -= body.height;
    layers.push(place(body, PAD, y));
    y -= 28;
  }
  if (title) {
    y -= title.height;
    layers.push(place(title, PAD, y));
    y -= 30;
  }
  const coverLabel = titleOnly ? "" : input.design.coverKicker.toUpperCase();
  const label = cover ? coverLabel : String(input.slideIndex).padStart(2, "0");
  if (label) {
    const badge = await labelPill(label, accent, y);
    if (badge) {
      layers.push(...badge.layers);
      y = badge.top;
    }
  }
  return { layers, top: y };
};

const composePhotoSlide = async (input: ComposeInput, photo: Buffer): Promise<Buffer> => {
  const height = heightOf(input);
  const base = await sharp(photo)
    .resize(SLIDE_WIDTH, height, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  const text = await photoTextLayers(input);
  const layers: sharp.OverlayOptions[] = [
    { input: photoShade(text.top, height), left: 0, top: 0 },
    ...text.layers,
    ...(await footerLayers(input, "#FFFFFF")),
  ];
  if (input.logo) {
    layers.push(...(await logoLayers(input.logo, { maxWidth: 300, maxHeight: 110 }, { left: 56, top: 56 })).layers);
  }
  return sharp(base).composite(layers).jpeg({ quality: 92 }).toBuffer();
};

const panelBase = (fill: string, height: number): Promise<Buffer> =>
  sharp({ create: { width: SLIDE_WIDTH, height, channels: 3, background: fill } }).png().toBuffer();

const panelAccent = (input: ComposeInput, colors: ReturnType<typeof panelPalette>): string =>
  colors.light ? colors.ink : accentFor(input);

const composeCardSlide = async (input: ComposeInput): Promise<Buffer> => {
  const colors = panelPalette(input.primaryColor);
  const accent = panelAccent(input, colors);
  const card = input.design.cards[input.slideIndex - 1];
  const square = input.shape === "square";
  const height = heightOf(input);
  const number = await renderTextBlock({
    text: input.slideIndex > 0 ? String(input.slideIndex).padStart(2, "0") : "",
    weight: "heavy",
    color: accent,
    maxWidth: TEXT_WIDTH,
    maxHeight: square ? 150 : 200,
    maxSize: square ? 110 : 150,
    minSize: 80,
  });
  const title = await renderTextBlock({
    text: card?.title ?? input.design.coverTitle,
    weight: "heavy",
    color: colors.ink,
    maxWidth: TEXT_WIDTH,
    maxHeight: square ? 280 : 380,
    maxSize: square ? 88 : 96,
    minSize: 56,
  });
  const body = await renderTextBlock({
    text: card?.summary ?? input.design.coverSubline,
    weight: "medium",
    color: colors.muted,
    maxWidth: TEXT_WIDTH,
    maxHeight: square ? 250 : 340,
    maxSize: square ? 42 : 48,
    minSize: 30,
  });

  const blocks = [number, title, body].filter((block): block is TextBlock => block !== null);
  const gap = square ? 30 : 40;
  const barHeight = 10;
  const stackHeight = blocks.reduce((sum, block) => sum + block.height, 0) + gap * blocks.length + barHeight;
  let y = Math.max(square ? 200 : 240, Math.round((height - stackHeight) / 2));
  const layers: sharp.OverlayOptions[] = [];
  if (number) {
    layers.push(place(number, PAD, y));
    y += number.height + 16;
    layers.push({ input: svg(`<rect width="120" height="${barHeight}" rx="5" fill="${accent}"/>`, 120, barHeight), left: PAD, top: y });
    y += barHeight + gap;
  }
  if (title) {
    layers.push(place(title, PAD, y));
    y += title.height + gap;
  }
  if (body) layers.push(place(body, PAD, y));
  if (input.logo) {
    layers.push(...(await logoLayers(input.logo, { maxWidth: 300, maxHeight: 110 }, { left: 56, top: 56 })).layers);
  }
  return sharp(await panelBase(colors.panel, height)).composite(layers).jpeg({ quality: 92 }).toBuffer();
};

const composeCtaSlide = async (input: ComposeInput): Promise<Buffer> => {
  const colors = panelPalette(input.primaryColor);
  const accent = panelAccent(input, colors);
  const square = input.shape === "square";
  const height = heightOf(input);
  const layers: sharp.OverlayOptions[] = [];
  let y = square ? 320 : 420;
  if (input.logo) {
    const logo = await logoLayers(input.logo, { maxWidth: 520, maxHeight: square ? 180 : 220 }, square ? { centreTop: 150 } : { centreTop: 200 });
    layers.push(...logo.layers);
    y = logo.bottom + (square ? 80 : 110);
  }
  const cta = await renderTextBlock({
    text: input.design.cta,
    weight: "heavy",
    color: colors.ink,
    maxWidth: TEXT_WIDTH,
    maxHeight: square ? 320 : 420,
    maxSize: 92,
    minSize: 54,
    align: "centre",
  });
  if (cta) {
    layers.push(place(cta, (SLIDE_WIDTH - cta.width) / 2, y));
    y += cta.height + 56;
  }
  const signature = websiteLabel(input.websiteUrl) || input.companyName?.trim() || "";
  const sign = signature
    ? await renderTextBlock({
      text: signature,
      weight: "medium",
      color: accent,
      maxWidth: TEXT_WIDTH,
      maxHeight: 70,
      maxSize: 40,
      minSize: 28,
      align: "centre",
    })
    : null;
  if (sign) layers.push(place(sign, (SLIDE_WIDTH - sign.width) / 2, Math.min(y, height - FOOTER - sign.height)));
  return sharp(await panelBase(colors.panel, height)).composite(layers).jpeg({ quality: 92 }).toBuffer();
};

export const composeDesignedSlide = async (input: ComposeInput): Promise<Buffer> => {
  if (input.layout === "cta") return composeCtaSlide(input);
  if (input.layout === "card" || !input.photo) return composeCardSlide(input);
  return composePhotoSlide(input, input.photo);
};
