import type { BrandContext } from "@/lib/types";

export const buildSystemContext = (ctx: BrandContext): string => {
  const parts: string[] = [];

  if (ctx.companyName) {
    parts.push(`BEDRIFT: ${ctx.companyName}`);
  }

  if (ctx.companyDescription) {
    parts.push(`BEDRIFTSBESKRIVELSE: ${ctx.companyDescription}`);
  }

  if (ctx.products && ctx.products.length > 0) {
    parts.push(`PRODUKTER/TJENESTER: ${ctx.products.join(", ")}`);
  }

  if (ctx.uniqueSellingPoints && ctx.uniqueSellingPoints.length > 0) {
    parts.push(`UNIKE SALGSARGUMENTER: ${ctx.uniqueSellingPoints.join(", ")}`);
  }

  if (ctx.targetAudience) {
    parts.push(`MAALGRUPPE: ${ctx.targetAudience}`);
  }

  if (ctx.brandVoice) {
    parts.push(`SKRIVESTIL: ${ctx.brandVoice}`);
  }

  if (ctx.keyMessages && ctx.keyMessages.length > 0) {
    parts.push(`NØKKELBUDSKAP: ${ctx.keyMessages.join(", ")}`);
  }

  if (ctx.websiteContent) {
    parts.push(`KONTEKST FRA NETTSIDE: ${ctx.websiteContent.slice(0, 800)}`);
  }

  return parts.join("\n");
};
