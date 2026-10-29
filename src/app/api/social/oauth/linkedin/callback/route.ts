import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { linkedInErrorStatus, safeOAuthText } from "@/lib/social/linkedinOAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const OAUTH_STATE_COOKIE = "social_oauth_state_linkedin";
const RETURN_PATH_COOKIE = "social_oauth_return_path_linkedin";

const getCookieValue = (request: Request, name: string): string | undefined => {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")[1];
};

const getReturnPath = (request: Request): string => {
  const raw = getCookieValue(request, RETURN_PATH_COOKIE);
  if (!raw) return "/dashboard";
  try { return decodeURIComponent(raw); } catch { return raw; }
};

const redirectToReturnPath = (returnPath: string, status: string): NextResponse => {
  const url = new URL(returnPath, getAppUrl());
  url.searchParams.set("social_connect", status);
  const response = NextResponse.redirect(url.toString());
  response.cookies.delete(RETURN_PATH_COOKIE);
  response.cookies.delete(OAUTH_STATE_COOKIE);
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

  const linkedInError = url.searchParams.get("error");
  if (linkedInError) {
    logger.warn("[linkedin/callback] LinkedIn avviste innloggingen", {
      userId,
      error: safeOAuthText(linkedInError),
      description: safeOAuthText(url.searchParams.get("error_description")),
    });
    return redirectToReturnPath(returnPath, linkedInErrorStatus(linkedInError));
  }

  const cookieState = getCookieValue(request, OAUTH_STATE_COOKIE);
  if (!state || !cookieState || state !== cookieState || !code) {
    return redirectToReturnPath(returnPath, "linkedin_invalid_state");
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
      error?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      logger.warn("[linkedin/callback] Tokenutveksling feilet", {
        userId,
        status: tokenResponse.status,
        error: safeOAuthText(tokenPayload.error),
        description: safeOAuthText(tokenPayload.error_description),
      });
      return redirectToReturnPath(returnPath, "linkedin_token_failed");
    }

    const profileResponse = await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      cache: "no-store",
    });
    const profile = (await profileResponse.json().catch(() => ({}))) as { id?: string };
    if (!profileResponse.ok || !profile.id) {
      logger.warn("[linkedin/callback] Kunne ikke hente profil", { userId, status: profileResponse.status });
      return redirectToReturnPath(returnPath, "linkedin_profile_failed");
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
        account_id: `urn:li:person:${profile.id}`,
        access_token: tokenPayload.access_token,
        refresh_token: null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel,account_id" },
    );

    if (error) {
      logger.warn("[linkedin/callback] Kunne ikke lagre kontoen", { userId, error: error.message });
    }
    return redirectToReturnPath(returnPath, error ? "linkedin_save_failed" : "linkedin_connected");
  } catch (error) {
    logger.error("[linkedin/callback] Uventet feil", {
      userId,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return redirectToReturnPath(returnPath, "linkedin_callback_failed");
  }
}
