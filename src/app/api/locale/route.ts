import { NextResponse } from "next/server";

import {
  isLocale,
  localeToPreferredLanguage,
  LOCALE_COOKIE,
  type Locale,
} from "@/lib/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const POST = async (request: Request): Promise<NextResponse> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_BODY", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const locale =
    typeof body === "object" && body !== null && "locale" in body
      ? (body as { locale: unknown }).locale
      : undefined;

  if (!isLocale(locale)) {
    return NextResponse.json(
      { code: "INVALID_LOCALE", message: "locale must be nb or en" },
      { status: 400 },
    );
  }

  const typedLocale: Locale = locale;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from("profiles")
        .update({ preferred_language: localeToPreferredLanguage[typedLocale] })
        .eq("user_id", user.id);
    }
  } catch {
    /* cookie still set even if profile update fails */
  }

  const response = NextResponse.json({ ok: true, locale: typedLocale });
  response.cookies.set(LOCALE_COOKIE, typedLocale, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
};
