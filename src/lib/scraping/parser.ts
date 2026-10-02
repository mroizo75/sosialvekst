const MAX_CONTENT_LENGTH = 2000;

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#\d+;/g, "");

const stripTags = (html: string): string => {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
};

const extractMetaContent = (html: string, name: string): string | undefined => {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match?.[1]) return decodeEntities(match[1].trim());

  const reversed = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    "i",
  );
  const reverseMatch = html.match(reversed);
  return reverseMatch?.[1] ? decodeEntities(reverseMatch[1].trim()) : undefined;
};

const extractTitle = (html: string): string | undefined => {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeEntities(match[1].trim()) : undefined;
};

const extractMainContent = (html: string): string => {
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);

  const rawContent = mainMatch?.[0] ?? articleMatch?.[0] ?? bodyMatch?.[0] ?? html;
  return stripTags(rawContent);
};

const attr = (tag: string, name: string): string | undefined => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ? decodeEntities(match[1]).trim() || undefined : undefined;
};

export type PageLink = { href: string; text: string };

const extractLinks = (html: string): PageLink[] =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: attr(match[1] ?? "", "href") ?? "", text: stripTags(match[2] ?? "").slice(0, 80) }))
    .filter((link) => link.href && !/^(#|mailto:|tel:|javascript:)/i.test(link.href));

type JsonLdOrganization = { name?: string; description?: string; logo?: string; sameAs: string[]; foundingDate?: string };

const asText = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

const logoValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return asText(value);
  if (value && typeof value === "object") return asText((value as { url?: unknown }).url);
  return undefined;
};

const ORGANIZATION_TYPES = /organization|localbusiness|corporation|store|travelagency|restaurant|professionalservice/i;

const flattenJsonLd = (node: unknown): Record<string, unknown>[] => {
  if (Array.isArray(node)) return node.flatMap(flattenJsonLd);
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  return [record, ...flattenJsonLd(record["@graph"])];
};

const extractJsonLdOrganization = (html: string): JsonLdOrganization | undefined => {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1] ?? "");
    } catch {
      continue;
    }
    const organization = flattenJsonLd(parsed).find((item) => ORGANIZATION_TYPES.test(String(item["@type"] ?? "")));
    if (!organization) continue;
    const sameAs = Array.isArray(organization.sameAs)
      ? organization.sameAs.filter((item): item is string => typeof item === "string")
      : typeof organization.sameAs === "string" ? [organization.sameAs] : [];
    return {
      name: asText(organization.name),
      description: asText(organization.description),
      logo: logoValue(organization.logo),
      sameAs,
      foundingDate: asText(organization.foundingDate),
    };
  }
  return undefined;
};

const SHARE_IMAGE = /opengraph|og[-_]image|twitter[-_]image|social[-_]share/i;

const extractLogoCandidates = (html: string, jsonLdLogo: string | undefined): string[] => {
  const imageLogos = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /logo/i.test(`${attr(tag, "class") ?? ""} ${attr(tag, "id") ?? ""} ${attr(tag, "alt") ?? ""} ${attr(tag, "src") ?? ""}`))
    .map((tag) => attr(tag, "src"))
    .filter((src): src is string => Boolean(src) && !src?.startsWith("data:"));
  const icons = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /apple-touch-icon/i.test(attr(tag, "rel") ?? ""))
    .map((tag) => attr(tag, "href"))
    .filter((href): href is string => Boolean(href));
  const shareImage = extractMetaContent(html, "og:image");
  return [...new Set([jsonLdLogo, ...imageLogos, ...icons].filter((item): item is string => Boolean(item)))]
    .filter((url) => url !== shareImage && !SHARE_IMAGE.test(url));
};

const extractStylesheets = (html: string): string[] =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /stylesheet/i.test(attr(tag, "rel") ?? ""))
    .map((tag) => attr(tag, "href"))
    .filter((href): href is string => Boolean(href));

const extractInlineCss = (html: string): string =>
  [
    ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1] ?? ""),
    ...[...html.matchAll(/\sstyle=["']([^"']+)["']/gi)].map((match) => match[1] ?? ""),
  ].join("\n");

const FACEBOOK_URL = /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)[A-Za-z0-9.\-_/]+/i;

export type ParsedWebsite = {
  title?: string;
  metaDescription?: string;
  ogDescription?: string;
  content: string;
  links: PageLink[];
  themeColor?: string;
  logoCandidates: string[];
  stylesheets: string[];
  inlineCss: string;
  facebookUrl?: string;
  organization?: JsonLdOrganization;
};

export const parseHtml = (html: string, maxContentLength = MAX_CONTENT_LENGTH): ParsedWebsite => {
  const organization = extractJsonLdOrganization(html);
  const facebookFromJsonLd = organization?.sameAs.find((url) => FACEBOOK_URL.test(url));

  return {
    title: extractTitle(html),
    metaDescription: extractMetaContent(html, "description"),
    ogDescription: extractMetaContent(html, "og:description"),
    content: extractMainContent(html).slice(0, maxContentLength),
    links: extractLinks(html),
    themeColor: extractMetaContent(html, "theme-color"),
    logoCandidates: extractLogoCandidates(html, organization?.logo),
    stylesheets: extractStylesheets(html),
    inlineCss: extractInlineCss(html),
    facebookUrl: facebookFromJsonLd ?? html.match(FACEBOOK_URL)?.[0],
    organization,
  };
};
