import sharp from "sharp";

import { contrastPlateFill, fitLogo, panelPalette } from "@/lib/ai/slideComposer";
import { renderTextBlock } from "@/lib/ai/slideText";
import { REEL_HEIGHT, REEL_WIDTH } from "@/lib/video/reelFrame";

export type ReelOverlayInput = {
  title?: string;
  logo?: Buffer;
  primaryColor?: string;
};

const PAD = 72;
// Instagram and TikTok draw their own UI over the top ~230 px and the bottom third of a reel.
const SAFE_TOP = 250;
const LOGO_PLATE_PAD = 18;
const PANEL_PAD_X = 40;
const PANEL_PAD_Y = 32;

const rect = (width: number, height: number, fill: string, radius: number): Buffer =>
  Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="${fill}"/></svg>`,
  );

const logoLayers = async (logo: Buffer): Promise<{ layers: sharp.OverlayOptions[]; bottom: number }> => {
  const fitted = await fitLogo(logo, 260, 100);
  const meta = await sharp(fitted).metadata();
  const width = meta.width ?? 260;
  const height = meta.height ?? 100;
  const plate = rect(width + LOGO_PLATE_PAD * 2, height + LOGO_PLATE_PAD * 2, await contrastPlateFill(fitted), 24);
  return {
    layers: [
      { input: plate, left: PAD, top: SAFE_TOP },
      { input: fitted, left: PAD + LOGO_PLATE_PAD, top: SAFE_TOP + LOGO_PLATE_PAD },
    ],
    bottom: SAFE_TOP + height + LOGO_PLATE_PAD * 2,
  };
};

const titleLayers = async (title: string, primaryColor: string | undefined, top: number): Promise<sharp.OverlayOptions[]> => {
  const colors = panelPalette(primaryColor);
  const block = await renderTextBlock({
    text: title,
    weight: "heavy",
    color: colors.ink,
    maxWidth: REEL_WIDTH - PAD * 2 - PANEL_PAD_X * 2,
    maxHeight: 420,
    maxSize: 96,
    minSize: 56,
  });
  if (!block) return [];
  return [
    { input: rect(block.width + PANEL_PAD_X * 2, block.height + PANEL_PAD_Y * 2, colors.panel, 28), left: PAD, top },
    { input: block.image, left: PAD + PANEL_PAD_X, top: top + PANEL_PAD_Y },
  ];
};

// GIF has 1-bit transparency, so alpha is forced to fully on or off to avoid dark fringes around shapes.
const toHardEdgedGif = async (png: Buffer): Promise<Buffer> => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = (pixels[index] ?? 0) >= 128 ? 255 : 0;
  }
  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).gif().toBuffer();
};

export const composeReelOverlay = async (input: ReelOverlayInput): Promise<Buffer | null> => {
  const title = input.title?.trim();
  if (!title && !input.logo) return null;

  const layers: sharp.OverlayOptions[] = [];
  let titleTop = SAFE_TOP;
  if (input.logo) {
    const logo = await logoLayers(input.logo);
    layers.push(...logo.layers);
    titleTop = logo.bottom + 28;
  }
  if (title) layers.push(...(await titleLayers(title, input.primaryColor, titleTop)));
  if (layers.length === 0) return null;

  const canvas = await sharp({
    create: { width: REEL_WIDTH, height: REEL_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
  return toHardEdgedGif(canvas);
};
