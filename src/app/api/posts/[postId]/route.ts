import { NextResponse } from "next/server";
import { z } from "zod";

import { fallbackAngle } from "@/lib/ai/generatePlan";
import { appVersion, creditRecordsFromText, generatePost, replaceCreditLine } from "@/lib/ai/generatePost";
import { assignPostStrategy, pinnedFromMeta } from "@/lib/ai/postStrategy";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { deleteFilesByUrls } from "@/lib/cloudflare/r2";
import { requireWorkspaceId } from "@/lib/workspace";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { loadProfilesSafely, profilePromptLines } from "@/lib/metrics/learning";
import { getPostById, savePost, setPostAdditionalImages, updatePostRow } from "@/lib/posts/repository";
import { timeZoneForCountry } from "@/lib/schedule/audienceTime";
import { requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GenerationMeta, GenerationStep, TopicWindow, VideoStatus } from "@/lib/types";
import type { CreditOwner } from "@/lib/videoCredits";
import {
  getReelBudget,
  queueReelRender,
  reelColumns,
  reelsAllowedFor,
  startReelRender,
  type ReelBudget,
} from "@/lib/video/renderReel";

const REGENERATE_TIMEOUT_MS = 180_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(toAppError(
      "GENERATION_TIMEOUT",
      `Genereringen brukte mer enn ${ms / 1000} sekunder og ble avbrutt. Prøv igjen.`,
      { label, version: appVersion() },
    )), ms);
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
    .enum([
      "save",
      "regenerate_all",
      "regenerate_text",
      "regenerate_image",
      "rewrite_topic",
      "reschedule",
      "unlock",
      "reject_and_regenerate",
      "more_like_this",
      "regenerate_video",
    ])
    .optional(),
  sourcePostId: z.string().uuid().optional(),
  regenerate: z.boolean().optional(),
});

type SourcePost = { meta: GenerationMeta; channel: string };

const getSourcePost = async (userId: string, sourcePostId: string): Promise<SourcePost | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("posts")
    .select("channel, generation_meta")
    .eq("id", sourcePostId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.generation_meta || typeof data.generation_meta !== "object") return null;
  return { meta: data.generation_meta as GenerationMeta, channel: data.channel as string };
};

const moreLikeThisNote = (meta: GenerationMeta): string =>
  meta.coverTitle
    ? `Lag en ny post i samme form og tone som «${meta.coverTitle}», som fikk godt engasjement. Ny vinkel og ny tittel, ikke kopier.`
    : "Lag en ny post i samme form og tone som et innlegg som fikk godt engasjement. Ny vinkel og ny tittel.";

