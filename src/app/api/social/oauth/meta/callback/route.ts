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
  source: "oauth" | "business_manager";
};

export type PendingMetaData = {
  pages: PendingMetaPage[];
  userAccessToken: string;
  tokenExpiresIn: number | null;
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
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string };
    return payload.access_token ?? null;
  } catch {
    return null;
  }
};

const resolvePageToken = async (page: MetaPage, userAccessToken: string): Promise<string | null> =>
  page.access_token ?? await fetchPageAccessToken(page.id, userAccessToken);

const fetchBusinessPages = async (
  userAccessToken: string,
): Promise<MetaPage[]> => {
  const allPages: MetaPage[] = [];
  try {
    const bizUrl = new URL("https://graph.facebook.com/v23.0/me/businesses");
    bizUrl.searchParams.set("access_token", userAccessToken);
    bizUrl.searchParams.set("fields", "id,name");
    bizUrl.searchParams.set("limit", "100");

    const bizResponse = await fetch(bizUrl.toString(), { cache: "no-store" });
    if (!bizResponse.ok) {
      logger.info("[meta/callback] /me/businesses returnerte ikke-OK", {
        status: bizResponse.status,
      });
      return allPages;
    }
    const bizPayload = (await bizResponse.json()) as {
      data?: Array<{ id: string; name?: string }>;
    };
    const businesses = bizPayload.data ?? [];

    logger.info("[meta/callback] Business Managers funnet", { count: businesses.length });

    for (const biz of businesses) {
      try {
        const ownedUrl = new URL(
          `https://graph.facebook.com/v23.0/${biz.id}/owned_pages`,
        );
        ownedUrl.searchParams.set("access_token", userAccessToken);
        ownedUrl.searchParams.set(
          "fields",
          "id,name,instagram_business_account{id,username}",
        );
        ownedUrl.searchParams.set("limit", "100");

        const ownedResponse = await fetch(ownedUrl.toString(), { cache: "no-store" });
        if (!ownedResponse.ok) {
          logger.info("[meta/callback] /{biz}/owned_pages feilet", {
            businessId: biz.id,
            status: ownedResponse.status,
          });
          continue;
        }

        const ownedPayload = (await ownedResponse.json()) as { data?: MetaPage[] };
        const owned = ownedPayload.data ?? [];

        logger.info("[meta/callback] Sider fra Business Manager", {
          businessId: biz.id,
          businessName: biz.name,
          pageCount: owned.length,
        });

        allPages.push(...owned);
      } catch {
        logger.warn("[meta/callback] Feil ved henting av owned_pages", {
          businessId: biz.id,
        });
      }
    }
  } catch (error) {
    logger.warn("[meta/callback] fetchBusinessPages feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
  }
  return allPages;
};

export const connectSinglePage = async (
  userId: string,
  workspaceId: string,
  page: PendingMetaPage,
  tokenExpiresIn: number | null,
): Promise<string> => {
  if (!page.pageToken) return "meta_page_token_missing";

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
    const userAccessToken = tokenPayload.access_token;
    const tokenExpiresIn = tokenPayload.expires_in ?? null;
    if (!tokenResponse.ok || !userAccessToken) {
      const failed = redirectToReturnPath(returnPath, "meta_token_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    // Phase 1: Fetch pages from /me/accounts (with tokens)
    const pagesUrl = new URL("https://graph.facebook.com/v23.0/me/accounts");
    pagesUrl.searchParams.set("access_token", userAccessToken);
    pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
    pagesUrl.searchParams.set("limit", "100");

    const pagesResponse = await fetch(pagesUrl.toString(), { cache: "no-store" });
    const pagesPayload = (await pagesResponse.json().catch(() => ({}))) as {
      data?: MetaPage[];
      error?: { message?: string };
    };
    if (!pagesResponse.ok) {
      logger.warn("[meta/callback] Kunne ikke hente sider fra /me/accounts", {
        status: pagesResponse.status,
        error: pagesPayload.error?.message ?? null,
      });
      const failed = redirectToReturnPath(returnPath, "meta_pages_fetch_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }
    const oauthPages = pagesPayload.data ?? [];

    logger.info("[meta/callback] OAuth-sider hentet", {
      pageCount: oauthPages.length,
      pagesWithIg: oauthPages.filter((p) => p.instagram_business_account?.id).length,
    });

    // Phase 2: Fetch additional pages from Business Manager API
    const businessPages = await fetchBusinessPages(userAccessToken);

    // Phase 3: Merge and deduplicate
    const oauthPageIds = new Set(oauthPages.filter((p) => p.id).map((p) => p.id));
    const resolvedPages: PendingMetaPage[] = [];

    for (const page of oauthPages) {
      if (!page.id) continue;
      const pageToken = await resolvePageToken(page, userAccessToken);
      if (!pageToken) continue;
      resolvedPages.push({
        id: page.id,
        name: page.name ?? `Side ${page.id}`,
        pageToken,
        igId: page.instagram_business_account?.id ?? null,
        igUsername: page.instagram_business_account?.username ?? null,
        source: "oauth",
      });
    }

    for (const page of businessPages) {
      if (!page.id || oauthPageIds.has(page.id)) continue;
      resolvedPages.push({
        id: page.id,
        name: page.name ?? `Side ${page.id}`,
        pageToken: null,
        igId: page.instagram_business_account?.id ?? null,
        igUsername: page.instagram_business_account?.username ?? null,
        source: "business_manager",
      });
    }

    logger.info("[meta/callback] Totalt etter merge", {
      oauthPages: oauthPages.length,
      businessPages: businessPages.length,
      resolvedTotal: resolvedPages.length,
      withToken: resolvedPages.filter((p) => p.pageToken).length,
      withoutToken: resolvedPages.filter((p) => !p.pageToken).length,
    });

    if (resolvedPages.length === 0) {
      const none = redirectToReturnPath(returnPath, "meta_no_pages");
      none.cookies.delete(OAUTH_STATE_COOKIE);
      return none;
    }

    const pendingData: PendingMetaData = {
      pages: resolvedPages,
      userAccessToken,
      tokenExpiresIn,
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
