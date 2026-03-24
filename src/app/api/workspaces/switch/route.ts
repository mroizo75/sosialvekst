import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setActiveWorkspaceId } from "@/lib/workspace";

const schema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: Request) {
  const userId = await requireUserId();
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(toAppError("VALIDATION_ERROR", "Ugyldig workspace-id"), { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", parsed.data.workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.id) {
    return NextResponse.json(toAppError("NOT_FOUND", "Bedriften ble ikke funnet"), { status: 404 });
  }

  await setActiveWorkspaceId(data.id as string);

  await supabase
    .from("profiles")
    .update({ active_workspace_id: data.id })
    .eq("user_id", userId);

  return NextResponse.json({ ok: true, activeId: data.id });
}
