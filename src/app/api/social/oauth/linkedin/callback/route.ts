import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const OAUTH_STATE_COOKIE = "social_oauth_state_linkedin";
const RETURN_PATH_COOKIE = "social_oauth_return_path_linkedin";

const getReturnPath = (request: Request): string => {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${RETURN_PATH_COOKIE}=`))
    ?.split("=")[1];
  if (!raw) return "/dashboard";
  try { return decodeURIComponent(raw); } catch { return raw; }
};

const redirectToReturnPath = (returnPath: string, status: string): NextResponse => {
  const url = new URL(returnPath, getAppUrl());
  url.searchParams.set("social_connect", status);
  const response = NextResponse.redirect(url.toString());
  response.cookies.delete(RETURN_PATH_COOKIE);
  return response;
};

export async function GET(request: Request) {
  const userId = await requireUserId();
  const workspaceId = await requireWorkspaceId(userId);
  const returnPath = getReturnPath(request);
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const callbackUrl = `${getAppUrl()}/api/social/oauth/linkedin/callback`;

  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!state || !cookieState || state !== cookieState || !code) {
    const invalid = redirectToReturnPath(returnPath, "linkedin_invalid_state");
    invalid.cookies.delete(OAUTH_STATE_COOKIE);
    return invalid;
  }

  try {
    const tokenBody = new URLSearchParams();
    tokenBody.set("grant_type", "authorization_code");
    tokenBody.set("code", code);
    tokenBody.set("redirect_uri", callbackUrl);
    tokenBody.set("client_id", getRequiredEnv("LINKEDIN_CLIENT_ID"));
    tokenBody.set("client_secret", getRequiredEnv("LINKEDIN_CLIENT_SECRET"));

    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
      cache: "no-store",
    });
    const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      const failed = redirectToReturnPath(returnPath, "linkedin_token_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    const userInfoResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
      cache: "no-store",
    });
    const userInfo = (await userInfoResponse.json().catch(() => ({}))) as { sub?: string };
    if (!userInfoResponse.ok || !userInfo.sub) {
      const failed = redirectToReturnPath(returnPath, "linkedin_profile_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    const supabase = await createSupabaseServerClient();
    await supabase
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .eq("channel", "linkedin");

    const tokenExpiresAt = tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase.from("social_accounts").upsert(
      {
        user_id: userId,
        workspace_id: workspaceId,
        channel: "linkedin",
        account_id: `urn:li:person:${userInfo.sub}`,
        access_token: tokenPayload.access_token,
        refresh_token: null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel,account_id" },
    );

    const done = redirectToReturnPath(returnPath, error ? "linkedin_save_failed" : "linkedin_connected");
    done.cookies.delete(OAUTH_STATE_COOKIE);
    return done;
  } catch {
    const failed = redirectToReturnPath(returnPath, "linkedin_callback_failed");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }
}
