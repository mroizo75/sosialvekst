import { describe, expect, it } from "vitest";

import { assignPostStrategy, pinnedFromMeta } from "@/lib/ai/postStrategy";
import {
  buildProfileFromSamples,
  engagementScore,
  pickWeighted,
  profilePromptLines,
  recommendedHours,
  type PerformanceSample,
} from "@/lib/metrics/learning";
import type { PostFormat } from "@/lib/types";

const sample = (index: number, format: PostFormat, likes: number, hourUtc: number): PerformanceSample => ({
  postId: `p${index}`,
  publishedAt: new Date(Date.UTC(2026, 8, 1 + index, hourUtc)),
  counts: { views: 100, reach: 80, likes, comments: 0, shares: 0, saves: 0 },
  meta: {
    topic: "Lisboa",
    format,
    coverTitle: `Tittel ${index}`,
    hook: `Hook ${index}`,
    slideCount: 3,
    realPlacePhoto: true,
  },
});

// Six "tip" posts with 2 likes posted 09:00 Oslo, four "myth_busting" posts with 10 likes posted 17:00 Oslo.
const clearWinner = [
  ...Array.from({ length: 6 }, (_, index) => sample(index, "tip", 2, 7)),
  ...Array.from({ length: 4 }, (_, index) => sample(index + 6, "myth_busting", 10, 15)),
];

describe("engagementScore", () => {
  it("vekter kommentarer, delinger og lagringer tyngre enn likes", () => {
    expect(engagementScore({ views: 100, reach: 0, likes: 1, comments: 1, shares: 1, saves: 1 })).toBeCloseTo(0.09);
  });

  it("bruker rekkevidde når visninger mangler og hopper over poster uten publikum", () => {
    expect(engagementScore({ views: 0, reach: 50, likes: 5, comments: 0, shares: 0, saves: 0 })).toBeCloseTo(0.1);
    expect(engagementScore({ views: 0, reach: 0, likes: 5, comments: 0, shares: 0, saves: 0 })).toBeNull();
  });
});

describe("buildProfileFromSamples", () => {
  it("finner en tydelig vinner i form, tid og titler", () => {
    const profile = buildProfileFromSamples("instagram", clearWinner, "Europe/Oslo");

    expect(profile.ready).toBe(true);
    expect(profile.formats.myth_busting).toBeGreaterThan(profile.formats.tip);
    expect(recommendedHours(profile)).toEqual([17]);
    expect(profile.topTitles[0]).toMatch(/Tittel [6-9]/);
    expect(profilePromptLines(profile)[0]).toContain("Dette har fungert for denne kontoen");
  });

  it("er ikke klar og gir ingen prompt med for lite data", () => {
    const profile = buildProfileFromSamples("instagram", clearWinner.slice(0, 5), "Europe/Oslo");

    expect(profile.ready).toBe(false);
    expect(profilePromptLines(profile)).toEqual([]);
    expect(recommendedHours(profile)).toEqual([]);
  });
});

describe("pickWeighted", () => {
  it("følger vektene i utnyttelsesdelen", () => {
    const rolls = [0.5, 0.95];
    const random = () => rolls.shift() ?? 0;
    expect(pickWeighted(["tip", "myth_busting"], { tip: 0.5, myth_busting: 1.5 }, random)).toBe("myth_busting");
  });

  it("velger jevnt i utforskningsdelen uansett vekter", () => {
    const rolls = [0.1, 0.0];
    const random = () => rolls.shift() ?? 0;
    expect(pickWeighted(["tip", "myth_busting"], { tip: 0.01, myth_busting: 10 }, random)).toBe("tip");
  });
});

describe("assignPostStrategy med profil", () => {
  const slot = { weekIndex: 0, dayIndex: 1, channel: "facebook" as const, feedIndex: 1 };

  it("vekter formatet etter profilen når den er klar", () => {
    const strategy = assignPostStrategy(slot, { ready: true, formats: { myth_busting: 3, how_to: 0.1, tip: 0.1, fact: 0.1 } }, () => 0.5);
    expect(strategy.contentPillar).toBe("useful");
    expect(strategy.format).toBe("myth_busting");
  });

  it("beholder rotasjonen uten klar profil, og låser form fra et forbilde", () => {
    expect(assignPostStrategy(slot).format).toBe(assignPostStrategy(slot, { ready: false, formats: { opinion: 9 } }).format);
    const pinned = pinnedFromMeta({ pillar: "trust", motif: "people", format: "opinion" });
    expect(assignPostStrategy({ ...slot, pinned })).toMatchObject({ contentPillar: "trust", visualMotif: "people", format: "opinion" });
    expect(pinnedFromMeta({ pillar: "hacker", format: "nope" as PostFormat })).toEqual({ pillar: undefined, motif: undefined, format: undefined });
  });
});
