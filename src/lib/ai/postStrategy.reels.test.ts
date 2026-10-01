import { describe, expect, it } from "vitest";

import { assignPostStrategy, chooseMediaFormat, pinnedFromMeta } from "@/lib/ai/postStrategy";

describe("valg av reel eller bilde", () => {
  it("gir omtrent hver tredje Instagram-post som reel og alltid reel på TikTok", () => {
    const instagram = Array.from({ length: 9 }, (_, index) => chooseMediaFormat("instagram", index, true));
    const tiktok = Array.from({ length: 4 }, (_, index) => chooseMediaFormat("tiktok", index, true));

    expect(instagram.filter((format) => format === "reel")).toHaveLength(3);
    expect(tiktok.every((format) => format === "reel")).toBe(true);
    expect(chooseMediaFormat("linkedin", 2, true)).toBe("image");
  });

  it("lager aldri reels når video ikke er tilgjengelig, selv om forbildet var en reel", () => {
    expect(chooseMediaFormat("tiktok", 0, false)).toBe("image");
    expect(chooseMediaFormat("instagram", 2, false, "reel")).toBe("image");

    const strategy = assignPostStrategy({ weekIndex: 0, dayIndex: 0, channel: "instagram", reelsAllowed: false });
    expect(strategy.mediaFormat).toBe("image");
  });

  it("beholder formatet fra forbildet i «lag mer som dette»", () => {
    const pinned = pinnedFromMeta({ mediaFormat: "reel" });

    expect(pinned.mediaFormat).toBe("reel");
    expect(chooseMediaFormat("facebook", 0, true, pinned.mediaFormat)).toBe("reel");
  });
});
