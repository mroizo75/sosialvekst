import { describe, expect, it } from "vitest";

import { generatePlan } from "@/lib/ai/generatePlan";

describe("generatePlan", () => {
  it("genererer 36 poster for 3 kanaler pa man-ons-fre i 4 uker", async () => {
    const result = await generatePlan({
      userId: "u1",
      postsPerWeek: 3,
      totalWeeks: 4,
      channels: ["facebook", "instagram", "linkedin"],
      mediaMode: "hybrid",
      countryCode: "NO",
      topicWindows: [
        { topic: "Salg", startWeek: 1, endWeek: 2 },
        { topic: "Blomster", startWeek: 3, endWeek: 4 },
      ],
    });

    expect(result.posts).toHaveLength(36);
    expect(result.posts[0]?.quality.total).toBeGreaterThan(0);
  });

  it("haandterer edge case med 1 post i 1 uke", async () => {
    const result = await generatePlan({
      userId: "u1",
      postsPerWeek: 1,
      totalWeeks: 1,
      channels: ["linkedin"],
      mediaMode: "owned_only",
      countryCode: "NO",
      topicWindows: [],
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.channel).toBe("linkedin");
  });
});
