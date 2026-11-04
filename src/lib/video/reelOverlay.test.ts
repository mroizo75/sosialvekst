import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { REEL_HEIGHT, REEL_WIDTH } from "@/lib/video/reelFrame";
import { composeReelOverlay, scaleReelOverlay, TITLE_SECONDS } from "@/lib/video/reelOverlay";

describe("overlag for reel", () => {
  it("lager en 9:16-GIF der bare tittelfeltet dekker videoen", async () => {
    const gif = await composeReelOverlay({ title: "Kretas beste strender", primaryColor: "#0B4F6C" });
    expect(gif).not.toBeNull();

    const { data, info } = await sharp(gif as Buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(REEL_WIDTH);
    expect(info.height).toBe(REEL_HEIGHT);

    const alphaAt = (x: number, y: number): number => data[(y * info.width + x) * 4 + 3] ?? -1;
    expect(alphaAt(REEL_WIDTH / 2, REEL_HEIGHT - 200)).toBe(0);
    expect(alphaAt(100, 300)).toBe(255);
  });

  it("lager ikke overlag uten tittel og logo", async () => {
    expect(await composeReelOverlay({ title: "   " })).toBeNull();
  });

  it("viser tittelen bare de første sekundene, så bare logoen", async () => {
    const logo = await sharp({ create: { width: 200, height: 80, channels: 4, background: "#ffffff" } }).png().toBuffer();
    const gif = await composeReelOverlay({ title: "Mappekaos eller full oversikt?", logo }) as Buffer;
    const meta = await sharp(gif, { animated: true }).metadata();

    expect(meta.pages).toBe(2);
    expect(meta.delay?.[0]).toBe(TITLE_SECONDS * 1000);

    const alphaAt = async (page: number, x: number, y: number): Promise<number> => {
      const { data, info } = await sharp(gif, { page }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return data[(y * info.width + x) * 4 + 3] ?? -1;
    };
    // Title panel sits below the logo; it is gone on the second frame while the logo stays.
    expect(await alphaAt(0, 140, 480)).toBe(255);
    expect(await alphaAt(1, 140, 480)).toBe(0);
    expect(await alphaAt(1, 140, 300)).toBe(255);
  });

  it("skalerer alle bilder i tekstlaget til klippets størrelse og beholder tidene", async () => {
    const overlay = await composeReelOverlay({ title: "HMS-permer eller alt digitalt?" });
    const scaled = await scaleReelOverlay(overlay as Buffer, 720, 1280);
    const meta = await sharp(scaled, { animated: true }).metadata();

    expect(meta.format).toBe("gif");
    expect([meta.width, meta.pageHeight ?? meta.height]).toEqual([720, 1280]);
    expect(meta.pages).toBe(2);
    expect(meta.delay?.[0]).toBe(TITLE_SECONDS * 1000);
  });
});
