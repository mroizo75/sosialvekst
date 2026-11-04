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
const hardenAlpha = async (png: Buffer): Promise<Buffer> => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = (pixels[index] ?? 0) >= 128 ? 255 : 0;
  }
  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
};

// The title is the hook: it shows for the first seconds, then only the logo stays so the video is visible.
export const TITLE_SECONDS = 3;
// Long enough to outlast any reel; ffmpeg holds the last frame anyway.
const REST_SECONDS = 60;

const toOverlayGif = async (frames: Buffer[]): Promise<Buffer> => {
  const hardened = await Promise.all(frames.map(hardenAlpha));
  if (hardened.length === 1) return sharp(hardened[0]).gif().toBuffer();
  return sharp(hardened, { join: { animated: true } })
    .gif({ delay: [TITLE_SECONDS * 1000, REST_SECONDS * 1000], loop: 1 })
    .toBuffer();
};

const transparentCanvas = () =>
  sharp({ create: { width: REEL_WIDTH, height: REEL_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

const drawFrame = async (layers: sharp.OverlayOptions[]): Promise<Buffer> =>
  layers.length > 0 ? transparentCanvas().composite(layers).png().toBuffer() : transparentCanvas().png().toBuffer();

export const composeReelOverlay = async (input: ReelOverlayInput): Promise<Buffer | null> => {
  const title = input.title?.trim();
  if (!title && !input.logo) return null;

  const logoOnly: sharp.OverlayOptions[] = [];
  let titleTop = SAFE_TOP;
  if (input.logo) {
    const logo = await logoLayers(input.logo);
    logoOnly.push(...logo.layers);
    titleTop = logo.bottom + 28;
  }
  const titleOnly = title ? await titleLayers(title, input.primaryColor, titleTop) : [];
  if (logoOnly.length === 0 && titleOnly.length === 0) return null;
  if (titleOnly.length === 0) return toOverlayGif([await drawFrame(logoOnly)]);

  return toOverlayGif([
    await drawFrame([...logoOnly, ...titleOnly]),
    await drawFrame(logoOnly),
  ]);
};

// The overlay is drawn for 1080x1920, but fal's overlay keeps its own pixel size, so a 720p clip
// would cut it on both sides. Every frame is scaled to the clip and the title timing is kept.
export const scaleReelOverlay = async (gif: Buffer, width: number, height: number): Promise<Buffer> => {
  const pages = (await sharp(gif, { animated: true }).metadata()).pages ?? 1;
  const frames = await Promise.all(
    Array.from({ length: pages }, (_, page) =>
      sharp(gif, { page }).resize(width, height, { fit: "fill" }).png().toBuffer()),
  );
  return toOverlayGif(frames);
};
