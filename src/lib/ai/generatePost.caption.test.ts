import { describe, expect, it } from "vitest";

import {
  assembleCaption,
  buildCopyUserInput,
  creditLineFromRecords,
  ensureCompleteEnding,
  ensureWebsiteLinkInText,
  postStatusForMedia,
  replaceCreditLine,
  resolveCopyModel,
} from "@/lib/ai/generatePost";

describe("fotokreditering", () => {
  it("samler kreditt fra alle bilder på én linje uten duplikater", () => {
    expect(creditLineFromRecords([
      "Foto: Ada, CC BY 2.0",
      "",
      "Foto: Bo, CC0",
      "Foto: Ada, CC BY 2.0",
      undefined,
    ])).toBe("Foto: Ada, CC BY 2.0 · Bo, CC0");
    expect(creditLineFromRecords(["", undefined])).toBe("");
  });

  it("bytter ut gammel kreditt når bildene byttes, og fjerner den når nye bilder er AI", () => {
    const text = "Kvelden er rolig.\n\n#rhodos\n\nFoto: Ada, CC BY 2.0";

    expect(replaceCreditLine(text, ["Foto: Bo, CC0"])).toBe("Kvelden er rolig.\n\n#rhodos\n\nFoto: Bo, CC0");
    expect(replaceCreditLine(text, [""])).toBe("Kvelden er rolig.\n\n#rhodos");
    expect(replaceCreditLine("Ny tekst.", ["Foto: Ada, CC BY 2.0"])).toBe("Ny tekst.\n\nFoto: Ada, CC BY 2.0");
  });
});

describe("assembleCaption", () => {
  it("setter ikke punktum etter hashtags, og lenken kommer før dem", () => {
    const text = "Kvelden ligger over gaten\n#sicilia #kveld";

    expect(ensureCompleteEnding(text)).toBe(text);
    expect(ensureWebsiteLinkInText(text, "https://sydenklar.no", true)).toBe(
      "Kvelden ligger over gaten.\n\nhttps://sydenklar.no\n\n#sicilia #kveld",
    );

    const caption = assembleCaption({
      body: text,
      link: "https://sydenklar.no",
      credits: "Foto: Ada – CC BY 2.0",
    });

    expect(caption).not.toMatch(/#kveld\./);
    expect(caption).not.toContain("Se utvalget");
    expect(caption.indexOf("https://sydenklar.no")).toBeLessThan(caption.indexOf("#sicilia"));
    expect(caption.endsWith("Foto: Ada – CC BY 2.0")).toBe(true);
    expect(caption.startsWith("Kvelden ligger over gaten.")).toBe(true);
    expect(ensureCompleteEnding("Se hva som finnes akkurat nå:")).toBe("Se hva som finnes akkurat nå.");
    expect(ensureCompleteEnding("Se hva som finnes akkurat nå:.")).toBe("Se hva som finnes akkurat nå.");
  });

  it("gir emneknagger uten firkant et #, én lenke, og fotograf til slutt", () => {
    const caption = assembleCaption({
      body: [
        "Se hva som finnes akkurat nå.",
        "https://www.sydenklar.no/",
        "",
        "reiseinspirasjon",
        "hotellvalg",
        "hotelldestinasjoner",
      ].join("\n"),
      link: "https://www.sydenklar.no/",
      credits: "Foto: Ada, CC BY 2.0",
    });

    expect(caption).toBe([
      "Se hva som finnes akkurat nå.",
      "",
      "https://www.sydenklar.no/",
      "",
      "#reiseinspirasjon #hotellvalg #hotelldestinasjoner",
      "",
      "Foto: Ada, CC BY 2.0",
    ].join("\n"));
    expect(caption.match(/sydenklar\.no/g)).toHaveLength(1);
  });

  it("sender bildet til copy-modellen og bruker en sterkere standardmodell", () => {
    expect(resolveCopyModel(undefined)).toBe("gpt-4.1");
    expect(resolveCopyModel("  gpt-5  ")).toBe("gpt-5");

    const content = buildCopyUserInput("BILDE OG OVERLAY\nScene: gate", "https://cdn.example/post.jpg");
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) return;
    expect(content[0]).toMatchObject({
      type: "input_text",
      text: expect.stringContaining("Dette er bildet som publiseres. Teksten skal passe det du ser."),
    });
    expect(content[0]?.text).toContain("BILDE OG OVERLAY");
    expect(content[1]).toMatchObject({
      type: "input_image",
      image_url: "https://cdn.example/post.jpg",
    });
    expect(buildCopyUserInput("Bare tekst")).toBe("Bare tekst");
  });

  it("setter TikTok uten bilde og video til vurdering", () => {
    expect(postStatusForMedia("tiktok", undefined, undefined, "draft")).toBe("needs_review");
    expect(postStatusForMedia("tiktok", "https://cdn.example/a.jpg", undefined, "draft")).toBe("draft");
    expect(postStatusForMedia("facebook", undefined, undefined, "draft")).toBe("draft");
  });
});
