import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const OAUTH_STATE_COOKIE = "social_oauth_state_meta";
const RETURN_PATH_COOKIE = "social_oauth_return_path_meta";

export async function GET(request: Request) {
  await requireUserId();

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/dashboard";

  const appId = getRequiredEnv("FACEBOOK_APP_ID");
  const callbackUrl = `${getAppUrl()}/api/social/oauth/meta/callback`;
  const state = crypto.randomUUID();
  const scopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management",
    "instagram_basic",
    "instagram_content_publish",
  ].join(",");

  const authUrl = new URL("https://www.facebook.com/v22.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);

  logger.info("[meta/start] OAuth redirect", {
    appId,
    callbackUrl,
    scopes,
    fullUrl: authUrl.toString(),
  });

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set(RETURN_PATH_COOKIE, returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
