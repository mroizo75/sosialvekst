import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Bruksvilkår</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sist oppdatert: {new Date().toLocaleDateString("nb-NO")}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-base font-semibold">1. Om avtalen</h2>
            <p className="mt-2">
              Disse vilkårene regulerer bruk av SosialVekst. Ved å opprette konto og bruke
              tjenesten aksepterer du vilkårene.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">2. Konto og ansvar</h2>
            <p className="mt-2">
              Du er ansvarlig for sikker bruk av konto, tilgangsstyring og at informasjonen du
              legger inn er korrekt og lovlig.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">3. Bruk av tjenesten</h2>
            <p className="mt-2">
              Tjenesten kan brukes til planlegging og publisering av innhold til valgte plattformer.
              Du er ansvarlig for innholdet som publiseres.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">4. Betaling</h2>
            <p className="mt-2">
              Betalte planer fornyes etter valgt modell med mindre abonnementet sies opp. Priser og
              vilkår fremgår i betalingsflyten.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">5. Tilgjengelighet og endringer</h2>
            <p className="mt-2">
              Vi etterstreber høy tilgjengelighet, men kan ikke garantere uavbrutt drift. Vi kan
              oppdatere funksjoner og vilkår ved behov.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">6. Ansvarsbegrensning</h2>
            <p className="mt-2">
              SosialVekst leveres som en programvaretjeneste. Vi er ikke ansvarlige for indirekte
              tap, tredjepartsendringer eller forhold utenfor vår kontroll.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">7. Oppsigelse og sletting</h2>
            <p className="mt-2">
              Du kan avslutte abonnement og be om kontosletting. Ved oppsigelse opphører tilgang i
              tråd med plan og gjeldende regler for datalagring.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold">8. Kontakt</h2>
            <p className="mt-2">
              For spørsmål om vilkår, bruk selskapets offisielle kontaktkanaler.
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
