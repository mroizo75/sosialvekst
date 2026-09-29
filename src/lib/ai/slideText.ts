import path from "node:path";

import sharp from "sharp";

import { logger } from "@/lib/logger";

export type TextWeight = "heavy" | "medium";

export type TextBlockInput = {
  text: string;
  weight: TextWeight;
  color: string;
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  align?: "left" | "centre";
};

export type TextBlock = {
  image: Buffer;
  width: number;
  height: number;
  size: number;
};

const FONTS: Record<TextWeight, { file: string; family: string }> = {
  heavy: { file: "Inter-800.ttf", family: "Inter ExtraBold" },
  medium: { file: "Inter-600.ttf", family: "Inter SemiBold" },
};

export const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

const fontFile = (weight: TextWeight): string => path.join(FONT_DIR, FONTS[weight].file);

export const escapeMarkup = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

const render = async (
  text: string,
  weight: TextWeight,
  color: string,
  size: number,
  width?: number,
  align: "left" | "centre" = "left",
): Promise<TextBlock> => {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
      font: `${FONTS[weight].family} ${size}`,
      fontfile: fontFile(weight),
      width,
      wrap: "word",
      align,
      rgba: true,
      dpi: 72,
    },
  }).png().toBuffer({ resolveWithObject: true });
  return { image: data, width: info.width, height: info.height, size };
};

const longestWord = (text: string): string =>
  text.split(" ").reduce((longest, word) => (word.length > longest.length ? word : longest), "");

export const renderTextBlock = async (input: TextBlockInput): Promise<TextBlock | null> => {
  const text = normalize(input.text);
  if (!text) return null;
  const word = longestWord(text);
  const step = Math.max(2, Math.round(input.maxSize * 0.05));

  let size = input.maxSize;
  while (size > input.minSize) {
    const wordBlock = await render(word, input.weight, input.color, size);
    if (wordBlock.width <= input.maxWidth) {
      const block = await render(text, input.weight, input.color, size, input.maxWidth, input.align);
      if (block.height <= input.maxHeight) return block;
    }
    size -= step;
  }

  const smallest = await render(text, input.weight, input.color, input.minSize, input.maxWidth, input.align);
  if (smallest.height > input.maxHeight) {
    logger.warn("Slidetekst er høyere enn plassen", {
      chars: text.length,
      height: smallest.height,
      maxHeight: input.maxHeight,
    });
  }
  return smallest;
};
