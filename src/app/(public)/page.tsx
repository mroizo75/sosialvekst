import Link from "next/link";

const steps = [
  {
    number: "1",
    title: "Fortell oss om bedriften din",
    description:
      "Vi henter informasjon fra nettsiden din og tilpasser alt til din merkevare og målgruppe.",
  },
  {
    number: "2",
    title: "Vi lager innholdet",
    description:
      "AI skriver tekster og lager bilder som passer for Facebook, Instagram og LinkedIn.",
  },
  {
    number: "3",
    title: "Alt publiseres automatisk",
    description:
      "Postene går ut på riktig tidspunkt. Du har full kontroll og kan endre alt når du vil.",
  },
];

const features = [
  {
    title: "Skreddersydd for deg",
    description:
      "Innholdet skrives i din bedrifts stil og tone — tilpasset dine kunder og ditt marked.",
  },
  {
    title: "Full oversikt",
    description:
      "Se alle poster i en enkel kalender. Rediger, flytt eller godkjenn med ett klikk.",
  },
  {
    title: "Spar tid hver uke",
    description:
      "Slutt å bruke timer på sosiale medier. Vi tar oss av det, så du kan fokusere på jobben.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <span className="text-base font-bold tracking-tight text-primary">
            SosialVekst
          </span>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Logg inn
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Kom i gang
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden py-20 sm:py-28">
          <div className="absolute inset-0 bg-gradient-to-b from-primary-light via-background to-background" />
          <div className="relative mx-auto max-w-3xl px-5 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.15]">
              Sosiale medier
              <br />
              <span className="text-primary">på autopilot</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Vi lager poster med tekst og bilder tilpasset bedriften din, og
              publiserer automatisk til Facebook, Instagram og LinkedIn.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary-hover hover:shadow-lg sm:w-auto"
              >
                Kom i gang gratis
              </Link>
              <a
                href="#slik-fungerer-det"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-border bg-card px-8 text-base font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary sm:w-auto"
              >
                Se hvordan det fungerer
              </a>
            </div>
          </div>
        </section>

        <section
          id="slik-fungerer-det"
          className="mx-auto max-w-4xl px-5 py-16 sm:py-20"
        >
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Slik fungerer det
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
            Tre enkle steg fra oppstart til ferdig publisert innhold.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
                  {step.number}
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-card py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-5">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Alt du trenger for sosiale medier
            </h2>

            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-border bg-background p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <h3 className="text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-2xl px-5 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Klar til å spare tid?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Start i dag og la oss ta oss av innholdet til sosiale medier for
              bedriften din.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex h-12 items-center rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary-hover hover:shadow-lg"
            >
              Kom i gang gratis
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-4 px-5">
          <span>&copy; {new Date().getFullYear()} SosialVekst</span>
          <Link href="/privacy" className="hover:text-foreground">
            Personvern
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Vilkår
          </Link>
        </div>
      </footer>
    </div>
  );
}
