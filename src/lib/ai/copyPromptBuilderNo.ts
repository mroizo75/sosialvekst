import type { BrandRules } from "@/lib/ai/brandRules";
import { norwegianStyleGuide } from "@/lib/ai/norwegianStyleGuide";
import { buildSystemContext } from "@/lib/ai/systemPrompt";
import type { BrandContext, PostFormat, PostIntent, SocialChannel } from "@/lib/types";

type CopyPromptInput = {
  topic: string;
  channel: SocialChannel;
  brandRules: BrandRules;
  brandContext?: BrandContext;
  intent?: PostIntent;
  format?: PostFormat;
  ctaType?: string;
};

type StructuredPrompt = {
  system: string;
  user: string;
};

const INTENT_INSTRUCTIONS: Record<PostIntent, string> = {
  brand_awareness: "Målet er å styrke merkevaren. Vis hva bedriften står for og hvorfor det betyr noe for målgruppen.",
  traffic: "Målet er å drive trafikk til nettsiden. Gi nok verdi til at leseren vil vite mer, og referer til nettsiden.",
  engagement: "Målet er å skape engasjement. Still spørsmål, inviter til diskusjon, og gjør innholdet delbart.",
  lead_generation: "Målet er å generere henvendelser. Vis konkret verdi og gjør det enkelt å ta kontakt.",
  authority: "Målet er å vise faglig autoritet. Del unik innsikt, data eller erfaring som posisjonerer bedriften som ekspert.",
  community: "Målet er å bygge fellesskap. Snakk til og med målgruppen, ikke til dem.",
};

const FORMAT_INSTRUCTIONS: Record<PostFormat, string> = {
  insight: "Format: Del en overraskende eller viktig innsikt fra bransjen, koblet til bedriftens erfaring.",
  tip: "Format: Gi et konkret, handlingsorientert tips som leseren kan bruke med en gang.",
  question: "Format: Still et tankevekkende spørsmål som inviterer til refleksjon og diskusjon.",
  case_study: "Format: Fortell kort om et konkret resultat, prosjekt eller kundehistorie (anonymiser om nødvendig).",
  how_to: "Format: Forklar steg-for-steg hvordan man løser et konkret problem.",
  fact: "Format: Del en interessant fakta eller statistikk, og forklar hva det betyr for målgruppen.",
  behind_the_scenes: "Format: Vis noe fra den daglige driften, teamet eller prosessen bak produktet/tjenesten.",
  myth_busting: "Format: Ta tak i en vanlig misforståelse i bransjen og forklar hva som faktisk stemmer.",
  opinion: "Format: Del et tydelig standpunkt om noe relevant i bransjen. Vær modig, men faglig fundamentert.",
};

