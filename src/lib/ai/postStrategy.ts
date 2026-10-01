import { pickWeighted, type PerformanceProfile } from "@/lib/metrics/learning";
import type { GenerationMeta, MediaFormat, PostFormat, PostIntent, SocialChannel } from "@/lib/types";

export type ContentPillar = "inspiration" | "useful" | "commercial" | "trust";

export type VisualMotif =
  | "people"
  | "beach"
  | "room"
  | "breakfast"
  | "restaurant"
  | "city"
  | "activity"
  | "view"
  | "nature"
  | "pool"
  | "hotel"
  | "destination"
  | "guide"
  | "comparison"
  | "price";

type PostSlot = {
  weekIndex: number;
  dayIndex: number;
  channel: SocialChannel;
  postsPerWeek?: number;
  feedIndex?: number;
  hasCustomerStories?: boolean;
  pinned?: PinnedStrategy;
  reelsAllowed?: boolean;
};

export type PinnedStrategy = {
  pillar?: ContentPillar;
  motif?: VisualMotif;
  format?: PostFormat;
  mediaFormat?: MediaFormat;
};

export type PostStrategyResult = {
  intent: PostIntent;
  format: PostFormat;
  ctaType: string;
  imageDirection: string;
  contentPillar: ContentPillar;
  visualMotif: VisualMotif;
  reelScript: boolean;
  includeWebsiteLink: boolean;
  feedIndex: number;
  mediaFormat: MediaFormat;
};

const REEL_EVERY = 3;

const MEDIA_FORMATS: Record<MediaFormat, true> = { reel: true, image: true };

// Instagram and Facebook use different offsets so the two feeds do not get a reel on the same day.
export const chooseMediaFormat = (
  channel: SocialChannel,
  feedIndex: number,
  reelsAllowed: boolean,
  pinned?: MediaFormat,
): MediaFormat => {
  if (!reelsAllowed) return "image";
  if (pinned) return pinned;
  if (channel === "tiktok") return "reel";
  if (channel === "linkedin") return "image";
  return (feedIndex + channelOffset(channel)) % REEL_EVERY === REEL_EVERY - 1 ? "reel" : "image";
};

const PILLAR_CYCLE: ContentPillar[] = [
  "inspiration",
  "useful",
  "inspiration",
  "commercial",
  "useful",
  "inspiration",
  "trust",
  "inspiration",
  "useful",
  "commercial",
  "inspiration",
  "useful",
  "inspiration",
  "trust",
  "commercial",
  "inspiration",
  "useful",
  "inspiration",
  "commercial",
  "trust",
];

const MOTIF_CYCLE: VisualMotif[] = [
  "people",
  "beach",
  "guide",
  "restaurant",
  "city",
  "comparison",
  "room",
  "activity",
  "breakfast",
  "view",
  "price",
  "nature",
  "destination",
  "pool",
  "restaurant",
  "hotel",
  "city",
  "activity",
];

const PILLAR_FORMATS: Record<ContentPillar, PostFormat[]> = {
  inspiration: ["question", "insight", "opinion"],
  useful: ["how_to", "tip", "myth_busting", "fact"],
  commercial: ["fact", "tip"],
  trust: ["behind_the_scenes", "opinion"],
};

const PILLAR_INTENT: Record<ContentPillar, PostIntent> = {
  inspiration: "engagement",
  useful: "authority",
  commercial: "traffic",
  trust: "brand_awareness",
};

const PILLAR_CTA: Record<ContentPillar, string[]> = {
  inspiration: [
    "Ville du tatt denne?",
    "Hva ville du gjort først?",
  ],
  useful: [
    "Hvilken ville du valgt? Skriv det under.",
    "Hva ville du sjekket først?",
  ],
  commercial: [
    "Se hva som finnes akkurat nå.",
  ],
  trust: [
    "Spørsmål? Skriv under, så svarer vi.",
    "Følg med for flere konkrete tips.",
  ],
};

const MOTIF_DIRECTION: Record<VisualMotif, string> = {
  people: "Mennesker i situasjonen kunden faktisk er i. Ikke et tomt produktbilde.",
  beach: "Ute i kundens verden, med mennesker og naturlig lys.",
  room: "Resultat eller detalj sett gjennom et menneske, ikke et tomt interiør.",
  breakfast: "Et konkret øyeblikk der noen bruker eller nyter det det handler om.",
  restaurant: "Mennesker sammen med det bedriften handler om. Stemning, ikke bare objektet.",
  city: "Miljøet rundt kunden, med liv og mennesker.",
  activity: "Mennesker som gjør noe i praksis, i ekte omgivelser.",
  view: "Et menneske som ser resultatet, stedet eller arbeidet.",
  nature: "Omgivelsene, med mennesker synlige. Ikke et tomt postkort.",
  pool: "Et samlingspunkt med mennesker, ikke et tomt anlegg eller lokale.",
  hotel: "Stedet eller lokalet med brukere synlige. Ikke bare fasade.",
  destination: "Helheten av situasjonen, med mennesker i miljøet.",
  guide: "En tydelig situasjon folk kan lære av, med mennesker. Rolig nedre tredjedel, uten tekst i selve bildet.",
  comparison: "Ett tydelig valg, med mennesker. Rolig nedre tredjedel, uten tekst i selve bildet.",
  price: "Hva man faktisk får, vist med mennesker. Rolig nedre tredjedel, uten tekst i selve bildet.",
};

