import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";

const OAUTH_STATE_COOKIE = "social_oauth_state_linkedin";
const RETURN_PATH_COOKIE = "social_oauth_return_path_linkedin";
const OAUTH_TYPE_COOKIE = "social_oauth_type_linkedin";

const PERSONAL_SCOPES = ["openid", "profile", "email", "w_member_social"];
const ORG_SCOPES = [
  ...PERSONAL_SCOPES,
  "w_organization_social",
  "r_organization_social",
];

export async function GET(request: Request) {
  await requireUserId();

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/dashboard";
  const type = url.searchParams.get("type") === "organization" ? "organization" : "personal";

  const clientId = getRequiredEnv("LINKEDIN_CLIENT_ID");
  const callbackUrl = `${getAppUrl()}/api/social/oauth/linkedin/callback`;
  const state = crypto.randomUUID();
  const scopes = (type === "organization" ? ORG_SCOPES : PERSONAL_SCOPES).join(" ");

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
  response.cookies.set(OAUTH_TYPE_COOKIE, type, cookieOpts);
  return response;
}
