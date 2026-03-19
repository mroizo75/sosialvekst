import Link from "next/link";

import { DashboardPanel } from "@/components/dashboard/DashboardPanel";

export default function PublishPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="text-lg font-bold text-primary">
            SosialVekst
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/kalender"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Kalender
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Publisering</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Bruk denne siden for å legge godkjente poster i kø og kjøre publisering.
        </p>
        <DashboardPanel />
      </main>
    </div>
  );
}

