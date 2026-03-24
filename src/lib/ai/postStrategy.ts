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
  insight: "Profesjonelt bilde som illustrerer en nøkkelinnsikt, gjerne med tekst-overlay.",
  tip: "Rent, minimalistisk bilde med fokus på et enkelt konsept eller verktøy.",
  question: "Engasjerende bilde som inviterer til refleksjon, gjerne med et spørsmålstegn-element.",
  case_study: "Dokumentarisk stil som viser et resultat eller en prosess.",
  how_to: "Steg-for-steg visuelt som viser en prosess eller metode.",
  fact: "Infografikk-inspirert bilde med tydelig visuell kommunikasjon av data eller fakta.",
  behind_the_scenes: "Autentisk, upolert bilde fra daglig drift eller arbeidsmiljø.",
  myth_busting: "Kontrastfylt bilde som visuelt viser forskjellen mellom myte og virkelighet.",
  opinion: "Bilde med tydelig karakter og personlighet som understreker et standpunkt.",
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
