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
  const email = pickString(query.email);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mb-2 text-lg font-bold text-primary">
            SosialVekst
          </Link>
          <CardTitle>Logg inn</CardTitle>
          <CardDescription>Skriv inn e-post og passord for å logge inn.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {message === "check_email" ? (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              Registrering fullført. Bekreft e-postadressen din før du logger inn.
            </div>
          ) : null}

          {message === "confirmation_sent" ? (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              Ny bekreftelsesmail er sendt.
            </div>
          ) : null}

          {message === "confirmed" ? (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              E-post bekreftet. Du kan logge inn.
            </div>
          ) : null}

          {error === "email_not_confirmed" ? (
            <div className="rounded-md bg-warning/10 p-3 text-sm">
              <p className="font-medium text-warning-foreground">E-post er ikke bekreftet enda.</p>
              <form action={resendConfirmationAction} className="mt-2">
                <input type="hidden" name="email" value={email} />
                <Button type="submit" variant="outline" size="sm">
                  Send bekreftelsesmail på nytt
                </Button>
              </form>
            </div>
          ) : null}

          {error === "signin_failed" ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Kunne ikke logge inn. Kontroller e-post og passord.
            </div>
          ) : null}

          {error === "resend_failed" ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Kunne ikke sende ny bekreftelsesmail akkurat na.
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
              placeholder="Minst 8 tegn"
            />
            <Button type="submit" className="w-full">
              Logg inn
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Ingen konto?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Registrer deg
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
