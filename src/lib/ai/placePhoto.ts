import { logger } from "@/lib/logger";

export type PlacePhotoPick = {
  imageUrl: string;
  credit: string;
};

type OpenverseResult = {
  title?: string;
  url?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  width?: number;
  height?: number;
  mature?: boolean;
  tags?: { name?: string }[];
};

const PLACE_EN: Record<string, string> = {
  Rhodos: "Rhodes",
  Kreta: "Crete",
  Kypros: "Cyprus",
  Sicilia: "Sicily",
  "Kap Verde": "Cape Verde",
  Amalfikysten: "Amalfi Coast",
};

const SUBJECT_EN: Record<string, string> = {
  gamlebyen: "old town",
  gamleby: "old town",
  stranden: "beach",
  strand: "beach",
  havnen: "harbour",
  havn: "harbour",
};

const BLOCKED_TITLE = /hotel|resort|pool|logo|flag|diagram|icon|coat of arms|\bmap\b|\bplan\b|wedding|tram|candle|butterfly|souvenir|portrait|selfie/i;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 500;

const cache = new Map<string, PlacePhotoPick[]>();

const fold = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const buildPlaceQuery = (place: string, subject?: string): string => {
  const placeEn = PLACE_EN[place] ?? place;
  const raw = subject?.trim() ?? "";
  const subjectEn = SUBJECT_EN[fold(raw)] ?? raw;
  if (!subjectEn) return `${placeEn} cityscape`;
  return `${placeEn} ${subjectEn}`;
};

const haystack = (result: OpenverseResult): string => {
  const tags = (result.tags ?? []).map((tag) => tag.name ?? "").join(" ");
  return fold(`${result.title ?? ""} ${tags}`);
};

const licenseCredit = (license: string, version?: string): string | null => {
  if (license === "cc0") return "CC0";
  if (license === "pdm") return "Public domain";
  if (license === "by") return `CC BY${version ? ` ${version}` : ""}`;
  return null;
};

const matchesPlace = (text: string, place: string): boolean => {
  const needles = [place, PLACE_EN[place]].filter((value): value is string => Boolean(value));
  return needles.some((needle) => text.includes(fold(needle).split(" ")[0] ?? fold(needle)));
};

const matchesSubject = (text: string, subject?: string): boolean => {
  const raw = subject?.trim() ?? "";
  if (!raw) return true;
  const subjectEn = SUBJECT_EN[fold(raw)] ?? raw;
  if (subjectEn === "old town") return /old town|oldtown|cityscape|city wall/.test(text);
  if (subjectEn === "beach") return /beach|coast|shore/.test(text);
  if (subjectEn === "harbour") return /harbour|harbor|port/.test(text);
  return text.includes(fold(subjectEn));
};

export const rankPlacePhotos = (payload: unknown, place: string, subject?: string): PlacePhotoPick[] => {
  const results = (payload as { results?: OpenverseResult[] } | null)?.results ?? [];
  return results
    .map((result) => {
      const imageUrl = result.url?.trim();
      const license = result.license?.trim().toLowerCase() ?? "";
      const creditName = licenseCredit(license, result.license_version);
      const creator = result.creator?.replace(/<[^>]+>/g, "").trim();
      const text = haystack(result);
      const width = result.width ?? 0;
      const height = result.height ?? 0;
      if (!imageUrl || !creditName || result.mature) return null;
      if (license === "by" && !creator) return null;
      if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
      if (BLOCKED_TITLE.test(result.title ?? "")) return null;
      if (!matchesPlace(text, place) || !matchesSubject(text, subject)) return null;
      const credit = creator ? `Foto: ${creator}, ${creditName}` : `Foto: ${creditName}`;
      return { imageUrl, credit };
    })
    .filter((item): item is PlacePhotoPick => item !== null);
};

const downloadPhoto = async (url: string): Promise<Buffer | null> => {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SosialVekst/1.0", Accept: "image/*" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 1000 ? bytes : null;
  } catch (error) {
    logger.warn("Kunne ikke laste ned stedsfoto", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export const findPlacePhoto = async (
  place: string,
  subject: string | undefined,
  used: Set<string>,
): Promise<{ bytes: Buffer; credit: string } | null> => {
  const query = buildPlaceQuery(place, subject);
  let photos = cache.get(query);
  if (!photos) {
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", query);
    url.searchParams.set("license", "by,cc0,pdm");
    url.searchParams.set("page_size", "20");
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "SosialVekst/1.0 (ekte stedsfoto)", Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return null;
      photos = rankPlacePhotos(await response.json(), place, subject);
      cache.set(query, photos);
    } catch (error) {
      logger.warn("Søk etter stedsfoto feilet", {
        query,
        error: error instanceof Error ? error.message : "ukjent",
      });
      return null;
    }
  }

  for (const photo of photos) {
    if (used.has(photo.imageUrl)) continue;
    const bytes = await downloadPhoto(photo.imageUrl);
    if (!bytes) continue;
    used.add(photo.imageUrl);
    return { bytes, credit: photo.credit };
  }
  return null;
};
