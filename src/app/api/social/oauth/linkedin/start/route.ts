import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { metricsScopesFor } from "@/lib/metrics/scopes";
import { toSafeReturnPath } from "@/lib/returnPath";

const OAUTH_STATE_COOKIE = "social_oauth_state_linkedin";
const RETURN_PATH_COOKIE = "social_oauth_return_path_linkedin";

// "Sign In with LinkedIn using OpenID Connect" grants openid and profile.
// "Share on LinkedIn" grants w_member_social. The app does not have the legacy
// Sign In product, so r_liteprofile and r_emailaddress are rejected.
const PERSONAL_SCOPES = ["openid", "profile", "w_member_social"];

export async function GET(request: Request) {
  await requireUserId();

  const url = new URL(request.url);
  const returnTo = toSafeReturnPath(url.searchParams.get("returnTo"), "/dashboard");

  const clientId = getRequiredEnv("LINKEDIN_CLIENT_ID");
  const callbackUrl = `${getAppUrl()}/api/social/oauth/linkedin/callback`;
  const state = crypto.randomUUID();
  const scopes = [...PERSONAL_SCOPES, ...metricsScopesFor("linkedin")].join(" ");

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", scopes);

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10,
  };

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOpts);
  response.cookies.set(RETURN_PATH_COOKIE, returnTo, cookieOpts);
  return response;
}
