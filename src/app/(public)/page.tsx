import type React from "react";
import Link from "next/link";
import Image from "next/image";

import { getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/get-locale";

type LandingDict = Dictionary["marketing"]["landing"];
type AnalysisMockupCopy = LandingDict["howItWorks"]["mockups"]["analysis"];
type BrandMockupCopy = LandingDict["howItWorks"]["mockups"]["brand"];
type ApprovalMockupCopy = LandingDict["howItWorks"]["mockups"]["approval"];
type RefineMockupCopy = LandingDict["howItWorks"]["mockups"]["refine"];

/* ─── Produkt-mockups ─────────────────────────────────────────────── */

function AnalysisMockup({ copy }: { copy: AnalysisMockupCopy }) {
  const steps = copy.steps.map((text, i) => ({
    text,
    done: i < 2,
    active: i === 2,
  }));
  return (
    <div
      style={{
        background: "white",
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid #e8e8ec",
        boxShadow: "0 8px 32px rgb(0 0 0 / 0.09)",
        maxWidth: 400,
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #f2f2f5",
          display: "flex",
          gap: 10,
          alignItems: "center",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            flex: 1,
            background: "white",
            borderRadius: 9,
            padding: "9px 12px",
            fontSize: 13,
            color: "#555",
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid #e8e8ec",
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
          {copy.domain}
        </div>
        <div
          style={{
            background: "oklch(62% 0.26 280)",
            color: "white",
            borderRadius: 9,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {copy.analyze}
        </div>
      </div>
      <div style={{ padding: "16px 18px" }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 0",
              opacity: !step.done && !step.active ? 0.32 : 1,
              borderBottom: i < steps.length - 1 ? "1px solid #f5f5f5" : "none",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                flexShrink: 0,
                background: step.done
                  ? "#22c55e"
                  : step.active
                  ? "oklch(62% 0.26 280)"
                  : "#e8e8ec",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {step.done ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : step.active ? (
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "white", animation: "pulse-ring 1.5s ease infinite" }} />
              ) : null}
            </div>
            <span
              style={{
                fontSize: 13,
                color: step.done ? "#111" : step.active ? "oklch(42% 0.26 280)" : "#bbb",
                fontWeight: step.active ? 600 : 400,
                flex: 1,
              }}
            >
              {step.text}
            </span>
            {step.active && (
              <span
                style={{
                  fontSize: 11,
                  color: "oklch(52% 0.26 280)",
                  background: "oklch(96% 0.02 280)",
                  padding: "2px 9px",
                  borderRadius: 100,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {copy.inProgress}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandMockup({ copy }: { copy: BrandMockupCopy }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 18,
        border: "1px solid #e8e8ec",
        boxShadow: "0 8px 32px rgb(0 0 0 / 0.09)",
        overflow: "hidden",
        maxWidth: 400,
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid #f2f2f5",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#fafafa",
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: "oklch(95% 0.025 280)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          🏢
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{copy.company}</div>
          <div style={{ fontSize: 12, color: "#999" }}>{copy.subtitle}</div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 0 3px #dcfce7",
          }}
        />
      </div>
      <div
        style={{
          padding: "14px 18px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {[
          { label: copy.industryLabel, value: copy.industryValue, icon: "📊" },
          { label: copy.toneLabel, value: copy.toneValue, icon: "🎙️" },
          { label: copy.platformsLabel, value: copy.platformsValue, icon: "📲" },
          { label: copy.frequencyLabel, value: copy.frequencyValue, icon: "📅" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "#f8f8fa",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#bbb",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {item.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>
              {item.icon} {item.value}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: "12px 18px",
          background: "oklch(97% 0.018 280)",
          borderTop: "1px solid oklch(91% 0.02 280)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(44% 0.26 280)" }}>
          {copy.thisWeek}
        </span>
        <span style={{ fontSize: 13, color: "oklch(50% 0.26 280)" }}>
          {copy.postsReady}
        </span>
      </div>
    </div>
  );
}

function ApprovalMockup({ copy }: { copy: ApprovalMockupCopy }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 18,
        border: "1px solid #e8e8ec",
        boxShadow: "0 8px 32px rgb(0 0 0 / 0.09)",
        overflow: "hidden",
        maxWidth: 340,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #f2f2f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "oklch(52% 0.14 200)",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>LinkedIn</span>
        </div>
        <span
          style={{
            fontSize: 11,
            background: "oklch(96% 0.02 280)",
            color: "oklch(50% 0.26 280)",
            padding: "3px 9px",
            borderRadius: 100,
            fontWeight: 600,
          }}
        >
          {copy.aiSuggestion}
        </span>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <p style={{ fontSize: 13, color: "#333", lineHeight: 1.65, marginBottom: 12 }}>
          {copy.postText}
        </p>
        <div
          style={{
            height: 110,
            borderRadius: 11,
            background:
              "linear-gradient(135deg, oklch(94% 0.022 200), oklch(87% 0.04 210))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="oklch(52% 0.14 200)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div
            style={{
              padding: "11px",
              borderRadius: 10,
              background: "#f5f5f7",
              border: "1px solid #e8e8ec",
              fontSize: 13,
              fontWeight: 600,
              color: "#777",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            {copy.skip}
          </div>
          <div
            style={{
              padding: "11px",
              borderRadius: 10,
              background: "oklch(62% 0.26 280)",
              fontSize: 13,
              fontWeight: 600,
              color: "white",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            {copy.approve}
          </div>
        </div>
      </div>
      <div
        style={{
          padding: "9px 16px",
          borderTop: "1px solid #f0f0f0",
          textAlign: "center",
          fontSize: 11,
          color: "#ccc",
        }}
      >
        {copy.queueFooter}
      </div>
    </div>
  );
}

function RefineMockup({ copy }: { copy: RefineMockupCopy }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 18,
        border: "1px solid #e8e8ec",
        boxShadow: "0 8px 32px rgb(0 0 0 / 0.09)",
        overflow: "hidden",
        maxWidth: 400,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #f2f2f5",
          display: "flex",
          gap: 10,
          alignItems: "center",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "oklch(97% 0.015 350)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          📸
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
            {copy.brandChannel}
          </div>
          <div style={{ fontSize: 11, color: "#bbb" }}>{copy.aiGenerated}</div>
        </div>
      </div>
      <div
        style={{
          padding: "14px 16px",
          fontSize: 13,
          color: "#444",
          lineHeight: 1.65,
          borderBottom: "1px solid #f5f5f7",
        }}
      >
        {copy.postText}
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#bbb",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          {copy.refineLabel}
        </div>
        <div
          style={{
            background: "#f8f8fa",
            borderRadius: 10,
            padding: "10px 13px",
            fontSize: 13,
            color: "#555",
            marginBottom: 10,
            border: "1px solid #eee",
            fontStyle: "italic",
          }}
        >
          {copy.refineHint}
        </div>
        <div
          style={{
            width: "100%",
            padding: "11px",
            borderRadius: 10,
            background: "oklch(62% 0.26 280)",
            fontSize: 13,
            fontWeight: 600,
            color: "white",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {copy.rewrite}
        </div>
      </div>
    </div>
  );
}

/* ─── Data ─────────────────────────────────────────────────────── */

const platforms: {
  name: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}[] = [
  {
    name: "Facebook",
    color: "oklch(53% 0.19 262)",
    bg: "oklch(97% 0.012 262)",
    border: "oklch(90% 0.025 262)",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    color: "oklch(55% 0.22 350)",
    bg: "oklch(97.5% 0.01 350)",
    border: "oklch(91% 0.022 350)",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    color: "oklch(52% 0.14 200)",
    bg: "oklch(97% 0.01 200)",
    border: "oklch(90% 0.022 200)",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    name: "TikTok",
    color: "#111111",
    bg: "#f5f5f5",
    border: "#e0e0e0",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.77 0 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.78a4.85 4.85 0 0 1-1.01-.09z" />
      </svg>
    ),
  },
];

const PROBLEM_ICONS = ["⏰", "📝", "📉", "🤖"] as const;
const STRATEGY_ICONS = [
  { icon: "📅", accent: "oklch(70% 0.22 210)" },
  { icon: "🎯", accent: "oklch(75% 0.26 280)" },
  { icon: "📣", accent: "oklch(68% 0.24 35)" },
  { icon: "🛒", accent: "oklch(65% 0.22 145)" },
] as const;
const CONTROL_ICONS = ["✏️", "🖼️", "📅", "🎯", "🔄", "✅"] as const;
const STATS_BAR_VALUES = ["4+", "90", "4", "5 min"] as const;

/* ─── Page ──────────────────────────────────────────────────────── */

export default async function LandingPage() {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const l = dict.marketing.landing;
  const mockups = l.howItWorks.mockups;

  const howItWorks = [
    {
      number: "1",
      title: l.howItWorks.steps[0].title,
      description: l.howItWorks.steps[0].description,
      mockup: <AnalysisMockup copy={mockups.analysis} />,
    },
    {
      number: "2",
      title: l.howItWorks.steps[1].title,
      description: l.howItWorks.steps[1].description,
      mockup: <BrandMockup copy={mockups.brand} />,
    },
    {
      number: "3",
      title: l.howItWorks.steps[2].title,
      description: l.howItWorks.steps[2].description,
      mockup: <ApprovalMockup copy={mockups.approval} />,
    },
    {
      number: "4",
      title: l.howItWorks.steps[3].title,
      description: l.howItWorks.steps[3].description,
      mockup: <RefineMockup copy={mockups.refine} />,
    },
  ];

  return (
    <main>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section
        style={{
          backgroundImage: "url('/hero-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dark overlay for text readability */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 0,
            background: "linear-gradient(105deg, #040409ee 0%, #040409bb 45%, #04040988 100%)",
          }}
        />
        {/* Bottom fade into next section */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0"
          style={{
            zIndex: 0,
            height: "25%",
            background: "linear-gradient(to bottom, transparent, #040409)",
          }}
        />

        <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-6 py-16 sm:py-20" style={{ zIndex: 1 }}>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">

            {/* Left: Logo + copy */}
            <div>
              <div style={{ animation: "fade-in 0.5s ease-out both" }}>
                <Image src="/logo-white.png" alt="SosialVekst" width={400} height={400} className="h-36 w-auto sm:h-44 mb-8" style={{ width: "auto" }} priority />
              </div>

              <h1
                className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-[3.4rem]"
                style={{
                  lineHeight: 1.08,
                  fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                  animation: "slide-up-lg 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both",
                }}
              >
                <span style={{ color: "oklch(96% 0.005 260)" }}>{l.hero.headline1}</span>
                <br />
                <span className="shimmer-text">{l.hero.headline2}</span>
              </h1>

              <p
                className="mt-5 text-lg leading-relaxed max-w-lg"
                style={{
                  color: "oklch(65% 0.018 260)",
                  animation: "slide-up-lg 0.6s cubic-bezier(0.16,1,0.3,1) 0.18s both",
                }}
              >
                {l.hero.subhead}
              </p>

              <form
                action="/register"
                method="get"
                className="mt-8 flex flex-col gap-3 sm:flex-row max-w-lg"
                style={{ animation: "slide-up-lg 0.6s cubic-bezier(0.16,1,0.3,1) 0.25s both" }}
              >
                <input
                  name="url"
                  type="text"
                  placeholder={l.hero.urlPlaceholder}
                  autoComplete="off"
                  className="flex-1 rounded-xl px-5 text-sm outline-none"
                  style={{
                    height: 52,
                    background: "oklch(16% 0.02 265)",
                    border: "1px solid oklch(28% 0.026 265)",
                    color: "oklch(90% 0.006 260)",
                    fontFamily: "var(--font-plus-jakarta), system-ui, sans-serif",
                  }}
                />
                <button
                  type="submit"
                  className="glow-btn inline-flex items-center justify-center rounded-xl px-6 text-sm font-semibold whitespace-nowrap"
                  style={{
                    height: 52,
                    background: "oklch(66% 0.28 280)",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {l.hero.cta}
                  <svg className="ml-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </form>

              <div
                className="mt-6 flex flex-wrap items-center gap-2"
                style={{ animation: "slide-up-lg 0.6s cubic-bezier(0.16,1,0.3,1) 0.33s both" }}
              >
                <span className="text-xs mr-1" style={{ color: "oklch(42% 0.012 260)" }}>{l.hero.postsTo}</span>
                {[
                  { name: "Facebook", c: "oklch(53% 0.19 262)" },
                  { name: "Instagram", c: "oklch(55% 0.22 350)" },
                  { name: "LinkedIn", c: "oklch(52% 0.14 200)" },
                  { name: "TikTok", c: "oklch(65% 0.01 260)" },
                ].map((p) => (
                  <span
                    key={p.name}
                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                    style={{
                      background: `${p.c.replace(")", " / 0.12)")}`,
                      border: `1px solid ${p.c.replace(")", " / 0.3)")}`,
                      color: p.c,
                    }}
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Hero illustration */}
            <div
              className="hidden lg:block relative"
              style={{ animation: "fade-in 0.9s ease-out 0.3s both" }}
            >
              {/* Glow behind image */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: "-15%",
                  background: "radial-gradient(ellipse 70% 60% at 50% 50%, oklch(66% 0.28 280 / 0.2) 0%, transparent 70%)",
                  pointerEvents: "none",
                  filter: "blur(20px)",
                }}
              />
              <Image
                src="/hero-illustration.png"
                alt={l.hero.heroImageAlt}
                width={1200}
                height={675}
                className="relative w-full rounded-2xl"
                style={{
                  boxShadow: "0 24px 80px oklch(0% 0 0 / 0.5), 0 0 0 1px oklch(40% 0.04 265)",
                  animation: "float 9s ease-in-out infinite",
                }}
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ─────────────────────────────────────── */}
      <section style={{ background: "oklch(6% 0.02 265)", borderBottom: "1px solid oklch(16% 0.02 265)" }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-12 sm:py-14">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {l.statsStrip.items.map((item) => (
              <div key={item.stat} className="flex flex-col gap-2">
                <div
                  className="text-4xl font-extrabold"
                  style={{
                    color: "oklch(75% 0.26 280)",
                    fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                    lineHeight: 1,
                  }}
                >
                  {item.stat}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "oklch(62% 0.015 260)" }}>
                  {item.text}
                </p>
                <span className="mt-auto text-xs" style={{ color: "oklch(40% 0.012 260)" }}>
                  {l.statsStrip.sourceLabel}: {item.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM SECTION ─────────────────────────────────── */}
      <section style={{ background: "white" }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-20 sm:py-28">
          <div className="text-center mb-14">
            <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "oklch(62% 0.26 280)" }}>
              {l.problem.eyebrow}
            </span>
            <h2
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{ color: "oklch(12% 0.015 260)", fontFamily: "var(--font-bricolage), system-ui, sans-serif" }}
            >
              {l.problem.title1}
              <br />
              <span style={{ color: "oklch(55% 0.26 280)" }}>{l.problem.title2}</span>
            </h2>
            <p className="mt-4 max-w-xl mx-auto text-base leading-relaxed" style={{ color: "oklch(50% 0.015 260)" }}>
              {l.problem.subhead}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {l.problem.cards.map((card, i) => (
              <div
                key={card.title}
                className="card-hover scroll-reveal rounded-2xl p-7 flex gap-5"
                style={{ background: "oklch(98.5% 0.005 75)", border: "1px solid oklch(93% 0.006 75)" }}
              >
                <div
                  className="shrink-0 flex size-12 items-center justify-center rounded-xl text-2xl"
                  style={{ background: "white", border: "1px solid oklch(91% 0.006 75)" }}
                >
                  {PROBLEM_ICONS[i]}
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "oklch(14% 0.015 260)" }}>
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "oklch(50% 0.015 260)" }}>
                    {card.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-12 rounded-2xl p-8 text-center scroll-reveal"
            style={{ background: "oklch(97% 0.018 280)", border: "1px solid oklch(90% 0.022 280)" }}
          >
            <p
              className="text-xl font-bold mb-2"
              style={{ color: "oklch(14% 0.015 260)", fontFamily: "var(--font-bricolage), system-ui, sans-serif" }}
            >
              {l.problem.calloutTitle}
            </p>
            <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: "oklch(48% 0.015 260)" }}>
              {l.problem.calloutText}
            </p>
            <div className="mt-5 flex flex-wrap gap-3 justify-center text-sm">
              {l.problem.badges.map((t) => (
                <span key={t} className="px-3 py-1.5 rounded-full font-medium" style={{ background: "white", color: "oklch(44% 0.26 280)", border: "1px solid oklch(88% 0.022 280)" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────── */}
      <section style={{ background: "oklch(12% 0.02 265)", borderBottom: "1px solid oklch(20% 0.022 265)" }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 text-center">
            {STATS_BAR_VALUES.map((value, i) => (
              <div key={l.statsBar.labels[i]} className="flex flex-col gap-1">
                <span
                  className="text-3xl font-black sm:text-4xl"
                  style={{
                    fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                    background: "linear-gradient(135deg, oklch(72% 0.3 280), oklch(68% 0.24 210))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {value}
                </span>
                <span className="text-xs" style={{ color: "oklch(52% 0.015 260)" }}>
                  {l.statsBar.labels[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SLIK FUNGERER DET ───────────────────────────────── */}
      <section id="slik-fungerer-det" style={{ background: "white" }}>
        <div className="mx-auto max-w-6xl px-5 sm:px-6 py-20 sm:py-28">
          <div className="text-center mb-4">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "oklch(62% 0.26 280)" }}
            >
              {l.howItWorks.eyebrow}
            </span>
          </div>
          <h2
            className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl mb-10"
            style={{
              color: "oklch(12% 0.015 260)",
              fontFamily: "var(--font-bricolage), system-ui, sans-serif",
            }}
          >
            {l.howItWorks.title}
          </h2>

          {/* Workflow illustration */}
          <div className="scroll-reveal mb-20 rounded-2xl overflow-hidden" style={{ boxShadow: "0 4px 32px rgb(0 0 0 / 0.08)", border: "1px solid oklch(92% 0.006 75)" }}>
            <Image
              src="/workflow-illustration.png"
              alt={l.howItWorks.workflowAlt}
              width={1200}
              height={675}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-28">
            {howItWorks.map((step, i) => (
              <div
                key={step.number}
                className={`scroll-reveal flex flex-col gap-12 lg:items-center lg:gap-16 ${
                  i % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
                }`}
              >
                {/* Text */}
                <div className="flex-1">
                  <div
                    className="mb-5 inline-flex items-center justify-center rounded-2xl text-3xl font-black"
                    style={{
                      width: 56,
                      height: 56,
                      background: "oklch(96% 0.02 280)",
                      color: "oklch(55% 0.26 280)",
                      fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                    }}
                  >
                    {step.number}
                  </div>
                  <h3
                    className="text-2xl font-extrabold tracking-tight mb-4 sm:text-3xl"
                    style={{
                      color: "oklch(12% 0.015 260)",
                      fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-base leading-relaxed max-w-md"
                    style={{ color: "oklch(48% 0.015 260)" }}
                  >
                    {step.description}
                  </p>
                  <Link
                    href="/register"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: "oklch(55% 0.26 280)" }}
                  >
                    {l.howItWorks.tryFree}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>

                {/* Mockup */}
                <div className="flex flex-1 justify-center lg:justify-start">
                  {step.mockup}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KALENDER SHOWCASE ────────────────────────────────── */}
      <section style={{ background: "oklch(98% 0.005 75)" }}>
        <div className="mx-auto max-w-6xl px-5 sm:px-6 py-20 sm:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="scroll-reveal">
              <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "oklch(62% 0.26 280)" }}>
                {l.calendar.eyebrow}
              </span>
              <h2
                className="text-3xl font-extrabold tracking-tight sm:text-4xl mb-5"
                style={{ color: "oklch(12% 0.015 260)", fontFamily: "var(--font-bricolage), system-ui, sans-serif" }}
              >
                {l.calendar.title1}
                <span style={{ color: "oklch(55% 0.26 280)" }}> {l.calendar.title2}</span>
              </h2>
              <p className="text-base leading-relaxed mb-6" style={{ color: "oklch(50% 0.015 260)" }}>
                {l.calendar.body}
              </p>
              <ul className="space-y-3 mb-8">
                {l.calendar.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm" style={{ color: "#444" }}>
                    <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="oklch(55% 0.22 150)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="inline-flex items-center rounded-xl px-7 text-sm font-semibold"
                style={{ height: 48, background: "oklch(62% 0.26 280)", color: "white", boxShadow: "0 0 24px oklch(62% 0.26 280 / 0.35)" }}
              >
                {l.calendar.cta}
                <svg className="ml-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="scroll-reveal-delay-1 relative">
              <div aria-hidden="true" style={{ position: "absolute", inset: "-8%", background: "radial-gradient(ellipse 70% 60% at 50% 50%, oklch(62% 0.26 280 / 0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
              <Image
                src="/calendar-screenshot.png"
                alt={l.calendar.imageAlt}
                width={1200}
                height={675}
                className="relative w-full rounded-2xl"
                style={{ boxShadow: "0 8px 48px rgb(0 0 0 / 0.12), 0 0 0 1px oklch(90% 0.006 75)" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── STRATEGISK PLANLEGGING ────────────────────────────── */}
      <section style={{ background: "oklch(6% 0.02 265)" }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-20 sm:py-28">

          <div className="text-center mb-14 scroll-reveal">
            <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "oklch(70% 0.22 210)" }}>
              {l.strategy.eyebrow}
            </span>
            <h2
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{ color: "oklch(96% 0.005 260)", fontFamily: "var(--font-bricolage), system-ui, sans-serif" }}
            >
              {l.strategy.title1}<br />
              <span style={{ color: "oklch(70% 0.22 210)" }}>{l.strategy.title2}</span>
            </h2>
            <p className="mt-4 max-w-xl mx-auto text-base leading-relaxed" style={{ color: "oklch(58% 0.015 260)" }}>
              {l.strategy.body}
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
            {l.strategy.features.map((f, i) => (
              <div
                key={f.title}
                className="card-hover-dark scroll-reveal rounded-2xl p-7 flex gap-5"
                style={{
                  background: "oklch(10% 0.022 265)",
                  border: "1px solid oklch(18% 0.022 265)",
                }}
              >
                <div
                  className="shrink-0 flex size-12 items-center justify-center rounded-xl text-2xl"
                  style={{ background: "oklch(14% 0.022 265)", border: `1px solid ${STRATEGY_ICONS[i].accent}44` }}
                >
                  {STRATEGY_ICONS[i].icon}
                </div>
                <div>
                  <h3
                    className="text-base font-semibold mb-2"
                    style={{ color: "oklch(92% 0.006 260)" }}
                  >
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "oklch(55% 0.015 260)" }}>
                    {f.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom callout */}
          <div
            className="mt-10 scroll-reveal rounded-2xl p-8 flex flex-col sm:flex-row items-center gap-6"
            style={{ background: "oklch(10% 0.022 265)", border: "1px solid oklch(20% 0.022 265)" }}
          >
            <div className="shrink-0 text-4xl">💡</div>
            <div className="flex-1">
              <p
                className="font-semibold text-base mb-1"
                style={{ color: "oklch(92% 0.006 260)", fontFamily: "var(--font-bricolage), system-ui, sans-serif" }}
              >
                {l.strategy.calloutTitle}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "oklch(55% 0.015 260)" }}>
                {l.strategy.calloutText}
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ── REDIGERBARHET ────────────────────────────────────── */}
      <section style={{ background: "white" }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-20 sm:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Right first on large screens */}
            <div className="scroll-reveal lg:order-2">
              <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "oklch(62% 0.26 280)" }}>
                {l.control.eyebrow}
              </span>
              <h2
                className="text-3xl font-extrabold tracking-tight sm:text-4xl mb-5"
                style={{ color: "oklch(12% 0.015 260)", fontFamily: "var(--font-bricolage), system-ui, sans-serif" }}
              >
                {l.control.title1}
                <br />
                <span style={{ color: "oklch(55% 0.26 280)" }}>{l.control.title2}</span>
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: "oklch(50% 0.015 260)" }}>
                {l.control.body}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {l.control.editItems.map((item, i) => (
                  <div
                    key={item.label}
                    className="card-hover rounded-xl p-4"
                    style={{ background: "oklch(98.5% 0.005 75)", border: "1px solid oklch(93% 0.006 75)" }}
                  >
                    <div className="text-xl mb-1.5">{CONTROL_ICONS[i]}</div>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: "oklch(14% 0.015 260)" }}>{item.label}</div>
                    <div className="text-xs leading-relaxed" style={{ color: "oklch(55% 0.015 260)" }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Left: Reassurance text */}
            <div className="scroll-reveal-delay-1 lg:order-1">
              <div
                className="rounded-2xl p-8"
                style={{ background: "oklch(97% 0.018 280)", border: "1px solid oklch(90% 0.02 280)" }}
              >
                <div className="text-4xl mb-5">💬</div>
                <blockquote className="text-base leading-relaxed mb-6 italic" style={{ color: "oklch(30% 0.015 260)" }}>
                  &ldquo;{l.control.quote}&rdquo;
                </blockquote>
                <div className="flex items-center gap-3">
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "oklch(85% 0.08 280)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👩</div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "oklch(14% 0.015 260)" }}>{l.control.quoteName}</div>
                    <div className="text-xs" style={{ color: "oklch(55% 0.015 260)" }}>{l.control.quoteRole}</div>
                  </div>
                </div>
                <div
                  className="mt-6 rounded-xl p-4 text-sm"
                  style={{ background: "white", border: "1px solid oklch(88% 0.022 280)" }}
                >
                  <strong style={{ color: "oklch(44% 0.26 280)" }}>{l.control.notTechnicalTitle}</strong>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "oklch(50% 0.015 260)" }}>
                    {l.control.notTechnicalBody}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATTFORMER ─────────────────────────────────────── */}
      <section style={{ background: "white" }}>
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-20 sm:py-28">
          <div className="text-center mb-14">
            <span
              className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest"
              style={{ color: "oklch(62% 0.26 280)" }}
            >
              {l.platforms.eyebrow}
            </span>
            <h2
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{
                color: "oklch(12% 0.015 260)",
                fontFamily: "var(--font-bricolage), system-ui, sans-serif",
              }}
            >
              {l.platforms.title}
            </h2>
            <p
              className="mt-3 max-w-md mx-auto text-base"
              style={{ color: "oklch(50% 0.015 260)" }}
            >
              {l.platforms.body}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {platforms.map((p) => (
              <div
                key={p.name}
                className="card-hover scroll-reveal flex flex-col rounded-2xl p-6"
                style={{
                  background: p.bg,
                  border: `1px solid ${p.border}`,
                }}
              >
                <div
                  className="mb-4 flex size-12 items-center justify-center rounded-xl"
                  style={{
                    background: `color-mix(in oklch, ${p.color} 15%, white)`,
                    color: p.color,
                  }}
                >
                  {p.icon}
                </div>
                <h3
                  className="text-base font-bold"
                  style={{
                    color: "oklch(12% 0.015 260)",
                    fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                  }}
                >
                  {p.name}
                </h3>
                {p.name === "TikTok" ? (
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "#888" }}>
                    {l.platforms.tiktokNote}
                  </p>
                ) : null}
                {p.name === "TikTok" && (
                  <span
                    className="mt-2 inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      background: "oklch(94% 0.025 280)",
                      color: "oklch(50% 0.26 280)",
                    }}
                  >
                    {l.platforms.newBadge}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRISER ──────────────────────────────────────────── */}
      <section style={{ background: "oklch(98% 0.005 75)" }}>
        <div className="mx-auto max-w-4xl px-5 sm:px-6 py-20 sm:py-28">
          <div className="text-center mb-14">
            <span
              className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest"
              style={{ color: "oklch(62% 0.26 280)" }}
            >
              {l.pricing.eyebrow}
            </span>
            <h2
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{
                color: "oklch(12% 0.015 260)",
                fontFamily: "var(--font-bricolage), system-ui, sans-serif",
              }}
            >
              {l.pricing.title}
            </h2>
            <p
              className="mt-3 text-base"
              style={{ color: "oklch(50% 0.015 260)" }}
            >
              {l.pricing.subtitle}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Starter */}
            <div
              className="card-hover scroll-reveal rounded-2xl p-8 flex flex-col"
              style={{
                background: "white",
                border: "1px solid oklch(91% 0.006 75)",
              }}
            >
              <div
                className="text-sm font-semibold uppercase tracking-widest mb-3"
                style={{ color: "oklch(60% 0.015 260)" }}
              >
                {l.pricing.starter.name}
              </div>
              <div
                className="text-4xl font-black mb-1"
                style={{
                  color: "oklch(12% 0.015 260)",
                  fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                }}
              >
                {l.pricing.starter.price}
              </div>
              <div className="text-sm mb-1" style={{ color: "oklch(60% 0.015 260)" }}>
                {l.pricing.starter.period}
              </div>
              <div
                className="mb-7 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold self-start mt-2"
                style={{
                  background: "oklch(96% 0.012 280)",
                  color: "oklch(50% 0.26 280)",
                }}
              >
                {l.pricing.starter.postsBadge}
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {l.pricing.starter.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm" style={{ color: "#444" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="oklch(55% 0.22 150)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block text-center rounded-xl py-3 text-sm font-semibold transition-all"
                style={{
                  background: "#f5f5f7",
                  color: "#333",
                  border: "1px solid #e5e5ea",
                }}
              >
                {l.pricing.starter.cta}
              </Link>
            </div>

            {/* Pro */}
            <div
              className="card-hover scroll-reveal-delay-1 gradient-border rounded-2xl p-8 relative overflow-hidden flex flex-col"
              style={{
                background: "oklch(62% 0.26 280)",
                border: "1px solid oklch(58% 0.26 280)",
              }}
            >
              {/* Most popular badge */}
              <div
                className="absolute top-0 right-0 rounded-bl-2xl rounded-tr-2xl px-4 py-1.5 text-xs font-bold uppercase tracking-wide"
                style={{ background: "oklch(80% 0.18 75)", color: "oklch(20% 0.05 75)" }}
              >
                {l.pricing.pro.popular}
              </div>

              <div
                className="text-sm font-semibold uppercase tracking-widest mb-3"
                style={{ color: "oklch(85% 0.1 280)" }}
              >
                {l.pricing.pro.name}
              </div>
              <div
                className="text-4xl font-black mb-1"
                style={{
                  color: "white",
                  fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                }}
              >
                {l.pricing.pro.price}
              </div>
              <div className="text-sm mb-1" style={{ color: "oklch(85% 0.1 280)" }}>
                {l.pricing.pro.period}
              </div>
              <div
                className="mb-7 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold self-start mt-2"
                style={{
                  background: "oklch(55% 0.26 280)",
                  color: "oklch(93% 0.04 280)",
                }}
              >
                {l.pricing.pro.postsBadge}
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {l.pricing.pro.features.map((f, i) => (
                  <li key={f} className="flex items-start gap-3 text-sm" style={{ color: i === 2 ? "white" : "oklch(93% 0.04 280)" }}>
                    <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={i === 2 ? "oklch(80% 0.18 75)" : "white"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                    {i === 2 && (
                      <span
                        className="ml-1 rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{ background: "oklch(80% 0.18 75)", color: "oklch(20% 0.05 75)" }}
                      >
                        {l.pricing.pro.newBadge}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* TikTok note */}
              <div
                className="mb-5 rounded-xl p-3 text-xs leading-relaxed"
                style={{
                  background: "oklch(55% 0.26 280)",
                  color: "oklch(88% 0.06 280)",
                  border: "1px solid oklch(58% 0.26 280)",
                }}
              >
                💡 {l.pricing.pro.tiktokNote}
              </div>

              <Link
                href="/register"
                className="block text-center rounded-xl py-3 text-sm font-semibold"
                style={{
                  background: "white",
                  color: "oklch(50% 0.26 280)",
                }}
              >
                {l.pricing.pro.cta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section style={{ background: "white" }}>
        <div className="mx-auto max-w-2xl px-5 sm:px-6 py-20 sm:py-28">
          <div className="text-center mb-14">
            <span
              className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest"
              style={{ color: "oklch(62% 0.26 280)" }}
            >
              {l.faq.eyebrow}
            </span>
            <h2
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{
                color: "oklch(12% 0.015 260)",
                fontFamily: "var(--font-bricolage), system-ui, sans-serif",
              }}
            >
              {l.faq.title}
            </h2>
          </div>

          <div className="flex flex-col divide-y" style={{ borderTop: "1px solid #f0f0f0", borderBottom: "1px solid #f0f0f0" }}>
            {l.faq.items.map((faq) => (
              <details
                key={faq.q}
                className="group py-5"
                style={{ listStyle: "none" }}
              >
                <summary
                  className="flex cursor-pointer items-start justify-between gap-4 text-sm font-semibold"
                  style={{
                    color: "oklch(14% 0.015 260)",
                    listStyle: "none",
                  }}
                >
                  {faq.q}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-0.5 shrink-0 transition-transform group-open:rotate-180"
                    style={{ color: "oklch(65% 0.015 260)" }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p
                  className="mt-3 text-sm leading-relaxed"
                  style={{ color: "oklch(50% 0.015 260)" }}
                >
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "oklch(10% 0.024 265)" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 80% 70% at 50% 50%, oklch(66% 0.28 280 / 0.14) 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-2xl px-5 sm:px-6 py-24 sm:py-32 text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight sm:text-5xl"
            style={{
              color: "oklch(95% 0.005 260)",
              fontFamily: "var(--font-bricolage), system-ui, sans-serif",
            }}
          >
            {l.finalCta.title1}
            <br />
            {l.finalCta.title2}
          </h2>
          <p
            className="mt-5 text-lg max-w-lg mx-auto leading-relaxed"
            style={{ color: "oklch(58% 0.018 260)" }}
          >
            {l.finalCta.body}
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-10 text-base font-semibold"
              style={{
                height: 56,
                background: "oklch(66% 0.28 280)",
                color: "white",
                boxShadow: "0 0 40px oklch(66% 0.28 280 / 0.5)",
              }}
            >
              {l.finalCta.startFree}
              <svg className="ml-2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl px-8 text-base font-semibold"
              style={{
                height: 56,
                background: "oklch(20% 0.024 265)",
                color: "oklch(70% 0.015 260)",
                border: "1px solid oklch(28% 0.028 265)",
              }}
            >
              {l.finalCta.login}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
