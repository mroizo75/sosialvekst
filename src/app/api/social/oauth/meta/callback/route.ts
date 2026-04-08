import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const OAUTH_STATE_COOKIE = "social_oauth_state_meta";
const RETURN_PATH_COOKIE = "social_oauth_return_path_meta";

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string };
};

type InstagramBusinessAccount = {
  id: string;
  username?: string;
};

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

const fetchInstagramViaPages = (pages: MetaPage[]): {
  igId: string;
  accessToken: string;
} | null => {
  for (const page of pages) {
    if (page.access_token && page.instagram_business_account?.id) {
      return {
        igId: page.instagram_business_account.id,
        accessToken: page.access_token,
      };
    }
  }
  return null;
};

const fetchInstagramViaBusinessLogin = async (
  userAccessToken: string,
): Promise<{ igId: string; accessToken: string } | null> => {
  try {
    const igUrl = new URL("https://graph.facebook.com/v23.0/me/accounts");
    igUrl.searchParams.set("access_token", userAccessToken);
    igUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");

    const igResponse = await fetch(igUrl.toString(), { cache: "no-store" });
    if (!igResponse.ok) {
      logger.warn("[meta/callback] Instagram Business pages fetch feilet", {
        status: igResponse.status,
      });
      return null;
    }

    const igPayload = (await igResponse.json()) as { data?: MetaPage[] };
    const pages = igPayload.data ?? [];

    for (const page of pages) {
      if (page.access_token && page.instagram_business_account?.id) {
        return {
          igId: page.instagram_business_account.id,
          accessToken: page.access_token,
        };
      }
    }

    const igDirectUrl = new URL("https://graph.facebook.com/v23.0/me/instagram_accounts");
    igDirectUrl.searchParams.set("access_token", userAccessToken);
    igDirectUrl.searchParams.set("fields", "id,username");

    const igDirectResponse = await fetch(igDirectUrl.toString(), { cache: "no-store" });
    if (!igDirectResponse.ok) {
      logger.warn("[meta/callback] Instagram direct accounts fetch feilet", {
        status: igDirectResponse.status,
      });
      return null;
    }

    const igDirectPayload = (await igDirectResponse.json()) as {
      data?: InstagramBusinessAccount[];
    };
    const igAccounts = igDirectPayload.data ?? [];

    if (igAccounts.length > 0 && igAccounts[0]?.id) {
      logger.info("[meta/callback] Fant Instagram via direct API", {
        igId: igAccounts[0].id,
        username: igAccounts[0].username,
      });
      return {
        igId: igAccounts[0].id,
        accessToken: userAccessToken,
      };
    }

    return null;
  } catch (error) {
    logger.warn("[meta/callback] Instagram Business Login fallback feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export async function GET(request: Request) {
  const userId = await requireUserId();
  const workspaceId = await requireWorkspaceId(userId);
  const returnPath = getReturnPath(request);

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const callbackUrl = `${getAppUrl()}/api/social/oauth/meta/callback`;

  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!state || !cookieState || state !== cookieState || !code) {
    const invalid = redirectToReturnPath(returnPath, "meta_invalid_state");
    invalid.cookies.delete(OAUTH_STATE_COOKIE);
    return invalid;
  }

  try {
    const authUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
    authUrl.searchParams.set("client_id", getRequiredEnv("FACEBOOK_APP_ID"));
    authUrl.searchParams.set("client_secret", getRequiredEnv("FACEBOOK_APP_SECRET"));
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(authUrl.toString(), { cache: "no-store" });

    const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };
    const userAccessToken = tokenPayload.access_token;
    const tokenExpiresIn = tokenPayload.expires_in;
    if (!tokenResponse.ok || !userAccessToken) {
      const failed = redirectToReturnPath(returnPath, "meta_token_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    const pagesUrl = new URL("https://graph.facebook.com/v23.0/me/accounts");
    pagesUrl.searchParams.set("access_token", userAccessToken);
    pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");

    const pagesResponse = await fetch(pagesUrl.toString(), { cache: "no-store" });
    const pagesPayload = (await pagesResponse.json().catch(() => ({}))) as {
      data?: MetaPage[];
    };
    const pages = pagesPayload.data ?? [];

    logger.info("[meta/callback] Sider hentet", {
      pageCount: pages.length,
      pagesWithIg: pages.filter((p) => p.instagram_business_account?.id).length,
    });

    const facebookPage = pages.find((page) => Boolean(page.id && page.access_token));

    if (!facebookPage) {
      const none = redirectToReturnPath(returnPath, "meta_no_pages");
      none.cookies.delete(OAUTH_STATE_COOKIE);
      return none;
    }

    let igResult = fetchInstagramViaPages(pages);

    if (!igResult) {
      logger.info("[meta/callback] Ingen Instagram via sider, prøver Business Login fallback");
      igResult = await fetchInstagramViaBusinessLogin(userAccessToken);
    }

    logger.info("[meta/callback] Instagram-resultat", {
      found: Boolean(igResult),
      igId: igResult?.igId ?? null,
    });

    const supabase = await createSupabaseServerClient();

    await supabase
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .in("channel", ["facebook", "instagram"]);

    const tokenExpiresAt = tokenExpiresIn
      ? new Date(Date.now() + tokenExpiresIn * 1000).toISOString()
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const upserts: Array<{
      user_id: string;
      workspace_id: string;
      channel: "facebook" | "instagram";
      account_id: string;
      access_token: string;
      refresh_token: null;
      token_expires_at: string;
      updated_at: string;
    }> = [
      {
        user_id: userId,
        workspace_id: workspaceId,
        channel: "facebook",
        account_id: facebookPage.id,
        access_token: facebookPage.access_token ?? "",
        refresh_token: null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
    ];

    if (igResult) {
      upserts.push({
        user_id: userId,
        workspace_id: workspaceId,
        channel: "instagram",
        account_id: igResult.igId,
        access_token: igResult.accessToken,
        refresh_token: null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      });
    }

    const { error } = await supabase.from("social_accounts").upsert(upserts, {
      onConflict: "user_id,channel,account_id",
    });

    const statusMsg = error
      ? "meta_save_failed"
      : igResult
        ? "meta_connected"
        : "meta_connected_no_instagram";

    const done = redirectToReturnPath(returnPath, statusMsg);
    done.cookies.delete(OAUTH_STATE_COOKIE);
    return done;
  } catch (error) {
    logger.error("[meta/callback] Callback feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    const failed = redirectToReturnPath(returnPath, "meta_callback_failed");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }
}
