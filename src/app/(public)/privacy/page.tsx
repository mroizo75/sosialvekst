import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Personvernerklæring</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sist oppdatert: {new Date().toLocaleDateString("nb-NO")}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-base font-semibold">1. Hvem vi er</h2>
            <p className="mt-2">
              SosialVekst leverer en SaaS-plattform for planlegging, generering og publisering av
              innhold i sosiale medier.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">2. Hvilke opplysninger vi behandler</h2>
            <p className="mt-2">
              Vi behandler kontoinformasjon, bedriftsinformasjon, innhold du oppretter i løsningen,
              opplastede medier og tekniske logger som er nødvendige for sikker drift.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">3. Formål</h2>
            <p className="mt-2">
              Opplysningene brukes for å levere tjenesten, forbedre kvaliteten, håndtere betaling,
              sikre plattformen og gjennomføre publisering til valgte sosiale medier.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">4. Deling med tredjeparter</h2>
            <p className="mt-2">
              Vi deler kun data med underleverandører som er nødvendige for tjenesten, som
              infrastruktur, lagring, betalingsleverandør og sosiale plattformer du selv kobler til.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">5. Lagringstid</h2>
            <p className="mt-2">
              Vi lagrer data så lenge det er nødvendig for å levere tjenesten eller oppfylle
              lovpålagte krav. Du kan be om sletting av konto og data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">6. Dine rettigheter</h2>
            <p className="mt-2">
              Du kan be om innsyn, retting, sletting og begrensning av behandling. Du kan også
              trekke tilbake samtykke der behandlingen er samtykkebasert.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">7. Informasjonssikkerhet</h2>
            <p className="mt-2">
              Vi bruker tekniske og organisatoriske tiltak for å beskytte data mot uautorisert
              tilgang, tap og misbruk.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">8. Kontakt</h2>
            <p className="mt-2">
              For spørsmål om personvern, kontakt oss via selskapets offisielle kontaktkanaler.
            </p>
          </section>
        </div>

        <div className="mt-10">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Tilbake til forsiden
          </Link>
        </div>
      </main>
    </div>
  );
}
