import { generateMusic } from "@/lib/ai/falClient";
import { findSharedFileUrl, uploadSharedFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";

export type MusicMood = "beach" | "city" | "nature" | "calm" | "upbeat";

export const TRACKS_PER_MOOD = 3;
export const TRACK_LENGTH_MS = 10_000;
const LIBRARY_VERSION = "v1";

const MOOD_PROMPTS: Record<MusicMood, string> = {
  beach: "Warm, sunny tropical house with soft marimba, light percussion and a relaxed summer groove. Instrumental, no vocals.",
  city: "Modern, stylish lo-fi electronic beat with a confident pulse, urban evening mood. Instrumental, no vocals.",
  nature: "Uplifting acoustic folk with fingerpicked guitar, airy strings and a sense of open landscapes. Instrumental, no vocals.",
  calm: "Gentle ambient piano with soft pads, calm and elegant, slow tempo. Instrumental, no vocals.",
  upbeat: "Bright, energetic pop instrumental with claps, plucked synths and a feel-good hook. Instrumental, no vocals.",
};

const wordStart = (words: string[]): RegExp =>
  new RegExp(`(?<![a-zæøå])(?:${words.join("|")})`, "i");

const MOOD_KEYWORDS: Array<{ mood: MusicMood; pattern: RegExp }> = [
  { mood: "beach", pattern: wordStart(["strand", "beach", "tropisk", "tropical", "øy", "island", "syden", "kyst", "coast", "bade", "ocean"]) },
  { mood: "city", pattern: wordStart(["byen", "byferie", "storby", "city", "metropol", "street", "shopping", "nattliv", "nightlife", "urban", "restaurant", "kafé", "cafe"]) },
  { mood: "nature", pattern: wordStart(["fjell", "mountain", "fjord", "skog", "forest", "natur", "hike", "hiking", "innsjø", "lake", "vandring", "fottur"]) },
  { mood: "calm", pattern: wordStart(["spa(?![a-zæøå])", "wellness", "rolig", "calm", "relax", "avslapp", "luksus", "luxury", "hotell", "hotel", "yoga"]) },
];

export const MUSIC_MOODS = Object.keys(MOOD_PROMPTS) as MusicMood[];

export const chooseMood = (text: string): MusicMood =>
  MOOD_KEYWORDS.find(({ pattern }) => pattern.test(text))?.mood ?? "upbeat";

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const trackIndexFor = (seed: string): number => hashString(seed) % TRACKS_PER_MOOD;

export const trackKey = (mood: MusicMood, index: number): string =>
  `shared/music/${LIBRARY_VERSION}/${mood}-${index + 1}.mp3`;

const inflight = new Map<string, Promise<string>>();

const createTrack = async (mood: MusicMood, key: string): Promise<string> => {
  const sourceUrl = await generateMusic(MOOD_PROMPTS[mood], TRACK_LENGTH_MS);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Kunne ikke hente generert musikk (${response.status}).`);
  }
  const url = await uploadSharedFile(key, "audio/mpeg", new Uint8Array(await response.arrayBuffer()));
  logger.info("Musikkspor lagt i biblioteket", { mood, key });
  return url;
};

export const getMusicTrackUrl = async (mood: MusicMood, seed: string): Promise<string> => {
  const key = trackKey(mood, trackIndexFor(seed));
  const cached = await findSharedFileUrl(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = createTrack(mood, key).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
};
