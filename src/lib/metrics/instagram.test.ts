import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchInstagramMetrics } from "@/lib/metrics/instagram";
import type { MetricsAccount } from "@/lib/metrics/types";

const account: MetricsAccount = {
  accountId: "ig1",
  accessToken: "token",
  refreshToken: null,
  tokenExpiresAt: null,
  userId: "u1",
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const permissionDenied = () => json(400, { error: { code: 10, message: "(#10) Application does not have permission for this action" } });

describe("Instagram-statistikk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bruker innsikt når kontoen har tilgang", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, {
      data: [
        { name: "views", values: [{ value: 500 }] },
        { name: "reach", values: [{ value: 320 }] },
        { name: "likes", values: [{ value: 21 }] },
      ],
    })));

    const result = await fetchInstagramMetrics("m1", account);

    expect(result).toMatchObject({ status: "ok", metrics: { views: 500, reach: 320, likes: 21 } });
    expect(result.status === "ok" && result.limitedBy).toBeFalsy();
  });

  it("henter likes og kommentarer fra posten når innsiktstilgangen mangler", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(permissionDenied())
      .mockResolvedValueOnce(json(200, { like_count: 7, comments_count: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInstagramMetrics("m1", account);

    expect(result).toMatchObject({ status: "ok", metrics: { likes: 7, comments: 2, views: 0, reach: 0 } });
    expect(result.status === "ok" && result.limitedBy).toContain("permission");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("fields=like_count%2Ccomments_count");
  });
});
