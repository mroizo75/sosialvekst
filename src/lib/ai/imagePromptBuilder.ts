import type { BrandRules } from "@/lib/ai/brandRules";
import type { BrandContext, MediaMode, PostFormat } from "@/lib/types";

type ImagePromptInput = {
  topic: string;
  channel: "facebook" | "instagram" | "linkedin";
  mediaMode: MediaMode;
  brandRules: BrandRules;
  brandContext?: BrandContext;
  imageDirection?: string;
  format?: PostFormat;
};

export const buildImagePrompt = (input: ImagePromptInput): string => {
  const ctx = input.brandContext ?? {};
  const companyName = ctx.companyName ?? "bedriften";
  const industry = ctx.companyDescription
    ? `Bransje/beskrivelse: ${ctx.companyDescription}.`
    : "";
  const products = ctx.products && ctx.products.length > 0
    ? `Produkter/tjenester: ${ctx.products.join(", ")}.`
    : "";

  const lines = [
    "Lag et profesjonelt, fotorealistisk bilde for en norsk bedriftspost på sosiale medier.",
    "",
    `Bedrift: ${companyName}.`,
    industry,
    products,
    `Tema: ${input.topic}.`,
    `Kanal: ${input.channel}.`,
    `Målgruppe: ${input.brandRules.targetAudience}.`,
  ];

  if (input.imageDirection) {
    lines.push(
      "",
      "VISUELL RETNING:",
      input.imageDirection,
    );
  }

  lines.push(
    "",
    "OBLIGATORISKE KRAV:",
    `- TEMAET "${input.topic}" er obligatorisk og skal være tydelig i motivet.`,
    `- Bildet SKAL være direkte relevant for ${companyName} og det de faktisk driver med.`,
    "- Profesjonell bedriftsfotografering-kvalitet med naturlig lys og ren komposisjon.",
    "- Realistisk og troverdig motiv som passer en seriøs norsk bedrift.",
    "- Bildet skal fortelle en historie eller kommunisere en tydelig idé.",
    "- Ingen generiske stockbilder eller tilfeldige elementer.",
    "- Ingen AI-artefakter, deformerte hender/ansikter eller unaturlige proporsjoner.",
    "- Ingen overmettet farge, neon, fantasy-elementer eller plastisk AI-look.",
    "- Motivet skal tydelig kommunisere bedriftens bransje og kompetanse.",
    `- Bildet skal følge den visuelle stilen: ${input.brandRules.toneOfVoice}.`,
    "- FOKUSLÅS: motivet skal være direkte knyttet til temaet, ikke et nærliggende eller tilfeldig underområde.",
    "- IKKE tolk temaet bredt. Bruk eksakt semantikk fra tema og bedriftskontekst.",
    "- Hvis temaet er spesifikt, skal motivet være like spesifikt.",
    `- Hvis det brukes tekst i bildet, skal teksten være NØYAKTIG "${companyName}" skrevet korrekt.`,
    "- Ingen annen tekst, ingen tilfeldige bokstaver, ingen engelske/russiske tegn, ingen stavefeil.",
    "- Hvis modellen ikke klarer korrekt tekst, skal bildet være helt uten tekst.",
  );

  lines.push(
    "",
    "BRANDING I BILDET (UTEN TEKST):",
    "- Bruk bedriftens visuelle uttrykk gjennom farger, miljø, klær, rekvisitter og motivvalg.",
    "- Ikke bruk skrift som branding. All branding skal være visuell og tekstfri.",
    "- Prioriter ren komposisjon med tydelig hovedmotiv og profesjonell lyssetting.",
  );

  return lines.filter(Boolean).join("\n");
};
