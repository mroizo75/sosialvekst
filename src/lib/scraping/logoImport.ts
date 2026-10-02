import { uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { fetchSafe } from "@/lib/scraping/safeFetch";

const MAX_LOGO_BYTES = 2_000_000;
const MIN_LOGO_BYTES = 300;
const MAX_ATTEMPTS = 3;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const LOGO_OPTIONS = {
  accept: "image/png,image/svg+xml,image/webp,image/jpeg",
  allowedTypes: Object.keys(EXTENSIONS),
  maxBytes: MAX_LOGO_BYTES,
};

// Candidates are ordered best-first (structured data, <img> marked as logo, touch icon); the first usable one wins.
export const importLogoFromWebsite = async (userId: string, candidates: string[]): Promise<string | undefined> => {
  for (const candidate of candidates.slice(0, MAX_ATTEMPTS)) {
    try {
      const logo = await fetchSafe(candidate, LOGO_OPTIONS);
      if (logo.body.byteLength < MIN_LOGO_BYTES) continue;
      const type = Object.keys(EXTENSIONS).find((item) => logo.contentType.includes(item)) ?? "image/png";
      const uploaded = await uploadUserFile({
        userId,
        fileName: `logo-fra-nettside.${EXTENSIONS[type]}`,
        contentType: type,
        mediaKind: "logo",
        body: logo.body,
      });
      return uploaded.publicUrl;
    } catch (error) {
      logger.warn("Kunne ikke hente logo fra nettsiden", {
        userId,
        candidate,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
};
