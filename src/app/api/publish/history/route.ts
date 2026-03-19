import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const querySchema = z.object({
  postId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      postId: url.searchParams.get("postId"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        toAppError("VALIDATION_ERROR", "Mangler gyldig postId."),
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("publish_jobs")
      .select("id, status, attempts, last_error, run_at, updated_at, created_at, channel, processing_started_at, external_post_id")
      .eq("user_id", userId)
      .eq("post_id", parsed.data.postId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json(
        toAppError("PUBLISH_HISTORY_FAILED", "Kunne ikke hente publiseringshistorikk.", error.message),
        { status: 500 },
      );
    }

    return NextResponse.json({
      jobs: data ?? [],
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("PUBLISH_HISTORY_ERROR", "Feil ved henting av publiseringshistorikk.", appError),
      { status: 400 },
    );
  }
}

