import sharp from "sharp";

import { imagesToVideo } from "@/lib/ai/falClient";
import { deleteFilesByUrls, uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { REEL_HEIGHT, REEL_WIDTH } from "@/lib/video/reelFrame";

const FPS = 24;
const HOLD_FRAMES = 2;
const ZOOM = 0.12;
const DRIFT_UP = 0.04;
const SUPERSAMPLE = 1.5;
const UPLOAD_BATCH = 12;

export type CropRect = { left: number; top: number; width: number; height: number };

const easeInOut = (t: number): number => t * t * (3 - 2 * t);

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

// A slow push-in with a slight upward drift, eased so the motion starts and ends softly.
export const kenBurnsCrops = (sourceWidth: number, sourceHeight: number, count: number): CropRect[] => {
  if (count < 1) throw new Error("Antall bilder må være minst 1.");
  return Array.from({ length: count }, (_, index) => {
    const progress = easeInOut(count === 1 ? 0 : index / (count - 1));
    const scale = 1 + ZOOM * progress;
    const width = Math.round(sourceWidth / scale);
    const height = Math.round(sourceHeight / scale);
    const centerY = sourceHeight * (0.5 - DRIFT_UP * progress);
    return {
      left: clamp(Math.round((sourceWidth - width) / 2), 0, sourceWidth - width),
      top: clamp(Math.round(centerY - height / 2), 0, sourceHeight - height),
      width,
      height,
    };
  });
};

export const photoReelFrameCount = (durationSeconds: number): number =>
  Math.round((durationSeconds * FPS) / HOLD_FRAMES);

const loadBase = async (imageUrl: string): Promise<{ buffer: Buffer; width: number; height: number }> => {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Kunne ikke hente bildet til reelen (${response.status}).`);
  const width = Math.round(REEL_WIDTH * SUPERSAMPLE);
  const height = Math.round(REEL_HEIGHT * SUPERSAMPLE);
  const buffer = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize(width, height, { fit: "cover", position: "attention" })
    .toBuffer();
  return { buffer, width, height };
};

const renderFrame = (base: Buffer, crop: CropRect): Promise<Buffer> =>
  sharp(base)
    .extract(crop)
    .resize(REEL_WIDTH, REEL_HEIGHT)
    .jpeg({ quality: 82 })
    .toBuffer();

const uploadFrame = async (userId: string, base: Buffer, crop: CropRect, index: number): Promise<string> => {
  const file = await uploadUserFile({
    userId,
    fileName: `reel-frame-${index}.jpg`,
    contentType: "image/jpeg",
    mediaKind: "image",
    body: new Uint8Array(await renderFrame(base, crop)),
  });
  return file.publicUrl;
};

// Credit-free reel motion: the frames are only needed until fal has encoded the clip.
export const renderPhotoMotionClip = async (
  userId: string,
  imageUrl: string,
  durationSeconds: number,
): Promise<string> => {
  const base = await loadBase(imageUrl);
  const crops = kenBurnsCrops(base.width, base.height, photoReelFrameCount(durationSeconds));
  const frameUrls: string[] = [];
  try {
    for (let start = 0; start < crops.length; start += UPLOAD_BATCH) {
      const batch = crops.slice(start, start + UPLOAD_BATCH);
      const results = await Promise.allSettled(
        batch.map((crop, offset) => uploadFrame(userId, base.buffer, crop, start + offset)),
      );
      results.forEach((result) => {
        if (result.status === "fulfilled") frameUrls.push(result.value);
      });
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    }
    return await imagesToVideo(frameUrls.map((url) => ({ url, frames: HOLD_FRAMES })), FPS);
  } finally {
    await deleteFilesByUrls(frameUrls).catch((error: unknown) => {
      logger.warn("Kunne ikke slette midlertidige reel-bilder", {
        userId,
        count: frameUrls.length,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
};
