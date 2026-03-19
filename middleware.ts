import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_ROUTES = ["/onboarding", "/calendar", "/kalender", "/media", "/dashboard", "/publiser"];
const SUBSCRIPTION_REQUIRED_ROUTES = ["/publiser"];
const AUTH_ROUTES = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const session = await updateSession(request);
  const hasSession = session.isAuthenticated;
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isSubscriptionRequired = SUBSCRIPTION_REQUIRED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuth = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuth && hasSession) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  if (isSubscriptionRequired && !session.hasActiveSubscription) {
    return NextResponse.redirect(new URL("/dashboard?billing=required", request.url));
  }

  return session.response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
