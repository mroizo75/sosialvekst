import type { BrandRules } from "@/lib/ai/brandRules";
import { buildBrandSkill } from "@/lib/ai/brandSkillBuilder";
import { norwegianStyleGuide } from "@/lib/ai/norwegianStyleGuide";
import type { ContentPillar } from "@/lib/ai/postStrategy";
import { buildSystemContext } from "@/lib/ai/systemPrompt";
import type { BrandContext, PostFormat, PostIntent, SocialChannel } from "@/lib/types";

export type CopyVisual = {
  placeName: string | null;
  scene: string;
  overlayTitle: string;
  overlaySubline: string;
};

type CopyPromptInput = {
  topic: string;
  channel: SocialChannel;
  brandRules: BrandRules;
  brandContext?: BrandContext;
  intent?: PostIntent;
  format?: PostFormat;
  ctaType?: string;
  contentPillar?: ContentPillar;
  reelScript?: boolean;
  visual?: CopyVisual;
};

type StructuredPrompt = {
  system: string;
  user: string;
};

const PILLAR_INSTRUCTIONS: Record<ContentPillar, string> = {
  inspiration: "Søyle: inspirasjon. Skap lyst, stemning eller gjenkjennelse. Produktet kan komme etter hooken, eller droppes.",
  useful: "Søyle: nyttig. Hjelp leseren å velge. Guide, sammenligning, sesong eller konkrete tips. Merkevaren er ikke poenget.",
  commercial: "Søyle: kommersielt. Vis en konkret mulighet, et sted, et tilbud eller hva man faktisk får. Selg utfallet, ikke funksjonene.",
  trust: "Søyle: tillit. Forklar hvem som står bak eller hvordan det fungerer, kort og uten brosjyrespråk. Merkenavn kan brukes her, aldri som åpning.",
};

const INTENT_INSTRUCTIONS: Record<PostIntent, string> = {
  brand_awareness: "Bygg gjenkjennelse gjennom noe leseren har nytte av, ikke gjennom å forklare selskapet.",
  traffic: "Gi en grunn til å se nærmere. Lenken kommer til slutt, etter verdien.",
  engagement: "Be om et konkret valg eller svar som passer innholdet, eller at leseren lagrer innlegget.",
  lead_generation: "Gjør neste steg tydelig, men bare etter at innlegget har gitt noe.",
  authority: "Lær bort noe konkret leseren kan bruke i en beslutning.",
  community: "Snakk med leseren. Inviter til et svar, ikke til en kampanje.",
};

const FORMAT_INSTRUCTIONS: Record<PostFormat, string> = {
  insight: "Format: Én konkret observasjon leseren ikke får fra en annonse.",
  tip: "Format: Ett tips som kan brukes med en gang.",
  question: "Format: Et ekte valg eller spørsmål, ikke et retorisk salgsspørsmål.",
  case_study: "Format: Bruk bare en kundehistorie som står i bedriftskonteksten. Hvis ingen finnes, skriv et tips i stedet. Ikke dikte.",
  how_to: "Format: 2–3 korte punkter som hjelper et valg. Ikke en lang bruksanvisning for tjenesten.",
  fact: "Format: Ett konkret faktum eller eksempel, og hva det betyr for leseren.",
  behind_the_scenes: "Format: Vis hvordan det faktisk fungerer, kort. Ikke en firmapresentasjon.",
  myth_busting: "Format: En vanlig misforståelse, og det som faktisk stemmer. Uten udokumenterte tall.",
  opinion: "Format: Et tydelig standpunkt leseren kan være enig eller uenig i.",
};

