import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const OAUTH_STATE_COOKIE = "social_oauth_state_meta";
const RETURN_PATH_COOKIE = "social_oauth_return_path_meta";
export const META_PENDING_PAGES_COOKIE = "meta_pending_pages";

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
};

export type PendingMetaPage = {
  id: string;
  name: string;
  pageToken: string | null;
  igId: string | null;
  igUsername: string | null;
};

export type PendingMetaData = {
  pages: PendingMetaPage[];
  userAccessToken: string;
  tokenExpiresIn: number | null;
  isLongLived: boolean;
  returnPath: string;
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

const fetchPageAccessToken = async (
  pageId: string,
  userAccessToken: string,
): Promise<string | null> => {
  try {
    const pageUrl = new URL(`https://graph.facebook.com/v23.0/${pageId}`);
    pageUrl.searchParams.set("access_token", userAccessToken);
    pageUrl.searchParams.set("fields", "access_token");
    const response = await fetch(pageUrl.toString(), { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      error?: { message?: string; code?: number };
    };
    if (!response.ok || !payload.access_token) {
      logger.warn("[meta/callback] Kunne ikke hente sidetoken", {
        pageId,
        status: response.status,
        error: payload.error?.message ?? null,
        hasToken: Boolean(payload.access_token),
      });
      return null;
    }
    return payload.access_token;
  } catch (err) {
    logger.error("[meta/callback] fetchPageAccessToken feilet", {
      pageId,
      error: err instanceof Error ? err.message : "ukjent",
    });
    return null;
  }
};

const resolvePageToken = async (page: MetaPage, userAccessToken: string): Promise<string | null> =>
  page.access_token ?? await fetchPageAccessToken(page.id, userAccessToken);

export const connectSinglePage = async (
  userId: string,
  workspaceId: string,
  page: PendingMetaPage,
  _tokenExpiresIn: number | null,
  isLongLived = false,
): Promise<string> => {
  if (!page.pageToken) return "meta_page_token_missing";

  const supabase = await createSupabaseServerClient();

  await supabase
    .from("social_accounts")
    .delete()
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .in("channel", ["facebook", "instagram"]);

  const tokenExpiresAt = isLongLived
    ? null
    : _tokenExpiresIn
      ? new Date(Date.now() + _tokenExpiresIn * 1000).toISOString()
      : null;

  const upserts: Array<{
    user_id: string;
    workspace_id: string;
    channel: "facebook" | "instagram";
    account_id: string;
    access_token: string;
    refresh_token: null;
    token_expires_at: string | null;
    updated_at: string;
  }> = [
    {
      user_id: userId,
      workspace_id: workspaceId,
      channel: "facebook",
      account_id: page.id,
      access_token: page.pageToken,
      refresh_token: null,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    },
  ];

  if (page.igId) {
    upserts.push({
      user_id: userId,
      workspace_id: workspaceId,
      channel: "instagram",
      account_id: page.igId,
      access_token: page.pageToken,
      refresh_token: null,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    });
  }

  const { error } = await supabase.from("social_accounts").upsert(upserts, {
    onConflict: "user_id,channel,account_id",
  });

  if (error) return "meta_save_failed";
  return page.igId ? "meta_connected" : "meta_connected_no_instagram";
};

export async function GET(request: Request) {
  const userId = await requireUserId();
  await requireWorkspaceId(userId);
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
    const shortLivedToken = tokenPayload.access_token;
    if (!tokenResponse.ok || !shortLivedToken) {
      const failed = redirectToReturnPath(returnPath, "meta_token_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    const exchangeUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
    exchangeUrl.searchParams.set("grant_type", "fb_exchange_token");
    exchangeUrl.searchParams.set("client_id", getRequiredEnv("FACEBOOK_APP_ID"));
    exchangeUrl.searchParams.set("client_secret", getRequiredEnv("FACEBOOK_APP_SECRET"));
    exchangeUrl.searchParams.set("fb_exchange_token", shortLivedToken);
    const exchangeResponse = await fetch(exchangeUrl.toString(), { cache: "no-store" });
    const exchangePayload = (await exchangeResponse.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };

    const isLongLived = Boolean(exchangePayload.access_token);
    const userAccessToken = exchangePayload.access_token ?? shortLivedToken;

    if (!isLongLived) {
      logger.warn("[meta/callback] Long-lived token exchange feilet, bruker kortlevd token", {
        status: exchangeResponse.status,
      });
    } else {
      logger.info("[meta/callback] Long-lived token OK", {
        expiresIn: exchangePayload.expires_in ?? "ukjent",
      });
    }

    const permsUrl = new URL("https://graph.facebook.com/v23.0/me/permissions");
    permsUrl.searchParams.set("access_token", userAccessToken);
    const permsResponse = await fetch(permsUrl.toString(), { cache: "no-store" });
    const permsPayload = (await permsResponse.json().catch(() => ({}))) as {
      data?: Array<{ permission: string; status: string }>;
    };
    const grantedPerms = (permsPayload.data ?? [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);
    logger.info("[meta/callback] Brukerens tillatelser", {
      granted: grantedPerms,
      declined: (permsPayload.data ?? [])
        .filter((p) => p.status !== "granted")
        .map((p) => `${p.permission}:${p.status}`),
    });

    const pagesUrl = new URL("https://graph.facebook.com/v23.0/me/accounts");
    pagesUrl.searchParams.set("access_token", userAccessToken);
    pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
    pagesUrl.searchParams.set("limit", "100");

    const pagesResponse = await fetch(pagesUrl.toString(), { cache: "no-store" });
    const pagesRawText = await pagesResponse.text();
    let pagesPayload: { data?: MetaPage[]; error?: { message?: string; code?: number; type?: string } } = {};
    try {
      pagesPayload = JSON.parse(pagesRawText) as typeof pagesPayload;
    } catch {
      logger.error("[meta/callback] Kunne ikke parse /me/accounts respons", {
        body: pagesRawText.slice(0, 500),
      });
    }

    if (!pagesResponse.ok) {
      logger.warn("[meta/callback] /me/accounts feilet", {
        status: pagesResponse.status,
        error: pagesPayload.error?.message ?? null,
        errorCode: pagesPayload.error?.code ?? null,
        errorType: pagesPayload.error?.type ?? null,
      });
      const failed = redirectToReturnPath(returnPath, "meta_pages_fetch_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }
    const oauthPages = pagesPayload.data ?? [];

    logger.info("[meta/callback] Sider hentet", {
      pageCount: oauthPages.length,
      pagesWithToken: oauthPages.filter((p) => p.access_token).length,
      pagesWithIg: oauthPages.filter((p) => p.instagram_business_account?.id).length,
      isLongLived,
      pageNames: oauthPages.map((p) => p.name ?? p.id),
    });

    let allPages = [...oauthPages];

    if (allPages.length === 0) {
      logger.info("[meta/callback] /me/accounts ga 0 sider, prøver Business Manager...");
      const bizUrl = new URL("https://graph.facebook.com/v23.0/me/businesses");
      bizUrl.searchParams.set("access_token", userAccessToken);
      bizUrl.searchParams.set("fields", "id,name");
      const bizResponse = await fetch(bizUrl.toString(), { cache: "no-store" });
      const bizPayload = (await bizResponse.json().catch(() => ({}))) as {
        data?: Array<{ id: string; name?: string }>;
      };
      const businesses = bizPayload.data ?? [];
      logger.info("[meta/callback] Businesses funnet", {
        count: businesses.length,
        names: businesses.map((b) => b.name ?? b.id),
      });

      for (const biz of businesses) {
        const bizPagesUrl = new URL(`https://graph.facebook.com/v23.0/${biz.id}/owned_pages`);
        bizPagesUrl.searchParams.set("access_token", userAccessToken);
        bizPagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
        bizPagesUrl.searchParams.set("limit", "100");
        const bizPagesResponse = await fetch(bizPagesUrl.toString(), { cache: "no-store" });
        const bizPagesPayload = (await bizPagesResponse.json().catch(() => ({}))) as {
          data?: MetaPage[];
          error?: { message?: string };
        };
        if (bizPagesResponse.ok && bizPagesPayload.data) {
          logger.info("[meta/callback] Business Manager-sider hentet", {
            businessId: biz.id,
            businessName: biz.name,
            pageCount: bizPagesPayload.data.length,
            pageNames: bizPagesPayload.data.map((p) => p.name ?? p.id),
            pagesWithToken: bizPagesPayload.data.filter((p) => p.access_token).length,
          });
          allPages.push(...bizPagesPayload.data);
        } else {
          logger.warn("[meta/callback] Kunne ikke hente sider fra business", {
            businessId: biz.id,
            error: bizPagesPayload.error?.message ?? null,
          });
        }
      }
    }

    const seenIds = new Set<string>();
    const resolvedPages: PendingMetaPage[] = [];
    for (const page of allPages) {
      if (!page.id || seenIds.has(page.id)) continue;
      seenIds.add(page.id);
      const pageToken = await resolvePageToken(page, userAccessToken);
      if (!pageToken) continue;
      resolvedPages.push({
        id: page.id,
        name: page.name ?? `Side ${page.id}`,
        pageToken,
        igId: page.instagram_business_account?.id ?? null,
        igUsername: page.instagram_business_account?.username ?? null,
      });
    }

    logger.info("[meta/callback] Totalt resolved sider", {
      total: resolvedPages.length,
      names: resolvedPages.map((p) => p.name),
    });

    if (resolvedPages.length === 0) {
      const none = redirectToReturnPath(returnPath, "meta_no_pages");
      none.cookies.delete(OAUTH_STATE_COOKIE);
      return none;
    }

    const pendingData: PendingMetaData = {
      pages: resolvedPages,
      userAccessToken,
      tokenExpiresIn: isLongLived ? null : (tokenPayload.expires_in ?? null),
      isLongLived,
      returnPath,
    };

    const selectUrl = new URL("/dashboard/velg-side", getAppUrl());
    const response = NextResponse.redirect(selectUrl.toString());
    response.cookies.set(META_PENDING_PAGES_COOKIE, JSON.stringify(pendingData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    logger.error("[meta/callback] Callback feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    const failed = redirectToReturnPath(returnPath, "meta_callback_failed");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }
}
