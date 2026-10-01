import { afterEach, describe, expect, it, vi } from "vitest";

import { publishFacebookReel, REEL_WAIT_MS, reelPublishDecision, type PublishInput } from "@/workers/publishWorker";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const input: PublishInput = {
  channel: "facebook",
  accountId: "page-1",
  accessToken: "token",
  refreshToken: null,
  tokenExpiresAt: null,
  text: "Kretas beste strender",
  imageUrl: "https://cdn.example/cover.jpg",
  additionalImageUrls: [],
  videoUrl: "https://cdn.example/reel.mp4",
  idempotencyKey: "job-1",
  userId: "u1",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("publisering av reels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("venter på video som lages, og publiserer som bilde etter 30 minutter", () => {
    const scheduled = Date.UTC(2026, 9, 1, 9, 0);

    expect(reelPublishDecision({ video_status: "pending", video_url: null }, scheduled, scheduled + 60_000)).toBe("wait");
    expect(reelPublishDecision({ video_status: "pending", video_url: null }, scheduled, scheduled + REEL_WAIT_MS)).toBe("image");
    expect(reelPublishDecision({ video_status: "ready", video_url: "https://v.mp4" }, scheduled, scheduled)).toBe("video");
    expect(reelPublishDecision({ video_status: "failed", video_url: null }, scheduled, scheduled)).toBe("image");
  });

  it("publiserer reel via video_reels i tre steg", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ video_id: "vid-1" }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const id = await publishFacebookReel(input, "v23.0", input.videoUrl as string);

    expect(id).toBe("vid-1");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("rupload.facebook.com/video-upload/v23.0/vid-1");
    expect(String(fetchMock.mock.calls[2]?.[1]?.body)).toContain("video_state=PUBLISHED");
  });

  it("faller tilbake til vanlig video når reel-opplastingen feiler", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: { message: "Reels ikke tillatt" } }, 400))
      .mockResolvedValueOnce(json({ id: "video-9" }));
    vi.stubGlobal("fetch", fetchMock);

    const id = await publishFacebookReel(input, "v23.0", input.videoUrl as string);

    expect(id).toBe("video-9");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/page-1/videos");
  });
});
