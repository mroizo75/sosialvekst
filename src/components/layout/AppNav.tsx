"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string): boolean => {
    if (href === "/kalender") {
      return pathname === "/kalender" || pathname === "/calendar";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        <nav className="hidden sm:flex items-center gap-1">
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

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="sm:hidden flex flex-col items-center justify-center gap-1 p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
          aria-label="Meny"
        >
          <span className={cn(
            "block h-0.5 w-5 rounded-full bg-foreground transition-all",
            mobileOpen && "translate-y-[6px] rotate-45",
          )} />
          <span className={cn(
            "block h-0.5 w-5 rounded-full bg-foreground transition-all",
            mobileOpen && "opacity-0",
          )} />
          <span className={cn(
            "block h-0.5 w-5 rounded-full bg-foreground transition-all",
            mobileOpen && "-translate-y-[6px] -rotate-45",
          )} />
        </button>

        <span className="sm:hidden text-sm font-semibold text-foreground">
          {NAV_ITEMS.find((item) => isActive(item.href))?.label ?? "SosialVekst"}
        </span>

        <div className="sm:hidden w-9" />
      </div>

      {mobileOpen && (
        <div className="sm:hidden border-t border-border bg-card animate-in slide-in-from-top-2 fade-in duration-200">
          <nav className="flex flex-col p-2 gap-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-lg px-4 py-3 text-sm font-medium transition-colors",
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
      )}
    </header>
  );
};
