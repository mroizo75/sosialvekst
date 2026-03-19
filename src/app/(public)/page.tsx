import Link from "next/link";

const features = [
  {
    title: "AI-generert innhold",
    description:
      "Profesjonelle tekster og bilder skreddersydd for din bedrift, skrevet på norsk med faglig tyngde.",
  },
  {
    title: "Automatisk publisering",
    description:
      "Poster publiseres til Facebook, Instagram og LinkedIn på de beste tidspunktene for ditt marked.",
  },
  {
    title: "Kalender og oversikt",
    description:
      "Full kontroll med Outlook-lignende kalender. Rediger, regenerer og planlegg alt fra ett sted.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="text-lg font-bold tracking-tight text-primary">SosialVekst</span>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Logg inn
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Kom i gang
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background py-24 sm:py-32">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Automatiser sosiale medier for bedriften din
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              SosialVekst genererer profesjonelle poster med AI, tilpasset din merkevare og
              publiserer automatisk til Facebook, Instagram og LinkedIn.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex h-12 items-center rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary-hover"
              >
                Start gratis
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-lg border border-border bg-card px-8 text-base font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary"
              >
                Logg inn
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20">
          <div className="grid gap-8 sm:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} SosialVekst. Alle rettigheter reservert.
      </footer>
    </div>
  );
}