export const buildNorwegianCopyPrompt = (input: CopyPromptInput): StructuredPrompt => {
  const brandContext = input.brandContext ?? {};
  const companyName = brandContext.companyName ?? "bedriften";
  const websiteUrl = brandContext.websiteUrl?.trim();
  const intent = input.intent ?? "brand_awareness";
  const format = input.format ?? "insight";
  const channelRules = norwegianStyleGuide.channelSpecific[input.channel] ?? [];

  const brandDosAndDonts = brandContext.brandDosAndDonts?.trim();

  const systemLines = [
    "Du er en senior norsk SoMe-strateg og copywriter som lager innhold som FAKTISK skaper verdi for bedrifter.",
    "Du lager IKKE generisk AI-innhold som fyller en feed. Du lager innhold folk ville savnet om det forsvant.",
    "",
    "UFRAVIKELIGE REGLER:",
    `1. Alt innhold SKAL handle om ${companyName} og deres virksomhet. Ingen unntak.`,
    `2. Bedriftsnavnet "${companyName}" SKAL nevnes minst én gang, naturlig integrert.`,
    "3. Innholdet SKAL referere til bedriftens konkrete produkter, tjenester eller bransjeekspertise.",
    "4. Skriv ALLTID på korrekt bokmål.",
    "5. ALDRI generer innhold som kunne passet en hvilken som helst bedrift.",
    "6. Hver post SKAL ha en tydelig, kontekstuell CTA — ikke generisk «kontakt oss».",
    "7. Vær SPESIFIKK. Bruk tall, eksempler og konkrete referanser.",
    `8. Forbudte uttrykk: ${input.brandRules.prohibitedTerms.join(", ")}.`,
    websiteUrl
      ? `9. Nettsidelinken SKAL inkluderes én gang i posten: ${websiteUrl}`
      : "9. Hvis nettside finnes i konteksten, inkluder nettsidelink én gang i CTA.",
    "10. Posten MÅ avsluttes med en komplett setning. Ingen avkapping eller ufullstendige setninger.",
    "",
    "ANTI-GENERISK SJEKKLISTE (alle må være oppfylt):",
    ...norwegianStyleGuide.antiGeneric.map((rule, i) => `${i + 1}. ${rule}`),
    "",
    "SPRÅK OG GRAMMATIKK:",
    ...norwegianStyleGuide.grammar,
    "",
    "TONE OG STEMME:",
    ...norwegianStyleGuide.tone,
    "",
    "STRUKTUR:",
    ...norwegianStyleGuide.structure,
    "",
    `KANALSPESIFIKKE REGLER FOR ${input.channel.toUpperCase()} (OBLIGATORISK — posten SKAL følge disse):`,
    ...channelRules,
    "",
    `VIKTIG: Denne posten er KUN for ${input.channel}. Den skal IKKE fungere på andre plattformer.`,
    `Tilpass lengde, tone, struktur og CTA-stil til ${input.channel}-brukere spesifikt.`,
    ...(brandDosAndDonts ? ["", "BEDRIFTENS EGNE RETNINGSLINJER:", brandDosAndDonts] : []),
    "",
    "BEDRIFTSKONTEKST (bruk dette AKTIVT — dette er kjernekunnskapen om bedriften):",
    buildSystemContext(brandContext),
  ];

  const userLines = [
    `Skriv en SoMe-post for ${input.channel}.`,
    `Tema: ${input.topic}.`,
    "",
    "STRATEGISK INTENSJON:",
    INTENT_INSTRUCTIONS[intent],
    "",
    "POSTFORMAT:",
    FORMAT_INSTRUCTIONS[format],
    "",
    `Målgruppe: ${input.brandRules.targetAudience}.`,
    `Skrivestil: ${input.brandRules.toneOfVoice}.`,
    `Nøkkelbudskap: ${input.brandRules.keyMessages.join(", ")}.`,
    "",
    `ANBEFALT CTA-RETNING: ${input.ctaType ?? "Tydelig og kontekstuell oppfordring til handling."}`,
    "",
    "KRAV TIL OUTPUT:",
    `- Posten SKAL være direkte knyttet til ${companyName} og deres virksomhet.`,
    `- Nevn minst ett spesifikt produkt, tjeneste eller kompetanseområde fra ${companyName}.`,
    "- Hook: Første setning skal fange oppmerksomhet — innsikt, påstand eller spørsmål.",
    "- Verdi: Gi leseren noe konkret og nyttig de kan ta med seg.",
    "- CTA: Avslutt med oppfordring til handling som passer postens strategiske mål.",
    websiteUrl
      ? `- Inkluder denne lenken én gang, naturlig i CTA: ${websiteUrl}`
      : "- Hvis nettside finnes i kontekst, inkluder én konkret lenke i CTA.",
    "- Ingen hashtagspam (maks 3 relevante hashtags).",
    "- Avslutt med fullstendig setning og god tegnsetting.",
    "- Lever KUN selve postteksten. Ingen forklaringer, overskrifter eller metadata.",
  ];

  return {
    system: systemLines.join("\n"),
    user: userLines.join("\n"),
  };
};
