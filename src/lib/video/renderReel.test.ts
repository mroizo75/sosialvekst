import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateKlingVideo, mergeAudioVideo } from "@/lib/ai/falClient";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { getMusicTrackUrl } from "@/lib/video/musicLibrary";
import { renderReelForPost } from "@/lib/video/renderReel";

vi.mock("@/lib/ai/falClient", () => ({
  generateKlingVideo: vi.fn(),
  mergeAudioVideo: vi.fn(),
  isFalAvailable: () => true,
}));
vi.mock("@/lib/cloudflare/r2", () => ({ uploadUserFile: vi.fn() }));
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
  status: "draft",
  reel_source_url: "https://cdn.example/users/u1/images/source.jpg",
  video_status: "pending",
  generation_meta: { topic: "Strandliv på Kreta", coverTitle: "Kretas beste strender" },
};

describe("rendering av reel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 1, 2]))));
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
  });

  it("markerer videoen som feilet når videogeneratoren ikke leverer", async () => {
    vi.mocked(generateKlingVideo).mockResolvedValue(null);
    const { client, updates } = fakeSupabase(reelPost);

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("failed");
    expect(updates.at(-1)).toEqual({ video_status: "failed" });
    expect(uploadUserFile).not.toHaveBeenCalled();
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

  it("hopper over poster uten reel-kilde", async () => {
    const { client, updates } = fakeSupabase({ ...reelPost, reel_source_url: null });

    const result = await renderReelForPost(client, "p1");

    expect(result.status).toBe("skipped");
    expect(updates).toHaveLength(0);
    expect(generateKlingVideo).not.toHaveBeenCalled();
  });
});
