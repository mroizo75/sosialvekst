import { getLocale } from "@/lib/i18n/get-locale";

export const metadata = {
  title: "Bruksvilkår — SosialVekst",
};

const NB = {
  legal: "Juridisk",
  title: "Bruksvilkår",
  updatedPrefix: "Sist oppdatert:",
  back: "Tilbake til forsiden",
  dateLocale: "nb-NO" as const,
  sections: [
    {
      heading: "1. Om avtalen",
      body: "Disse vilkårene regulerer din bruk av SosialVekst. Ved å opprette konto og bruke tjenesten aksepterer du vilkårene. Les dem nøye — ved spørsmål, kontakt oss før du begynner å bruke tjenesten.",
    },
    {
      heading: "2. Konto og ansvar",
      body: "Du er ansvarlig for sikker bruk av kontoen din, tilgangsstyring og at informasjonen du legger inn er korrekt, nøyaktig og lovlig. Du må ikke dele innloggingsinformasjon.",
    },
    {
      heading: "3. Bruk av tjenesten",
      body: "Tjenesten kan brukes til planlegging og publisering av lovlig innhold til valgte plattformer. Du er ansvarlig for innholdet som publiseres fra din konto. Vi forbeholder oss retten til å suspendere kontoer som bryter med vilkårene.",
    },
    {
      heading: "4. Betaling og abonnement",
      body: "Betalte planer faktureres etter valgt syklus og fornyes automatisk med mindre abonnementet sies opp før neste fakturadato. Gjeldende priser fremgår i betalingsflyten og på prisingsiden.",
    },
    {
      heading: "5. Tilgjengelighet og endringer",
      body: "Vi etterstreber høy tilgjengelighet, men kan ikke garantere uavbrutt drift. Vi kan oppdatere funksjoner og vilkår med rimelig varsel. Vesentlige endringer varsles via e-post.",
    },
    {
      heading: "6. Immaterialrettigheter",
      body: "SosialVekst og underliggende teknologi tilhører oss. Innhold du lager i plattformen er ditt. Du gir oss nødvendig lisens for å levere tjenesten, inkludert publisering til valgte kanaler.",
    },
    {
      heading: "7. Ansvarsbegrensning",
      body: "SosialVekst leveres som en programvaretjeneste. Vi er ikke ansvarlige for indirekte tap, tap av inntekt, tredjepartsendringer på sosiale plattformer, eller forhold utenfor vår kontroll.",
    },
    {
      heading: "8. Oppsigelse og sletting",
      body: "Du kan avslutte abonnementet og be om sletting av konto når som helst. Ved oppsigelse opphører tilgang ved periodens slutt. Datasletting skjer i henhold til personvernerklæringen.",
    },
    {
      heading: "9. Lovvalg og tvisteløsning",
      body: "Avtalen reguleres av norsk rett. Eventuelle tvister søkes løst i minnelighet. Kan vi ikke komme til enighet, er Oslo tingrett verneting.",
    },
    {
      heading: "10. Kontakt",
      body: "For spørsmål om vilkår, bruk selskapets offisielle kontaktkanaler. Vi svarer normalt innen 2 virkedager.",
    },
  ],
};

const EN = {
  legal: "Legal",
  title: "Terms of Service",
  updatedPrefix: "Last updated:",
  back: "Back to homepage",
  dateLocale: "en-GB" as const,
  sections: [
    {
      heading: "1. About the agreement",
      body: "These terms govern your use of SosialVekst. By creating an account and using the service, you accept the terms. Read them carefully — if you have questions, contact us before you start using the service.",
    },
    {
      heading: "2. Account and responsibility",
      body: "You are responsible for the secure use of your account, access management, and ensuring that information you enter is correct, accurate, and lawful. You must not share login credentials.",
    },
    {
      heading: "3. Use of the service",
      body: "The service may be used to plan and publish lawful content to selected platforms. You are responsible for content published from your account. We reserve the right to suspend accounts that violate these terms.",
    },
    {
      heading: "4. Payment and subscription",
      body: "Paid plans are billed according to the selected cycle and renew automatically unless cancelled before the next billing date. Current prices are shown in the checkout flow and on the pricing page.",
    },
    {
      heading: "5. Availability and changes",
      body: "We strive for high availability but cannot guarantee uninterrupted operation. We may update features and terms with reasonable notice. Material changes are communicated by email.",
    },
    {
      heading: "6. Intellectual property",
      body: "SosialVekst and the underlying technology belong to us. Content you create in the platform is yours. You grant us the licence needed to deliver the service, including publishing to selected channels.",
    },
    {
      heading: "7. Limitation of liability",
      body: "SosialVekst is provided as a software service. We are not liable for indirect loss, loss of revenue, third-party changes on social platforms, or circumstances beyond our control.",
    },
    {
      heading: "8. Cancellation and deletion",
      body: "You may end your subscription and request account deletion at any time. Upon cancellation, access ends at the close of the billing period. Data deletion follows the privacy policy.",
    },
    {
      heading: "9. Governing law and disputes",
      body: "The agreement is governed by Norwegian law. Disputes should first be resolved amicably. If we cannot agree, Oslo District Court is the venue.",
    },
    {
      heading: "10. Contact",
      body: "For questions about the terms, use the company’s official contact channels. We normally respond within 2 business days.",
    },
  ],
};

export default async function TermsPage() {
  const locale = await getLocale();
  const copy = locale === "en" ? EN : NB;

  return (
    <div
      className="min-h-screen"
      style={{ background: "oklch(9% 0.022 265)" }}
    >
      <div className="mx-auto max-w-3xl px-5 sm:px-6 py-16 sm:py-24">
        {/* Header */}
        <div className="mb-12">
          <span
            className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest"
            style={{ color: "oklch(66% 0.28 280)" }}
          >
            {copy.legal}
          </span>
          <h1
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{
              color: "oklch(95% 0.005 260)",
              fontFamily: "var(--font-bricolage), system-ui, sans-serif",
            }}
          >
            {copy.title}
          </h1>
          <p
            className="mt-3 text-sm"
            style={{ color: "oklch(48% 0.015 260)" }}
          >
            {copy.updatedPrefix}{" "}
            {new Date().toLocaleDateString(copy.dateLocale, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Divider */}
        <div
          className="mb-10 h-px"
          style={{ background: "oklch(20% 0.022 265)" }}
        />

        {/* Content */}
        <div className="space-y-8">
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h2
                className="mb-2.5 text-base font-semibold"
                style={{ color: "oklch(88% 0.006 260)" }}
              >
                {section.heading}
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "oklch(58% 0.018 260)" }}
              >
                {section.body}
              </p>
            </section>
          ))}
        </div>

        {/* Back link */}
        <div
          className="mt-16 pt-8"
          style={{ borderTop: "1px solid oklch(18% 0.02 265)" }}
        >
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
            style={{ color: "oklch(66% 0.28 280)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {copy.back}
          </a>
        </div>
      </div>
    </div>
  );
}
