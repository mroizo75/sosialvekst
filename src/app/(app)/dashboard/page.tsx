import Link from "next/link";

import { DashboardPanel } from "@/components/dashboard/DashboardPanel";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="text-lg font-bold text-primary">
            SosialVekst
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/kalender"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Kalender
            </Link>
            <Link
              href="/publiser"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Publisering
            </Link>
            <Link
              href="/onboarding"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Onboarding
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Helhetsoversikt over innhold, abonnement, planlegging og publiseringskø.
          </p>
        </div>
        <DashboardPanel />
      </main>
    </div>
  );
}

