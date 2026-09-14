"use client";

import Link from "next/link";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

function MarketingHeader() {
  const { dictionary } = useI18n();
  const h = dictionary.marketing.header;

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "#040409",
        borderBottom: "1px solid oklch(18% 0.022 265 / 0.6)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
        <Link
          href="/"
          style={{
            color: "oklch(95% 0.005 260)",
            fontFamily: "var(--font-bricolage), system-ui, sans-serif",
            fontSize: "1.1rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          SosialVekst
        </Link>

        <nav className="flex items-center gap-1">
          <LanguageSwitcher variant="marketing" className="mr-2" />
          <Link
            href="/login"
            className="marketing-nav-link rounded-lg px-4 py-2 text-sm font-medium"
          >
            {h.login}
          </Link>
          <Link
            href="/register"
            className="inline-flex h-9 items-center rounded-lg px-5 text-sm font-semibold transition-all"
            style={{
              background: "oklch(66% 0.28 280)",
              color: "oklch(98% 0.003 260)",
              boxShadow: "0 0 20px oklch(66% 0.28 280 / 0.4)",
            }}
          >
            {h.getStarted}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function MarketingFooter() {
  const { dictionary } = useI18n();
  const f = dictionary.marketing.footer;

  return (
    <footer
      style={{
        background: "oklch(7% 0.018 265)",
        borderTop: "1px solid oklch(18% 0.022 265)",
      }}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="text-sm font-bold"
              style={{
                color: "oklch(95% 0.005 260)",
                fontFamily: "var(--font-bricolage), system-ui, sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              SosialVekst
            </Link>
            <p
              className="text-sm max-w-xs leading-relaxed"
              style={{ color: "oklch(50% 0.015 260)" }}
            >
              {f.tagline}
            </p>
          </div>

          <div className="flex gap-12 text-sm">
            <div className="flex flex-col gap-3">
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "oklch(42% 0.015 260)" }}
              >
                {f.product}
              </span>
              <Link href="/#slik-fungerer-det" className="marketing-footer-link">
                {f.howItWorks}
              </Link>
              <Link href="/register" className="marketing-footer-link">
                {f.getStarted}
              </Link>
              <Link href="/login" className="marketing-footer-link">
                {f.login}
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "oklch(42% 0.015 260)" }}
              >
                {f.legal}
              </span>
              <Link href="/privacy" className="marketing-footer-link">
                {f.privacy}
              </Link>
              <Link href="/terms" className="marketing-footer-link">
                {f.terms}
              </Link>
            </div>
          </div>
        </div>

        <div
          className="mt-10 pt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs"
          style={{
            borderTop: "1px solid oklch(16% 0.02 265)",
            color: "oklch(40% 0.012 260)",
          }}
        >
          <span>
            &copy; {new Date().getFullYear()} SosialVekst. {f.rights}
          </span>
          <span>{f.norwegianTool}</span>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </>
  );
}
