import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const customPostSchema = z.object({
  channel: z.enum(["facebook", "instagram", "linkedin", "tiktok"]),
  scheduledAt: z.string().min(1),
  text: z.string().min(1),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await requireActiveSubscription(userId);
    const json = await request.json();
    const payload = customPostSchema.parse(json);

    if (new Date(payload.scheduledAt).getTime() <= Date.now()) {
      return NextResponse.json(
        toAppError("PAST_DATE", "Publiseringstidspunktet må være i fremtiden."),
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();

    const { data: plan } = await supabase
      .from("content_plans")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan) {
      return NextResponse.json(
        toAppError("NO_PLAN", "Du må generere en innholdsplan først."),
        { status: 400 },
      );
    }

    const postId = crypto.randomUUID();
    const qualityScore = {
      languageQuality: 100,
      brandMatch: 100,
      factualClarity: 100,
      engagementPotential: 100,
      visualQuality: payload.imageUrl ? 100 : 50,
      ctaPresent: true,
      companyMentioned: true,
      total: 100,
    };

    const { data, error } = await supabase
      .from("posts")
      .insert({
        id: postId,
        user_id: userId,
        plan_id: plan.id,
        channel: payload.channel,
        status: "draft",
        scheduled_at: payload.scheduledAt,
        text_content: payload.text,
        image_url: payload.imageUrl || null,
        quality_score: qualityScore,
      })
      .select("id, channel, status, scheduled_at, text_content, image_url, video_url, quality_score")
      .single();

    if (error) {
      return NextResponse.json(
        toAppError("CUSTOM_POST_FAILED", "Kunne ikke opprette post", error.message),
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: data.id,
      channel: data.channel,
      status: data.status,
      scheduledAt: data.scheduled_at,
      text: data.text_content,
      imageUrl: data.image_url ?? undefined,
      quality: data.quality_score,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("CUSTOM_POST_ERROR", "Feil ved opprettelse av post", appError),
      { status: 400 },
    );
  }
}
