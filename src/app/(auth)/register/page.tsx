import Link from "next/link";

import { signUpAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox, Input } from "@/components/ui/Input";

type RegisterPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pickString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const query = await searchParams;
  const error = pickString(query.error);
  const email = pickString(query.email);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-light to-background p-4">
      <Card className="w-full max-w-lg animate-[scale-in_0.3s_ease-out]">
        <CardHeader className="text-center">
          <Link href="/" className="mb-1 text-base font-bold text-primary">
            SosialVekst
          </Link>
          <CardTitle>Opprett konto</CardTitle>
          <CardDescription>
            Kom i gang på under ett minutt. Vi guider deg gjennom resten etterpå.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error === "terms_required" ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Du må godkjenne vilkårene for å opprette konto.
            </div>
          ) : null}

          {error === "email_exists" ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Denne e-posten er allerede registrert.{" "}
              <Link href="/login" className="font-semibold underline">
                Logg inn her
              </Link>
            </div>
          ) : null}

          {error === "rate_limited" ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              For mange forsøk. Vent noen minutter og prøv igjen.
            </div>
          ) : null}

          {error === "weak_password" ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Passordet er for svakt. Velg et sterkere passord med minst 8 tegn.
            </div>
          ) : null}

          {error === "signup_failed" ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Noe gikk galt. Prøv igjen om litt.
            </div>
          ) : null}

          <form action={signUpAction} className="space-y-4">
            <Input
              name="fullName"
              type="text"
              label="Ditt navn"
              required
              placeholder="Ola Nordmann"
            />
            <Input
              name="email"
              type="email"
              label="E-post"
              required
              defaultValue={email}
              placeholder="din@epost.no"
            />
            <Input
              name="password"
              type="password"
              label="Passord"
              required
              minLength={8}
              placeholder="Minst 8 tegn"
            />

            <div className="pt-1">
              <Checkbox
                name="termsAccepted"
                label="Jeg godkjenner vilkårene"
                required
              />
            </div>

            <Button type="submit" className="w-full" size="lg">
              Opprett konto
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Har du konto?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Logg inn
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
