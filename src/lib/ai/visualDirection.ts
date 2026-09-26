import type { VisualMotif } from "@/lib/ai/postStrategy";
import type { BrandContext, PostFormat } from "@/lib/types";

export type VisualWorld = "travel" | "food" | "craft" | "generic";

export type VisualBrief = {
  world: VisualWorld;
  placeName: string | null;
  sceneLock: string;
  subjectDirection: string;
  carouselAngles: string[];
  bans: string[];
};

const TRAVEL_MARKERS = [
  "reise",
  "reiseliv",
  "hotell",
  "hotel",
  "ferie",
  "turisme",
  "tourism",
  "travel",
  "destinasjon",
  "destination",
  "syden",
  "charter",
  "flybillett",
  "all inclusive",
  "all-inclusive",
  "resort",
  "booking",
  "pakketur",
  "solferie",
  "strandferie",
  "weekendtur",
];

const FOOD_MARKERS = [
  "restaurant",
  "kafé",
  "kafe",
  "bakeri",
  "catering",
  "mat",
  "meny",
  "kokk",
  "servering",
];

const CRAFT_MARKERS = [
  "håndverk",
  "handverk",
  "bygg",
  "rørlegg",
  "rorlegg",
  "elektrik",
  "snekker",
  "maler",
  "anlegg",
  "verksted",
  "hms",
];

const DESTINATIONS = [
  "Gran Canaria",
  "Tenerife",
  "Mallorca",
  "Rhodos",
  "Kreta",
  "Kypros",
  "Antalya",
  "Alanya",
  "Algarve",
  "Costa del Sol",
  "Sicilia",
  "Sardinia",
  "Dubrovnik",
  "Phuket",
  "Bali",
  "Dubai",
  "Hurghada",
  "Sharm el-Sheikh",
  "Kap Verde",
  "Madeira",
  "Santorini",
  "Mykonos",
  "Korfu",
  "Kos",
  "Lanzarote",
  "Fuerteventura",
  "Ibiza",
  "Split",
  "Nice",
  "Amalfikysten",
];

const GENERIC_BANS = [
  "person som sitter ved en datamaskin, laptop eller skjerm",
  "kontorlandskap, cubicles, call-senter eller konferanserom",
  "generic stockfoto av smilende forretningsperson med laptop",
  "håndtrykk i glassbygg",
  "hodesett/kundestøtte ved pult",
  "illustrasjon, clipart, 3D-render eller tegneserie",
];

const TRAVEL_BANS = [
  ...GENERIC_BANS,
  "norsk vinterkontor eller innendørs arbeidsplass",
  "tilfeldig by i et annet land enn destinasjonen",
  "ulike destinasjoner i samme bildeserie",
  "mennesker bare som uleselige prikker langt unna",
  "tomt basseng, tom fasade eller tom solnedgang uten mennesker",
];

const COVER_MOTIFS = new Set<VisualMotif>(["guide", "comparison", "price"]);

const TRAVEL_MOTIF_SCENE: Record<VisualMotif, string> = {
  people: "Par, familie eller venner på ferie, tydelig i bildet.",
  beach: "Mennesker på stranden, i forgrunnen. Sjø og lys rundt dem.",
  room: "Et menneske som ser utsikten fra hotellrommet. Rommet er ramme, ikke hovedperson.",
  breakfast: "Hotellfrokost med mennesker ved bordet. Mat, kaffe og morgenlys.",
  restaurant: "Middag på restaurant. Mennesker som spiser sammen.",
  city: "Mennesker som går i en hyggelig bygate, med kafeer og liv.",
  activity: "Mennesker som gjør noe: båt, marked, vandring eller lek.",
  view: "Utsikt med en person som ser. Stedet skal kjennes.",
  nature: "Natur med mennesker synlige, ikke bare et tomt postkort.",
  pool: "Basseng med mennesker som bader eller sitter ved kanten.",
  hotel: "Hotell med gjester som ankommer eller slapper av. Ikke bare fasaden.",
  destination: "Destinasjonen med mennesker på promenade, strand eller i gaten.",
  guide: "Et tydelig sted folk oppholder seg, med mennesker. Rolig nedre tredjedel.",
  comparison: "Ett karakteristisk sted, med mennesker. Rolig nedre tredjedel.",
  price: "Konkret ferieopplevelse med mennesker: rom, mat eller basseng. Rolig nedre tredjedel.",
};

