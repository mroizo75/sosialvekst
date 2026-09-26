import type { PostFormat, PostIntent, SocialChannel } from "@/lib/types";

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
    "Lagre denne til neste gang.",
    "Send den til den du vil oppleve det med.",
    "Ville du tatt denne?",
  ],
  useful: [
    "Hvilken ville du valgt? Skriv det under.",
    "Lagre denne til du skal bestemme deg.",
    "Send den til den du planlegger med.",
  ],
  commercial: [
    "Se utvalget og finn dagens pris.",
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

export const assignPostStrategy = (slot: PostSlot): PostStrategyResult => {
  const postsPerWeek = Math.max(1, slot.postsPerWeek ?? 3);
  const feedIndex = slot.feedIndex ?? slot.weekIndex * postsPerWeek + slot.dayIndex;
  const contentPillar = PILLAR_CYCLE[feedIndex % PILLAR_CYCLE.length];
  const visualMotif = MOTIF_CYCLE[(feedIndex + channelOffset(slot.channel)) % MOTIF_CYCLE.length];
  const ctaOptions = PILLAR_CTA[contentPillar];
  const reelScript = slot.channel === "tiktok"
    || (slot.channel === "instagram" && contentPillar === "inspiration");

  const imageDirection = [
    MOTIF_DIRECTION[visualMotif],
    reelScript ? "Vertikalt format 9:16, reel. Motivet skal fungere som åpningsbilde uten logo." : null,
    "Ikke gjenta samme type motiv flere ganger på rad.",
  ].filter(Boolean).join(" ");

  return {
    intent: PILLAR_INTENT[contentPillar],
    format: formatForPillar(contentPillar, feedIndex, slot.hasCustomerStories ?? false),
    ctaType: ctaOptions[feedIndex % ctaOptions.length],
    imageDirection,
    contentPillar,
    visualMotif,
    reelScript,
    includeWebsiteLink: contentPillar === "commercial" || contentPillar === "trust",
    feedIndex,
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
