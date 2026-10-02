import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openai", () => ({ getOpenAiClient: () => null }));

import { emptySuggestion, parseSuggestion } from "@/lib/scraping/analyzer";
import { pickBrandColors } from "@/lib/scraping/brandColors";
import { pickSubpages, unwrapImageProxy } from "@/lib/scraping/crawler";
import { formatFacebookPage } from "@/lib/scraping/facebookPage";
import { parseHtml } from "@/lib/scraping/parser";
import { buildProfileUpdate } from "@/lib/scraping/profileMerge";

const HTML = `<!doctype html><html><head>
<title>Sydenklar – Reiser til sola</title>
<meta name="description" content="Vi finner beste hotell i syden">
<meta name="theme-color" content="#0a7cff">
<link rel="stylesheet" href="/css/main.css">
<link rel="apple-touch-icon" href="/icon.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"TravelAgency","name":"Sydenklar","logo":{"url":"https://sydenklar.no/logo.svg"},"foundingDate":"2019","sameAs":["https://www.facebook.com/sydenklar"]}]}</script>
<style>:root{--brand-primary:#ff6b00}</style>
</head><body><header><img class="site-logo" src="/img/logo.png"></header>
<main><h1>Velkommen</h1><p>Vi hjelper deg med &amp; reisen.</p>
<a href="/om-oss">Om oss</a><a href="/hoteller">Hoteller</a><a href="https://annen.no/om-oss">Ekstern</a>
<a href="/kontakt#skjema">Kontakt</a><a href="mailto:post@sydenklar.no">E-post</a><a href="/vilkar.pdf">Priser PDF</a></main>
</body></html>`;

describe("parseHtml", () => {
  it("henter metadata, logo, farger, lenker og strukturert data", () => {
    const parsed = parseHtml(HTML);
    expect(parsed.title).toBe("Sydenklar – Reiser til sola");
    expect(parsed.themeColor).toBe("#0a7cff");
    expect(parsed.content).toContain("Vi hjelper deg med & reisen.");
    expect(parsed.logoCandidates).toEqual(["https://sydenklar.no/logo.svg", "/img/logo.png", "/icon.png"]);
    expect(parsed.stylesheets).toEqual(["/css/main.css"]);
    expect(parsed.facebookUrl).toBe("https://www.facebook.com/sydenklar");
    expect(parsed.organization).toMatchObject({ name: "Sydenklar", foundingDate: "2019" });
    expect(parsed.links.some((link) => link.href.startsWith("mailto:"))).toBe(false);
  });

  it("hopper over delingsbilder som er merket som logo", () => {
    const parsed = parseHtml(`<head><script type="application/ld+json">{"@type":"Organization","logo":"https://a.no/opengraph-image"}</script></head><body><img alt="Logo" src="/logo-nova.png"></body>`);
    expect(parsed.logoCandidates).toEqual(["/logo-nova.png"]);
  });

  it("tåler ugyldig JSON-LD og sider uten noe ekstra", () => {
    const parsed = parseHtml(`<html><head><script type="application/ld+json">{ikke json</script></head><body>Hei</body></html>`);
    expect(parsed.organization).toBeUndefined();
    expect(parsed.logoCandidates).toEqual([]);
    expect(parsed.content).toBe("Hei");
  });
});

describe("pickSubpages", () => {
  it("velger relevante undersider på samme domene og hopper over filer og eksterne lenker", () => {
    const { links } = parseHtml(HTML);
    expect(pickSubpages(links, "https://www.sydenklar.no/")).toEqual([
      "https://www.sydenklar.no/om-oss",
      "https://www.sydenklar.no/hoteller",
      "https://www.sydenklar.no/kontakt",
    ]);
  });

  it("pakker ut Next.js-bildeadresser til originalfilen", () => {
    expect(unwrapImageProxy("https://www.sydenklar.no/_next/image?url=%2Flogo-hvit.png&w=1080&q=75")).toBe("https://www.sydenklar.no/logo-hvit.png");
    expect(unwrapImageProxy("https://a.no/logo.svg")).toBe("https://a.no/logo.svg");
  });

  it("returnerer tom liste når ingen lenker matcher", () => {
    expect(pickSubpages([{ href: "/blogg/innlegg-1", text: "Les mer" }], "https://a.no/")).toEqual([]);
  });
});

describe("pickBrandColors", () => {
  it("prioriterer theme-color og merkevarevariabler foran tilfeldige farger", () => {
    const colors = pickBrandColors("#0a7cff", [":root{--brand-primary:#ff6b00} .x{color:#22aa44} .y{color:#ffffff}"]);
    expect(colors).toEqual({ primary: "#0a7cff", secondary: "#ff6b00", accent: "#22aa44" });
  });

  it("ignorerer svart, hvitt og grått, også Tailwinds blågrå toner", () => {
    expect(pickBrandColors(undefined, ["body{color:#000;background:#fff;border-color:#888888}"])).toBeUndefined();
    expect(pickBrandColors(undefined, [".a{color:#cbd5e1}.b{color:#1f2937}.c{color:#2b6f7e}"])).toEqual({ primary: "#2b6f7e" });
  });
});

describe("formatFacebookPage", () => {
  it("lager lesbar tekst av sidefeltene", () => {
    expect(formatFacebookPage({ name: "Sydenklar", category: "Reisebyrå", about: " Sol hele året " })).toBe(
      "Navn: Sydenklar\nKategori: Reisebyrå\nOm: Sol hele året",
    );
  });

  it("returnerer undefined når siden ikke har tekst", () => {
    expect(formatFacebookPage({ id: "123", about: "" })).toBeUndefined();
  });
});

describe("parseSuggestion", () => {
  it("validerer, kutter og fjerner duplikater", () => {
    const suggestion = parseSuggestion(JSON.stringify({ industry: "Reiseliv", products: ["Pakkereiser", "Pakkereiser", "Hotell"], foundedYear: 2019 }));
    expect(suggestion.industry).toBe("Reiseliv");
    expect(suggestion.products).toEqual(["Pakkereiser", "Hotell"]);
    expect(suggestion.foundedYear).toBe("");
    expect(suggestion.services).toEqual([]);
  });

  it("gir tomt forslag ved ugyldig JSON", () => {
    expect(parseSuggestion("ikke json")).toEqual(emptySuggestion());
  });
});

describe("buildProfileUpdate", () => {
  const extras = { websiteUrl: "https://sydenklar.no/", websiteContent: "Sydenklar" };

  it("fyller bare tomme felt og beholder det brukeren har skrevet", () => {
    const suggestion = { ...emptySuggestion(), industry: "Reiseliv", targetAudience: "Barnefamilier", services: ["Hotellsøk"] };
    const update = buildProfileUpdate(
      { industry: "Reisebyrå", target_audience: "", services: [], brand_colors: { primary: "#111111" }, logo_url: null },
      suggestion,
      { ...extras, brandColors: { primary: "#0a7cff" }, logoUrl: "https://cdn/logo.png" },
    );
    expect(update).toEqual({
      website_url: "https://sydenklar.no/",
      website_content: "Sydenklar",
      target_audience: "Barnefamilier",
      services: ["Hotellsøk"],
      logo_url: "https://cdn/logo.png",
    });
  });

  it("setter farger når profilen ikke har noen, og ignorerer tomme forslag", () => {
    const update = buildProfileUpdate(null, emptySuggestion(), { ...extras, brandColors: { primary: "#0a7cff" } });
    expect(update).toEqual({ ...{ website_url: extras.websiteUrl, website_content: "Sydenklar" }, brand_colors: { primary: "#0a7cff" } });
  });
});