const CUSTOMER_MOTIF_SCENE: Record<VisualMotif, string> = {
  people: "Ekte mennesker i situasjonen kunden kjenner seg igjen i.",
  beach: "Ute i kundens verden, med mennesker i aktivitet og naturlig lys.",
  room: "Resultatet sett gjennom et menneske, ikke et tomt produktbilde.",
  breakfast: "Et måltid, en pause eller et konkret øyeblikk med mennesker.",
  restaurant: "Mennesker som bruker eller nyter det bedriften handler om.",
  city: "Miljøet rundt kunden, med mennesker i ekte omgivelser.",
  activity: "Mennesker som gjør jobben eller opplevelsen, i praksis.",
  view: "Et menneske som ser resultatet eller stedet.",
  nature: "Omgivelsene, med mennesker synlige i bildet.",
  pool: "Et samlingspunkt med mennesker, ikke et tomt anlegg.",
  hotel: "Stedet eller lokalet med brukere synlige.",
  destination: "Helheten av situasjonen, med mennesker i miljøet.",
  guide: "En tydelig situasjon folk kan lære noe av, med mennesker. Rolig nedre tredjedel.",
  comparison: "Ett tydelig valg eller miljø, med mennesker. Rolig nedre tredjedel.",
  price: "Hva man faktisk får, vist med mennesker. Rolig nedre tredjedel.",
};

export const isCoverMotif = (motif?: VisualMotif): boolean =>
  motif !== undefined && COVER_MOTIFS.has(motif);

const shortenLabel = (value: string): string => {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 22) return cleaned;
  return cleaned.slice(0, 22).trim();
};

export const buildCoverLines = (input: {
  motif?: VisualMotif;
  placeName: string | null;
  topic: string;
}): { line1: string; line2: string } | null => {
  if (!isCoverMotif(input.motif)) return null;
  const source = input.placeName ?? input.topic;
  const line1 = shortenLabel(source).toUpperCase();
  const line2 = input.motif === "guide"
    ? (input.placeName ? "Her bør du bo" : "Dette bør du vite")
    : input.motif === "comparison"
      ? "Hva passer deg?"
      : "Se hva du får";
  return { line1, line2 };
};

