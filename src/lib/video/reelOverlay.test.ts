import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { REEL_HEIGHT, REEL_WIDTH } from "@/lib/video/reelFrame";
import { composeReelOverlay } from "@/lib/video/reelOverlay";

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
});
