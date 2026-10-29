import { describe, expect, it } from "vitest";

import { kenBurnsCrops, photoReelFrameCount } from "@/lib/video/photoReel";

describe("kenBurnsCrops", () => {
  const crops = kenBurnsCrops(1620, 2880, 120);

  it("zoomer gradvis inn fra hele bildet og holder 9:16", () => {
    expect(crops[0]).toEqual({ left: 0, top: 0, width: 1620, height: 2880 });
    expect(crops.at(-1)?.width).toBeLessThan(1500);
    crops.forEach((crop, index) => {
      if (index > 0) expect(crop.width).toBeLessThanOrEqual(crops[index - 1].width);
      expect(crop.width / crop.height).toBeCloseTo(9 / 16, 2);
    });
  });

  it("holder utsnittet innenfor bildet hele veien", () => {
    crops.forEach((crop) => {
      expect(crop.left).toBeGreaterThanOrEqual(0);
      expect(crop.top).toBeGreaterThanOrEqual(0);
      expect(crop.left + crop.width).toBeLessThanOrEqual(1620);
      expect(crop.top + crop.height).toBeLessThanOrEqual(2880);
    });
  });

  it("avviser null bilder", () => {
    expect(() => kenBurnsCrops(1620, 2880, 0)).toThrow();
  });
});

describe("photoReelFrameCount", () => {
  it("gir 120 ulike bilder for en 10 sekunders reel", () => {
    expect(photoReelFrameCount(10)).toBe(120);
  });
});
