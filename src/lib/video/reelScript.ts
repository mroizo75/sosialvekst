import { z } from "zod";

import type { BrandContext, GenerationMeta, PostFormat, ReelConcept, ReelShot } from "@/lib/types";
import { MAX_VOICE_WORDS, normalizeVoiceScript, spokenDomain } from "@/lib/video/voiceScript";

export const REEL_MIN_SECONDS = 8;
export const REEL_MAX_SECONDS = 15;
export const REEL_DEFAULT_SECONDS = 12;
// Pause before the voice starts and after it ends, so the cut does not clip the last word.
const VOICE_LEAD_SECONDS = 0.4;
const VOICE_TAIL_SECONDS = 1.1;
const MAX_SHOTS = 4;
const MIN_SHOTS = 2;
const WEBSITE_EXCERPT_CHARS = 1200;

const CONCEPT_GUIDE: Record<ReelConcept, { label: string; idea: string }> = {
  quick_tip: {
    label: "Kjapt tips",
    idea: "Ett konkret tips som løser et ekte problem. Første klipp viser problemet, de neste viser grepet og resultatet.",
  },
  spot_the_mistake: {
    label: "Finn feilen",
    idea: "Seeren skal lete etter en feil eller risiko i en hverdagssituasjon. Første klipp viser situasjonen, så zoomer kameraet inn på feilen, til slutt vises riktig måte.",
  },
  pov_story: {
    label: "POV-historie",
    idea: "En kort, gjenkjennelig situasjon sett fra kundens øyne, med en liten vri. Humor er lov, men ingen skader eller ulykker vises grafisk.",
  },
  myth_fact: {
    label: "Myte eller fakta",
    idea: "Start med en vanlig påstand folk tror på, og avkreft eller bekreft den med et tydelig visuelt bevis.",
  },
  before_after: {
    label: "Før og etter",
    idea: "Vis tydelig kontrast: hvordan det ser ut uten bedriftens løsning, og hvordan det ser ut med den.",
  },
  behind_the_scenes: {
    label: "Bak kulissene",
    idea: "Vis menneskene og arbeidet bak bedriften i ekte omgivelser. Nært, varmt og ærlig.",
  },
};

const FORMAT_CONCEPTS: Record<PostFormat, ReelConcept[]> = {
  tip: ["quick_tip", "spot_the_mistake"],
  how_to: ["quick_tip", "before_after"],
  myth_busting: ["myth_fact"],
  fact: ["spot_the_mistake", "myth_fact"],
  question: ["pov_story", "spot_the_mistake"],
  insight: ["pov_story", "before_after"],
  opinion: ["pov_story"],
  case_study: ["before_after"],
  behind_the_scenes: ["behind_the_scenes"],
};

export const REEL_CONCEPTS = Object.keys(CONCEPT_GUIDE) as ReelConcept[];

export const reelConceptLabel = (concept: ReelConcept): string => CONCEPT_GUIDE[concept].label;

// Rotating within the format keeps a plan from posting the same kind of reel twice in a row.
export const chooseReelConcept = (format: PostFormat | undefined, feedIndex = 0): ReelConcept => {
  const options = format ? FORMAT_CONCEPTS[format] : ["quick_tip", "pov_story", "spot_the_mistake"] as ReelConcept[];
  return options[Math.abs(feedIndex) % options.length];
};

const lineOf = (label: string, value: string | undefined): string | undefined =>
  value?.trim() ? `${label}: ${value.trim()}` : undefined;

const listOf = (label: string, values: string[] | undefined): string | undefined =>
  values && values.length > 0 ? `${label}: ${values.join("; ")}` : undefined;

export type ReelScriptPromptInput = {
  topic: string;
  caption: string;
  concept: ReelConcept;
  brandContext?: BrandContext;
};

