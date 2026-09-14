import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePost } from "@/lib/ai/generatePost";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const customPostSchema = z.object({
  channel: z.enum(["facebook", "instagram", "linkedin", "tiktok"]),
  scheduledAt: z.string().min(1),
  text: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  topic: z.string().optional(),
  useAi: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    await requireActiveSubscription(userId);
    const json = await request.json();
    const payload = customPostSchema.parse(json);

    if (!payload.useAi && !payload.text?.trim()) {
      return NextResponse.json(
        toAppError("MISSING_TEXT", "Skriv inn tekst eller velg AI-generering."),
        { status: 400 },
      );
    }

    if (payload.useAi && !payload.topic?.trim()) {
      return NextResponse.json(
        toAppError("MISSING_TOPIC", "Skriv inn et tema for AI-generering."),
        { status: 400 },
      );
    }

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

    let finalText = payload.text?.trim() ?? "";
    let finalImageUrl = payload.imageUrl || null;

    if (payload.useAi && payload.topic) {
      logger.info("[custom-post] Starter AI-generering", {
        userId,
        channel: payload.channel,
        topic: payload.topic.slice(0, 60),
      });

      const brandContext = await getBrandContext(userId, workspaceId);
      const generated = await generatePost({
        userId,
        topic: payload.topic,
        channel: payload.channel,
        scheduledAt: payload.scheduledAt,
        mediaMode: "ai_only",
        imageProfile: "preview",
        brandContext,
        skipVideo: true,
      });

      finalText = generated.text || finalText;
      finalImageUrl = generated.imageUrl ?? finalImageUrl;

      logger.info("[custom-post] AI-generering ferdig", {
        userId,
        hasText: Boolean(generated.text),
        hasImage: Boolean(generated.imageUrl),
      });
    }

    const postId = crypto.randomUUID();
    const qualityScore = {
      languageQuality: 100,
      brandMatch: 100,
      factualClarity: 100,
      engagementPotential: 100,
      visualQuality: finalImageUrl ? 100 : 50,
      ctaPresent: true,
      companyMentioned: true,
      total: 100,
    };

    const { data, error } = await supabase
      .from("posts")
      .insert({
        id: postId,
        user_id: userId,
        workspace_id: workspaceId,
        plan_id: plan.id,
        channel: payload.channel,
        status: "draft",
        scheduled_at: payload.scheduledAt,
        text_content: finalText,
        image_url: finalImageUrl,
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
