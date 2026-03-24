import { NextResponse } from "next/server";
import { z } from "zod";

import { generateImageToVideo, isFalAvailable } from "@/lib/ai/falClient";
import { generatePost } from "@/lib/ai/generatePost";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { requireWorkspaceId } from "@/lib/workspace";
import { deleteFilesByUrls } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { checkAiEditAvailable, consumeAiEdit } from "@/lib/posts/aiEditLimits";
import { getPostById, savePost, setPostAdditionalImages } from "@/lib/posts/repository";
import { requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrandContext, TopicWindow } from "@/lib/types";

const REGENERATE_TIMEOUT_MS = 120_000;

async function generateVideoInBackground(
  userId: string,
  postId: string,
  imageUrl: string,
  brandContext?: BrandContext,
): Promise<void> {
  if (!isFalAvailable()) return;

  try {
    logger.info("[post/patch] Starter bakgrunnsvideogenerering", { postId, userId });

    const companyName = brandContext?.companyName ?? "bedriften";
    const productName = brandContext?.productImages?.[0]?.productName;
    const motionPrompt = productName
      ? `Smooth, cinematic product showcase of ${productName} by ${companyName}. Slow camera push-in revealing product details. Subtle ambient lighting shifts. Professional commercial quality, steady motion, no text overlays.`
      : `Professional social media video for ${companyName}. Gentle camera movement with slow zoom or pan. Warm, inviting atmosphere with subtle light transitions. Smooth cinematic motion, high production quality, no text overlays.`;

    const result = await generateImageToVideo({
      prompt: motionPrompt,
      imageUrl,
      resolution: "480p",
    });

    if (!result?.url) {
      logger.warn("[post/patch] Videogenerering returnerte tomt resultat", { postId });
      return;
    }

    const videoResponse = await fetch(result.url);
    if (!videoResponse.ok) {
      logger.warn("[post/patch] Kunne ikke hente generert video", { postId, status: videoResponse.status });
      return;
    }

    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    const uploaded = await uploadUserFile({
      userId,
      fileName: `tiktok-video-${crypto.randomUUID()}.mp4`,
      contentType: "video/mp4",
      mediaKind: "video",
      body: videoBytes,
    });

    const supabase = await createSupabaseServerClient();
    await supabase
      .from("posts")
      .update({ video_url: uploaded.publicUrl, updated_at: new Date().toISOString() })
      .eq("id", postId)
      .eq("user_id", userId);

    logger.info("[post/patch] Bakgrunnsvideo ferdig og lagret", { postId, userId });
  } catch (error) {
    logger.warn("[post/patch] Bakgrunnsvideogenerering feilet", {
      postId,
      error: error instanceof Error ? error.message : "ukjent",
    });
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout etter ${ms / 1000}s: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const updateSchema = z.object({
  text: z.string().trim().min(1).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  videoUrl: z.string().url().optional().or(z.literal("")),
  additionalImageUrls: z.array(z.string().url()).optional(),
  topic: z.string().trim().min(2).max(180).optional(),
  scheduledAt: z.string().datetime().optional(),
  action: z
    .enum(["save", "regenerate_all", "regenerate_text", "regenerate_image", "rewrite_topic", "reschedule"])
    .optional(),
  regenerate: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ postId: string }>;
};

const startOfWeekMonday = (value: Date): Date => {
  const date = new Date(value);
  const day = date.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + distanceToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getTopicForWeek = (week: number, windows: TopicWindow[]): string | null => {
  const match = windows.find((w) => week >= w.startWeek && week <= w.endWeek);
  return match?.topic ?? null;
};

const getTopicFromPlan = async (
  userId: string,
  postId: string,
): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: postMeta } = await supabase
    .from("posts")
    .select("plan_id, scheduled_at")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!postMeta?.plan_id || !postMeta?.scheduled_at) {
    return null;
  }

  const { data: planMeta } = await supabase
    .from("content_plans")
    .select("topic_windows")
    .eq("id", postMeta.plan_id)
    .eq("user_id", userId)
    .maybeSingle();

  const topicWindows = Array.isArray(planMeta?.topic_windows)
    ? (planMeta.topic_windows as TopicWindow[])
    : [];

  if (topicWindows.length === 0) {
    return null;
  }

  const { data: firstPost } = await supabase
    .from("posts")
    .select("scheduled_at")
    .eq("plan_id", postMeta.plan_id)
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstPost?.scheduled_at) {
    return null;
  }

  const planStart = startOfWeekMonday(new Date(firstPost.scheduled_at));
  const postDate = new Date(postMeta.scheduled_at);
  const daysDiff = Math.max(0, Math.floor((postDate.getTime() - planStart.getTime()) / 86400000));
  const week = Math.floor(daysDiff / 7) + 1;

  return getTopicForWeek(week, topicWindows);
};

