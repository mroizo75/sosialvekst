import { logger } from "@/lib/logger";
import { pickBrandColors } from "@/lib/scraping/brandColors";
import { parseHtml, type PageLink, type ParsedWebsite } from "@/lib/scraping/parser";
import { fetchSafeText } from "@/lib/scraping/safeFetch";
import type { BrandColors } from "@/lib/types";

const MAX_HTML_BYTES = 2_000_000;
const MAX_CSS_BYTES = 600_000;
const MAX_SUBPAGES = 4;
const MAX_STYLESHEETS = 2;
const HOME_CONTENT_CHARS = 3000;
const SUBPAGE_CONTENT_CHARS = 2500;

const HTML_OPTIONS = { accept: "text/html", allowedTypes: ["text/html"], maxBytes: MAX_HTML_BYTES };
const CSS_OPTIONS = { accept: "text/css", allowedTypes: ["text/css"], maxBytes: MAX_CSS_BYTES };

const SUBPAGE_KEYWORDS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /om-oss|om oss|about|hvem-vi|hvem vi|historie|our-story/i, score: 10 },
  { pattern: /tjenester|services|vi-tilbyr|vi tilbyr|losninger|løsninger|solutions/i, score: 9 },
  { pattern: /produkter|products|sortiment|kurs|meny|menu|hotell|hotel|reiser/i, score: 8 },
  { pattern: /priser|pris|pricing|prices|abonnement/i, score: 7 },
  { pattern: /faq|sporsmal|spørsmål|questions|hjelp/i, score: 6 },
  { pattern: /kontakt|contact/i, score: 4 },
];

const SKIPPED_PATH = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?)$|\/(wp-admin|login|logg-inn|cart|handlekurv|checkout|kasse)\b/i;

export type CrawledPage = { url: string; parsed: ParsedWebsite };

export type CrawlResult = {
  finalUrl: string;
  pages: CrawledPage[];
  brandColors?: BrandColors;
  logoCandidates: string[];
  facebookUrl?: string;
};

const resolveUrl = (href: string, base: string): string | undefined => {
  try {
    const url = new URL(href, base);
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
};

// Next.js serves resized copies via /_next/image?url=/logo.png; the original file keeps transparency and full size.
export const unwrapImageProxy = (url: string): string => {
  const parsed = new URL(url);
  const original = parsed.pathname === "/_next/image" ? parsed.searchParams.get("url") : null;
  return original ? new URL(original, parsed.origin).toString() : url;
};

export const pickSubpages = (links: PageLink[], baseUrl: string, limit = MAX_SUBPAGES): string[] => {
  const base = new URL(baseUrl);
  const scored = new Map<string, number>();
  for (const link of links) {
    const resolved = resolveUrl(link.href, baseUrl);
    if (!resolved) continue;
    const url = new URL(resolved);
    if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    if (url.pathname === "/" || url.pathname === base.pathname || SKIPPED_PATH.test(url.pathname)) continue;
    const haystack = `${decodeURIComponent(url.pathname)} ${link.text}`;
    const score = SUBPAGE_KEYWORDS.find(({ pattern }) => pattern.test(haystack))?.score ?? 0;
    if (score === 0) continue;
    url.search = "";
    const key = url.toString();
    scored.set(key, Math.max(scored.get(key) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([url]) => url);
};

const settledValues = <T>(results: PromiseSettledResult<T>[], what: string, finalUrl: string): T[] =>
  results.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    logger.warn(`Kunne ikke hente ${what} under nettside-analyse`, {
      site: finalUrl,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
    return [];
  });

export const crawlWebsite = async (inputUrl: string): Promise<CrawlResult> => {
  const home = await fetchSafeText(inputUrl, HTML_OPTIONS);
  const homepage = parseHtml(home.text, HOME_CONTENT_CHARS);

  const subpageUrls = pickSubpages(homepage.links, home.finalUrl);
  const stylesheetUrls = homepage.stylesheets
    .map((href) => resolveUrl(href, home.finalUrl))
    .filter((url): url is string => Boolean(url))
    .slice(0, MAX_STYLESHEETS);

  const [subpageResults, stylesheetResults] = await Promise.all([
    Promise.allSettled(subpageUrls.map(async (url) => {
      const page = await fetchSafeText(url, HTML_OPTIONS);
      return { url: page.finalUrl, parsed: parseHtml(page.text, SUBPAGE_CONTENT_CHARS) };
    })),
    Promise.allSettled(stylesheetUrls.map(async (url) => (await fetchSafeText(url, CSS_OPTIONS)).text)),
  ]);

  const subpages = settledValues(subpageResults, "underside", home.finalUrl);
  const stylesheets = settledValues(stylesheetResults, "stilark", home.finalUrl);

  return {
    finalUrl: home.finalUrl,
    pages: [{ url: home.finalUrl, parsed: homepage }, ...subpages],
    brandColors: pickBrandColors(homepage.themeColor, [homepage.inlineCss, ...stylesheets]),
    logoCandidates: [...new Set(homepage.logoCandidates
      .map((href) => resolveUrl(href, home.finalUrl))
      .filter((url): url is string => Boolean(url))
      .map(unwrapImageProxy))],
    facebookUrl: homepage.facebookUrl,
  };
};
