import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SocialChannel } from "@/lib/types";

type SocialAccountRow = {
  channel: SocialChannel;
  account_id: string;
  updated_at: string;
};

export async function GET() {
  try {
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("social_accounts")
      .select("channel, account_id, updated_at")
      .eq("user_id", userId)
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

    return NextResponse.json({
      connected: Array.from(byChannel.values()),
    });
  } catch {
    return NextResponse.json(
      toAppError("SOCIAL_ACCOUNTS_FETCH_FAILED", "Kunne ikke hente sosiale kontoer."),
      { status: 400 },
    );
  }
}
