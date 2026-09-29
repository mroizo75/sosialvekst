import type { BrandRules } from "@/lib/ai/brandRules";
import { buildBrandSkill } from "@/lib/ai/brandSkillBuilder";
import { norwegianStyleGuide } from "@/lib/ai/norwegianStyleGuide";
import { formatCopyExamples } from "@/lib/ai/copyExamples";
import type { ContentPillar } from "@/lib/ai/postStrategy";
import type { VisualWorld } from "@/lib/ai/visualDirection";
import { buildSystemContext } from "@/lib/ai/systemPrompt";
import type { BrandContext, PostFormat, PostIntent, SocialChannel } from "@/lib/types";

export type CopyVisual = {
  placeName: string | null;
  scene: string;
  overlayTitle: string;
  overlaySubline: string;
  slides?: { title: string; summary: string }[];
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
  visualWorld?: VisualWorld;
  rejectionReasons?: string[];
  avoidRepeating?: string[];
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

const buildCoreRules = (
  companyName: string,
  prohibitedTerms: string[],
  includeWebsite: boolean,
  websiteUrl: string | undefined,
  tiktok: boolean,
): string[] => {
  const rules = [
    "Skriv for noen som ikke kjenner merkevaren. Første 1–2 linjer skal stoppe scrolling. Ikke åpne med et spørsmål. Åpne med en konkret observasjon, et sted eller en detalj fra bildet.",
    `«${companyName}» kan nevnes etter at interessen er skapt, bare når det faller naturlig. Aldri i åpningen, og ikke i hvert innlegg.`,
    "Selg utfallet kunden vil ha. Ikke søk, plattform, utvalg, kundeservice eller bookingfunksjoner.",
    "Skriv på korrekt bokmål. Korte setninger, aktive verb og konkrete detaljer. Snakk til leseren med «du». Ikke bruk annonsespråk som kunne stått hos hvem som helst.",
    "CTA skal passe dette innlegget: et konkret valg-spørsmål, eller se utvalget. Aldri «kontakt oss», «les mer», «send dette til», «lagre denne» eller «tagg en».",
    "Ikke finn på kundehistorier, sitater, prosenter, «best pris» eller «billigere enn andre». Bruk bare historier som står i bedriftskonteksten.",
    tiktok || !includeWebsite || !websiteUrl
      ? "Ikke ta med nettadresse."
      : `Ta med denne lenken én gang til slutt, uten å skrive «Les mer»: ${websiteUrl}`,
    "Hashtags er ikke strategien. Maks 3 konkrete tags på egen linje, uten tegnsetting. Siste setning før hashtags skal være komplett.",
    "Ikke skriv om søk, sammenligning, antall hoteller eller antall land med mindre søylen er commercial eller trust.",
    "Innlegget skal tåle spørsmålet om hvorfor en fremmed stopper. Hvis svaret bare er at vi vil selge, skriv om.",
    "Verdi først: inspirer, lær bort, hjelp et valg, eller vis en konkret mulighet. Produkt og merkevare kommer etterpå, eller ikke i det hele tatt.",
    `Forbudte uttrykk: ${prohibitedTerms.join(", ")}.`,
  ];
  return rules.slice(0, 12);
};

const limitedBrandContext = (ctx: BrandContext): string => {
  const lines = [
    `Firmanavn: ${ctx.companyName ?? "bedriften"}`,
    ctx.industry ? `Bransje: ${ctx.industry}` : "",
    ctx.targetAudience ? `Målgruppe: ${ctx.targetAudience}` : "",
  ].filter(Boolean);
  return lines.join("\n");
};

const slideLines = (slides?: CopyVisual["slides"]): string[] => {
  if (!slides?.length) return [];
  return [
    "KARUSELLEN (leseren sveiper gjennom disse):",
    ...slides.map((slide, index) => `${index + 1}. ${slide.title}: ${slide.summary}`),
    "Posteksten skal bygge videre på forsiden og gi mer forklaring enn slidene. Ikke kopier slide-tekstene ordrett.",
    "Første linje skal matche forsidetittelen, men med egne ord. Få gjerne med ett konkret poeng per slide.",
  ];
};

const visualLines = (visual?: CopyVisual): string[] => {
  if (!visual) return [];
  const place = visual.placeName ?? "ikke et navngitt sted";
  return [
    "BILDE OG OVERLAY (teksten skal passe dette, ikke noe annet):",
    `Sted: ${place}.`,
    `Scene: ${visual.scene}`,
    `Overlay-tittel: ${visual.overlayTitle}`,
    `Overlay-undertekst: ${visual.overlaySubline}`,
    ...slideLines(visual.slides),
    "Ikke skriv fotografkreditt. Den settes inn etter hashtags.",
    "Nevn stedet hvis det finnes. Beskriv bare det bildene viser. Ikke motsi tittelen eller underteksten.",
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
    `CTA-RETNING: ${input.ctaType ?? "Et konkret valg eller svar som passer innholdet."}`,
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
    "- Gi leseren en grunn til å lese ferdig eller svare.",
    "- Produktet kommer naturlig etterpå, eller uteblir.",
    includeWebsite && websiteUrl
      ? `- Én lenke til slutt, uten «Les mer»: ${websiteUrl}`
      : "- Ingen nettadresse.",
    "- 0–3 hashtags.",
    "- Luft mellom avsnitt på Facebook og Instagram.",
    "- Lever KUN postteksten. Ingen forklaringer eller metadata.",
  );

  if (input.avoidRepeating?.length) {
    lines.push("", "Ikke gjenta disse:", ...input.avoidRepeating.slice(-5));
  }
  if (input.rejectionReasons?.length) {
    lines.push("", `Forrige utkast ble avvist fordi: ${input.rejectionReasons.join(" ")}`);
  }

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
  ...(input.avoidRepeating?.length
    ? ["", "Ikke gjenta disse:", ...input.avoidRepeating.slice(-5)]
    : []),
  ...(input.rejectionReasons?.length
    ? ["", `Forrige utkast ble avvist fordi: ${input.rejectionReasons.join(" ")}`]
    : []),
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
    "Du er en norsk SoMe-redaktør. Du lager innhold folk vil lese ferdig eller svare på.",
    "Du lager ikke annonser som forklarer en tjeneste.",
    "",
    "REGLER:",
    ...buildCoreRules(
      companyName,
      input.brandRules.prohibitedTerms,
      includeWebsite,
      websiteUrl,
      isTikTok,
    ).map((rule, index) => `${index + 1}. ${rule}`),
    "",
    formatCopyExamples(pillar, input.visualWorld),
    "",
    `KANAL: ${input.channel.toUpperCase()}`,
    ...channelRules,
    "",
    `Tilpass lengde og rytme til ${input.channel}. Ikke skriv en tekst som kunne ligget uendret på en annen plattform.`,
    ...(brandDosAndDonts ? ["", "BEDRIFTENS EGNE RETNINGSLINJER:", brandDosAndDonts] : []),
    "",
    buildBrandSkill(brandContext),
    "",
    "BAKGRUNN OM BEDRIFTEN (brukes som fakta, ikke som manus):",
    includeWebsite ? buildSystemContext(brandContext) : limitedBrandContext(brandContext),
  ];

  const userLines = isTikTok
    ? buildTikTokUserPrompt(input, companyName, intent, format, pillar)
    : buildStandardUserPrompt(input, companyName, websiteUrl, intent, format, pillar);

  return {
    system: systemLines.join("\n"),
    user: userLines.join("\n"),
  };
};