export const buildReelScriptPrompt = ({ topic, caption, concept, brandContext }: ReelScriptPromptInput): { system: string; user: string } => {
  const domain = spokenDomain(brandContext?.websiteUrl);
  const guide = CONCEPT_GUIDE[concept];
  const system = [
    "Du er regissør for korte, vertikale videoer til TikTok, Instagram Reels og Facebook Reels.",
    "Målet er at folk som ikke kjenner bedriften stopper å scrolle. Også et kjedelig tema skal føles levende, menneskelig og litt overraskende.",
    `Konsept: ${guide.label}. ${guide.idea}`,
    "",
    "Svar KUN med JSON i dette formatet:",
    '{"hook": string, "voiceover": string, "shots": [{"seconds": number, "camera": string, "action": string}]}',
    "",
    "hook: norsk, maks 6 ord. Det første seeren hører, et spørsmål eller en påstand som skaper nysgjerrighet. Ikke «Visste du at».",
    `voiceover: norsk speakertekst som starter med hooken. Maks ${MAX_VOICE_WORDS} ord, helst 20–26. Korte setninger som er naturlige å si høyt, muntlig og varm tone.`,
    domain
      ? `Hvis du nevner nettsiden, skriv den nøyaktig slik den skal uttales: «${domain}». Ikke nevn den i hver video.`
      : "Ikke nevn noen nettadresse.",
    `shots: ${MIN_SHOTS}–${MAX_SHOTS} klipp på ENGELSK for videomodellen. Til sammen ${REEL_MIN_SECONDS}–${REEL_MAX_SECONDS} sekunder. Første klipp er maks 3 sekunder og må fange blikket med en gang.`,
    "camera: kort kameraføring på engelsk, for eksempel «fast handheld push-in», «low angle tracking shot», «macro close-up», «whip pan».",
    "action: hva som skjer i bildet på engelsk, konkret og fysisk. Samme personer, sted og produkt gjennom hele videoen, slik de er på åpningsbildet.",
    "Ingen tekst, skilt, logoer eller undertekster i klippene. Ingen blod, skader eller farlige stunt.",
    "Bruk bare fakta fra bedriftsprofilen og posten. Ikke dikt opp priser, tall, tilbud eller garantier.",
  ].join("\n");

  const facts = [
    lineOf("Bedrift", brandContext?.companyName),
    lineOf("Bransje", brandContext?.industry),
    lineOf("Beskrivelse", brandContext?.companyDescription),
    listOf("Produkter", brandContext?.products),
    listOf("Tjenester", brandContext?.services),
    listOf("Fortrinn", brandContext?.uniqueSellingPoints),
    lineOf("Målgruppe", brandContext?.targetAudience),
    listOf("Kundens utfordringer", brandContext?.customerPainPoints),
    lineOf("Tone", brandContext?.brandVoice),
    lineOf("Utdrag fra nettsiden", brandContext?.websiteContent?.slice(0, WEBSITE_EXCERPT_CHARS)),
  ].filter(Boolean);

  const user = [
    `Tema for posten: ${topic}`,
    `Posttekst:\n${caption}`,
    facts.length > 0 ? `Bedriftsprofil:\n${facts.join("\n")}` : "Bedriftsprofil: ingen detaljer.",
  ].join("\n\n");

  return { system, user };
};

const rawScriptSchema = z.object({
  hook: z.string().optional(),
  voiceover: z.string(),
  shots: z.array(z.object({
    seconds: z.coerce.number(),
    camera: z.string(),
    action: z.string(),
  })).min(1),
});

export type ReelScript = {
  concept: ReelConcept;
  hook?: string;
  voiceover?: string;
  shots: ReelShot[];
};

const BANNED_SHOT_WORDS = /\b(text|caption|subtitle|logo|watermark|sign reading|blood|injur|gore)\w*/i;

const cleanShot = (shot: { seconds: number; camera: string; action: string }): ReelShot | undefined => {
  const camera = shot.camera.replace(/\s+/g, " ").trim().slice(0, 80);
  const action = shot.action.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!action || BANNED_SHOT_WORDS.test(action)) return undefined;
  const seconds = Number.isFinite(shot.seconds) ? Math.min(Math.max(shot.seconds, 1.5), 6) : 3;
  return { seconds: Math.round(seconds * 2) / 2, camera: camera || "handheld shot", action };
};

const extractJson = (raw: string): unknown => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
};

