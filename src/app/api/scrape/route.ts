import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { analyzeWebsiteContent } from "@/lib/scraping/analyzer";
import { parseHtml } from "@/lib/scraping/parser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const scrapeSchema = z.object({
  url: z.string().url("Ugyldig URL"),
  companyName: z.string().min(1),
});

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

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

const fetchSafeHtml = async (inputUrl: string): Promise<{ html: string; finalUrl: string }> => {
  let currentUrl = inputUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    await assertPublicTarget(currentUrl);

    const response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "SosialVekst/1.0 (website-analyzer)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
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
      throw new Error(`Kunne ikke hente nettside: HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) {
      throw new Error("Kun HTML-sider kan analyseres.");
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
      throw new Error("Nettsiden er for stor å analysere.");
    }

    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      throw new Error("Nettsiden er for stor å analysere.");
    }

    return { html, finalUrl: currentUrl };
  }

  throw new Error("For mange redirects under nettside-analyse.");
};

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const json = await request.json();
    const { url, companyName } = scrapeSchema.parse(json);

    const { html, finalUrl } = await fetchSafeHtml(url);
    const parsed = parseHtml(html);
    const analysis = await analyzeWebsiteContent(parsed, companyName);

    const supabase = await createSupabaseServerClient();
    const { error: dbError } = await supabase
      .from("brand_profiles")
      .update({
        website_url: finalUrl,
        website_content: [parsed.title, parsed.metaDescription, parsed.content.slice(0, 1500)]
          .filter(Boolean)
          .join(" | "),
        company_description: analysis.companyDescription,
        products: analysis.products,
        unique_selling_points: analysis.uniqueSellingPoints,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (dbError) {
      return NextResponse.json(
        toAppError("SCRAPE_SAVE_FAILED", "Kunne ikke lagre analyseresultat", dbError.message),
        { status: 500 },
      );
    }

    return NextResponse.json({
      companyDescription: analysis.companyDescription,
      products: analysis.products,
      uniqueSellingPoints: analysis.uniqueSellingPoints,
      websiteTitle: parsed.title,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("SCRAPE_ERROR", "Feil under nettside-analyse", appError),
      { status: 400 },
    );
  }
}
