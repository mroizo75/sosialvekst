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
];

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

const pickStableDestination = (brandContext?: BrandContext, topic = ""): string => {
  const named = extractDestination(brandContext, topic);
  if (named) return named;
  const seed = `${brandContext?.companyName ?? ""}|${topic}`;
  return DESTINATIONS[hashString(seed) % DESTINATIONS.length];
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

export const buildVisualBrief = (input: {
  topic: string;
  brandContext?: BrandContext;
  format?: PostFormat;
}): VisualBrief => {
  const world = detectVisualWorld(input.brandContext, input.topic);
  const companyName = input.brandContext?.companyName ?? "bedriften";

  if (world === "travel") {
    const placeName = pickStableDestination(input.brandContext, input.topic);
    const sceneLock = `Ferie- og hotelldestinasjonen ${placeName}: samme by, samme kystlinje, samme lys og arkitektur i alle bilder`;
    return {
      world,
      placeName,
      sceneLock,
      subjectDirection: [
        `Reise- og hotellfotografi fra ${placeName}.`,
        "Vis det reisende faktisk lengter etter: strand, gammelby, havn, hotellterrasse, basseng eller solnedgang.",
        `Bildet skal få folk til å ville booke ferie til ${placeName} via ${companyName}.`,
        "Fotorealistisk reisebilde i magasin-kvalitet, naturlig gyllent lys.",
        "Mennesker kun som feriegjester i det fjerne hvis i det hele tatt — aldri som kontorarbeidere.",
      ].join(" "),
      carouselAngles: [
        `Vidt etablerende landskapsbilde av ${placeName} i gyllent lys (strand, havn eller gammelby).`,
        `Hotellbasseng, terrasse eller boutique-fasade på samme sted i ${placeName}.`,
        `Lokal stemning på samme sted: promenade, kaféterrasse eller smal gate i ${placeName}.`,
        `Nærdetalj fra samme destinasjon: turkis sjø, steinmur, palmer eller solnedgang over ${placeName}.`,
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
      subjectDirection:
        "Mat- og restaurantfotografi. Rett, dampedamping, råvarer eller dekkede bord. Ingen kontor og ingen laptop.",
      carouselAngles: [
        "Hero-rett i nærbilde, samme lokale.",
        "Råvarer eller tilberedning i samme kjøkken.",
        "Dekket bord eller servering i samme spisesal.",
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
      subjectDirection:
        "Vis faget i praksis: verktøy, materialer, ferdige flater, anlegg eller verksted. Ingen person ved PC.",
      carouselAngles: [
        "Oversiktsbilde av jobben i samme miljø.",
        "Nærbilde av håndverk/detalj i samme miljø.",
        "Resultat eller ferdig flate i samme miljø.",
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
      formatDirectionFallback(input.format),
      products ? `Vis produktene/tjenestene: ${products}.` : null,
      input.brandContext?.industry
        ? `Bransje: ${input.brandContext.industry}. Miljøet skal speile bransjen, ikke et generisk kontor.`
        : "Miljøet skal speile det bedriften selger, ikke et generisk kontor.",
    ]
      .filter(Boolean)
      .join(" "),
    carouselAngles: [
      "Samme sted, etablerende oversiktsbilde.",
      "Samme sted, nærmere detaljer av hovedmotivet.",
      "Samme sted, atmosfære og omgivelser rundt motivet.",
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
