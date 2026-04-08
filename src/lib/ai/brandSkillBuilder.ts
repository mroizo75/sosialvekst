import type { BrandContext } from "@/lib/types";

const section = (heading: string, lines: string[]): string => {
  const filtered = lines.filter(Boolean);
  if (filtered.length === 0) return "";
  return `[${heading}]\n${filtered.join("\n")}`;
};

const buildVisualIdentity = (ctx: BrandContext): string => {
  const lines: string[] = [];

  if (ctx.logoUrl) {
    lines.push("Logo: Tilgjengelig (brukes i branded bildemodus).");
  }

  if (ctx.brandColors) {
    const colorParts: string[] = [];
    if (ctx.brandColors.primary) colorParts.push(`Primær: ${ctx.brandColors.primary}`);
    if (ctx.brandColors.secondary) colorParts.push(`Sekundær: ${ctx.brandColors.secondary}`);
    if (ctx.brandColors.accent) colorParts.push(`Aksent: ${ctx.brandColors.accent}`);
    if (colorParts.length > 0) {
      lines.push(`Merkevarefarger: ${colorParts.join(", ")}.`);
    }
  }

  if (ctx.fontStyle) {
    lines.push(`Font-stil: ${ctx.fontStyle}.`);
  }

  return section("VISUELL IDENTITET", lines);
};

const buildVerbalIdentity = (ctx: BrandContext): string => {
  const lines: string[] = [];

  if (ctx.tagline) {
    lines.push(`Tagline: "${ctx.tagline}"`);
  }
  if (ctx.slogan) {
    lines.push(`Slagord: "${ctx.slogan}"`);
  }
  if (ctx.brandVoice) {
    lines.push(`Skrivestil: ${ctx.brandVoice}`);
  }
  if (ctx.brandPersonality) {
    lines.push(`Personlighet: ${ctx.brandPersonality}`);
  }

  return section("VERBAL IDENTITET", lines);
};

const buildBrandValues = (ctx: BrandContext): string => {
  const lines: string[] = [];

  if (ctx.keyMessages && ctx.keyMessages.length > 0) {
    lines.push(`Nøkkelbudskap: ${ctx.keyMessages.join(", ")}`);
  }
  if (ctx.coreValues && ctx.coreValues.length > 0) {
    lines.push(`Kjerneverdier: ${ctx.coreValues.join(", ")}`);
  }

  return section("MERKEVARE-BUDSKAP", lines);
};

const buildBrandGuidelines = (ctx: BrandContext): string => {
  const lines: string[] = [];

  if (ctx.brandDosAndDonts) {
    lines.push(ctx.brandDosAndDonts);
  }
  if (ctx.prohibitedTerms && ctx.prohibitedTerms.length > 0) {
    lines.push(`Forbudte termer: ${ctx.prohibitedTerms.join(", ")}`);
  }

  return section("RETNINGSLINJER", lines);
};

export const buildBrandSkill = (ctx: BrandContext): string => {
  const blocks = [
    buildVisualIdentity(ctx),
    buildVerbalIdentity(ctx),
    buildBrandValues(ctx),
    buildBrandGuidelines(ctx),
  ].filter(Boolean);

  if (blocks.length === 0) return "";

  return `=== MERKEVARE-SKILL ===\n${blocks.join("\n\n")}\n=== /MERKEVARE-SKILL ===`;
};
