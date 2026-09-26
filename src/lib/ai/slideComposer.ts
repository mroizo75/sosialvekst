import sharp from "sharp";

import type { SocialDesign } from "@/lib/ai/slideDesign";
import type { SocialChannel } from "@/lib/types";

export type SlideLayout = "cover" | "card" | "single";

export const resolveSlideLayout = (
  channel: SocialChannel,
  mode: SocialDesign["mode"],
  slideIndex: number,
): SlideLayout => {
  if (channel === "tiktok" || mode === "headline") return "single";
  if (slideIndex > 0) return "card";
  return "cover";
};

type ComposeInput = {
  photo: Buffer;
  design: SocialDesign;
  slideIndex: number;
  layout: SlideLayout;
  logo?: Buffer;
  primaryColor?: string;
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

export const buildSlideSvg = (input: ComposeInput): string => {
  const colors = palette(input.primaryColor);
  const font = "Segoe UI, Arial, Helvetica, sans-serif";
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

  if (input.layout === "single") {
    const titleLines = wrap(input.design.coverTitle, 22, 2).map(escapeXml);
    const sublines = wrap(input.design.coverSubline, 34, 2).map(escapeXml);
    const panelY = 900;
    const titleSvg = titleLines.map((line, index) =>
      `<text x="64" y="${1020 + index * 72}" fill="${colors.ink}" font-family="${font}" font-size="56" font-weight="700">${line}</text>`,
    ).join("");
    const sublineSvg = sublines.map((line, index) =>
      `<text x="64" y="${1188 + index * 42}" fill="${colors.muted}" font-family="${font}" font-size="30">${line}</text>`,
    ).join("");
    return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${panelY}" width="${WIDTH}" height="${HEIGHT - panelY}" fill="${colors.panel}"/>
      ${titleSvg}
      ${sublineSvg}
    </svg>`;
  }

  const titleLines = wrap(input.design.coverTitle, 16, 2).map(escapeXml);
  const subline = escapeXml(wrap(input.design.coverSubline, 28, 1)[0] ?? "");
  const titleSvg = titleLines.map((line, index) =>
    `<text x="64" y="${980 + index * 84}" fill="#FFFFFF" font-family="${font}" font-size="72" font-weight="700">${line}</text>`,
  ).join("");
  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.42" stop-color="rgba(0,0,0,0)"/>
        <stop offset="1" stop-color="rgba(8,18,28,0.88)"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    ${titleSvg}
    <text x="64" y="1180" fill="#F6E27A" font-family="${font}" font-size="40" font-weight="600">${subline}</text>
  </svg>`;
};

const fitLogo = async (logo: Buffer): Promise<Buffer> =>
  sharp(logo).resize({ width: 168, height: 168, fit: "inside", withoutEnlargement: false }).png().toBuffer();

export const composeDesignedSlide = async (input: ComposeInput): Promise<Buffer> => {
  const photo = await sharp(input.photo)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: input.layout === "cover" ? "centre" : "attention" })
    .png()
    .toBuffer();
  const overlay = Buffer.from(buildSlideSvg(input));
  const layers: sharp.OverlayOptions[] = [{ input: overlay, top: 0, left: 0 }];

  if (input.logo) {
    const logo = await fitLogo(input.logo);
    const meta = await sharp(logo).metadata();
    const logoW = meta.width ?? 168;
    const logoH = meta.height ?? 168;
    const onPanel = input.layout !== "cover";
    const left = onPanel ? WIDTH - logoW - 48 : 48;
    const top = input.layout === "single" ? 928 : onPanel ? 792 : 48;
    const platePad = 14;
    const plate = Buffer.from(
      `<svg width="${logoW + platePad * 2}" height="${logoH + platePad * 2}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="22" fill="rgba(255,255,255,0.96)"/></svg>`,
    );
    layers.push({ input: plate, left: left - platePad, top: top - platePad });
    layers.push({ input: logo, left, top });
  }

  return sharp(photo).composite(layers).jpeg({ quality: 92 }).toBuffer();
};
