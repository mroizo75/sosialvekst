import sharp from "sharp";

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;

export const toReelFrame = async (photo: Buffer): Promise<Buffer> =>
  sharp(photo)
    .rotate()
    .resize(REEL_WIDTH, REEL_HEIGHT, { fit: "cover", position: "attention" })
    .jpeg({ quality: 90 })
    .toBuffer();
