import Link from "next/link";

import { signUpAction } from "@/app/(auth)/actions";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox, Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/get-locale";

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
  const websiteUrl = pickString(query.url);

  const locale = await getLocale();
  const dict = getDictionary(locale);
  const a = dict.auth.register;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-light to-background p-4">
      <div className="w-full max-w-lg space-y-3">
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
            {error === "terms_required" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.termsRequired}
              </div>
            ) : null}

            {error === "email_exists" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.emailExists}{" "}
                <Link href="/login" className="font-semibold underline">
                  {a.emailExistsLogin}
                </Link>
              </div>
            ) : null}

            {error === "rate_limited" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.rateLimited}
              </div>
            ) : null}

            {error === "weak_password" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.weakPassword}
              </div>
            ) : null}

            {error === "signup_failed" ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {a.signupFailed}
              </div>
            ) : null}

            <form action={signUpAction} className="space-y-4">
              {websiteUrl ? (
                <input type="hidden" name="websiteUrl" value={websiteUrl} />
              ) : null}
              <Input
                name="fullName"
                type="text"
                label={a.fullNameLabel}
                required
                placeholder={a.fullNamePlaceholder}
              />
              <Input
                name="email"
                type="email"
                label={a.emailLabel}
                required
                defaultValue={email}
                placeholder={a.emailPlaceholder}
              />
              <Input
                name="password"
                type="password"
                label={a.passwordLabel}
                required
                minLength={8}
                placeholder={a.passwordPlaceholder}
              />

              <div className="pt-1">
                <Checkbox
                  name="termsAccepted"
                  label={a.termsLabel}
                  required
                />
              </div>

              <SubmitButton className="w-full" size="lg" cooldownMs={10000} pendingText={a.pending}>
                {a.submit}
              </SubmitButton>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              {a.hasAccount}{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                {a.login}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
