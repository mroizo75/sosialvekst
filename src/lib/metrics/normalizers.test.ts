import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchFacebookMetrics, normalizeFacebookMetrics } from "@/lib/metrics/facebook";
import { fetchInstagramMetrics, normalizeInstagramMetrics } from "@/lib/metrics/instagram";
import { normalizeLinkedInMemberMetrics, normalizeLinkedInOrgMetrics } from "@/lib/metrics/linkedin";
import { normalizeTikTokMetrics } from "@/lib/metrics/tiktok";
import type { MetricsAccount } from "@/lib/metrics/types";

vi.mock("@/workers/publishWorker", () => ({ ensureTikTokToken: vi.fn() }));

const account: MetricsAccount = {
  accountId: "123",
  accessToken: "token",
  refreshToken: null,
  tokenExpiresAt: null,
  userId: "u1",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalisering av statistikk", () => {
  it("leser Facebook-innsikt og engasjement", () => {
    const metrics = normalizeFacebookMetrics(
      { data: [{ name: "post_media_view", values: [{ value: 420 }] }, { name: "post_total_media_view_unique", values: [{ value: 300 }] }] },
      { reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } },
    );
    expect(metrics).toMatchObject({ views: 420, reach: 300, likes: 12, comments: 3, shares: 2, saves: 0 });
  });

  it("leser Instagram-innsikt med både values og total_value", () => {
    const metrics = normalizeInstagramMetrics({
      data: [
        { name: "views", total_value: { value: 900 } },
        { name: "reach", values: [{ value: 610 }] },
        { name: "likes", values: [{ value: 40 }] },
        { name: "saved", values: [{ value: 7 }] },
      ],
    });
    expect(metrics).toMatchObject({ views: 900, reach: 610, likes: 40, saves: 7, comments: 0 });
  });

  it("leser LinkedIn for organisasjon og person", () => {
    expect(normalizeLinkedInOrgMetrics({
      elements: [{ totalShareStatistics: { impressionCount: 500, uniqueImpressionsCount: 320, likeCount: 9, clickCount: 14 } }],
    })).toMatchObject({ views: 500, reach: 320, likes: 9, clicks: 14 });
    expect(normalizeLinkedInMemberMetrics({ IMPRESSION: 80, REACTION: 4 })).toMatchObject({ views: 80, likes: 4, reach: 0 });
  });

  it("leser TikTok og tåler manglende video", () => {
    expect(normalizeTikTokMetrics({ view_count: 1500, like_count: 90, share_count: 5 }))
      .toMatchObject({ views: 1500, likes: 90, shares: 5 });
    expect(normalizeTikTokMetrics(undefined)).toMatchObject({ views: 0, likes: 0 });
  });

  it("gjør negative og ugyldige tall om til 0", () => {
    const metrics = normalizeInstagramMetrics({ data: [{ name: "reach", values: [{ value: -4 }] }, { name: "likes", values: [{ value: "abc" }] }] });
    expect(metrics.reach).toBe(0);
    expect(metrics.likes).toBe(0);
  });
});

describe("manglende tillatelse", () => {
  it("returnerer missing_permission når Meta svarer med tillatelsesfeil", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { error: { code: 10, message: "(#10) Application does not have permission" } })));

    const result = await fetchFacebookMetrics("123_456", account);

    expect(result.status).toBe("missing_permission");
  });

  it("prøver Instagram på nytt med enklere metrikker ved code 100", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(400, { error: { code: 100, message: "metric views not supported" } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ name: "reach", values: [{ value: 55 }] }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInstagramMetrics("789", account);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "ok", metrics: { reach: 55 } });
  });
});
