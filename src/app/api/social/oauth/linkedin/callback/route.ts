import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const OAUTH_STATE_COOKIE = "social_oauth_state_linkedin";
const RETURN_PATH_COOKIE = "social_oauth_return_path_linkedin";
const OAUTH_TYPE_COOKIE = "social_oauth_type_linkedin";

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

type LinkedInOrg = { id: string; name: string };

const fetchAdminOrganizations = async (accessToken: string): Promise<LinkedInOrg[]> => {
  const response = await fetch(
    "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=(elements*(organizationalTarget~(localizedName)))",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) return [];

  const payload = (await response.json().catch(() => ({}))) as {
    elements?: Array<{
      organizationalTarget?: string;
      "organizationalTarget~"?: { localizedName?: string };
    }>;
  };

  return (payload.elements ?? [])
    .filter((el) => el.organizationalTarget)
    .map((el) => ({
      id: el.organizationalTarget!,
      name: el["organizationalTarget~"]?.localizedName ?? "Ukjent side",
    }));
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

    const oauthType = getCookieValue(request, OAUTH_TYPE_COOKIE) ?? "personal";

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
      failed.cookies.delete(OAUTH_TYPE_COOKIE);
      return failed;
    }

    let accountId = `urn:li:person:${userInfo.sub}`;

    if (oauthType === "organization") {
      const orgs = await fetchAdminOrganizations(tokenPayload.access_token);
      if (orgs.length > 0) {
        accountId = orgs[0].id;
      } else {
        const failed = redirectToReturnPath(returnPath, "linkedin_no_org_found");
        failed.cookies.delete(OAUTH_STATE_COOKIE);
        failed.cookies.delete(OAUTH_TYPE_COOKIE);
        return failed;
      }
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
        account_id: accountId,
        access_token: tokenPayload.access_token,
        refresh_token: null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel,account_id" },
    );

    const done = redirectToReturnPath(returnPath, error ? "linkedin_save_failed" : "linkedin_connected");
    done.cookies.delete(OAUTH_STATE_COOKIE);
    done.cookies.delete(OAUTH_TYPE_COOKIE);
    return done;
  } catch {
    const failed = redirectToReturnPath(returnPath, "linkedin_callback_failed");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }
}
