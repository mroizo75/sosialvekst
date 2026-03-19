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
    `- Bildet SKAL være direkte relevant for ${companyName} og det de faktisk driver med.`,
    "- Profesjonell bedriftsfotografering-kvalitet med naturlig lys og ren komposisjon.",
    "- Realistisk og troverdig motiv som passer en seriøs norsk bedrift.",
    "- Bildet skal fortelle en historie eller kommunisere en tydelig idé.",
    "- Ingen generiske stockbilder eller tilfeldige elementer.",
    "- Ingen AI-artefakter, deformerte hender/ansikter eller unaturlige proporsjoner.",
    "- Ingen overmettet farge, neon, fantasy-elementer eller plastisk AI-look.",
    "- Motivet skal tydelig kommunisere bedriftens bransje og kompetanse.",
    `- Bildet skal følge den visuelle stilen: ${input.brandRules.toneOfVoice}.`,
  );

  lines.push(
    "",
    "BRANDING I BILDET:",
    `- Inkluder teksten "${companyName}" som en integrert del av bildet.`,
    `- Teksten skal plasseres ${input.brandRules.logoPlacement}, med god luft rundt (minst ${input.brandRules.safeMarginPx}px margin).`,
    "- Bruk en ren, profesjonell skrifttype (sans-serif) som passer en seriøs bedrift.",
    "- Teksten skal være godt lesbar men ikke dominere bildet.",
    "- Farge på teksten skal kontrastere tydelig mot bakgrunnen.",
    "- IKKE legg teksten oppå ansikter, produkter eller viktige elementer.",
  );

  return lines.filter(Boolean).join("\n");
};
