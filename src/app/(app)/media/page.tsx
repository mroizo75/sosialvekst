import Link from "next/link";

import { MediaManager } from "@/components/media/MediaManager";

type MediaPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pickString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
};

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const query = await searchParams;
  const returnToRaw = pickString(query.returnTo);
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/onboarding?step=3";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/kalender" className="text-lg font-bold text-primary">
            SosialVekst
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/onboarding"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Innstillinger
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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mediebibliotek</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Last opp og administrer bilder, videoer og logoer. Filene kan brukes i poster.
            </p>
          </div>
          <Link
            href={returnTo}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
          >
            &larr; Tilbake til wizard
          </Link>
        </div>

        <MediaManager />
      </main>
    </div>
  );
}
