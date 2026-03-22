"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Oversikt" },
  { href: "/kalender", label: "Kalender" },
  { href: "/media", label: "Bilder og video" },
  { href: "/publiser", label: "Publiser" },
  { href: "/onboarding", label: "Min bedrift" },
] as const;

export const AppNav = () => {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === "/kalender") {
      return pathname === "/kalender" || pathname === "/calendar";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="text-base font-bold tracking-tight text-primary shrink-0"
        >
          SosialVekst
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};
