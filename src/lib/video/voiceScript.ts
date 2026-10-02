import type { BrandContext } from "@/lib/types";

export const MAX_VOICE_WORDS = 22;
const WEBSITE_EXCERPT_CHARS = 1500;
const DOMAIN_PATTERN = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9æøå-]+(?:\.[a-z0-9æøå-]+)*)\.(no|com|net|org|se|dk|io|eu|nu)\b(?:\/\S*)?/gi;

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const speakLabel = (label: string): string => label.split("-").join(" bindestrek ");

export const spokenDomain = (url: string | undefined): string | undefined => {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return undefined;
  }
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return undefined;
  return capitalize(labels.map(speakLabel).join(" punktum "));
};

const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const fitToLength = (text: string): string | undefined => {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  while (sentences.length > 1 && countWords(sentences.join(" ")) > MAX_VOICE_WORDS) {
    sentences.pop();
  }
  const fitted = sentences.join(" ");
  return countWords(fitted) <= MAX_VOICE_WORDS ? fitted : undefined;
};

const mentionsProhibited = (text: string, prohibitedTerms: string[] | undefined): boolean => {
  const lower = text.toLowerCase();
  return (prohibitedTerms ?? []).some((term) => term.trim().length > 0 && lower.includes(term.trim().toLowerCase()));
};

export const normalizeVoiceScript = (
  raw: string,
  prohibitedTerms?: string[],
): string | undefined => {
  const cleaned = raw
    .replace(/^["'«»“”\s]+|["'«»“”\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(DOMAIN_PATTERN, (match) => spokenDomain(match) ?? match)
    .trim();
  if (!cleaned || mentionsProhibited(cleaned, prohibitedTerms)) return undefined;
  return fitToLength(cleaned);
};

const listOf = (label: string, values: string[] | undefined): string | undefined =>
  values && values.length > 0 ? `${label}: ${values.join("; ")}` : undefined;

const lineOf = (label: string, value: string | undefined): string | undefined =>
  value?.trim() ? `${label}: ${value.trim()}` : undefined;

export type VoiceScriptPromptInput = {
  topic: string;
  caption: string;
  brandContext?: BrandContext;
};

export const buildVoiceScriptPrompt = ({ topic, caption, brandContext }: VoiceScriptPromptInput): { system: string; user: string } => {
  const domain = spokenDomain(brandContext?.websiteUrl);
  const system = [
    "Du skriver en kort norsk speakertekst som leses opp over en 10 sekunders reel.",
    `Maks ${MAX_VOICE_WORDS - 4} ord, helst 15–18. To eller tre korte setninger som er naturlige å si høyt.`,
    "Følg temaet for posten. Ikke selg hver gang: et tips eller en inspirasjon er like bra som et tilbud.",
    "Bruk bare fakta som står i bedriftsprofilen, nettsiden eller posten. Ikke dikt opp navn, priser, tilbud, tall eller garantier.",
    domain
      ? `Hvis du nevner nettsiden, skriv den nøyaktig slik den skal uttales: «${domain}».`
      : "Ikke nevn noen nettadresse.",
    "Ingen emojier, hashtags, anførselstegn eller forkortelser. Svar bare med selve teksten.",
  ].join("\n");

  const facts = [
    lineOf("Bedrift", brandContext?.companyName),
    lineOf("Bransje", brandContext?.industry),
    lineOf("Beskrivelse", brandContext?.companyDescription),
    listOf("Produkter", brandContext?.products),
    listOf("Tjenester", brandContext?.services),
    listOf("Fortrinn", brandContext?.uniqueSellingPoints),
    lineOf("Målgruppe", brandContext?.targetAudience),
    lineOf("Tone", brandContext?.brandVoice),
    listOf("Nøkkelbudskap", brandContext?.keyMessages),
    lineOf("Sesongfokus", brandContext?.seasonalFocus),
    lineOf("Utdrag fra nettsiden", brandContext?.websiteContent?.slice(0, WEBSITE_EXCERPT_CHARS)),
  ].filter(Boolean);

  const user = [
    `Tema for posten: ${topic}`,
    `Posttekst:\n${caption}`,
    facts.length > 0 ? `Bedriftsprofil:\n${facts.join("\n")}` : "Bedriftsprofil: ingen detaljer.",
  ].join("\n\n");

  return { system, user };
};
