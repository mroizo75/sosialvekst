import { z } from "zod";

import { resolveCopyModel } from "@/lib/ai/models";
import { getOpenAiClient } from "@/lib/openai";
import type { CrawledPage } from "@/lib/scraping/crawler";

const MAX_PAGE_CHARS = 3000;

const text = (max: number) => z.string().trim().transform((value) => value.slice(0, max)).catch("");
const list = (maxItems: number) =>
  z.array(z.string().trim().min(1)).transform((items) => [...new Set(items)].slice(0, maxItems)).catch([]);

export const brandProfileSuggestionSchema = z.object({
  companyDescription: text(500),
  industry: text(80),
  foundedYear: text(10),
  teamDescription: text(400),
  products: list(10),
  services: list(10),
  uniqueSellingPoints: list(6),
  priceRange: text(120),
  competitorDifferentiators: text(400),
  targetAudience: text(300),
  brandVoice: text(200),
  brandPersonality: text(200),
  keyMessages: list(5),
  coreValues: list(5),
  customerPainPoints: list(5),
  commonQuestions: list(5),
  seasonalFocus: text(200),
  tagline: text(120),
});

export type BrandProfileSuggestion = z.infer<typeof brandProfileSuggestionSchema>;

export const emptySuggestion = (): BrandProfileSuggestion => brandProfileSuggestionSchema.parse({});

const SYSTEM_PROMPT = [
  "Du er en norsk merkevarestrateg som setter opp en bedriftsprofil for markedsføring i sosiale medier.",
  "Du får innhold fra bedriftens nettsider og eventuelt Facebook-siden. Fyll ut profilen på norsk bokmål.",
  "Regler:",
  "- Fakta (produkter, tjenester, priser, årstall, team, fortrinn) skal KUN hentes fra kildene. Ikke dikt opp. Står det ikke i kildene, la feltet være tomt (\"\" eller []).",
  "- Målgruppe, tone, personlighet, nøkkelbudskap, kjerneverdier, kundens utfordringer og vanlige spørsmål kan du utlede fra det bedriften faktisk skriver og selger, men hold deg tett til kildene.",
  "- Skriv konkret og kort. Ingen markedsføringsfloskler.",
  "Returner JSON med nøyaktig disse feltene:",
  '"companyDescription" (1–2 setninger), "industry" (bransje, 1–3 ord), "foundedYear" (årstall eller ""),',
  '"teamDescription", "products" (liste), "services" (liste), "uniqueSellingPoints" (liste),',
  '"priceRange" (prisnivå eller konkrete priser fra kildene), "competitorDifferentiators" (hva skiller dem ut),',
  '"targetAudience" (hvem de selger til), "brandVoice" (hvordan de snakker, f.eks. "varm, uformell og trygg"),',
  '"brandPersonality", "keyMessages" (liste), "coreValues" (liste), "customerPainPoints" (liste med kundens problemer),',
  '"commonQuestions" (liste med spørsmål kunder typisk stiller), "seasonalFocus" (sesonger eller perioder som er viktige for bedriften),',
  '"tagline" (eksisterende slagord fra kildene, ellers "").',
].join("\n");

const describePage = ({ url, parsed }: CrawledPage): string =>
  [
    `### ${url}`,
    parsed.title ? `Tittel: ${parsed.title}` : "",
    parsed.metaDescription ? `Meta: ${parsed.metaDescription}` : "",
    parsed.organization?.description ? `Strukturert beskrivelse: ${parsed.organization.description}` : "",
    parsed.organization?.foundingDate ? `Grunnlagt: ${parsed.organization.foundingDate}` : "",
    `Innhold: ${parsed.content.slice(0, MAX_PAGE_CHARS)}`,
  ].filter(Boolean).join("\n");

export type AnalyzeInput = {
  companyName: string;
  pages: CrawledPage[];
  facebookSummary?: string;
};

export const buildAnalysisPrompt = ({ companyName, pages, facebookSummary }: AnalyzeInput): string =>
  [
    `Bedriftsnavn: ${companyName}`,
    "",
    "## Nettsider",
    pages.map(describePage).join("\n\n"),
    facebookSummary ? `\n## Facebook-siden\n${facebookSummary}` : "",
  ].join("\n");

export const parseSuggestion = (raw: string | undefined): BrandProfileSuggestion => {
  if (!raw?.trim()) return emptySuggestion();
  try {
    const json = JSON.parse(raw.replace(/```json\s*|```/g, "").trim()) as unknown;
    const result = brandProfileSuggestionSchema.safeParse(json);
    return result.success ? result.data : emptySuggestion();
  } catch {
    return emptySuggestion();
  }
};

export const analyzeWebsiteContent = async (input: AnalyzeInput): Promise<BrandProfileSuggestion> => {
  const client = getOpenAiClient();
  if (!client) return emptySuggestion();

  const response = await client.responses.create({
    model: resolveCopyModel(),
    text: { format: { type: "json_object" } },
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildAnalysisPrompt(input) },
    ],
  });

  return parseSuggestion(response.output_text);
};
