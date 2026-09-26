import type { BrandRules } from "@/lib/ai/brandRules";
import type { VisualMotif } from "@/lib/ai/postStrategy";
import { buildVisualBrief } from "@/lib/ai/visualDirection";
import type { BrandContext, MediaMode, PostFormat } from "@/lib/types";

type ImagePromptInput = {
  topic: string;
  channel: "facebook" | "instagram" | "linkedin" | "tiktok";
  mediaMode: MediaMode;
  brandRules: BrandRules;
  brandContext?: BrandContext;
  imageDirection?: string;
  format?: PostFormat;
  visualMotif?: VisualMotif;
  feedIndex?: number;
  reelScript?: boolean;
};

const CHANNEL_SPEC: Record<ImagePromptInput["channel"], { format: string; style: string }> = {
  instagram: {
    format: "Kvadratisk (1:1) eller portrett (4:5). Tett motiv med tydelig fokuspunkt.",
    style: "Visuelt sterkt og variert. Mennesker og situasjon skal stoppe scroll. Ikke samme motiv om igjen.",
  },
  facebook: {
    format: "Landskap (16:9 eller 1.91:1). Romslig komposisjon med luft rundt motivet.",
    style: "Vennlig, troverdig og lettfattelig. Naturlig lys og ekte situasjoner.",
  },
  linkedin: {
    format: "Landskap (1.91:1) eller kvadratisk (1:1). Ryddig og profesjonell komposisjon.",
    style: "Seriost, faglig og tillitvekkende. Unnga klisjeer og overdramatisering.",
  },
  tiktok: {
    format: "Portrett (9:16). Fullt vertikalt format for mobilvisning.",
    style: "Dynamisk, fengende og autentisk. Passer som thumbnail eller videostillbilde.",
  },
};

const TONE_TO_VISUAL: Record<string, string> = {
  profesjonell: "Noytral fargepalett, ren komposisjon, naturlig lyssetting.",
  varm: "Varme jordtoner, mykt lys, menneskelig naervaer.",
  energisk: "Hoyere kontrast, dynamisk komposisjon, aktivt motiv.",
  noytral: "Balansert lys og farger, tydelig men rolig uttrykk.",
  innovativ: "Moderne, minimalistisk og teknologisk preg med rene linjer.",
  tillitvekkende: "Jordnaere farger, aapent kroppssprak, naturlig dagslys.",
};

const MEDIA_MODE_SPEC: Record<MediaMode, string> = {
  ai_only: "Generer et nytt, fotorealistisk bilde med hoy kvalitet.",
  hybrid: "Generer et nytt bilde som visuelt matcher brukerens eksisterende bildebank og brand.",
  owned_only: "Generer et reservebilde kun dersom det absolutt kreves teknisk. Ellers hold uttrykket tett pa brukerens egne bilder.",
};

const FORMAT_SPEC: Partial<Record<PostFormat, string>> = {
  insight: "Tydelig hovedmotiv fra det bedriften faktisk leverer.",
  tip: "Konkret handling i relevant miljo, uten skrivebord.",
  question: "Motiv som inviterer til lengsel eller dialog, ikke et kontorportrett.",
  behind_the_scenes: "Ekte situasjon fra leveransen ute i felt, kjokken, hotell eller verksted.",
  case_study: "Resultat eller opplevelse i ekte setting.",
  fact: "Noytralt og tydelig informasjonsmotiv uten visuell stoy.",
  how_to: "Handling i det relevante miljoeet, uten laptop-scene.",
  myth_busting: "Vis kontrast i virkelige omgivelser, ikke i et mote-rom.",
  opinion: "Tydelig karakter i et miljo som matcher bransjen.",
};

