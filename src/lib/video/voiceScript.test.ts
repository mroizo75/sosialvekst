import { describe, expect, it } from "vitest";

import { buildVoiceScriptPrompt, normalizeVoiceScript, spokenDomain } from "@/lib/video/voiceScript";

describe("talemanus for reels", () => {
  it("uttaler nettadressen med punktum", () => {
    expect(spokenDomain("https://www.sydenklar.no/hoteller")).toBe("Sydenklar punktum no");
    expect(spokenDomain("hms-nova.com")).toBe("Hms bindestrek nova punktum com");
    expect(spokenDomain("ikke en adresse")).toBeUndefined();
  });

  it("gjør skrevne adresser om til uttale og fjerner anførselstegn", () => {
    const script = normalizeVoiceScript("«Drømmer du om Kreta? Finn hotellet ditt på sydenklar.no.»");

    expect(script).toBe("Drømmer du om Kreta? Finn hotellet ditt på Sydenklar punktum no.");
  });

  it("kutter siste setning når manuset blir for langt", () => {
    const long = [
      "Drømmer du om Kreta i sommer?",
      "Vi har håndplukket hotellene med best strand og rolig atmosfære for hele familien.",
      "Finn ditt på Sydenklar punktum no i dag og bestill før det blir fullt.",
    ].join(" ");

    expect(normalizeVoiceScript(long)).toBe(
      "Drømmer du om Kreta i sommer? Vi har håndplukket hotellene med best strand og rolig atmosfære for hele familien.",
    );
  });

  it("avviser manus med forbudte ord", () => {
    expect(normalizeVoiceScript("Billigste hotell på Kreta!", ["billigste"])).toBeUndefined();
  });

  it("ber ikke om nettadresse når bedriften ikke har en", () => {
    const prompt = buildVoiceScriptPrompt({ topic: "Kreta", caption: "Strandliv", brandContext: { companyName: "Sydenklar" } });

    expect(prompt.system).toContain("Ikke nevn noen nettadresse.");
    expect(prompt.user).toContain("Bedrift: Sydenklar");
  });
});
