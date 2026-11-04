import { describe, expect, it } from "vitest";

import { assignPostStrategy, chooseMediaFormat, pinnedFromMeta, plannedMediaFormat, toReachGoal } from "@/lib/ai/postStrategy";

describe("valg av reel eller bilde", () => {
  it("gjør alle Instagram- og Facebook-poster til reels når videokreditt finnes, og LinkedIn til bilde", () => {
    const instagram = Array.from({ length: 9 }, (_, index) => chooseMediaFormat("instagram", index, true));
    const facebook = Array.from({ length: 9 }, (_, index) => chooseMediaFormat("facebook", index, true));
    const tiktok = Array.from({ length: 4 }, (_, index) => chooseMediaFormat("tiktok", index, true));

    expect(instagram.every((format) => format === "reel")).toBe(true);
    expect(facebook.every((format) => format === "reel")).toBe(true);
    expect(tiktok.every((format) => format === "reel")).toBe(true);
    expect(chooseMediaFormat("linkedin", 2, true)).toBe("image");
  });

  it("gir LinkedIn B2B-avslutninger og aldri forbrukerspørsmål", () => {
    const linkedin = Array.from({ length: 8 }, (_, index) =>
      assignPostStrategy({ weekIndex: 0, dayIndex: index, channel: "linkedin", feedIndex: index }).ctaType);

    expect(linkedin).not.toContain("Ville du tatt denne?");
    expect(linkedin.some((cta) => /dere|bedrift|arbeidsplass/i.test(cta))).toBe(true);
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

  it("følger kundens vekstmål: vekst gir reels, balansert annenhver, følgere bilder", () => {
    const formats = (goal: "growth" | "balanced" | "followers") =>
      Array.from({ length: 4 }, (_, index) => plannedMediaFormat("instagram", index, goal));

    expect(formats("growth")).toEqual(["reel", "reel", "reel", "reel"]);
    expect(formats("balanced")).toEqual(["reel", "image", "reel", "image"]);
    expect(formats("followers")).toEqual(["image", "image", "image", "image"]);
  });

  it("holder TikTok som video og LinkedIn som bilde uansett mål", () => {
    expect(plannedMediaFormat("tiktok", 1, "followers")).toBe("reel");
    expect(plannedMediaFormat("linkedin", 0, "growth")).toBe("image");
  });

  it("lar kundens eget formatvalg vinne over målet", () => {
    expect(chooseMediaFormat("facebook", 1, true, "reel", "followers")).toBe("reel");
    expect(chooseMediaFormat("facebook", 0, true, "image", "growth")).toBe("image");
    expect(assignPostStrategy({ weekIndex: 0, dayIndex: 1, channel: "facebook", feedIndex: 1, reelsAllowed: true, reachGoal: "balanced" }).mediaFormat).toBe("image");
  });

  it("tolker ukjente mål som vekst", () => {
    expect(toReachGoal("balanced")).toBe("balanced");
    expect(toReachGoal("tull")).toBe("growth");
    expect(toReachGoal(undefined)).toBe("growth");
  });
});
