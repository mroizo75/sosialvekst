import { logger } from "@/lib/logger";

export type PhotoAttribution = {
  creator: string;
  license: string;
};

export type PlacePhotoPick = {
  imageUrl: string;
  credit: string;
  attribution: PhotoAttribution;
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
  Rhodos: "Rhodes Greece",
  Kreta: "Crete Greece",
  Kypros: "Cyprus",
  Sicilia: "Sicily Italy",
  Korfu: "Corfu Greece",
  Kos: "Kos Greece",
  Santorini: "Santorini Greece",
  Mykonos: "Mykonos Greece",
  Hurghada: "Hurghada Egypt",
  "Sharm el-Sheikh": "Sharm el-Sheikh Egypt",
  Antalya: "Antalya Turkey",
  Alanya: "Alanya Turkey",
  Phuket: "Phuket Thailand",
  Bali: "Bali Indonesia",
  "Kap Verde": "Cape Verde",
  Amalfikysten: "Amalfi Coast",
  "Costa del Sol": "Costa del Sol Spain",
  Algarve: "Algarve Portugal",
};

const SUBJECT_EN: Record<string, string> = {
  gamlebyen: "old town",
  gamleby: "old town",
  stranden: "beach",
  strand: "beach",
  havnen: "harbour",
  havn: "harbour",
  sentrum: "city centre",
};

const GENERIC_SUBJECT = /^(downtown|down town|sentrum|centrum|center|centre|city)$/i;

const BLOCKED_TITLE = /hotel|resort|pool|logo|flag|diagram|icon|coat of arms|\bmap\b|\bplan\b|wedding|tram|candle|butterfly|souvenir|portrait|selfie/i;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 500;

const cache = new Map<string, PlacePhotoPick[]>();

const fold = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const placeLabel = (place: string): string => PLACE_EN[place] ?? place;

const specificSubject = (place: string, subject?: string): string | null => {
  const raw = subject?.trim() ?? "";
  if (!raw) return null;
  const withoutPlace = raw.replace(new RegExp(place, "ig"), " ").replace(/\s+/g, " ").trim();
  const mapped = SUBJECT_EN[fold(withoutPlace)] ?? withoutPlace;
  if (!mapped || GENERIC_SUBJECT.test(mapped) || GENERIC_SUBJECT.test(fold(mapped))) return null;
  return mapped;
};

export const placeSearchQueries = (place: string, subject?: string): { query: string; subject?: string }[] => {
  const placeEn = placeLabel(place);
  const specific = specificSubject(place, subject);
  if (!specific) {
    return [
      { query: `${placeEn} cityscape` },
      { query: `${placeEn} beach` },
      { query: placeEn },
    ];
  }
  return [
    { query: `${placeEn} ${specific}`, subject: specific },
    { query: `${placeEn} cityscape` },
    { query: `${placeEn} beach` },
  ];
};

export const buildPlaceQuery = (place: string, subject?: string): string =>
  placeSearchQueries(place, subject)[0]?.query ?? placeLabel(place);

const haystack = (result: OpenverseResult): string => {
  const tags = (result.tags ?? []).map((tag) => tag.name ?? "").join(" ");
  return fold(`${result.title ?? ""} ${tags}`);
};

const creatorIsComplete = (creator: string): boolean => {
  const name = creator.trim();
  if (!name) return false;
  if (name.includes("...") || name.includes("…")) return false;
  return true;
};

export const formatPhotoCredits = (items: PhotoAttribution[]): string => {
  const usable = items.filter((item) => item.license.trim());
  if (usable.length === 0) return "";
  const licenses = new Set(usable.map((item) => item.license));
  if (licenses.size === 1) {
    const names = usable.map((item) => item.creator.trim()).filter(Boolean);
    const license = usable[0]?.license ?? "";
    return names.length > 0 ? `Foto: ${names.join(", ")} – ${license}` : `Foto: ${license}`;
  }
  return `Foto: ${usable.map((item) => (
    item.creator.trim() ? `${item.creator.trim()} (${item.license})` : item.license
  )).join(", ")}`;
};

export const photoCreditRecord = (item: PhotoAttribution): string =>
  item.creator.trim() ? `Foto: ${item.creator.trim()}, ${item.license}` : `Foto: ${item.license}`;

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
      if (license === "by" && (!creator || !creatorIsComplete(creator))) return null;
      if (creator && !creatorIsComplete(creator)) return null;
      if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
      if (BLOCKED_TITLE.test(result.title ?? "")) return null;
      if (!matchesPlace(text, place) || !matchesSubject(text, subject)) return null;
      const attribution = { creator: creator ?? "", license: creditName };
      return { imageUrl, credit: photoCreditRecord(attribution), attribution };
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
): Promise<{ bytes: Buffer; credit: string; attribution: PhotoAttribution } | null> => {
  for (const attempt of placeSearchQueries(place, subject)) {
    const cacheKey = `${attempt.query}|${attempt.subject ?? ""}`;
    let photos = cache.get(cacheKey);
    if (!photos) {
      const url = new URL("https://api.openverse.org/v1/images/");
      url.searchParams.set("q", attempt.query);
      url.searchParams.set("license", "by,cc0,pdm");
      url.searchParams.set("page_size", "20");
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "SosialVekst/1.0 (ekte stedsfoto)", Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) continue;
        photos = rankPlacePhotos(await response.json(), place, attempt.subject);
        cache.set(cacheKey, photos);
      } catch (error) {
        logger.warn("Søk etter stedsfoto feilet", {
          query: attempt.query,
          error: error instanceof Error ? error.message : "ukjent",
        });
        continue;
      }
    }

    for (const photo of photos) {
      if (used.has(photo.imageUrl)) continue;
      const bytes = await downloadPhoto(photo.imageUrl);
      if (!bytes) continue;
      used.add(photo.imageUrl);
      return { bytes, credit: photo.credit, attribution: photo.attribution };
    }
  }
  return null;
};
