import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateMusic } from "@/lib/ai/falClient";
import { findSharedFileUrl, uploadSharedFile } from "@/lib/cloudflare/r2";
import { chooseMood, getMusicTrackUrl, TRACKS_PER_MOOD, trackIndexFor, trackKey } from "@/lib/video/musicLibrary";

vi.mock("@/lib/ai/falClient", () => ({ generateMusic: vi.fn() }));
vi.mock("@/lib/cloudflare/r2", () => ({ findSharedFileUrl: vi.fn(), uploadSharedFile: vi.fn() }));

describe("musikkvalg for reels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("velger stemning fra temaet og samme spor for samme post", () => {
    expect(chooseMood("Strandliv på Kreta")).toBe("beach");
    expect(chooseMood("Fottur i fjellet ved Lofoten")).toBe("nature");
    expect(chooseMood("Spar euro på reisen")).toBe("upbeat");
    expect(chooseMood("Helg på spa i Oslo")).toBe("calm");

    const index = trackIndexFor("post-123");
    expect(trackIndexFor("post-123")).toBe(index);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(TRACKS_PER_MOOD);
    expect(trackKey("beach", 0)).toBe("shared/music/v1/beach-1.mp3");
  });

  it("bruker lagret spor uten å lage ny musikk", async () => {
    vi.mocked(findSharedFileUrl).mockResolvedValue("https://cdn.example/shared/music/v1/calm-2.mp3");

    const url = await getMusicTrackUrl("calm", "post-1");

    expect(url).toBe("https://cdn.example/shared/music/v1/calm-2.mp3");
    expect(generateMusic).not.toHaveBeenCalled();
    expect(uploadSharedFile).not.toHaveBeenCalled();
  });

  it("lager og lagrer sporet første gang det trengs", async () => {
    vi.mocked(findSharedFileUrl).mockResolvedValue(undefined);
    vi.mocked(generateMusic).mockResolvedValue("https://fal.example/track.mp3");
    vi.mocked(uploadSharedFile).mockResolvedValue("https://cdn.example/shared/music/v1/city-1.mp3");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))));

    const url = await getMusicTrackUrl("city", "post-2");

    expect(url).toBe("https://cdn.example/shared/music/v1/city-1.mp3");
    expect(generateMusic).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadSharedFile).mock.calls[0]?.[1]).toBe("audio/mpeg");
    vi.unstubAllGlobals();
  });
});