const collectBrandText = (brandContext?: BrandContext, topic = ""): string => {
  const parts = [
    topic,
    brandContext?.industry,
    brandContext?.companyDescription,
    brandContext?.companyName,
    brandContext?.websiteUrl,
    brandContext?.websiteContent?.slice(0, 800),
    ...(brandContext?.products ?? []),
    ...(brandContext?.services ?? []),
    ...(brandContext?.keyMessages ?? []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
};

const matchesAny = (haystack: string, markers: string[]): boolean =>
  markers.some((marker) => haystack.includes(marker));

export const detectVisualWorld = (brandContext?: BrandContext, topic = ""): VisualWorld => {
  const text = collectBrandText(brandContext, topic);
  if (matchesAny(text, TRAVEL_MARKERS)) return "travel";
  if (matchesAny(text, FOOD_MARKERS)) return "food";
  if (matchesAny(text, CRAFT_MARKERS)) return "craft";
  return "generic";
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

export const extractDestination = (brandContext?: BrandContext, topic = ""): string | null => {
  const searchIn = (text: string): string | null => {
    const found = DESTINATIONS.find((place) => text.toLowerCase().includes(place.toLowerCase()));
    return found ?? null;
  };

  const fromTopic = searchIn(topic);
  if (fromTopic) return fromTopic;

  const brandText = [
    ...(brandContext?.products ?? []),
    ...(brandContext?.services ?? []),
    brandContext?.companyDescription ?? "",
    brandContext?.seasonalFocus ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return searchIn(brandText);
};

const formatDirectionFallback = (format?: PostFormat): string => {
  switch (format) {
    case "behind_the_scenes":
      return "Autentisk situasjon fra det bedriften faktisk leverer — i ekte omgivelser, ikke et kontor.";
    case "how_to":
      return "Vis konkret handling i det relevante miljøet, uten skrivebordsscene.";
    case "tip":
      return "Ett tydelig motiv fra virkeligheten kunden ønsker seg.";
    case "case_study":
      return "Resultat eller opplevelse i ekte setting, ikke et møterom.";
    default:
      return "Fotorealistisk scene som viser det bedriften selger, i naturlige omgivelser.";
  }
};

const resolveTravelPlace = (
  brandContext: BrandContext | undefined,
  topic: string,
  feedIndex = 0,
): string => {
  const named = extractDestination(brandContext, topic);
  if (named) return named;
  const seed = `${brandContext?.companyName ?? ""}|${topic}`;
  return DESTINATIONS[(hashString(seed) + feedIndex) % DESTINATIONS.length];
};

export const buildVisualBrief = (input: {
  topic: string;
  brandContext?: BrandContext;
  format?: PostFormat;
  motif?: VisualMotif;
  feedIndex?: number;
}): VisualBrief => {
  const world = detectVisualWorld(input.brandContext, input.topic);
  const companyName = input.brandContext?.companyName ?? "bedriften";
  const motif = input.motif ?? "people";
  const motifScene = world === "travel"
    ? TRAVEL_MOTIF_SCENE[motif]
    : CUSTOMER_MOTIF_SCENE[motif];

  if (world === "travel") {
    const placeName = resolveTravelPlace(input.brandContext, input.topic, input.feedIndex ?? 0);
    const sceneLock = `Ferie- og hotelldestinasjonen ${placeName}: samme sted i alle bilder i denne serien`;
    return {
      world,
      placeName,
      sceneLock,
      subjectDirection: [
        `Reisebilde fra ${placeName}.`,
        motifScene,
        "Mennesker skal være tydelige i bildet. Vi selger følelsen av å være der, ikke bare arkitekturen.",
        "Fotorealistisk, naturlig lys, variert motiv. Ikke enda et tomt basseng i varmt filter.",
      ].join(" "),
      carouselAngles: [
        `Mennesker på ferie i ${placeName}: par, familie eller venner i forgrunnen.`,
        `Mat, frokost eller restaurant i ${placeName}, med gjester ved bordet.`,
        `Byliv, promenade eller aktivitet i ${placeName}, med mennesker som går eller gjør noe.`,
        `Strand, utsikt eller rom i ${placeName}, med en person som opplever stedet.`,
      ],
      bans: TRAVEL_BANS,
    };
  }

  if (world === "food") {
    const sceneLock = `Samme restaurant-/matmiljø for ${companyName}: samme lokale, samme belysning og samme bordsetting`;
    return {
      world,
      placeName: null,
      sceneLock,
      subjectDirection: [
        "Mat- og restaurantfotografi med mennesker synlige.",
        motifScene,
        "Ingen kontor og ingen laptop.",
      ].join(" "),
      carouselAngles: [
        "Gjester ved bordet i samme lokale.",
        "Rett og mennesker i samme lokale.",
        "Kjøkken eller servering med mennesker i samme lokale.",
      ],
      bans: GENERIC_BANS,
    };
  }

  if (world === "craft") {
    const sceneLock = `Samme arbeidsplass ute i felt for ${companyName}: bygg, verksted eller anlegg — ikke kontor`;
    return {
      world,
      placeName: null,
      sceneLock,
      subjectDirection: [
        "Vis faget i praksis, med mennesker som gjør jobben.",
        motifScene,
        "Ingen person ved PC.",
      ].join(" "),
      carouselAngles: [
        "Mennesker i arbeid, oversikt i samme miljø.",
        "Nærbilde av håndverk med hender og materialer i samme miljø.",
        "Ferdig resultat med menneskene som gjorde jobben, samme miljø.",
      ],
      bans: GENERIC_BANS,
    };
  }

  const products = (input.brandContext?.products ?? []).slice(0, 4).join(", ");
  const sceneLock = `Samme virkelige miljø som ${companyName} opererer i${products ? ` (knyttet til ${products})` : ""}`;
  return {
    world,
    placeName: null,
    sceneLock,
    subjectDirection: [
      motifScene,
      "Mennesker skal være tydelige i bildet. Vis kundens situasjon, ikke en annonse for produktet.",
      formatDirectionFallback(input.format),
      products ? `Kontekst: ${products}.` : null,
      input.brandContext?.industry
        ? `Bransje: ${input.brandContext.industry}. Miljøet skal speile bransjen, ikke et generisk kontor.`
        : "Miljøet skal speile det kunden opplever, ikke et generisk kontor.",
    ]
      .filter(Boolean)
      .join(" "),
    carouselAngles: [
      "Samme sted, mennesker i situasjonen.",
      "Samme sted, nærdetalj av det kunden faktisk får.",
      "Samme sted, miljø og stemning rundt menneskene.",
    ],
    bans: GENERIC_BANS,
  };
};

export const buildCarouselVariantPrompt = (
  basePrompt: string,
  brief: VisualBrief,
  index: number,
): string => {
  const angle = brief.carouselAngles[index % brief.carouselAngles.length];
  return [
    basePrompt,
    "",
    "KARUSELL-KONSISTENS (UFRAVIKELIG):",
    `Alle slides viser SAMME sted: ${brief.sceneLock}.`,
    "Ikke bytt land, by, hotell, sesong eller belysning mellom bildene.",
    `Dette bildet: ${angle}`,
    "Behold samme fargepalett, samme tid på dagen og samme destinasjon.",
  ].join("\n");
};
