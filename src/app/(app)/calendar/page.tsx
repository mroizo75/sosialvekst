import Link from "next/link";

import { CalendarBillingActions } from "@/components/calendar/CalendarBillingActions";
import { PostCalendar } from "@/components/calendar/PostCalendar";

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/kalender" className="text-lg font-bold text-primary">
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
              href="/onboarding"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Innstillinger
            </Link>
            <Link
              href="/publiser"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Publisering
            </Link>
            <Link
              href="/media"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Mediebibliotek
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kalender</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Oversikt over planlagte poster. Klikk på en post for å se detaljer eller generere på nytt.
            </p>
          </div>
          <CalendarBillingActions />
        </div>

        <PostCalendar />
      </main>
    </div>
  );
}