const buildStandardSystemRules = (
  companyName: string,
  prohibitedTerms: string[],
  includeWebsite: boolean,
  websiteUrl: string | undefined,
): string[] => [
  "UFRAVIKELIGE REGLER:",
  "1. Skriv for noen som ikke kjenner merkevaren. Første 1–2 linjer skal stoppe scrolling.",
  "2. Start med kundens situasjon, sted, valg eller følelse. Ikke med bedriften, produktet eller en funksjon. Ikke åpne med et spørsmål. Åpne med en konkret observasjon, et sted eller en detalj fra bildet.",
  `3. «${companyName}» kan nevnes etter at interessen er skapt, bare når det faller naturlig. Aldri i åpningen, og ikke i hvert innlegg.`,
  "4. Selg utfallet kunden vil ha. Ikke søk, plattform, utvalg, kundeservice eller bookingfunksjoner.",
  "5. Skriv ALLTID på korrekt bokmål. Menneskelig, direkte, varmt og konkret.",
  "6. Ikke bruk annonsespråk som kunne stått hos hvem som helst i bransjen.",
  "7. CTA skal passe akkurat dette innlegget. Ikke «kontakt oss», «les mer» eller «gjør det enklere».",
  `8. Forbudte uttrykk: ${prohibitedTerms.join(", ")}.`,
  "9. Ikke finn på kundehistorier, sitater, prosenter, «best pris» eller «billigere enn andre». Bruk bare historier som står i bedriftskonteksten.",
  includeWebsite && websiteUrl
    ? `10. Ta med denne lenken én gang til slutt, uten å skrive «Les mer»: ${websiteUrl}`
    : "10. Ikke ta med nettadresse. Avslutt med et konkret spørsmål om innholdet. Aldri «send dette til», «tagg en venn», «del med» eller lignende.",
  "11. Hashtags er ikke strategien. Maks 3 konkrete tags, eller ingen.",
  "12. Siste setning før hashtags skal være komplett. Hashtags står alene på egen linje, uten tegnsetting.",
  "13. Et merkenavn som signatur («Er du …?») bare når det høres naturlig ut. Aldri som første linje.",
  "14. Ikke skriv om søk, sammenligning, antall hoteller eller antall land med mindre søylen er commercial eller trust.",
];

const buildTikTokSystemRules = (companyName: string, prohibitedTerms: string[]): string[] => [
  "TIKTOK-REGLER (caption til kort video, ikke et innlegg):",
  "1. Hook i første setning. Ingen logo og ingen intro. Ikke åpne med et spørsmål. Åpne med en konkret observasjon, et sted eller en detalj fra bildet.",
  `2. ${companyName} kan nevnes hvis det faller naturlig. Det er ikke påkrevd.`,
  "3. Skriv ALLTID på korrekt bokmål. 8–30 ord før eventuelle hashtags.",
  "4. ALDRI nettadresser.",
  "5. Ingen salgs-CTA. Avslutt med et konkret spørsmål om innholdet. Aldri «send dette til», «tagg en venn», «del med» eller lignende.",
  `6. Forbudte uttrykk: ${prohibitedTerms.join(", ")}.`,
  "7. Ikke finn på kundehistorier eller udokumenterte påstander.",
  "8. Siste setning før hashtags skal være komplett. Hashtags står alene på egen linje, uten tegnsetting. Maks 3.",
  "9. Ikke skriv om søk, sammenligning, antall hoteller eller antall land med mindre søylen er commercial eller trust.",
];

const visualLines = (visual?: CopyVisual): string[] => {
  if (!visual) return [];
  const place = visual.placeName ?? "ikke et navngitt sted";
  return [
    "BILDE OG OVERLAY (teksten skal passe dette, ikke noe annet):",
    `Sted: ${place}.`,
    `Scene: ${visual.scene}`,
    `Overlay-tittel: ${visual.overlayTitle}`,
    `Overlay-undertekst: ${visual.overlaySubline}`,
    "Nevn stedet hvis det finnes. Beskriv bare det scenen viser. Ikke motsi tittelen eller underteksten.",
    "",
  ];
};

const buildStandardUserPrompt = (
  input: CopyPromptInput,
  companyName: string,
  websiteUrl: string | undefined,
  intent: PostIntent,
  format: PostFormat,
  pillar: ContentPillar,
): string[] => {
  const includeWebsite = pillar === "commercial" || pillar === "trust";
  const lines = [
    ...visualLines(input.visual),
    `Skriv en organisk SoMe-post for ${input.channel}.`,
    `Tema: ${input.topic}.`,
    `Bedrift i bakgrunnen: ${companyName}. Innlegget skal ikke høres ut som en annonse for dem.`,
    "",
    "SØYLE:",
    PILLAR_INSTRUCTIONS[pillar],
    "",
    "INTENSJON:",
    INTENT_INSTRUCTIONS[intent],
    "",
    "FORMAT:",
    FORMAT_INSTRUCTIONS[format],
    "",
    `Målgruppe: ${input.brandRules.targetAudience}.`,
    `Skrivestil: menneskelig, direkte og varm. Utgangspunkt: ${input.brandRules.toneOfVoice}.`,
    "",
    `CTA-RETNING: ${input.ctaType ?? "Et konkret valg eller svar som passer innholdet, eller at leseren lagrer innlegget."}`,
    "",
  ];

  if (input.reelScript) {
    lines.push(
      "REEL-MANUS:",
      "- Første linje er hooken. Ingen logo, ingen velkomst, ingen forklaring av tjenesten.",
      "- Deretter 2–3 korte punkter som hjelper et valg eller bygger lyst.",
      "- Avslutt med et spørsmål.",
      "- Skriv teksten folk leser. Ikke kamerainstruks, ikke «scene 1».",
      "",
    );
  }

  lines.push(
    "KRAV TIL OUTPUT:",
    "- Hook i de første 1–2 linjene, om kundens verden.",
    "- Gi leseren en grunn til å se ferdig, lagre, dele eller svare.",
    "- Produktet kommer naturlig etterpå, eller uteblir.",
    includeWebsite && websiteUrl
      ? `- Én lenke til slutt, uten «Les mer»: ${websiteUrl}`
      : "- Ingen nettadresse.",
    "- 0–3 hashtags.",
    "- Luft mellom avsnitt på Facebook og Instagram.",
    "- Lever KUN postteksten. Ingen forklaringer eller metadata.",
  );

  return lines;
};

