import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

const steps = [
  {
    number: "1",
    title: "Logg inn med Facebook",
    description:
      "Du blir sendt til Facebook for å logge inn. Bruk kontoen som administrerer sidene dine.",
  },
  {
    number: "2",
    title: "Gi tilgang til alle sidene dine",
    description:
      "Facebook viser hvilke sider appen har tilgang til. Hvis du har koblet til før og bare ser én side, klikk «Rediger innstillinger» og huk av for ALLE sidene du administrerer.",
  },
  {
    number: "3",
    title: "Velg riktig side",
    description:
      "Du kommer tilbake hit og ser en liste over alle sidene du ga tilgang til. Velg hvilken side som tilhører denne bedriften.",
  },
];

export default function ConnectMetaPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Koble Facebook og Instagram
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          For at du skal kunne velge riktig Facebook-side for denne bedriften,
          er det viktig at du gir tilgang til alle sidene dine i Facebook-dialogen.
        </p>
      </div>

      <div className="grid gap-4 mb-8">
        {steps.map((step) => (
          <Card key={step.number}>
            <CardContent className="flex items-start gap-4 p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                {step.number}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{step.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 mb-8">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <svg className="size-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Viktig: Gi tilgang til alle sider
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                Har du koblet til før? Da husker Facebook forrige valg. I dialogen:
                klikk <strong>Rediger innstillinger</strong> og huk av for alle sidene
                du vil administrere. Uten dette ser du bare én side.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-4">
        <Link href="/api/social/oauth/meta/start">
          <Button size="lg" className="gap-2.5 px-8">
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Fortsett til Facebook
          </Button>
        </Link>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Avbryt og gå tilbake
        </Link>
      </div>
    </div>
  );
}
