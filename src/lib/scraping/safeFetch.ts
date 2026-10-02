import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const USER_AGENT = "SosialVekst/1.0 (website-analyzer)";

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split(".").map((value) => Number(value));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
};

const isPrivateIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
};

const isBlockedHost = (host: string): boolean => {
  const normalized = host.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  );
};

const assertPublicTarget = async (targetUrl: string): Promise<void> => {
  const parsed = new URL(targetUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Kun http/https er tillatt.");
  }

  if (parsed.port && !["80", "443"].includes(parsed.port)) {
    throw new Error("Kun standard porter 80/443 er tillatt.");
  }

  if (isBlockedHost(parsed.hostname)) {
    throw new Error("Ugyldig vertsnavn for scraping.");
  }

  const ipType = isIP(parsed.hostname);
  if (ipType === 4 && isPrivateIpv4(parsed.hostname)) {
    throw new Error("Private IPv4-adresser er ikke tillatt.");
  }
  if (ipType === 6 && isPrivateIpv6(parsed.hostname)) {
    throw new Error("Private IPv6-adresser er ikke tillatt.");
  }

  if (ipType === 0) {
    const resolved = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (resolved.length === 0) {
      throw new Error("Kunne ikke slå opp vertsnavn.");
    }
    for (const item of resolved) {
      if ((item.family === 4 && isPrivateIpv4(item.address)) || (item.family === 6 && isPrivateIpv6(item.address))) {
        throw new Error("Vertsnavn peker til privat adresse og er blokkert.");
      }
    }
  }
};

export type SafeFetchOptions = {
  accept: string;
  allowedTypes: string[];
  maxBytes: number;
};

export type SafeFetchResult = {
  body: Uint8Array;
  contentType: string;
  finalUrl: string;
};

// Every hop is re-validated so a public URL cannot redirect the server into a private network.
export const fetchSafe = async (inputUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> => {
  let currentUrl = inputUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    await assertPublicTarget(currentUrl);

    const response = await fetch(currentUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: options.accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect uten location-header.");
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Kunne ikke hente ${currentUrl}: HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!options.allowedTypes.some((type) => contentType.includes(type))) {
      throw new Error(`Uventet filtype (${contentType || "ukjent"}).`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      throw new Error("Filen er for stor å analysere.");
    }

    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > options.maxBytes) {
      throw new Error("Filen er for stor å analysere.");
    }

    return { body, contentType, finalUrl: currentUrl };
  }

  throw new Error("For mange redirects under nettside-analyse.");
};

export const fetchSafeText = async (
  url: string,
  options: SafeFetchOptions,
): Promise<{ text: string; finalUrl: string }> => {
  const result = await fetchSafe(url, options);
  return { text: new TextDecoder().decode(result.body), finalUrl: result.finalUrl };
};
