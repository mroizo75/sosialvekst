"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/components/i18n/I18nProvider";

export const Breadcrumbs = () => {
  const pathname = usePathname();
  const { dictionary } = useI18n();
  const b = dictionary.breadcrumbs;

  const routeLabels: Record<string, string> = {
    dashboard: b.overview,
    kalender: b.calendar,
    calendar: b.calendar,
    media: b.media,
    "video-studio": b.videoStudio,
    publiser: b.publish,
    onboarding: b.myCompany,
    "velg-side": b.chooseFacebookPage,
    "koble-meta": b.connectFacebook,
  };

  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const label = routeLabels[segment] ?? segment;
    const isLast = index === segments.length - 1;

    return { href, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {b.home}
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <span className="text-muted-foreground/50">/</span>
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
};
