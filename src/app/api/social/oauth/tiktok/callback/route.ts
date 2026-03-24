import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const OAUTH_STATE_COOKIE = "social_oauth_state_tiktok";
const RETURN_PATH_COOKIE = "social_oauth_return_path_tiktok";

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
  const errorParam = url.searchParams.get("error");

  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.split("=")[1];

  if (errorParam) {
    const failed = redirectToReturnPath(returnPath, "tiktok_auth_denied");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }

  if (!state || !cookieState || state !== cookieState || !code) {
    const invalid = redirectToReturnPath(returnPath, "tiktok_invalid_state");
    invalid.cookies.delete(OAUTH_STATE_COOKIE);
    return invalid;
  }

  try {
    const clientKey = getRequiredEnv("TIKTOK_CLIENT_KEY");
    const clientSecret = getRequiredEnv("TIKTOK_CLIENT_SECRET");
    const callbackUrl = `${getAppUrl()}/api/social/oauth/tiktok/callback`;

    const tokenBody = new URLSearchParams();
    tokenBody.set("client_key", clientKey);
    tokenBody.set("client_secret", clientSecret);
    tokenBody.set("code", code);
    tokenBody.set("grant_type", "authorization_code");
    tokenBody.set("redirect_uri", callbackUrl);

    const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
      cache: "no-store",
    });

    const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_expires_in?: number;
      open_id?: string;
      error?: string;
    };

    if (!tokenResponse.ok || !tokenPayload.access_token || !tokenPayload.open_id) {
      const failed = redirectToReturnPath(returnPath, "tiktok_token_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    const supabase = await createSupabaseServerClient();
    await supabase
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .eq("channel", "tiktok");

    const tokenExpiresAt = tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase.from("social_accounts").upsert(
      {
        user_id: userId,
        workspace_id: workspaceId,
        channel: "tiktok",
        account_id: tokenPayload.open_id,
        access_token: tokenPayload.access_token,
        refresh_token: tokenPayload.refresh_token ?? null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel,account_id" },
    );

    const done = redirectToReturnPath(returnPath, error ? "tiktok_save_failed" : "tiktok_connected");
    done.cookies.delete(OAUTH_STATE_COOKIE);
    return done;
  } catch {
    const failed = redirectToReturnPath(returnPath, "tiktok_callback_failed");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }
}
