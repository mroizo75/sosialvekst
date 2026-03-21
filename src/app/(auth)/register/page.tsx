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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <Link href="/" className="mb-2 text-lg font-bold text-primary">
            SosialVekst
          </Link>
          <CardTitle>Opprett konto</CardTitle>
          <CardDescription>
            Fyll inn firmainfo og opprett konto. Betaling aktiveres etter innlogging i dashboard.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error === "terms_required" ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Du må godkjenne kjøpsvilkårene for å registrere konto.
            </div>
          ) : null}

          {error === "email_exists" ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              E-postadressen er allerede registrert. Prøv å logge inn i stedet.
            </div>
          ) : null}

          {error === "signup_failed" ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Kunne ikke opprette konto nå. Prøv igjen om litt.
            </div>
          ) : null}

          <form action={signUpAction} className="space-y-4">
            <Input name="fullName" type="text" label="Ditt navn" required placeholder="Ola Nordmann" />
            <Input name="companyName" type="text" label="Firmanavn" required placeholder="Mitt Firma AS" />
            <Input
              name="targetAudience"
              type="text"
              label="Hvem er kundene dine?"
              required
              placeholder="Småbedrifter i Norge"
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

            <div className="space-y-3 pt-2">
              <Checkbox name="termsAccepted" label="Jeg godkjenner kjøpsvilkårene" required />
            </div>

            <Button type="submit" className="w-full">
              Opprett konto og gå videre
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Har du konto?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Logg inn
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
