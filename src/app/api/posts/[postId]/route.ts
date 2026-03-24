import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePost } from "@/lib/ai/generatePost";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { requireWorkspaceId } from "@/lib/workspace";
import { deleteFilesByUrls } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { checkAiEditAvailable, consumeAiEdit } from "@/lib/posts/aiEditLimits";
import { getPostById, savePost, setPostAdditionalImages } from "@/lib/posts/repository";
import { requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TopicWindow } from "@/lib/types";

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
      await requireActiveSubscription(userId);
      await checkAiEditAvailable(userId, workspaceId);

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

      const regenerated = await generatePost({
        userId,
        topic,
        channel: post.channel,
        scheduledAt: post.scheduledAt,
        mediaMode,
        imageProfile,
        brandContext,
        skipVideo: true,
      });

      if (action === "regenerate_image") {
        if (!regenerated.imageUrl) {
          return NextResponse.json(
            toAppError("IMAGE_GENERATION_FAILED", "Bildegenerering feilet. Ingen kreditt ble brukt. Prøv igjen."),
            { status: 502 },
          );
        }
        updatedImageUrl = regenerated.imageUrl;
        updatedVideoUrl = regenerated.videoUrl;
        updatedAdditionalImageUrls = [];
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
        updatedAdditionalImageUrls = [];
      }

      await consumeAiEdit(userId, workspaceId);

      if (oldImageUrl && oldImageUrl !== updatedImageUrl) {
        await deleteFilesByUrls([oldImageUrl]).catch(() => {});
      }
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
