import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import type { SocialChannel } from "@/lib/types";

type SocialAccountRow = {
  channel: SocialChannel;
  account_id: string;
  access_token: string | null;
  token_expires_at: string | null;
  updated_at: string;
};

type TokenStatus = "valid" | "expired" | "missing";

const verifyMetaToken = async (accessToken: string): Promise<boolean> => {
  try {
    const url = new URL("https://graph.facebook.com/v23.0/me");
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("fields", "id");
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const verifyLinkedinToken = async (accessToken: string): Promise<boolean> => {
  try {
    const response = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const verifyTikTokToken = async (accessToken: string): Promise<boolean> => {
  try {
    const response = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const verifyToken = async (channel: SocialChannel, accessToken: string): Promise<boolean> => {
  switch (channel) {
    case "facebook":
    case "instagram":
      return verifyMetaToken(accessToken);
    case "linkedin":
      return verifyLinkedinToken(accessToken);
    case "tiktok":
      return verifyTikTokToken(accessToken);
  }
};

const resolveTokenStatus = async (row: SocialAccountRow): Promise<TokenStatus> => {
  if (!row.access_token || row.access_token.startsWith("pending-")) {
    return "missing";
  }
  if (row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at).getTime();
    if (expiresAt < Date.now()) {
      return "expired";
    }
  }
  const isValid = await verifyToken(row.channel, row.access_token);
  return isValid ? "valid" : "expired";
};

export async function GET() {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("social_accounts")
      .select("channel, account_id, access_token, token_expires_at, updated_at")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        toAppError("SOCIAL_ACCOUNTS_FETCH_FAILED", "Kunne ikke hente sosiale kontoer.", error.message),
        { status: 500 },
      );
    }

    const byChannel = new Map<SocialChannel, SocialAccountRow>();
    for (const row of (data ?? []) as SocialAccountRow[]) {
      if (!byChannel.has(row.channel)) {
        byChannel.set(row.channel, row);
      }
    }

    const rows = Array.from(byChannel.values());
    const statuses = await Promise.all(rows.map((row) => resolveTokenStatus(row)));

    const connected = rows.map((row, i) => ({
      channel: row.channel,
      account_id: row.account_id,
      updated_at: row.updated_at,
      tokenStatus: statuses[i],
    }));

    return NextResponse.json({ connected });
  } catch {
    return NextResponse.json(
      toAppError("SOCIAL_ACCOUNTS_FETCH_FAILED", "Kunne ikke hente sosiale kontoer."),
      { status: 400 },
    );
  }
}