export const buildImagePrompt = (input: ImagePromptInput): string => {
  const ctx = input.brandContext ?? {};
  const companyName = ctx.companyName ?? "bedriften";
  const contextParts = [`Bedrift: ${companyName}.`];
  if (ctx.industry) {
    contextParts.push(`Bransje: ${ctx.industry}.`);
  }
  if (ctx.companyDescription) {
    contextParts.push(`Beskrivelse: ${ctx.companyDescription}.`);
  }
  if (ctx.products && ctx.products.length > 0) {
    contextParts.push(`Produkter/tjenester: ${ctx.products.join(", ")}.`);
  }

  const visualBrief = buildVisualBrief({
    topic: input.topic,
    brandContext: ctx,
    format: input.format,
    motif: input.visualMotif,
    feedIndex: input.feedIndex,
  });
  const channelSpec = input.reelScript
    ? {
        format: "Portrett 9:16 reel. Vertikalt mobilformat. Motivet skal fungere som åpning uten logo.",
        style: "Rask, tydelig og menneskelig. Første bilde er hooken.",
      }
    : CHANNEL_SPEC[input.channel];
  const toneKey = input.brandRules.toneOfVoice.toLowerCase().replaceAll("æ", "ae").replaceAll("ø", "o").replaceAll("å", "a");
  const visualTone = TONE_TO_VISUAL[toneKey] ?? `Visuell stil skal folge tonen: ${input.brandRules.toneOfVoice}.`;
  const mediaModeSpec = MEDIA_MODE_SPEC[input.mediaMode];
  const formatSpec = input.format ? FORMAT_SPEC[input.format] : undefined;

  const sections: string[] = [];

  sections.push(
    [
      `Lag et profesjonelt bilde for en norsk bedriftspost pa ${input.channel}.`,
      mediaModeSpec,
    ].join(" "),
  );

  sections.push(["BEDRIFTSKONTEKST:", ...contextParts].join("\n"));

  sections.push(
    [
      "TEMA OG MALGRUPPE:",
      `Tema: ${input.topic}.`,
      `Malgruppe: ${input.brandRules.targetAudience}.`,
    ].join("\n"),
  );

  const channelBlock = [
    "KANAL OG FORMAT:",
    `Kanal: ${input.channel}.`,
    `Bildeformat: ${channelSpec.format}`,
    `Kanalstil: ${channelSpec.style}`,
  ];
  if (formatSpec) {
    channelBlock.push(`Postformat: ${formatSpec}`);
  }
  sections.push(channelBlock.join("\n"));

  sections.push(
    [
      "VISUELL STIL:",
      `Tone: ${visualTone}`,
      `Hovedretning: ${visualBrief.subjectDirection}`,
      input.imageDirection ? `Formatretning: ${input.imageDirection}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push(
    [
      "STEDLÅS (UFRAVIKELIG):",
      visualBrief.sceneLock,
      visualBrief.placeName
        ? `Destinasjonen er ${visualBrief.placeName}. Alle motiver skal vaere der, ikke et tilfeldig annet sted.`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push(
    [
      "OBLIGATORISKE KRAV:",
      `- Temaet "${input.topic}" skal vaere eksplisitt og tydelig i motivet, ikke et tilgrensende konsept.`,
      "- Motivet skal vise kundens opplevelse eller situasjon. Ikke en annonse for bedriften.",
      "- Mennesker skal være tydelige når motivretningen ber om det. Ikke bare tom arkitektur.",
      "- Varier uttrykket. Ikke et generisk stockbilde som kunne vært for en hvilken som helst bedrift.",
      "- Profesjonell kvalitet: naturlig lys, ren komposisjon, realistiske proporsjoner.",
      "- Ingen AI-artefakter: ingen deformerte hender/ansikter eller unaturlige proporsjoner.",
      "- Ingen overmettet farge, neon, fantasy eller kitsch.",
      "- Bildet skal kommunisere en tydelig ide.",
      "- FOKUSLAS: Ikke tolk temaet bredt. Bruk eksakt semantikk fra tema og bedriftskontekst.",
      "- FORBUDT:",
      ...visualBrief.bans.map((ban) => `  - ${ban}`),
    ].join("\n"),
  );

  sections.push(
    [
      "ABSOLUTT INGEN TEKST I BILDET:",
      "- Bildet skal IKKE inneholde noen form for tekst, bokstaver, ord, tall eller typografi.",
      "- Ingen firmanavn, ingen slagord, ingen overskrifter, ingen vannmerker med tekst.",
      "- Hvis det er skilt, plakater eller skjermer i scenen, skal de vaere uten lesbar tekst.",
      "- Dette kravet er UFRAVIKELIG. Ethvert bilde med synlig tekst er feil.",
      "- Logoen legges pa programmatisk etterpaa — IKKE tegn den inn i bildet.",
    ].join("\n"),
  );

  const brandingLines = [
    "VISUELL BRANDING:",
    "- Formidle brand gjennom farger, miljo, klaer, rekvisitter og lyssetting.",
    "- Ren komposisjon med tydelig hovedmotiv.",
  ];

  if (ctx.brandColors) {
    const colorParts: string[] = [];
    if (ctx.brandColors.primary) colorParts.push(`primaer ${ctx.brandColors.primary}`);
    if (ctx.brandColors.secondary) colorParts.push(`sekundaer ${ctx.brandColors.secondary}`);
    if (ctx.brandColors.accent) colorParts.push(`aksent ${ctx.brandColors.accent}`);
    if (colorParts.length > 0) {
      brandingLines.push(`- Bedriftens merkevarefarger: ${colorParts.join(", ")}. Bruk disse som referanse for fargepalett i bildet — integrer subtilt i miljo, klaer, rekvisitter eller bakgrunn.`);
    }
  }

  sections.push(brandingLines.join("\n"));

  return sections.join("\n\n");
};