const buildTikTokUserPrompt = (
  input: CopyPromptInput,
  companyName: string,
  intent: PostIntent,
  format: PostFormat,
  pillar: ContentPillar,
): string[] => [
  ...visualLines(input.visual),
  "Skriv en KORT videocaption for TikTok.",
  `Tema: ${input.topic}.`,
  `Bedrift i bakgrunnen: ${companyName}.`,
  "",
  "SØYLE:",
  PILLAR_INSTRUCTIONS[pillar],
  "",
  "INTENSJON:",
  INTENT_INSTRUCTIONS[intent],
  "",
  "FORMAT:",
  FORMAT_INSTRUCTIONS[format],
  "",
  `Målgruppe: ${input.brandRules.targetAudience}.`,
  "",
  input.reelScript
    ? "Hook først. Deretter maks ett kort poeng. Avslutt gjerne med et spørsmål. Ingen intro."
    : "Første setning er hooken.",
  "",
  "KRAV TIL OUTPUT:",
  "- 8–30 ord før hashtags.",
  "- INGEN nettadresser.",
  "- 0–3 hashtags.",
  "- Lever KUN captionen.",
];

export const buildNorwegianCopyPrompt = (input: CopyPromptInput): StructuredPrompt => {
  const brandContext = input.brandContext ?? {};
  const companyName = brandContext.companyName ?? "bedriften";
  const websiteUrl = brandContext.websiteUrl?.trim();
  const intent = input.intent ?? "brand_awareness";
  const format = input.format ?? "tip";
  const pillar = input.contentPillar ?? "inspiration";
  const includeWebsite = pillar === "commercial" || pillar === "trust";
  const channelRules = norwegianStyleGuide.channelSpecific[input.channel] ?? [];
  const brandDosAndDonts = brandContext.brandDosAndDonts?.trim();
  const isTikTok = input.channel === "tiktok";

  const systemLines = [
    "Du er en norsk SoMe-redaktør. Du lager innhold folk vil se ferdig, lagre, dele eller svare på.",
    "Du lager ikke annonser som forklarer en tjeneste.",
    "",
    ...(isTikTok
      ? buildTikTokSystemRules(companyName, input.brandRules.prohibitedTerms)
      : buildStandardSystemRules(companyName, input.brandRules.prohibitedTerms, includeWebsite, websiteUrl)),
    "",
    "KVALITETSSJEKK FØR DU LEVERER:",
    ...norwegianStyleGuide.antiGeneric.map((rule, i) => `${i + 1}. ${rule}`),
    "",
    "SPRÅK:",
    ...norwegianStyleGuide.grammar,
    "",
    "TONE:",
    ...norwegianStyleGuide.tone,
    "",
    ...(isTikTok ? [] : ["STRUKTUR:", ...norwegianStyleGuide.structure, ""]),
    `KANAL: ${input.channel.toUpperCase()}`,
    ...channelRules,
    "",
    `Tilpass lengde og rytme til ${input.channel}. Ikke skriv en tekst som kunne ligget uendret på en annen plattform.`,
    ...(brandDosAndDonts ? ["", "BEDRIFTENS EGNE RETNINGSLINJER:", brandDosAndDonts] : []),
    "",
    buildBrandSkill(brandContext),
    "",
    "BAKGRUNN OM BEDRIFTEN (brukes som fakta, ikke som manus):",
    buildSystemContext(brandContext),
  ];

  const userLines = isTikTok
    ? buildTikTokUserPrompt(input, companyName, intent, format, pillar)
    : buildStandardUserPrompt(input, companyName, websiteUrl, intent, format, pillar);

  return {
    system: systemLines.join("\n"),
    user: userLines.join("\n"),
  };
};
