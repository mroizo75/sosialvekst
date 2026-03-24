import sharp from "sharp";

import { logger } from "@/lib/logger";

type LogoPosition = "bottom-right" | "bottom-left" | "bottom-center";

type ApplyLogoOverlayInput = {
  imageBytes: Buffer;
  logoUrl: string;
  position?: LogoPosition;
};

const LOGO_MAX_WIDTH_RATIO = 0.25;
const LOGO_PADDING_RATIO = 0.04;

const fetchAsBuffer = async (url: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Logo fetch feilet: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

const pickRandomPosition = (): LogoPosition => {
  const positions: LogoPosition[] = ["bottom-right", "bottom-left", "bottom-center"];
  return positions[Math.floor(Math.random() * positions.length)];
};

export const shouldApplyLogo = (_postIndex: number): boolean => {
  // TODO: Sett tilbake til ~35% etter test
  // const hash = ((_postIndex * 2654435761) >>> 0) % 100;
  // return hash < 35;
  return true;
};

export const applyLogoOverlay = async (
  input: ApplyLogoOverlayInput,
): Promise<Buffer> => {
  const { imageBytes, logoUrl } = input;
  const position = input.position ?? pickRandomPosition();

  try {
    const logoBuffer = await fetchAsBuffer(logoUrl);
    const baseImage = sharp(imageBytes);
    const baseMeta = await baseImage.metadata();

    const baseWidth = baseMeta.width ?? 1080;
    const baseHeight = baseMeta.height ?? 1080;

    const maxLogoWidth = Math.round(baseWidth * LOGO_MAX_WIDTH_RATIO);
    const padding = Math.round(baseWidth * LOGO_PADDING_RATIO);

    const resizedLogo = await sharp(logoBuffer)
      .resize({ width: maxLogoWidth, withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });

    const logoWidth = resizedLogo.info.width;
    const logoHeight = resizedLogo.info.height;

    const bgPadding = Math.round(Math.min(logoWidth, logoHeight) * 0.15);
    const bgWidth = logoWidth + bgPadding * 2;
    const bgHeight = logoHeight + bgPadding * 2;

    const bgWithLogo = await sharp({
      create: {
        width: bgWidth,
        height: bgHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0.55 },
      },
    })
      .composite([
        {
          input: resizedLogo.data,
          left: bgPadding,
          top: bgPadding,
        },
      ])
      .png()
      .toBuffer();

    let left: number;
    const top = baseHeight - bgHeight - padding;

    switch (position) {
      case "bottom-left":
        left = padding;
        break;
      case "bottom-center":
        left = Math.round((baseWidth - bgWidth) / 2);
        break;
      case "bottom-right":
      default:
        left = baseWidth - bgWidth - padding;
        break;
    }

    const result = await sharp(imageBytes)
      .composite([
        {
          input: bgWithLogo,
          left: Math.max(0, left),
          top: Math.max(0, top),
        },
      ])
      .png()
      .toBuffer();

    return result;
  } catch (error) {
    logger.warn("Logo overlay feilet, returnerer originalt bilde", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return imageBytes;
  }
};