// The model output is untrusted: shots that ask for text or injuries are dropped, the voiceover goes through the same rules as before.
export const parseReelScript = (
  raw: string,
  concept: ReelConcept,
  prohibitedTerms?: string[],
): ReelScript | undefined => {
  const parsed = rawScriptSchema.safeParse(extractJson(raw));
  if (!parsed.success) return undefined;
  const shots = parsed.data.shots
    .map(cleanShot)
    .filter((shot): shot is ReelShot => Boolean(shot))
    .slice(0, MAX_SHOTS);
  if (shots.length < MIN_SHOTS) return undefined;
  const hook = parsed.data.hook?.replace(/["«»“”]/g, "").trim() || undefined;
  return {
    concept,
    hook,
    voiceover: normalizeVoiceScript(parsed.data.voiceover, prohibitedTerms),
    shots,
  };
};

// The clip is as long as the voice needs, inside what the platforms and the music bed support.
export const reelDurationFor = (voiceSeconds: number | undefined): number => {
  if (!voiceSeconds || !Number.isFinite(voiceSeconds)) return REEL_DEFAULT_SECONDS;
  const needed = Math.ceil(VOICE_LEAD_SECONDS + voiceSeconds + VOICE_TAIL_SECONDS);
  return Math.min(REEL_MAX_SECONDS, Math.max(REEL_MIN_SECONDS, needed));
};

export const VOICE_START_MS = Math.round(VOICE_LEAD_SECONDS * 1000);
export const VOICE_MAX_SECONDS = REEL_MAX_SECONDS - VOICE_LEAD_SECONDS - VOICE_TAIL_SECONDS;

// Shots are stretched or squeezed to the final duration, so the cuts land where the model was told.
export const timeShots = (shots: ReelShot[], durationSeconds: number): Array<ReelShot & { start: number; end: number }> => {
  const total = shots.reduce((sum, shot) => sum + shot.seconds, 0) || 1;
  const scale = durationSeconds / total;
  let cursor = 0;
  return shots.map((shot, index) => {
    const start = cursor;
    const end = index === shots.length - 1 ? durationSeconds : Math.round((cursor + shot.seconds * scale) * 2) / 2;
    cursor = end;
    return { ...shot, start, end };
  });
};

const fmt = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const subjectLine = (meta: Pick<GenerationMeta, "coverTitle" | "topic"> | null | undefined): string | undefined => {
  const subject = [meta?.coverTitle, meta?.topic].filter(Boolean).join(" – ");
  return subject ? `Subject: ${subject}.` : undefined;
};

// Wan 3.0 follows a shot list with timestamps far better than one flowing sentence.
export const buildShotListPrompt = (
  shots: ReelShot[],
  durationSeconds: number,
  meta?: Pick<GenerationMeta, "coverTitle" | "topic"> | null,
): string => {
  const timed = timeShots(shots, durationSeconds);
  return [
    `Vertical 9:16 short-form social video, ${timed.length} shots with clean, energetic cuts, ${durationSeconds} seconds total.`,
    subjectLine(meta),
    "The first frame is the opening image. Keep every person, place, product and outfit consistent with it across all shots.",
    ...timed.map((shot, index) => `Shot ${index + 1} (${fmt(shot.start)}-${fmt(shot.end)}s), ${shot.camera}: ${shot.action}`),
    "Style: authentic, modern smartphone look, natural light, real people with natural expressions and believable movement, crisp detail, no slow motion unless asked.",
    "Keep the top-left corner and the lower third free of important detail; title and logo are added afterwards.",
    "Do not render any text, captions, subtitles, signs with writing, logos, watermarks or letterboxing.",
    "Audio: none.",
  ].filter(Boolean).join("\n");
};

// Old posts and failed scripts still get a reel, just without the shot list.
export const buildFallbackMotionPrompt = (
  meta: Pick<GenerationMeta, "coverTitle" | "topic"> | null | undefined,
  durationSeconds: number,
): string => buildShotListPrompt(
  [
    { seconds: 3, camera: "fast handheld push-in", action: "the main subject comes alive with a clear, natural movement that grabs attention" },
    { seconds: 4, camera: "smooth orbit around the subject", action: "people interact naturally with the situation, product or place in the opening image" },
    { seconds: 3, camera: "close-up detail shot", action: "a satisfying detail that shows the result or the key moment" },
  ],
  durationSeconds,
  meta,
);
