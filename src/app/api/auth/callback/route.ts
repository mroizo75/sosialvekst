import { type NextRequest, NextResponse } from "next/server";

import { getAppUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const appUrl = getAppUrl();

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${appUrl}/login?error=confirmation_failed`);
  }

  return NextResponse.redirect(`${appUrl}${next}`);
};
