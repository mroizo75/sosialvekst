import Link from "next/link";

import { resendConfirmationAction, signInAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pickString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const error = pickString(query.error);
  const message = pickString(query.message);
  const confirmed = pickString(query.confirmed);
  const email = pickString(query.email);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-light to-background p-4">
      <Card className="w-full max-w-md animate-[scale-in_0.3s_ease-out]">
        <CardHeader className="text-center">
          <Link href="/" className="mb-1 text-base font-bold text-primary">
            SosialVekst
          </Link>
          <CardTitle>Velkommen tilbake</CardTitle>
          <CardDescription>Logg inn for å se postene dine og administrere innhold.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {message === "check_email" ? (
            <div className="rounded-xl bg-success/10 p-3 text-sm text-success">
              Bra! Sjekk e-posten din og klikk på lenken for å bekrefte kontoen.
            </div>
          ) : null}

          {message === "confirmation_sent" ? (
            <div className="rounded-xl bg-success/10 p-3 text-sm text-success">
              Vi har sendt en ny bekreftelseslenke til e-posten din.
            </div>
          ) : null}

          {message === "confirmed" || confirmed === "1" ? (
            <div className="rounded-xl bg-success/10 p-3 text-sm text-success">
              E-posten er bekreftet! Du kan nå logge inn.
            </div>
          ) : null}

          {error === "email_not_confirmed" ? (
            <div className="rounded-xl bg-warning/10 p-3.5 text-sm">
              <p className="font-medium text-warning-foreground">
                Du må bekrefte e-posten din først.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sjekk innboksen din for en bekreftelseslenke.
              </p>
              <form action={resendConfirmationAction} className="mt-2">
                <input type="hidden" name="email" value={email} />
                <Button type="submit" variant="outline" size="sm">
                  Send lenken på nytt
                </Button>
              </form>
            </div>
          ) : null}

          {error === "signin_failed" ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Feil e-post eller passord. Prøv igjen.
            </div>
          ) : null}

          {error === "resend_failed" ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Kunne ikke sende ny lenke akkurat nå. Prøv igjen om litt.
            </div>
          ) : null}

          <form action={signInAction} className="space-y-4">
            <Input
              name="email"
              type="email"
              label="E-post"
              defaultValue={email}
              required
              placeholder="din@epost.no"
            />
            <Input
              name="password"
              type="password"
              label="Passord"
              required
              placeholder="Skriv inn passordet ditt"
            />
            <Button type="submit" className="w-full" size="lg">
              Logg inn
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Ny her?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Opprett konto
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