// A pending render of this same post is replaced, so its reserved credit is available again.
const reelBudgetFor = async (owner: CreditOwner, videoStatus: VideoStatus | undefined): Promise<ReelBudget> => {
  const budget = await getReelBudget(owner);
  return { remaining: budget.remaining + (videoStatus === "pending" ? 1 : 0) };
};

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
    const brandContext = await getBrandContext(userId, workspaceId);
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
    let updatedImageCredit = post.imageCredit;
    let updatedAdditionalImageCredits = post.additionalImageCredits ?? [];
    let generationTrace: GenerationStep[] = [];
    let generationMeta: GenerationMeta | undefined;
    let reelUpdate: ReturnType<typeof reelColumns> | undefined;
    const fallbackTopic = brandContext?.companyDescription?.slice(0, 180)
      ?? fallbackAngle(brandContext);
    const action = payload.action ?? (payload.regenerate ? "regenerate_all" : "save");
    const shouldUnlockFirst =
      (action === "unlock" || action === "reject_and_regenerate") &&
      (post.status === "approved" || post.status === "scheduled");

    if (action === "unlock" || action === "reject_and_regenerate") {
      if (post.status === "published") {
        return NextResponse.json(
          toAppError("POST_LOCKED", "Publiserte poster kan ikke låses opp."),
          { status: 400 },
        );
      }
    }

    if (shouldUnlockFirst) {
      const supabase = await createSupabaseServerClient();
      const { error: queueDeleteError } = await supabase
        .from("publish_jobs")
        .delete()
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .eq("post_id", postId)
        .in("status", ["queued", "retrying", "processing"]);

      if (queueDeleteError) {
        return NextResponse.json(
          toAppError(
            "PUBLISH_QUEUE_CANCEL_FAILED",
            "Kunne ikke avbryte publiseringskø for posten.",
            queueDeleteError.message,
          ),
          { status: 500 },
        );
      }
    }

    if (action === "unlock") {
      await savePost(userId, {
        ...post,
        status: "draft",
      });
      const refreshedPost = await getPostById(userId, post.id);
      return NextResponse.json(refreshedPost);
    }

    if (action === "regenerate_video") {
      if (post.status === "published") {
        return NextResponse.json(
          toAppError("POST_LOCKED", "Publiserte poster kan ikke få ny video."),
          { status: 400 },
        );
      }
      await requireActiveSubscription(userId, workspaceId);
      if ((await reelBudgetFor({ userId, workspaceId }, post.videoStatus)).remaining <= 0) {
        return NextResponse.json(
          toAppError("VIDEO_CREDITS_EXHAUSTED", "Du har ingen videokreditter igjen. Kjøp flere i kalenderen for å lage reels."),
          { status: 402 },
        );
      }
      const queued = await queueReelRender(await createSupabaseServerClient(), { id: post.id, userId });
      if (!queued) {
        return NextResponse.json(
          toAppError("REEL_SOURCE_MISSING", "Posten er ikke en reel, eller mangler foto å lage video av."),
          { status: 400 },
        );
      }
      startReelRender(post.id);
      return NextResponse.json(await getPostById(userId, post.id));
    }

    const regenAction = action === "reject_and_regenerate" || action === "more_like_this" ? "regenerate_all" : action;

    let source: SourcePost | null = null;
    if (action === "more_like_this") {
      source = payload.sourcePostId ? await getSourcePost(userId, payload.sourcePostId) : null;
      if (!source) {
        return NextResponse.json(
          toAppError("SOURCE_POST_MISSING", "Fant ikke forbildet, eller det mangler genereringsdata."),
          { status: 400 },
        );
      }
      if (source.channel !== post.channel) {
        return NextResponse.json(
          toAppError("CHANNEL_MISMATCH", "Forbildet må være fra samme kanal som posten som skal lages på nytt."),
          { status: 400 },
        );
      }
    }

    const isApprovalLocked = post.status === "approved" || post.status === "scheduled";
    if (isApprovalLocked && regenAction !== "reschedule" && action !== "reject_and_regenerate") {
      return NextResponse.json(
        toAppError(
          "POST_APPROVAL_LOCKED",
          "Posten er godkjent/planlagt. Avbryt publisering først for å redigere eller generere nytt innhold.",
        ),
        { status: 409 },
      );
    }

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

    if (regenAction !== "save") {
      const t0 = Date.now();
      logger.info("[post/patch] Start AI-redigering", {
        postId, action, regenAction, channel: post.channel, userId,
      });

      await requireActiveSubscription(userId, workspaceId);

      const oldImageUrl = post.imageUrl;
      const topicFromPlan = await getTopicFromPlan(userId, postId);
      const mediaModeFromPlan = await getMediaModeFromPlan(userId, postId);
      const effectiveMediaMode = mediaModeFromPlan ?? "ai_only";
      const topic = regenAction === "rewrite_topic"
        ? payload.topic ?? topicFromPlan ?? fallbackTopic
        : topicFromPlan ?? fallbackTopic;
      const mediaMode = effectiveMediaMode === "owned_only" ? "owned_only" : "ai_only";
      const imageProfile = regenAction === "regenerate_image" ? "final" : "preview";
      const scheduled = new Date(post.scheduledAt);
      const profiles = await loadProfilesSafely(
        await createSupabaseServerClient(),
        { userId, workspaceId },
        [post.channel],
        timeZoneForCountry("NO"),
      );
      const profile = profiles.get(post.channel);
      const strategy = assignPostStrategy({
        weekIndex: 0,
        dayIndex: 0,
        channel: post.channel,
        feedIndex: action === "reject_and_regenerate"
          ? Date.now() % 20
          : scheduled.getUTCDate() + scheduled.getUTCMonth() * 3,
        hasCustomerStories: (brandContext?.customerSuccessStories?.length ?? 0) > 0,
        pinned: source ? pinnedFromMeta(source.meta) : undefined,
        reelsAllowed: reelsAllowedFor(mediaMode, await reelBudgetFor({ userId, workspaceId }, post.videoStatus)),
      }, profile);
      const performanceNotes = [
        ...(source ? [moreLikeThisNote(source.meta)] : []),
        ...profilePromptLines(profile),
      ];

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
          intent: strategy.intent,
          format: strategy.format,
          ctaType: strategy.ctaType,
          imageDirection: strategy.imageDirection,
          contentPillar: strategy.contentPillar,
          visualMotif: strategy.visualMotif,
          reelScript: strategy.reelScript,
          mediaFormat: strategy.mediaFormat,
          includeWebsiteLink: strategy.includeWebsiteLink,
          feedIndex: strategy.feedIndex,
          avoidRepeating: source?.meta.coverTitle ? [source.meta.coverTitle] : undefined,
          performanceNotes,
          textOnlyForImageUrl: regenAction === "regenerate_text" ? post.imageUrl ?? "" : undefined,
        }),
        REGENERATE_TIMEOUT_MS,
        `${regenAction}/${post.channel}`,
      );

      generationTrace = regenerated.generationTrace ?? [];
      generationMeta = regenerated.generationMeta;
      logger.info("[post/patch] generatePost ferdig", {
        postId, action, channel: post.channel,
        hasText: Boolean(regenerated.text),
        hasImage: Boolean(regenerated.imageUrl),
        hasVideo: Boolean(regenerated.videoUrl),
        durationMs: Date.now() - t0,
      });

      const needsNewImage = regenAction === "regenerate_image"
        || ((regenAction === "regenerate_all" || regenAction === "rewrite_topic") && post.channel !== "tiktok");
      if (needsNewImage && !regenerated.imageUrl) {
        const reasons = generationTrace
          .filter((item) => !item.ok)
          .map((item) => `${item.step}: ${item.detail ?? "feilet"}`);
        logger.warn("[post/patch] Bildegenerering feilet", { postId, channel: post.channel, reasons });
        return NextResponse.json(
          toAppError(
            "IMAGE_GENERATION_FAILED",
            `Nye bilder kunne ikke lages, så innlegget er ikke endret. Årsak: ${reasons.join(" | ") || "ukjent"}`,
            { version: appVersion(), steps: generationTrace },
          ),
          { status: 502 },
        );
      }

      if (regenAction === "regenerate_image" || regenAction === "regenerate_all" || regenAction === "rewrite_topic") {
        reelUpdate = reelColumns(regenerated);
      }
      if (regenAction === "regenerate_text" && generationMeta) {
        generationMeta = { ...generationMeta, mediaFormat: post.videoUrl || post.videoStatus ? "reel" : "image" };
      }

      if (regenAction === "regenerate_image") {
        updatedImageUrl = regenerated.imageUrl;
        updatedVideoUrl = regenerated.videoUrl;
        updatedAdditionalImageUrls = regenerated.additionalImageUrls ?? [];
        updatedImageCredit = regenerated.imageCredit;
        updatedAdditionalImageCredits = regenerated.additionalImageCredits ?? [];
        updatedText = replaceCreditLine(post.text, [updatedImageCredit, ...updatedAdditionalImageCredits]);
      }
      const storedCredits = [post.imageCredit, ...(post.additionalImageCredits ?? [])];
      const keptCredits = storedCredits.some((credit) => credit?.trim())
        ? storedCredits
        : creditRecordsFromText(post.text);
      if (regenAction === "regenerate_text") {
        updatedText = replaceCreditLine(regenerated.text, keptCredits);
        updatedImageUrl = post.imageUrl;
        updatedVideoUrl = post.videoUrl;
        updatedAdditionalImageUrls = post.additionalImageUrls ?? [];
      }
      if (regenAction === "regenerate_all" || regenAction === "rewrite_topic") {
        updatedText = regenerated.text;
        updatedImageUrl = regenerated.imageUrl;
        updatedVideoUrl = regenerated.videoUrl;
        updatedAdditionalImageUrls = regenerated.additionalImageUrls ?? [];
        updatedImageCredit = regenerated.imageCredit;
        updatedAdditionalImageCredits = regenerated.additionalImageCredits ?? [];
      }

      if (oldImageUrl && oldImageUrl !== updatedImageUrl) {
        await deleteFilesByUrls([oldImageUrl]).catch(() => {});
      }

      logger.info("[post/patch] AI-redigering fullført", {
        postId, action, channel: post.channel, durationMs: Date.now() - t0,
      });
    }

    if (updatedVideoUrl) {
      updatedAdditionalImageUrls = [];
      updatedAdditionalImageCredits = [];
    } else if (updatedAdditionalImageUrls.length > 0) {
      updatedVideoUrl = undefined;
    }

    const decision = evaluatePolicy({ text: updatedText, imageUrl: updatedImageUrl, companyName });

    await savePost(userId, {
      ...post,
      text: updatedText,
      imageUrl: updatedImageUrl,
      videoUrl: updatedVideoUrl,
      imageCredit: updatedImageCredit,
      additionalImageUrls: updatedAdditionalImageUrls,
      additionalImageCredits: updatedAdditionalImageCredits,
      status: decision.status,
      quality: decision.quality,
    });

    await setPostAdditionalImages(userId, post.id, updatedAdditionalImageUrls, updatedAdditionalImageCredits);

    if (generationMeta || reelUpdate) {
      const metaError = await updatePostRow(await createSupabaseServerClient(), { id: post.id, userId }, {
        ...(generationMeta ? { generation_meta: generationMeta } : {}),
        ...reelUpdate,
      });
      if (metaError) logger.warn("[post/patch] Kunne ikke lagre generation_meta/reel", { postId: post.id, error: metaError });
      else if (reelUpdate?.reel_source_url) startReelRender(post.id);
    }

    const refreshedPost = await getPostById(userId, post.id);
    return NextResponse.json(
      generationTrace.length > 0 ? { ...refreshedPost, generationTrace, version: appVersion() } : refreshedPost,
    );
  } catch (error) {
    const appError = toUnknownAppError(error);
    const status = appError.code === "AI_EDIT_LIMIT_REACHED" ? 403
      : appError.code === "SUBSCRIPTION_REQUIRED" ? 402
      : appError.code === "GENERATION_TIMEOUT" ? 504
      : appError.code === "INTERNAL_ERROR" ? 500
      : 400;
    logger.error("[post/patch] Feilet", {
      postId: (await context.params).postId,
      code: appError.code,
      message: appError.message,
      details: appError.details,
      status,
    });
    return NextResponse.json(appError, { status });
  }
}
