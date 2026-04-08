import type { BrandRules } from "@/lib/ai/brandRules";
import type { BrandContext, MediaMode, PostFormat } from "@/lib/types";

export type ImageBrandMode = "clean" | "branded" | "text";

type ImagePromptInput = {
  topic: string;
  channel: "facebook" | "instagram" | "linkedin" | "tiktok";
  mediaMode: MediaMode;
  brandRules: BrandRules;
  brandContext?: BrandContext;
  imageDirection?: string;
  format?: PostFormat;
  brandMode?: ImageBrandMode;
};

const CHANNEL_SPEC: Record<ImagePromptInput["channel"], { format: string; style: string }> = {
  instagram: {
    format: "Kvadratisk (1:1) eller portrett (4:5). Tett motiv med tydelig fokuspunkt.",
    style: "Visuelt sterkt, moderne og engasjerende. Hovedmotiv skal stoppe scroll.",
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
  insight: "Kommuniser innsikt med tydelig hovedmotiv og profesjonell kontekst.",
  tip: "Vis konkret handling eller praksisnaert scenario med klar nytteverdi.",
  question: "Lag et motiv som inviterer til refleksjon og dialog.",
  behind_the_scenes: "Autentisk arbeidsmiljo med ekte situasjon i fokus.",
  case_study: "Resultat- eller leveranseorientert motiv med konkret faglig relevans.",
  fact: "Noytralt og tydelig informasjonsmotiv uten visuell stoy.",
  how_to: "Trinnvis eller instruktivt preg med klar handling i bildet.",
  myth_busting: "Vis kontrast mellom feil praksis og korrekt praksis pa en troverdig mate.",
  opinion: "Tydelig standpunkt visuelt, men fortsatt profesjonelt og saklig uttrykk.",
};

export const buildImagePrompt = (input: ImagePromptInput): string => {
  const ctx = input.brandContext ?? {};
  const companyName = ctx.companyName ?? "bedriften";
  const contextParts = [`Bedrift: ${companyName}.`];
  if (ctx.companyDescription) {
    contextParts.push(`Bransje/beskrivelse: ${ctx.companyDescription}.`);
  }
  if (ctx.products && ctx.products.length > 0) {
    contextParts.push(`Produkter/tjenester: ${ctx.products.join(", ")}.`);
  }

  const channelSpec = CHANNEL_SPEC[input.channel];
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
      input.imageDirection ? `Retning: ${input.imageDirection}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push(
    [
      "OBLIGATORISKE KRAV:",
      `- Temaet "${input.topic}" skal vaere eksplisitt og tydelig i motivet, ikke et tilgrensende konsept.`,
      `- Motivet skal kommunisere direkte hva ${companyName} driver med. Ingen generiske stockbilder.`,
      "- Profesjonell kvalitet: naturlig lys, ren komposisjon, realistiske proporsjoner.",
      "- Ingen AI-artefakter: ingen deformerte hender/ansikter eller unaturlige proporsjoner.",
      "- Ingen overmettet farge, neon, fantasy eller kitsch.",
      "- Bildet skal kommunisere en tydelig ide.",
      "- FOKUSLAS: Ikke tolk temaet bredt. Bruk eksakt semantikk fra tema og bedriftskontekst.",
    ].join("\n"),
  );

  const brandMode = input.brandMode ?? "clean";

  if (brandMode === "branded") {
    sections.push(
      [
        "LOGO-INTEGRERING (VIKTIG):",
        "- Et referansebilde av bedriftens logo er vedlagt.",
        "- Integrer denne logoen NATURLIG i scenen — pa et av disse stedene:",
        "  * Brodert eller trykket pa arbeidsklaer, uniform eller hjelm",
        "  * Pa utstyr, verktoey, kjoeretoey eller materialer i bruk",
        "  * Pa et skilt, vegg, doer eller banner i bakgrunnen",
        "  * Pa en skjerm, dokument, emballasje eller fasade i scenen",
        "- Logoen skal se ut som den HOERER HJEMME der — ikke klistret pa.",
        "- Behold logoens farger og proporsjoner noyaktig som i referansebildet.",
        "- Logoen trenger ikke vaere dominant, men skal vaere gjenkjennbar.",
        "- INGEN annen tekst i bildet utover logoen selv.",
      ].join("\n"),
    );
  } else if (brandMode === "text") {
    sections.push(
      [
        "TEKST I BILDET:",
        `- Du KAN inkludere firmanavnet "${companyName}" som kort, ren tekst i bildet.`,
        "- Maks 1-2 ord. Tydelig, lesbar skrifttype. Godt plassert i komposisjonen.",
        "- Teksten skal vaere en naturlig del av designet, ikke et paaklistret element.",
        "- INGEN andre ord, setninger, slagord eller tilfeldig tekst — kun firmanavnet.",
        "- Hvis korrekt tekstgjengivelse er usikkert: dropp teksten helt.",
      ].join("\n"),
    );
  } else {
    sections.push(
      [
        "ABSOLUTT INGEN TEKST I BILDET:",
        "- Bildet skal IKKE inneholde noen form for tekst, bokstaver, ord, tall eller typografi.",
        "- Ingen firmanavn, ingen slagord, ingen overskrifter, ingen vannmerker med tekst.",
        "- Hvis det er skilt, plakater eller skjermer i scenen, skal de vaere uten lesbar tekst.",
        "- Dette kravet er UFRAVIKELIG. Ethvert bilde med synlig tekst er feil.",
      ].join("\n"),
    );
  }

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

  if (ctx.tagline && brandMode !== "clean") {
    brandingLines.push(`- Bedriftens tagline er "${ctx.tagline}" — la bildet visuelt reflektere dette budskapet.`);
  }

  if (ctx.fontStyle && brandMode === "text") {
    brandingLines.push(`- Foretrukket font-stil: ${ctx.fontStyle}.`);
  }

  sections.push(brandingLines.join("\n"));

  return sections.join("\n\n");
};
