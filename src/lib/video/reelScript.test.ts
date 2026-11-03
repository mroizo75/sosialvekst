import { describe, expect, it } from "vitest";

import { speechPayload, wanVideoPayload } from "@/lib/ai/falClient";
import {
  buildReelScriptPrompt,
  buildShotListPrompt,
  chooseReelConcept,
  parseReelScript,
  reelDurationFor,
  timeShots,
} from "@/lib/video/reelScript";

const validScript = JSON.stringify({
  hook: "Ser du feilen?",
  voiceover: "Ser du feilen? Stigen står feil vei. Snu den, sikre foten, og du slipper fallet. Sjekk hms bindestrek nova punktum no.",
  shots: [
    { seconds: 3, camera: "fast handheld push-in", action: "a worker climbs a ladder placed at a bad angle" },
    { seconds: 4, camera: "macro close-up", action: "the ladder foot slides slightly on the floor" },
    { seconds: 4, camera: "smooth orbit", action: "the worker repositions the ladder correctly and smiles" },
  ],
});

describe("reel-manus", () => {
  it("roterer konsept innenfor postformatet", () => {
    expect(chooseReelConcept("myth_busting", 3)).toBe("myth_fact");
    expect(chooseReelConcept("tip", 0)).toBe("quick_tip");
    expect(chooseReelConcept("tip", 1)).toBe("spot_the_mistake");
    expect(chooseReelConcept(undefined, 2)).toBe("spot_the_mistake");
  });

  it("tolker gyldig JSON, også med tekst rundt", () => {
    const script = parseReelScript(`Her er manuset:\n${validScript}\nLykke til!`, "spot_the_mistake");

    expect(script?.concept).toBe("spot_the_mistake");
    expect(script?.hook).toBe("Ser du feilen?");
    expect(script?.shots).toHaveLength(3);
    expect(script?.voiceover).toContain("Stigen står feil vei.");
  });

  it("fjerner klipp som ber om tekst eller skader, og avviser manus med for få klipp", () => {
    const raw = JSON.stringify({
      voiceover: "Kort tekst.",
      shots: [
        { seconds: 3, camera: "close-up", action: "a sign with text reading DANGER" },
        { seconds: 3, camera: "wide", action: "a worker bleeding from an injury" },
        { seconds: 3, camera: "wide", action: "a calm workshop at dawn" },
      ],
    });

    expect(parseReelScript(raw, "quick_tip")).toBeUndefined();
  });

  it("avviser ugyldig svar", () => {
    expect(parseReelScript("ingen json her", "quick_tip")).toBeUndefined();
    expect(parseReelScript('{"voiceover": 3}', "quick_tip")).toBeUndefined();
  });

  it("dropper speakerteksten men beholder klippene når teksten har forbudte ord", () => {
    const script = parseReelScript(validScript, "spot_the_mistake", ["stigen"]);

    expect(script?.voiceover).toBeUndefined();
    expect(script?.shots).toHaveLength(3);
  });

  it("gjør videoen like lang som talen, innenfor 8–15 sekunder", () => {
    expect(reelDurationFor(undefined)).toBe(12);
    expect(reelDurationFor(3)).toBe(8);
    expect(reelDurationFor(9.6)).toBe(12);
    expect(reelDurationFor(20)).toBe(15);
  });

  it("strekker klippene til full lengde og lager tidsstemplet klippliste", () => {
    const timed = timeShots([
      { seconds: 2, camera: "a", action: "x" },
      { seconds: 2, camera: "b", action: "y" },
    ], 10);
    expect(timed.map((shot) => [shot.start, shot.end])).toEqual([[0, 5], [5, 10]]);

    const prompt = buildShotListPrompt(timed, 10, { coverTitle: "Stigesjekk", topic: "HMS" });
    expect(prompt).toContain("Shot 1 (0-5s), a: x");
    expect(prompt).toContain("Shot 2 (5-10s), b: y");
    expect(prompt).toContain("Subject: Stigesjekk – HMS.");
    expect(prompt).toContain("Do not render any text");
  });

  it("beskriver konseptet og nettadressen i prompten", () => {
    const prompt = buildReelScriptPrompt({
      topic: "Stiger",
      caption: "Tre feil folk gjør",
      concept: "spot_the_mistake",
      brandContext: { companyName: "HMS Nova", websiteUrl: "https://hmsnova.no" },
    });

    expect(prompt.system).toContain("Finn feilen");
    expect(prompt.system).toContain("«Hmsnova punktum no»");
    expect(prompt.user).toContain("Bedrift: HMS Nova");
  });
});

describe("fal-payloads for reels", () => {
  it("sender Wan 3.0 riktig format, lengde og lyd av", () => {
    expect(wanVideoPayload({ prompt: "p", imageUrl: "https://x/img.jpg", durationSeconds: 12.4, resolution: "720p" })).toEqual({
      prompt: "p",
      start_image_url: "https://x/img.jpg",
      duration: 12,
      aspect_ratio: "9:16",
      resolution: "720p",
      audio: false,
      enable_prompt_expansion: true,
      enable_thinking: false,
    });
  });

  it("bruker norsk språkkode for både Eleven v3 og turbo", () => {
    expect(speechPayload("Hei", "George", "eleven-v3")).toEqual({ text: "Hei", voice: "George", language_code: "no", stability: 0.5 });
    expect(speechPayload("Hei", "George", "turbo-v2.5", 1.15)).toEqual({ text: "Hei", voice: "George", language_code: "no", speed: 1.15 });
  });
});
