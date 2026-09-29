import { describe, expect, it } from "vitest";

import { assembleCaption, ensureCompleteEnding, ensureWebsiteLinkInText } from "@/lib/ai/generatePost";

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
  });
});
