import { describe, expect, it } from "vitest";

import { escapeMarkup, renderTextBlock } from "@/lib/ai/slideText";

describe("renderTextBlock", () => {
  it("bryter lang tekst over flere linjer innenfor bredden", async () => {
    const block = await renderTextBlock({
      text: "Slik unngår du fukt i våtrommet før vinteren kommer",
      weight: "heavy",
      color: "#FFFFFF",
      maxWidth: 600,
      maxHeight: 600,
      maxSize: 90,
      minSize: 40,
    });

    expect(block).not.toBeNull();
    expect(block!.width).toBeLessThanOrEqual(600);
    expect(block!.height).toBeGreaterThan(90);
  });

  it("krymper skriften til et langt ord får plass", async () => {
    const block = await renderTextBlock({
      text: "Våtromsrehabilitering",
      weight: "heavy",
      color: "#FFFFFF",
      maxWidth: 400,
      maxHeight: 300,
      maxSize: 120,
      minSize: 20,
    });

    expect(block!.size).toBeLessThan(120);
    expect(block!.width).toBeLessThanOrEqual(400);
  });

  it("returnerer null for tom tekst og escaper markup", async () => {
    expect(await renderTextBlock({
      text: "   ",
      weight: "medium",
      color: "#000000",
      maxWidth: 100,
      maxHeight: 100,
      maxSize: 20,
      minSize: 10,
    })).toBeNull();
    expect(escapeMarkup("Rør & <rør>")).toBe("Rør &amp; &lt;rør&gt;");
  });
});
