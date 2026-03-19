const MAX_CONTENT_LENGTH = 2000;

const stripTags = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const extractMetaContent = (html: string, name: string): string | undefined => {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match?.[1]) return match[1].trim();

  const reversed = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    "i",
  );
  const reverseMatch = html.match(reversed);
  return reverseMatch?.[1]?.trim();
};

const extractTitle = (html: string): string | undefined => {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim();
};

const extractMainContent = (html: string): string => {
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);

  const rawContent = mainMatch?.[0] ?? articleMatch?.[0] ?? bodyMatch?.[0] ?? html;
  return stripTags(rawContent);
};

export type ParsedWebsite = {
  title?: string;
  metaDescription?: string;
  ogDescription?: string;
  content: string;
};

export const parseHtml = (html: string): ParsedWebsite => {
  const title = extractTitle(html);
  const metaDescription = extractMetaContent(html, "description");
  const ogDescription = extractMetaContent(html, "og:description");

  let content = extractMainContent(html);
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH);
  }

  return { title, metaDescription, ogDescription, content };
};
