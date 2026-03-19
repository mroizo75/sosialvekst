import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { deleteAllUserFiles } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE() {
  try {
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

    await deleteAllUserFiles(userId);

    await supabase.from("generation_log").delete().eq("user_id", userId);
    await supabase.from("publish_jobs").delete().eq("user_id", userId);
    await supabase.from("posts").delete().eq("user_id", userId);
    await supabase.from("content_plans").delete().eq("user_id", userId);
    await supabase.from("media_assets").delete().eq("user_id", userId);
    await supabase.from("social_accounts").delete().eq("user_id", userId);
    await supabase.from("brand_profiles").delete().eq("user_id", userId);
    await supabase.from("subscriptions").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("user_id", userId);

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw toAppError("ACCOUNT_DELETE_FAILED", "Kunne ikke slette bruker", error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("ACCOUNT_DELETE_FAILED", "Kunne ikke slette konto", appError),
      { status: 400 },
    );
  }
}
