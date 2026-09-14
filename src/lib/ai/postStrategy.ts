import type { PostFormat, PostIntent, SocialChannel } from "@/lib/types";

type PostSlot = {
  weekIndex: number;
  dayIndex: number;
  channel: SocialChannel;
};

type PostStrategyResult = {
  intent: PostIntent;
  format: PostFormat;
  ctaType: string;
  imageDirection: string;
};

const INTENT_ROTATION: PostIntent[] = [
  "authority",
  "engagement",
  "brand_awareness",
  "lead_generation",
  "traffic",
  "community",
];

const FORMAT_ROTATION: PostFormat[] = [
  "insight",
  "tip",
  "question",
  "case_study",
  "how_to",
  "fact",
  "behind_the_scenes",
  "myth_busting",
  "opinion",
];

const CTA_MAP: Record<PostIntent, string> = {
  brand_awareness: "Del denne posten med noen som har nytte av det.",
  traffic: "Les mer på nettsiden vår (lenke i bio/kommentar).",
  engagement: "Hva er din erfaring? Del i kommentarfeltet.",
  lead_generation: "Ta kontakt for en uforpliktende prat om hvordan vi kan hjelpe.",
  authority: "Følg oss for flere faglige tips og innsikt.",
  community: "Tagg en kollega som burde se dette.",
};

const IMAGE_DIRECTION_MAP: Record<PostFormat, string> = {
  insight: "Fotorealistisk scene fra det bedriften faktisk leverer. Ingen tekst i bildet.",
  tip: "Ett konkret motiv fra virkeligheten kunden ønsker seg. Ingen laptop eller kontor.",
  question: "Lengsel eller nysgjerrighet gjennom ekte omgivelser. Ingen tekst.",
  case_study: "Resultat eller opplevelse i ekte setting, ikke et møterom.",
  how_to: "Handling i relevant miljø. Ingen skrivebordsscene og ingen tekstoverlegg.",
  fact: "Motivet kommuniserer gjennom sted og detalj, ikke tekst eller infografikk.",
  behind_the_scenes: "Ekte situasjon ute i felt, kjøkken, hotell eller verksted — ikke kontor.",
  myth_busting: "Kontrast i virkelige omgivelser, ikke i et møterom.",
  opinion: "Karakter gjennom sted og atmosfære, ikke et portrett ved PC.",
};

export const assignPostStrategy = (slot: PostSlot): PostStrategyResult => {
  const globalIndex = slot.weekIndex * 3 + slot.dayIndex;
  const channelOffset = slot.channel === "facebook" ? 0 : slot.channel === "instagram" ? 1 : slot.channel === "linkedin" ? 2 : 3;

  const intentIndex = (globalIndex + channelOffset) % INTENT_ROTATION.length;
  const formatIndex = (globalIndex * 3 + channelOffset * 2) % FORMAT_ROTATION.length;

  const intent = INTENT_ROTATION[intentIndex];
  const format = FORMAT_ROTATION[formatIndex];

  return {
    intent,
    format,
    ctaType: CTA_MAP[intent],
    imageDirection: IMAGE_DIRECTION_MAP[format],
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
