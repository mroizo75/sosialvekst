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
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bilder og video</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last opp bilder, videoer og logoer. Du kan bruke dem i postene dine.
          </p>
        </div>
        {returnToRaw && (
          <Link
            href={returnTo}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
          >
            &larr; Tilbake
          </Link>
        )}
      </div>
      <MediaManager />
    </>
  );
}
