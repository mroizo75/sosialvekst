import { getOpenAiClient } from "@/lib/openai";
import type { ParsedWebsite } from "@/lib/scraping/parser";

export type WebsiteAnalysis = {
  companyDescription: string;
  products: string[];
  uniqueSellingPoints: string[];
};

const fallbackAnalysis: WebsiteAnalysis = {
  companyDescription: "",
  products: [],
  uniqueSellingPoints: [],
};

export const analyzeWebsiteContent = async (
  parsed: ParsedWebsite,
  companyName: string,
): Promise<WebsiteAnalysis> => {
  const client = getOpenAiClient();
  if (!client) return fallbackAnalysis;

  const contextParts = [
    parsed.title ? `Tittel: ${parsed.title}` : "",
    parsed.metaDescription ? `Meta: ${parsed.metaDescription}` : "",
    parsed.ogDescription ? `OG: ${parsed.ogDescription}` : "",
    `Innhold: ${parsed.content}`,
  ].filter(Boolean);

  const systemPrompt = [
    "Du er en forretningsanalytiker som analyserer nettsider for norske bedrifter.",
    "Analyser nettsideinnholdet og returner et JSON-objekt med folgende felt:",
    '- "companyDescription": En kort beskrivelse av bedriften (1-2 setninger, maks 200 tegn).',
    '- "products": En liste med produkter eller tjenester bedriften tilbyr (maks 8 elementer).',
    '- "uniqueSellingPoints": En liste med unike salgsargumenter (maks 5 elementer).',
    "Svar KUN med gyldig JSON uten markdown-formatering.",
  ].join(" ");

  const userPrompt = [
    `Bedriftsnavn: ${companyName}`,
    "",
    "Nettsideinnhold:",
    contextParts.join("\n"),
  ].join("\n");

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.output_text?.trim();
  if (!raw) return fallbackAnalysis;

  try {
    const cleaned = raw.replace(/```json\s*|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    return {
      companyDescription:
        typeof parsed.companyDescription === "string"
          ? parsed.companyDescription.slice(0, 500)
          : "",
      products: Array.isArray(parsed.products)
        ? (parsed.products.filter((p): p is string => typeof p === "string").slice(0, 8))
        : [],
      uniqueSellingPoints: Array.isArray(parsed.uniqueSellingPoints)
        ? (parsed.uniqueSellingPoints.filter((u): u is string => typeof u === "string").slice(0, 5))
        : [],
    };
  } catch {
    return fallbackAnalysis;
  }
};
