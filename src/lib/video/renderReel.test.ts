import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateKlingVideo,
  generateSpeech,
  getMediaDuration,
  mergeAudioVideo,
  mixVoiceOverMusic,
  normalizeLoudness,
  overlayOnVideo,
} from "@/lib/ai/falClient";
import { deleteFilesByUrls, uploadUserFile } from "@/lib/cloudflare/r2";
import { getMusicTrackUrl } from "@/lib/video/musicLibrary";
import { renderReelForPost } from "@/lib/video/renderReel";
import { consumeVideoCredit, getVideoBalance } from "@/lib/videoCredits";

vi.mock("@/lib/ai/falClient", () => ({
  generateKlingVideo: vi.fn(),
  mergeAudioVideo: vi.fn(),
  overlayOnVideo: vi.fn(),
  generateSpeech: vi.fn(),
  getMediaDuration: vi.fn(),
  normalizeLoudness: vi.fn(),
  mixVoiceOverMusic: vi.fn(),
  isFalAvailable: () => true,
}));
vi.mock("@/lib/cloudflare/r2", () => ({ uploadUserFile: vi.fn(), deleteFilesByUrls: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/videoCredits", () => ({ getVideoBalance: vi.fn(), consumeVideoCredit: vi.fn() }));
vi.mock("@/lib/video/musicLibrary", () => ({ chooseMood: () => "beach", getMusicTrackUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

type Row = Record<string, unknown> | null;

const fakeSupabase = (row: Row) => {
  const updates: Array<Record<string, unknown>> = [];
  const filter = {
    eq: () => filter,
    neq: () => filter,
    maybeSingle: async () => ({ data: row, error: null }),
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  const client = {
    from: () => ({
      select: () => filter,
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return filter;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, updates };
};

const reelPost = {
  id: "p1",
  user_id: "u1",
  workspace_id: "w1",
  status: "draft",
  reel_source_url: "https://cdn.example/users/u1/images/source.jpg",
  video_status: "pending",
  generation_meta: { topic: "Strandliv på Kreta", coverTitle: "Kretas beste strender" },
};

describe("rendering av reel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 1, 2]))));
    vi.mocked(getVideoBalance).mockResolvedValue({ balance: 5, totalPurchased: 10 });
    vi.mocked(consumeVideoCredit).mockResolvedValue({ balance: 4, totalPurchased: 10 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lager 10 sekunders 9:16-video med musikk og markerer posten som klar", async () => {
    vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(getMusicTrackUrl).mockResolvedValue("https://cdn.example/shared/music/v1/beach-1.mp3");
    vi.mocked(mergeAudioVideo).mockResolvedValue("https://fal.example/merged.mp4");
    vi.mocked(uploadUserFile).mockResolvedValue({ key: "k", publicUrl: "https://cdn.example/users/u1/videos/reel.mp4" });
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result).toEqual({ status: "ready", videoUrl: "https://cdn.example/users/u1/videos/reel.mp4" });
    expect(vi.mocked(generateKlingVideo).mock.calls[0]?.[0]).toMatchObject({
      duration: 10,
      aspectRatio: "9:16",
      generateAudio: false,
      imageUrl: reelPost.reel_source_url,
    });
    expect(updates.at(-1)).toEqual({ video_status: "ready", video_url: "https://cdn.example/users/u1/videos/reel.mp4" });
    expect(consumeVideoCredit).toHaveBeenCalledTimes(1);
    expect(consumeVideoCredit).toHaveBeenCalledWith({ userId: "u1", workspaceId: "w1" }, "Reel for post p1", expect.anything());
    expect(overlayOnVideo).not.toHaveBeenCalled();
  });

  it("lager ikke video og trekker ingen kreditt når saldoen er tom", async () => {
    vi.mocked(getVideoBalance).mockResolvedValue({ balance: 0, totalPurchased: 10 });
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("no_credits");
    expect(generateKlingVideo).not.toHaveBeenCalled();
    expect(consumeVideoCredit).not.toHaveBeenCalled();
    expect(updates.at(-1)).toEqual({ video_status: "no_credits" });
  });

  it("forkaster videoen når kreditten er brukt opp før den ble ferdig", async () => {
    vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(getMusicTrackUrl).mockResolvedValue("https://cdn.example/shared/music/v1/beach-1.mp3");
    vi.mocked(mergeAudioVideo).mockResolvedValue("https://fal.example/merged.mp4");
    vi.mocked(uploadUserFile).mockResolvedValue({ key: "k", publicUrl: "https://cdn.example/users/u1/videos/reel.mp4" });
    vi.mocked(consumeVideoCredit).mockRejectedValue(Object.assign(new Error("tom"), { code: "VIDEO_CREDITS_EXHAUSTED" }));
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("no_credits");
    expect(deleteFilesByUrls).toHaveBeenCalledWith(["https://cdn.example/users/u1/videos/reel.mp4"]);
    expect(updates.at(-1)).toEqual({ video_status: "no_credits" });
  });

  it("markerer videoen som feilet når videogeneratoren ikke leverer", async () => {
    vi.mocked(generateKlingVideo).mockResolvedValue(null);
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("failed");
    expect(updates.at(-1)).toEqual({ video_status: "failed" });
    expect(uploadUserFile).not.toHaveBeenCalled();
    expect(consumeVideoCredit).not.toHaveBeenCalled();
  });

  it("bruker videoen uten lyd når musikken feiler", async () => {
    vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(getMusicTrackUrl).mockRejectedValue(new Error("musikk nede"));
    vi.mocked(uploadUserFile).mockResolvedValue({ key: "k", publicUrl: "https://cdn.example/users/u1/videos/reel.mp4" });
    const { client } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("ready");
    expect(mergeAudioVideo).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/clip.mp4");
  });

  it("legger tittel og logo oppå videoen med musikk når posten har overlag", async () => {
    vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(getMusicTrackUrl).mockResolvedValue("https://cdn.example/shared/music/v1/beach-1.mp3");
    vi.mocked(mergeAudioVideo).mockResolvedValue("https://fal.example/merged.mp4");
    vi.mocked(overlayOnVideo).mockResolvedValue("https://fal.example/branded.mp4");
    vi.mocked(uploadUserFile).mockResolvedValue({ key: "k", publicUrl: "https://cdn.example/users/u1/videos/reel.mp4" });
    const overlayUrl = "https://cdn.example/users/u1/images/reel-overlay.gif";
    const { client } = fakeSupabase({ ...reelPost, generation_meta: { ...reelPost.generation_meta, reelOverlayUrl: overlayUrl } });

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("ready");
    expect(overlayOnVideo).toHaveBeenCalledWith("https://fal.example/merged.mp4", overlayUrl);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/branded.mp4");
  });

  it("bruker videoen uten tekst og logo når overlaget feiler", async () => {
    vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(getMusicTrackUrl).mockResolvedValue("https://cdn.example/shared/music/v1/beach-1.mp3");
    vi.mocked(mergeAudioVideo).mockResolvedValue("https://fal.example/merged.mp4");
    vi.mocked(overlayOnVideo).mockRejectedValue(new Error("overlay nede"));
    vi.mocked(uploadUserFile).mockResolvedValue({ key: "k", publicUrl: "https://cdn.example/users/u1/videos/reel.mp4" });
    const { client } = fakeSupabase({
      ...reelPost,
      generation_meta: { ...reelPost.generation_meta, reelOverlayUrl: "https://cdn.example/overlay.gif" },
    });

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("ready");
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/merged.mp4");
    expect(consumeVideoCredit).toHaveBeenCalledTimes(1);
  });

  describe("speakerstemme", () => {
    const voicePost = {
      ...reelPost,
      generation_meta: { ...reelPost.generation_meta, voiceScript: "Drømmer du om Kreta?", reelVoice: "male" },
    };

    beforeEach(() => {
      vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
      vi.mocked(getMusicTrackUrl).mockResolvedValue("https://cdn.example/shared/music/v1/beach-1.mp3");
      vi.mocked(mergeAudioVideo).mockResolvedValue("https://fal.example/merged.mp4");
      vi.mocked(generateSpeech).mockResolvedValue("https://fal.example/voice.mp3");
      vi.mocked(normalizeLoudness).mockImplementation(async (url, lufs) => `${url}?lufs=${lufs}`);
      vi.mocked(mixVoiceOverMusic).mockResolvedValue("https://fal.example/voiced.mp4");
      vi.mocked(uploadUserFile).mockResolvedValue({ key: "k", publicUrl: "https://cdn.example/users/u1/videos/reel.mp4" });
    });

    it("legger valgt stemme over dempet musikk", async () => {
      vi.mocked(getMediaDuration).mockResolvedValue(6.3);
      const { client } = fakeSupabase(voicePost);

      const result = await renderReelForPost(client, "p1");

      expect(result.status).toBe("ready");
      expect(generateSpeech).toHaveBeenCalledWith("Drømmer du om Kreta?", "George", 1);
      expect(mixVoiceOverMusic).toHaveBeenCalledWith({
        videoUrl: "https://fal.example/clip.mp4",
        musicUrl: "https://cdn.example/shared/music/v1/beach-1.mp3?lufs=-30",
        voiceUrl: "https://fal.example/voice.mp3?lufs=-16",
        videoMs: 10_000,
        voiceStartMs: 400,
        voiceMs: 6300,
      });
      expect(mergeAudioVideo).not.toHaveBeenCalled();
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/voiced.mp4");
    });

    it("leser raskere når talen blir for lang", async () => {
      vi.mocked(getMediaDuration).mockResolvedValueOnce(10.4).mockResolvedValueOnce(8.9);
      const { client } = fakeSupabase(voicePost);

      await renderReelForPost(client, "p1");

      expect(vi.mocked(generateSpeech).mock.calls.map((call) => call[2])).toEqual([1, 1.15]);
      expect(vi.mocked(mixVoiceOverMusic).mock.calls[0]?.[0].voiceMs).toBe(8900);
    });

    it("bruker kun musikk når talen er for lang også i høy fart", async () => {
      vi.mocked(getMediaDuration).mockResolvedValue(11);
      const { client } = fakeSupabase(voicePost);

      const result = await renderReelForPost(client, "p1");

      expect(result.status).toBe("ready");
      expect(mixVoiceOverMusic).not.toHaveBeenCalled();
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/merged.mp4");
    });

    it("bruker kun musikk når talegeneratoren feiler", async () => {
      vi.mocked(generateSpeech).mockRejectedValue(new Error("tts nede"));
      const { client } = fakeSupabase(voicePost);

      const result = await renderReelForPost(client, "p1");

      expect(result.status).toBe("ready");
      expect(mergeAudioVideo).toHaveBeenCalledWith("https://fal.example/clip.mp4", "https://cdn.example/shared/music/v1/beach-1.mp3");
      expect(consumeVideoCredit).toHaveBeenCalledTimes(1);
    });
  });

  it("hopper over poster uten reel-kilde", async () => {
    const { client, updates } = fakeSupabase({ ...reelPost, reel_source_url: null });

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("skipped");
    expect(updates).toHaveLength(0);
    expect(generateKlingVideo).not.toHaveBeenCalled();
  });
});
