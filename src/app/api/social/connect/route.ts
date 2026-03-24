import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import type { SocialChannel } from "@/lib/types";

const schema = z.object({
  channel: z.enum(["facebook", "instagram", "linkedin", "tiktok"]),
  accountId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
});

export async function POST(request: Request) {
  const userId = await requireUserId();
  const workspaceId = await requireWorkspaceId(userId);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(toAppError("VALIDATION_ERROR", "Ugyldig sosial konto payload"), {
      status: 400,
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("social_accounts").upsert(
    {
      user_id: userId,
      workspace_id: workspaceId,
      channel: parsed.data.channel,
      account_id: parsed.data.accountId,
      access_token: parsed.data.accessToken,
      refresh_token: parsed.data.refreshToken ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,channel,account_id" },
  );

  if (error) {
    return NextResponse.json(
      toAppError("SOCIAL_CONNECT_FAILED", "Kunne ikke lagre sosial konto", error.message),
      {
        status: 400,
      },
    );
  }

  const { data } = await supabase
    .from("social_accounts")
    .select("channel, account_id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({
    ok: true,
    connected: (data ?? []).map((item) => ({
      channel: item.channel as SocialChannel,
      accountId: item.account_id as string,
    })),
  });
}
