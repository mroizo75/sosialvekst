import { getLocale } from "@/lib/i18n/get-locale";

export const metadata = {
  title: "Personvernerklæring — SosialVekst",
};

const NB = {
  legal: "Juridisk",
  title: "Personvernerklæring",
  updatedPrefix: "Sist oppdatert:",
  back: "Tilbake til forsiden",
  dateLocale: "nb-NO" as const,
  sections: [
    {
      heading: "1. Hvem vi er",
      body: "SosialVekst er en norsk SaaS-plattform for planlegging, generering og publisering av innhold i sosiale medier. Vi opererer i henhold til norsk og europeisk personvernlovgivning (GDPR).",
    },
    {
      heading: "2. Hvilke opplysninger vi behandler",
      body: "Vi behandler kontoinformasjon (navn, e-post), bedriftsinformasjon du oppgir, innhold du oppretter eller godkjenner i løsningen, opplastede medier og tekniske logger nødvendige for sikker drift og feilsøking.",
    },
    {
      heading: "3. Formål og rettslig grunnlag",
      body: "Opplysningene behandles for å levere tjenesten (avtale), forbedre kvaliteten, håndtere betaling, sikre plattformen og gjennomføre publisering til valgte sosiale medier. Rettslig grunnlag er oppfyllelse av avtale og berettiget interesse.",
    },
    {
      heading: "4. Deling med tredjeparter",
      body: "Vi deler kun data med underleverandører nødvendige for tjenesten — infrastruktur, lagring, betalingsleverandør og sosiale plattformer du selv kobler til. Ingen data selges til tredjepart.",
    },
    {
      heading: "5. Lagringstid",
      body: "Data lagres så lenge det er nødvendig for å levere tjenesten eller oppfylle lovpålagte krav. Du kan når som helst be om sletting av konto og tilhørende data.",
    },
    {
      heading: "6. Dine rettigheter",
      body: "Du har rett til innsyn, retting, sletting og begrensning av behandling. Du kan trekke tilbake samtykke der behandlingen er samtykkebasert. Klagen kan også rettes til Datatilsynet.",
    },
    {
      heading: "7. Informasjonssikkerhet",
      body: "Vi bruker tekniske og organisatoriske tiltak — kryptering, tilgangskontroll og regelmessige sikkerhetsvurderinger — for å beskytte data mot uautorisert tilgang, tap og misbruk.",
    },
    {
      heading: "8. Kontakt",
      body: "For spørsmål om personvern og dine rettigheter, kontakt oss via selskapets offisielle kontaktkanaler. Vi svarer innen 30 dager.",
    },
  ],
};

const EN = {
  legal: "Legal",
  title: "Privacy Policy",
  updatedPrefix: "Last updated:",
  back: "Back to homepage",
  dateLocale: "en-GB" as const,
  sections: [
    {
      heading: "1. Who we are",
      body: "SosialVekst is a Norwegian SaaS platform for planning, generating, and publishing social media content. We operate in accordance with Norwegian and European data protection law (GDPR).",
    },
    {
      heading: "2. What information we process",
      body: "We process account information (name, email), business information you provide, content you create or approve in the product, uploaded media, and technical logs necessary for secure operation and troubleshooting.",
    },
    {
      heading: "3. Purpose and legal basis",
      body: "Data is processed to deliver the service (contract), improve quality, handle payments, secure the platform, and publish to social networks you choose. The legal bases are performance of a contract and legitimate interest.",
    },
    {
      heading: "4. Sharing with third parties",
      body: "We only share data with subprocessors necessary for the service — infrastructure, storage, payment provider, and social platforms you connect yourself. No data is sold to third parties.",
    },
    {
      heading: "5. Retention",
      body: "Data is stored for as long as needed to deliver the service or meet legal requirements. You may request deletion of your account and associated data at any time.",
    },
    {
      heading: "6. Your rights",
      body: "You have the right to access, rectification, erasure, and restriction of processing. You may withdraw consent where processing is consent-based. You may also lodge a complaint with the Norwegian Data Protection Authority (Datatilsynet).",
    },
    {
      heading: "7. Information security",
      body: "We use technical and organisational measures — encryption, access control, and regular security assessments — to protect data against unauthorised access, loss, and misuse.",
    },
    {
      heading: "8. Contact",
      body: "For questions about privacy and your rights, contact us via the company’s official channels. We respond within 30 days.",
    },
  ],
};

export default async function PrivacyPage() {
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
