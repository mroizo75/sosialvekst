import Link from "next/link";

import { resendConfirmationAction, signInAction } from "@/app/(auth)/actions";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/get-locale";

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

  const locale = await getLocale();
  const dict = getDictionary(locale);
  const a = dict.auth.login;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-light to-background p-4">
      <div className="w-full max-w-md space-y-3">
        <div className="flex justify-end">
          <LanguageSwitcher variant="app" />
        </div>
        <Card className="w-full animate-[scale-in_0.3s_ease-out]">
          <CardHeader className="text-center">
            <Link href="/" className="mb-1 text-base font-bold text-primary">
              SosialVekst
            </Link>
            <CardTitle>{a.title}</CardTitle>
            <CardDescription>{a.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {message === "check_email" ? (
              <div className="rounded-xl bg-success/10 p-3 text-sm text-success">
                {a.checkEmail}
              </div>
            ) : null}

            {message === "confirmation_sent" ? (
              <div className="rounded-xl bg-success/10 p-3 text-sm text-success">
                {a.confirmationSent}
              </div>
            ) : null}

            {message === "confirmed" || confirmed === "1" ? (
              <div className="rounded-xl bg-success/10 p-3 text-sm text-success">
                {a.confirmed}
              </div>
            ) : null}

            {error === "email_not_confirmed" ? (
              <div className="rounded-xl bg-warning/10 p-3.5 text-sm">
                <p className="font-medium text-warning-foreground">
                  {a.emailNotConfirmedTitle}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.emailNotConfirmedHint}
                </p>
                <form action={resendConfirmationAction} className="mt-2">
                  <input type="hidden" name="email" value={email} />
                  <Button type="submit" variant="outline" size="sm">
                    {a.resendLink}
                  </Button>
                </form>
              </div>
            ) : null}

            {error === "signin_failed" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.signinFailed}
              </div>
            ) : null}

            {error === "resend_failed" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.resendFailed}
              </div>
            ) : null}

            {error === "confirmation_failed" || error === "missing_code" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.confirmationFailed}
              </div>
            ) : null}

            <form action={signInAction} className="space-y-4">
              <Input
                name="email"
                type="email"
                label={a.emailLabel}
                defaultValue={email}
                required
                placeholder={a.emailPlaceholder}
              />
              <Input
                name="password"
                type="password"
                label={a.passwordLabel}
                required
                placeholder={a.passwordPlaceholder}
              />
              <Button type="submit" className="w-full" size="lg">
                {a.submit}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              {a.newHere}{" "}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                {a.createAccount}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
