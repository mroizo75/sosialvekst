import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl, getRequiredEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OAUTH_STATE_COOKIE = "social_oauth_state_meta";

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string };
};

const redirectToDashboard = (status: string): NextResponse => {
  const url = new URL("/dashboard", getAppUrl());
  url.searchParams.set("social_connect", status);
  return NextResponse.redirect(url.toString());
};

export async function GET(request: Request) {
  const userId = await requireUserId();

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
    const invalid = redirectToDashboard("meta_invalid_state");
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
    };
    const userAccessToken = tokenPayload.access_token;
    if (!tokenResponse.ok || !userAccessToken) {
      const failed = redirectToDashboard("meta_token_failed");
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    const pagesUrl = new URL("https://graph.facebook.com/v23.0/me/accounts");
    pagesUrl.searchParams.set("access_token", userAccessToken);
    pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id}");

    const pagesResponse = await fetch(pagesUrl.toString(), { cache: "no-store" });
    const pagesPayload = (await pagesResponse.json().catch(() => ({}))) as {
      data?: MetaPage[];
    };
    const pages = pagesPayload.data ?? [];
    const facebookPage = pages.find((page) => Boolean(page.id && page.access_token));
    const instagramPage = pages.find(
      (page) => Boolean(page.access_token && page.instagram_business_account?.id),
    );

    if (!facebookPage) {
      const none = redirectToDashboard("meta_no_pages");
      none.cookies.delete(OAUTH_STATE_COOKIE);
      return none;
    }

    const supabase = await createSupabaseServerClient();

    await supabase
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .in("channel", ["facebook", "instagram"]);

    const upserts: Array<{
      user_id: string;
      channel: "facebook" | "instagram";
      account_id: string;
      access_token: string;
      refresh_token: null;
      updated_at: string;
    }> = [
      {
        user_id: userId,
        channel: "facebook",
        account_id: facebookPage.id,
        access_token: facebookPage.access_token ?? "",
        refresh_token: null,
        updated_at: new Date().toISOString(),
      },
    ];

    if (instagramPage?.instagram_business_account?.id) {
      upserts.push({
        user_id: userId,
        channel: "instagram",
        account_id: instagramPage.instagram_business_account.id,
        access_token: instagramPage.access_token ?? "",
        refresh_token: null,
        updated_at: new Date().toISOString(),
      });
    }

    const { error } = await supabase.from("social_accounts").upsert(upserts, {
      onConflict: "user_id,channel,account_id",
    });

    const done = redirectToDashboard(error ? "meta_save_failed" : "meta_connected");
    done.cookies.delete(OAUTH_STATE_COOKIE);
    return done;
  } catch {
    const failed = redirectToDashboard("meta_callback_failed");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }
}