const channelOffset = (channel: SocialChannel): number => {
  if (channel === "instagram") return 4;
  if (channel === "linkedin") return 8;
  if (channel === "tiktok") return 12;
  return 0;
};

const formatForPillar = (
  pillar: ContentPillar,
  feedIndex: number,
  hasCustomerStories: boolean,
): PostFormat => {
  if (pillar === "trust" && hasCustomerStories && feedIndex % 2 === 0) {
    return "case_study";
  }
  const formats = PILLAR_FORMATS[pillar];
  return formats[feedIndex % formats.length];
};

export type StrategyProfile = Pick<PerformanceProfile, "ready" | "formats">;

const chooseFormat = (
  pillar: ContentPillar,
  feedIndex: number,
  hasCustomerStories: boolean,
  profile: StrategyProfile | undefined,
  random: () => number,
): PostFormat => {
  const rotated = formatForPillar(pillar, feedIndex, hasCustomerStories);
  if (!profile?.ready || rotated === "case_study") return rotated;
  return pickWeighted(PILLAR_FORMATS[pillar], profile.formats, random);
};

export const assignPostStrategy = (
  slot: PostSlot,
  profile?: StrategyProfile,
  random: () => number = Math.random,
): PostStrategyResult => {
  const postsPerWeek = Math.max(1, slot.postsPerWeek ?? 3);
  const feedIndex = slot.feedIndex ?? slot.weekIndex * postsPerWeek + slot.dayIndex;
  const contentPillar = slot.pinned?.pillar
    ?? PILLAR_CYCLE[(feedIndex + channelOffset(slot.channel)) % PILLAR_CYCLE.length];
  const visualMotif = slot.pinned?.motif
    ?? MOTIF_CYCLE[(feedIndex + channelOffset(slot.channel)) % MOTIF_CYCLE.length];
  const ctaOptions = PILLAR_CTA[contentPillar];
  const mediaFormat = chooseMediaFormat(slot.channel, feedIndex, slot.reelsAllowed ?? false, slot.pinned?.mediaFormat);
  const reelScript = mediaFormat === "reel"
    || slot.channel === "tiktok"
    || (slot.channel === "instagram" && contentPillar === "inspiration");

  const imageDirection = [
    MOTIF_DIRECTION[visualMotif],
    reelScript ? "Vertikalt format 9:16, reel. Motivet skal fungere som åpningsbilde uten logo." : null,
    "Ikke gjenta samme type motiv flere ganger på rad.",
  ].filter(Boolean).join(" ");

  return {
    intent: PILLAR_INTENT[contentPillar],
    format: slot.pinned?.format
      ?? chooseFormat(contentPillar, feedIndex, slot.hasCustomerStories ?? false, profile, random),
    ctaType: ctaOptions[feedIndex % ctaOptions.length],
    imageDirection,
    contentPillar,
    visualMotif,
    reelScript,
    includeWebsiteLink: contentPillar === "commercial" || contentPillar === "trust",
    feedIndex,
    mediaFormat,
  };
};

const isKeyOf = <T extends string>(record: Record<T, unknown>, value: unknown): value is T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(record, value);

// Stored metadata is untrusted JSON, so only known values may steer a new post.
export const pinnedFromMeta = (
  meta: Pick<GenerationMeta, "pillar" | "motif" | "format" | "mediaFormat"> | null | undefined,
): PinnedStrategy => {
  const pillar: unknown = meta?.pillar;
  const motif: unknown = meta?.motif;
  const format: unknown = meta?.format;
  const mediaFormat: unknown = meta?.mediaFormat;
  return {
    pillar: isKeyOf(PILLAR_INTENT, pillar) ? pillar : undefined,
    motif: isKeyOf(MOTIF_DIRECTION, motif) ? motif : undefined,
    format: isKeyOf(FORMAT_LABELS_NO, format) ? format : undefined,
    mediaFormat: isKeyOf(MEDIA_FORMATS, mediaFormat) ? mediaFormat : undefined,
  };
};

const INTENT_LABELS_NO: Record<PostIntent, string> = {
  brand_awareness: "Merkevarebygging",
  traffic: "Drive trafikk",
  engagement: "Engasjement",
  lead_generation: "Leads",
  authority: "Faglig autoritet",
  community: "Fellesskap",
};

const FORMAT_LABELS_NO: Record<PostFormat, string> = {
  insight: "Innsikt",
  tip: "Tips",
  question: "Spørsmål",
  case_study: "Casestudie",
  how_to: "Slik gjør du det",
  fact: "Fakta",
  behind_the_scenes: "Bak kulissene",
  myth_busting: "Myteavkreftning",
  opinion: "Mening",
};

export const getIntentLabel = (intent: PostIntent): string =>
  INTENT_LABELS_NO[intent];

export const getFormatLabel = (format: PostFormat): string =>
  FORMAT_LABELS_NO[format];
