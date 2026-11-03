import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateKlingVideo,
  generateSpeech,
  generateWanVideo,
  getMediaDuration,
  mergeAudioVideo,
  mixVoiceOverMusic,
  normalizeLoudness,
  overlayOnVideo,
} from "@/lib/ai/falClient";
import { deleteFilesByUrls, uploadUserFile } from "@/lib/cloudflare/r2";
import { getMusicTrackUrl } from "@/lib/video/musicLibrary";
import { renderPhotoMotionClip } from "@/lib/video/photoReel";
import { renderReelForPost } from "@/lib/video/renderReel";
import { consumeVideoCredit, refundVideoCredit } from "@/lib/videoCredits";

vi.mock("@/lib/ai/falClient", () => ({
  generateKlingVideo: vi.fn(),
  generateWanVideo: vi.fn(),
  resolveReelVideoModel: () => "wan3",
  mergeAudioVideo: vi.fn(),
  overlayOnVideo: vi.fn(),
  generateSpeech: vi.fn(),
  getMediaDuration: vi.fn(),
  normalizeLoudness: vi.fn(),
  mixVoiceOverMusic: vi.fn(),
  isFalAvailable: () => true,
}));
vi.mock("@/lib/cloudflare/r2", () => ({ uploadUserFile: vi.fn(), deleteFilesByUrls: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/videoCredits", () => ({ getVideoBalance: vi.fn(), consumeVideoCredit: vi.fn(), refundVideoCredit: vi.fn() }));
vi.mock("@/lib/video/musicLibrary", () => ({ chooseMood: () => "beach", getMusicTrackUrl: vi.fn() }));
vi.mock("@/lib/video/photoReel", () => ({ renderPhotoMotionClip: vi.fn() }));
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
  const MUSIC = "https://cdn.example/shared/music/v2/beach-1.mp3";
  const STORED = "https://cdn.example/users/u1/videos/reel.mp4";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 1, 2]))));
    vi.mocked(consumeVideoCredit).mockResolvedValue({ balance: 4, totalPurchased: 10 });
    vi.mocked(refundVideoCredit).mockResolvedValue({ balance: 5, totalPurchased: 10 });
    vi.mocked(getMusicTrackUrl).mockResolvedValue(MUSIC);
    vi.mocked(mergeAudioVideo).mockResolvedValue("https://fal.example/merged.mp4");
    vi.mocked(uploadUserFile).mockResolvedValue({ key: "k", publicUrl: STORED });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trekker kreditten først og lager 9:16-video med Wan 3.0", async () => {
    vi.mocked(generateWanVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result).toEqual({ status: "ready", videoUrl: STORED });
    expect(vi.mocked(consumeVideoCredit).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(generateWanVideo).mock.invocationCallOrder[0]);
    const input = vi.mocked(generateWanVideo).mock.calls[0]?.[0];
    expect(input).toMatchObject({ durationSeconds: 12, aspectRatio: "9:16", audio: false, imageUrl: reelPost.reel_source_url });
    expect(input?.prompt).toContain("Kretas beste strender");
    expect(input?.prompt).toContain("Shot 1 (0-");
    expect(generateKlingVideo).not.toHaveBeenCalled();
    expect(updates.at(-1)).toEqual({ video_status: "ready", video_url: STORED });
    expect(consumeVideoCredit).toHaveBeenCalledWith({ userId: "u1", workspaceId: "w1" }, "Reel for post p1", expect.anything());
    expect(refundVideoCredit).not.toHaveBeenCalled();
    expect(overlayOnVideo).not.toHaveBeenCalled();
  });

  it("bruker klipplisten fra manuset", async () => {
    vi.mocked(generateWanVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    const { client } = fakeSupabase({
      ...reelPost,
      generation_meta: {
        ...reelPost.generation_meta,
        reelShots: [
          { seconds: 3, camera: "fast push-in", action: "a worker grabs the wrong ladder" },
          { seconds: 5, camera: "macro close-up", action: "the cracked step is revealed" },
        ],
      },
    });

    await renderReelForPost(client, "p1");

    const prompt = vi.mocked(generateWanVideo).mock.calls[0]?.[0]?.prompt ?? "";
    expect(prompt).toContain("a worker grabs the wrong ladder");
    expect(prompt).toContain("Shot 2");
  });

  it("lager gratis fotobevegelse uten AI-video når bedriften mangler kreditter", async () => {
    vi.mocked(consumeVideoCredit).mockRejectedValue(Object.assign(new Error("tom"), { code: "VIDEO_CREDITS_EXHAUSTED" }));
    vi.mocked(renderPhotoMotionClip).mockResolvedValue("https://fal.example/photo.mp4");
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("ready");
    expect(generateWanVideo).not.toHaveBeenCalled();
    expect(generateKlingVideo).not.toHaveBeenCalled();
    expect(renderPhotoMotionClip).toHaveBeenCalledWith("u1", reelPost.reel_source_url, 12);
    expect(refundVideoCredit).not.toHaveBeenCalled();
    expect(deleteFilesByUrls).not.toHaveBeenCalled();
    expect(updates.at(-1)).toEqual({ video_status: "ready", video_url: STORED });
  });

  it("faller tilbake til Kling når Wan 3.0 feiler", async () => {
    vi.mocked(generateWanVideo).mockRejectedValue(new Error("wan nede"));
    vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/kling.mp4" });
    const { client } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("ready");
    expect(vi.mocked(generateKlingVideo).mock.calls[0]?.[0]).toMatchObject({ duration: 10, imageUrl: reelPost.reel_source_url });
    expect(mergeAudioVideo).toHaveBeenCalledWith("https://fal.example/kling.mp4", MUSIC);
    expect(refundVideoCredit).not.toHaveBeenCalled();
  });

  it("markerer videoen som feilet og gir kreditten tilbake når ingen modell leverer", async () => {
    vi.mocked(generateWanVideo).mockRejectedValue(new Error("wan nede"));
    vi.mocked(generateKlingVideo).mockResolvedValue(null);
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("failed");
    expect(renderPhotoMotionClip).not.toHaveBeenCalled();
    expect(refundVideoCredit).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toEqual({ video_status: "failed" });
  });

  it("bruker videoen uten lyd når musikken feiler", async () => {
    vi.mocked(generateWanVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(getMusicTrackUrl).mockRejectedValue(new Error("musikk nede"));
    const { client } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("ready");
    expect(mergeAudioVideo).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/clip.mp4");
  });

  it("legger tittel og logo oppå videoen med musikk når posten har overlag", async () => {
    vi.mocked(generateWanVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(overlayOnVideo).mockResolvedValue("https://fal.example/branded.mp4");
    const overlayUrl = "https://cdn.example/users/u1/images/reel-overlay.gif";
    const { client } = fakeSupabase({ ...reelPost, generation_meta: { ...reelPost.generation_meta, reelOverlayUrl: overlayUrl } });

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("ready");
    expect(overlayOnVideo).toHaveBeenCalledWith("https://fal.example/merged.mp4", overlayUrl);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/branded.mp4");
  });

  it("bruker videoen uten tekst og logo når overlaget feiler", async () => {
    vi.mocked(generateWanVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
    vi.mocked(overlayOnVideo).mockRejectedValue(new Error("overlay nede"));
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
      vi.mocked(generateWanVideo).mockResolvedValue({ url: "https://fal.example/clip.mp4" });
      vi.mocked(generateSpeech).mockResolvedValue("https://fal.example/voice.mp3");
      vi.mocked(normalizeLoudness).mockImplementation(async (url, lufs) => `${url}?lufs=${lufs}`);
      vi.mocked(mixVoiceOverMusic).mockResolvedValue("https://fal.example/voiced.mp4");
    });

    it("lager talen først med Eleven v3 og gjør videoen like lang som talen trenger", async () => {
      vi.mocked(getMediaDuration).mockResolvedValue(6.3);
      const { client } = fakeSupabase(voicePost);

      const result = await renderReelForPost(client, "p1");

      expect(result.status).toBe("ready");
      expect(generateSpeech).toHaveBeenCalledWith("Drømmer du om Kreta?", "George", 1, "eleven-v3");
      expect(vi.mocked(generateSpeech).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(generateWanVideo).mock.invocationCallOrder[0]);
      expect(vi.mocked(generateWanVideo).mock.calls[0]?.[0]?.durationSeconds).toBe(8);
      expect(mixVoiceOverMusic).toHaveBeenCalledWith({
        videoUrl: "https://fal.example/clip.mp4",
        musicUrl: `${MUSIC}?lufs=-30`,
        voiceUrl: "https://fal.example/voice.mp3?lufs=-16",
        videoMs: 8_000,
        voiceStartMs: 400,
        voiceMs: 6300,
      });
      expect(mergeAudioVideo).not.toHaveBeenCalled();
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fal.example/voiced.mp4");
    });

    it("prøver turbo i høyere fart når Eleven v3 blir for lang", async () => {
      vi.mocked(getMediaDuration).mockResolvedValueOnce(14.2).mockResolvedValueOnce(12);
      const { client } = fakeSupabase(voicePost);

      await renderReelForPost(client, "p1");

      expect(vi.mocked(generateSpeech).mock.calls.map((call) => [call[2], call[3]])).toEqual([[1, "eleven-v3"], [1.15, "turbo-v2.5"]]);
      expect(vi.mocked(generateWanVideo).mock.calls[0]?.[0]?.durationSeconds).toBe(14);
      expect(vi.mocked(mixVoiceOverMusic).mock.calls[0]?.[0].voiceMs).toBe(12_000);
    });

    it("bruker kun musikk når talen ikke passer i Kling-klippet", async () => {
      vi.mocked(getMediaDuration).mockResolvedValue(12);
      vi.mocked(generateWanVideo).mockRejectedValue(new Error("wan nede"));
      vi.mocked(generateKlingVideo).mockResolvedValue({ url: "https://fal.example/kling.mp4" });
      const { client } = fakeSupabase(voicePost);

      const result = await renderReelForPost(client, "p1");

      expect(result.status).toBe("ready");
      expect(mixVoiceOverMusic).not.toHaveBeenCalled();
      expect(mergeAudioVideo).toHaveBeenCalledWith("https://fal.example/kling.mp4", MUSIC);
    });

    it("bruker kun musikk når talegeneratoren feiler", async () => {
      vi.mocked(generateSpeech).mockRejectedValue(new Error("tts nede"));
      const { client } = fakeSupabase(voicePost);

      const result = await renderReelForPost(client, "p1");

      expect(result.status).toBe("ready");
      expect(vi.mocked(generateWanVideo).mock.calls[0]?.[0]?.durationSeconds).toBe(12);
      expect(mergeAudioVideo).toHaveBeenCalledWith("https://fal.example/clip.mp4", MUSIC);
      expect(consumeVideoCredit).toHaveBeenCalledTimes(1);
    });
  });

  it("hopper over poster uten reel-kilde", async () => {
    const { client, updates } = fakeSupabase({ ...reelPost, reel_source_url: null });

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("skipped");
    expect(updates).toHaveLength(0);
    expect(consumeVideoCredit).not.toHaveBeenCalled();
    expect(generateWanVideo).not.toHaveBeenCalled();
  });
});
