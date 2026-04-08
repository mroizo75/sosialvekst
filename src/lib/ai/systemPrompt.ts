import type { BrandContext } from "@/lib/types";

const section = (heading: string, content: string): string => {
  return `[${heading}]\n${content}`;
};

const listOrEmpty = (items?: string[]): string | null => {
  if (!items || items.length === 0) return null;
  return items.map((item) => `- ${item}`).join("\n");
};

export const buildSystemContext = (ctx: BrandContext): string => {
  const sections: string[] = [];

  if (ctx.companyName) {
    const identityParts = [`Navn: ${ctx.companyName}`];
    if (ctx.industry) identityParts.push(`Bransje: ${ctx.industry}`);
    if (ctx.foundedYear) identityParts.push(`Grunnlagt: ${ctx.foundedYear}`);
    if (ctx.companyDescription) identityParts.push(`Beskrivelse: ${ctx.companyDescription}`);
    if (ctx.teamDescription) identityParts.push(`Team: ${ctx.teamDescription}`);
    sections.push(section("BEDRIFT", identityParts.join("\n")));
  }

  if (ctx.coreValues && ctx.coreValues.length > 0) {
    sections.push(section("KJERNEVERDIER", ctx.coreValues.join(", ")));
  }

  const offerings: string[] = [];
  if (ctx.products && ctx.products.length > 0) {
    offerings.push(`Produkter: ${ctx.products.join(", ")}`);
  }
  if (ctx.services && ctx.services.length > 0) {
    offerings.push(`Tjenester: ${ctx.services.join(", ")}`);
  }
  if (ctx.priceRange) {
    offerings.push(`Prisnivå: ${ctx.priceRange}`);
  }
  if (offerings.length > 0) {
    sections.push(section("PRODUKTER OG TJENESTER", offerings.join("\n")));
  }

  if (ctx.uniqueSellingPoints && ctx.uniqueSellingPoints.length > 0) {
    sections.push(section("UNIKE SALGSARGUMENTER", listOrEmpty(ctx.uniqueSellingPoints)!));
  }

  if (ctx.competitorDifferentiators) {
    sections.push(section("KONKURRANSEFORTRINN", ctx.competitorDifferentiators));
  }

  if (ctx.targetAudience) {
    const audienceParts = [`Målgruppe: ${ctx.targetAudience}`];
    const painList = listOrEmpty(ctx.customerPainPoints);
    if (painList) audienceParts.push(`Typiske utfordringer hos kundene:\n${painList}`);
    const questionList = listOrEmpty(ctx.commonQuestions);
    if (questionList) audienceParts.push(`Vanlige spørsmål fra kunder:\n${questionList}`);
    sections.push(section("KUNDER", audienceParts.join("\n\n")));
  }

  const storyList = listOrEmpty(ctx.customerSuccessStories);
  if (storyList) {
    sections.push(section("KUNDEHISTORIER OG REFERANSER", storyList));
  }

  if (ctx.tagline || ctx.slogan) {
    const identityParts: string[] = [];
    if (ctx.tagline) identityParts.push(`Tagline: "${ctx.tagline}"`);
    if (ctx.slogan) identityParts.push(`Slagord: "${ctx.slogan}"`);
    sections.push(section("TAGLINE OG SLAGORD", identityParts.join("\n")));
  }

  if (ctx.brandColors) {
    const colorParts: string[] = [];
    if (ctx.brandColors.primary) colorParts.push(`Primærfarge: ${ctx.brandColors.primary}`);
    if (ctx.brandColors.secondary) colorParts.push(`Sekundærfarge: ${ctx.brandColors.secondary}`);
    if (ctx.brandColors.accent) colorParts.push(`Aksentfarge: ${ctx.brandColors.accent}`);
    if (colorParts.length > 0) {
      sections.push(section("MERKEVAREFARGER", colorParts.join(", ")));
    }
  }

  if (ctx.brandVoice || ctx.brandPersonality || ctx.brandDosAndDonts) {
    const voiceParts: string[] = [];
    if (ctx.brandVoice) voiceParts.push(`Skrivestil: ${ctx.brandVoice}`);
    if (ctx.brandPersonality) voiceParts.push(`Personlighet: ${ctx.brandPersonality}`);
    if (ctx.brandDosAndDonts) voiceParts.push(`Gjør / Ikke gjør:\n${ctx.brandDosAndDonts}`);
    sections.push(section("MERKEVARESTEMME", voiceParts.join("\n")));
  }

  if (ctx.keyMessages && ctx.keyMessages.length > 0) {
    sections.push(section("NØKKELBUDSKAP", ctx.keyMessages.join(", ")));
  }

  if (ctx.seasonalFocus) {
    sections.push(section("SESONGFOKUS", ctx.seasonalFocus));
  }

  if (ctx.websiteContent) {
    sections.push(section("KONTEKST FRA NETTSIDE", ctx.websiteContent.slice(0, 1200)));
  }

  return sections.join("\n\n");
};