const getMediaModeFromPlan = async (
  userId: string,
  postId: string,
): Promise<"ai_only" | "hybrid" | "owned_only" | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: postMeta } = await supabase
    .from("posts")
    .select("plan_id")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!postMeta?.plan_id) {
    return null;
  }

  const { data: planMeta } = await supabase
    .from("content_plans")
    .select("media_mode")
    .eq("id", postMeta.plan_id)
    .eq("user_id", userId)
    .maybeSingle();

  const value = planMeta?.media_mode;
  if (value === "ai_only" || value === "hybrid" || value === "owned_only") {
    return value;
  }
  return null;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const brandContext = await getBrandContext(userId);
    const { postId } = await context.params;
    const post = await getPostById(userId, postId);
    if (!post) {
      return NextResponse.json(toAppError("POST_NOT_FOUND", "Fant ikke post"), { status: 404 });
    }

    const payload = updateSchema.parse(await request.json());
    const companyName = brandContext?.companyName;
    let updatedText = payload.text ?? post.text;
    let updatedImageUrl = payload.imageUrl === "" ? undefined : payload.imageUrl ?? post.imageUrl;
    let updatedVideoUrl = payload.videoUrl === "" ? undefined : payload.videoUrl ?? post.videoUrl;
    let updatedAdditionalImageUrls = payload.additionalImageUrls ?? post.additionalImageUrls ?? [];
    const fallbackTopic = brandContext?.companyDescription?.slice(0, 180)
      ?? brandContext?.products?.join(", ")?.slice(0, 180)
      ?? "Generell merkevarebygging";
    const action = payload.action ?? (payload.regenerate ? "regenerate_all" : "save");

    if (action === "reschedule") {
      if (!payload.scheduledAt) {
        return NextResponse.json(
          toAppError("SCHEDULE_REQUIRED", "Nytt tidspunkt mangler."),
          { status: 400 },
        );
      }
      if (new Date(payload.scheduledAt).getTime() <= Date.now()) {
        return NextResponse.json(
          toAppError("PAST_DATE", "Publiseringstidspunktet må være i fremtiden."),
          { status: 400 },
        );
      }
      if (post.status === "published") {
        return NextResponse.json(
          toAppError("POST_LOCKED", "Publiserte poster kan ikke flyttes."),
          { status: 400 },
        );
      }
      const updated = await savePost(userId, {
        ...post,
        scheduledAt: payload.scheduledAt,
      });
      return NextResponse.json(updated);
    }

    if (action === "rewrite_topic" && !payload.topic) {
      return NextResponse.json(
        toAppError("TOPIC_REQUIRED", "Du må skrive et emne før omskriving."),
        { status: 400 },
      );
    }

    if (action !== "save") {
      const t0 = Date.now();
      logger.info("[post/patch] Start AI-redigering", {
        postId, action, channel: post.channel, userId,
      });

      await requireActiveSubscription(userId);
      // TODO: Aktiver igjen etter test
      // await checkAiEditAvailable(userId, workspaceId);

      const oldImageUrl = post.imageUrl;
      const topicFromPlan = await getTopicFromPlan(userId, postId);
      const mediaModeFromPlan = await getMediaModeFromPlan(userId, postId);
      const effectiveMediaMode = mediaModeFromPlan ?? "ai_only";
      const topic = action === "rewrite_topic"
        ? payload.topic ?? topicFromPlan ?? fallbackTopic
        : topicFromPlan ?? fallbackTopic;
      const mediaMode = action === "regenerate_text"
        ? "owned_only"
        : effectiveMediaMode === "owned_only"
          ? "owned_only"
          : "ai_only";
      const imageProfile = action === "regenerate_image" ? "final" : "preview";

      logger.info("[post/patch] Starter generatePost", {
        postId, action, channel: post.channel, mediaMode, imageProfile, topic: topic.slice(0, 60),
      });

      const regenerated = await withTimeout(
        generatePost({
          userId,
          topic,
          channel: post.channel,
          scheduledAt: post.scheduledAt,
          mediaMode,
          imageProfile,
          brandContext,
          skipVideo: true,
        }),
        REGENERATE_TIMEOUT_MS,
        `${action}/${post.channel}`,
      );

      logger.info("[post/patch] generatePost ferdig", {
        postId, action, channel: post.channel,
        hasText: Boolean(regenerated.text),
        hasImage: Boolean(regenerated.imageUrl),
        hasVideo: Boolean(regenerated.videoUrl),
        durationMs: Date.now() - t0,
      });

      if (action === "regenerate_image") {
        if (!regenerated.imageUrl) {
          logger.warn("[post/patch] Bildegenerering feilet", { postId, channel: post.channel });
          return NextResponse.json(
            toAppError("IMAGE_GENERATION_FAILED", "Bildegenerering feilet. Ingen kreditt ble brukt. Prøv igjen."),
            { status: 502 },
          );
        }
        updatedImageUrl = regenerated.imageUrl;
        updatedVideoUrl = regenerated.videoUrl;
        updatedAdditionalImageUrls = regenerated.additionalImageUrls ?? [];
      }
      if (action === "regenerate_text") {
        updatedText = regenerated.text;
        updatedImageUrl = post.imageUrl;
        updatedVideoUrl = post.videoUrl;
        updatedAdditionalImageUrls = post.additionalImageUrls ?? [];
      }
      if (action === "regenerate_all" || action === "rewrite_topic") {
        updatedText = regenerated.text;
        updatedImageUrl = regenerated.imageUrl;
        updatedVideoUrl = regenerated.videoUrl;
        updatedAdditionalImageUrls = regenerated.additionalImageUrls ?? [];
      }

      // TODO: Aktiver igjen etter test
      // await consumeAiEdit(userId, workspaceId);

      if (oldImageUrl && oldImageUrl !== updatedImageUrl) {
        await deleteFilesByUrls([oldImageUrl]).catch(() => {});
      }

      logger.info("[post/patch] AI-redigering fullført", {
        postId, action, channel: post.channel, durationMs: Date.now() - t0,
      });
    }

    if (updatedVideoUrl) {
      updatedAdditionalImageUrls = [];
    } else if (updatedAdditionalImageUrls.length > 0) {
      updatedVideoUrl = undefined;
    }

    const decision = evaluatePolicy({ text: updatedText, imageUrl: updatedImageUrl, companyName });

    await savePost(userId, {
      ...post,
      text: updatedText,
      imageUrl: updatedImageUrl,
      videoUrl: updatedVideoUrl,
      additionalImageUrls: updatedAdditionalImageUrls,
      status: decision.status,
      quality: decision.quality,
    });

    await setPostAdditionalImages(userId, post.id, updatedAdditionalImageUrls);

    if (post.channel === "tiktok" && updatedImageUrl && !updatedVideoUrl && action !== "save") {
      void generateVideoInBackground(userId, post.id, updatedImageUrl, brandContext);
    }

    const refreshedPost = await getPostById(userId, post.id);
    return NextResponse.json(refreshedPost);
  } catch (error) {
    const appError = toUnknownAppError(error);
    const status = appError.code === "AI_EDIT_LIMIT_REACHED" ? 403
      : appError.code === "SUBSCRIPTION_REQUIRED" ? 402
      : 400;
    return NextResponse.json(appError, { status });
  }
}
