import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RunPublishWorkerInput = {
  userId?: string;
  limit?: number;
};

type PublishInput = {
  channel: "facebook" | "instagram" | "linkedin" | "tiktok";
  accountId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  text: string;
  imageUrl: string | null;
  additionalImageUrls: string[];
  videoUrl: string | null;
  idempotencyKey: string;
  userId: string;
};

const MAX_ATTEMPTS = 3;
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const RETRY_DELAYS_MS = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];
const EXPIRE_AFTER_MS = 48 * 60 * 60 * 1000;

const ensureJson = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; type?: string; code?: number };
  };
  if (!response.ok) {
    const message =
      payload?.error?.message ??
      `Kanal-API svarte med HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
};

const publishFacebook = async (input: PublishInput): Promise<string> => {
  if (!input.accountId) {
    throw new Error("Mangler Facebook accountId.");
  }
  const apiVersion = process.env.FACEBOOK_GRAPH_API_VERSION ?? "v23.0";
  const endpoint = input.videoUrl
    ? `https://graph.facebook.com/${apiVersion}/${input.accountId}/videos`
    : input.imageUrl
      ? `https://graph.facebook.com/${apiVersion}/${input.accountId}/photos`
      : `https://graph.facebook.com/${apiVersion}/${input.accountId}/feed`;
  const form = new URLSearchParams();
  form.set("access_token", input.accessToken ?? "");
  if (input.videoUrl) {
    form.set("description", input.text);
    form.set("file_url", input.videoUrl);
  } else {
    form.set("message", input.text);
  }
  if (input.imageUrl && !input.videoUrl) {
    form.set("url", input.imageUrl);
    form.set("published", "true");
    form.set("caption", input.text);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const payload = await ensureJson<{ id?: string; post_id?: string }>(response);
  return payload.post_id ?? payload.id ?? `facebook_${input.idempotencyKey}`;
};

const publishInstagram = async (input: PublishInput): Promise<string> => {
  if (!input.accountId) {
    throw new Error("Mangler Instagram accountId.");
  }
  const imageUrls = [input.imageUrl, ...input.additionalImageUrls]
    .filter((value): value is string => Boolean(value));
  if (imageUrls.length === 0 && !input.videoUrl) {
    throw new Error("Instagram krever bilde eller video for publisering.");
  }
  const apiVersion = process.env.FACEBOOK_GRAPH_API_VERSION ?? "v23.0";

  if (!input.videoUrl && imageUrls.length > 1) {
    const carouselIds: string[] = [];
    for (const imageUrl of imageUrls) {
      const itemForm = new URLSearchParams();
      itemForm.set("access_token", input.accessToken ?? "");
      itemForm.set("image_url", imageUrl);
      itemForm.set("is_carousel_item", "true");
      const itemResponse = await fetch(
        `https://graph.facebook.com/${apiVersion}/${input.accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: itemForm.toString(),
        },
      );
      const itemPayload = await ensureJson<{ id?: string }>(itemResponse);
      if (!itemPayload.id) {
        throw new Error("Instagram karusell-element ble ikke opprettet.");
      }
      carouselIds.push(itemPayload.id);
    }

    const parentForm = new URLSearchParams();
    parentForm.set("access_token", input.accessToken ?? "");
    parentForm.set("media_type", "CAROUSEL");
    parentForm.set("children", carouselIds.join(","));
    parentForm.set("caption", input.text);
    const parentResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${input.accountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: parentForm.toString(),
      },
    );
    const parentPayload = await ensureJson<{ id?: string }>(parentResponse);
    if (!parentPayload.id) {
      throw new Error("Instagram karusell-container ble ikke opprettet.");
    }

    const publishForm = new URLSearchParams();
    publishForm.set("access_token", input.accessToken ?? "");
    publishForm.set("creation_id", parentPayload.id);
    const publishResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${input.accountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: publishForm.toString(),
      },
    );
    const publishPayload = await ensureJson<{ id?: string }>(publishResponse);
    return publishPayload.id ?? `instagram_${input.idempotencyKey}`;
  }

  const createForm = new URLSearchParams();
  createForm.set("access_token", input.accessToken ?? "");
  if (input.videoUrl) {
    createForm.set("video_url", input.videoUrl);
    createForm.set("media_type", "REELS");
  } else if (imageUrls[0]) {
    createForm.set("image_url", imageUrls[0]);
  }
  createForm.set("caption", input.text);
  const createResponse = await fetch(
    `https://graph.facebook.com/${apiVersion}/${input.accountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createForm.toString(),
    },
  );
  const createPayload = await ensureJson<{ id?: string }>(createResponse);
  if (!createPayload.id) {
    throw new Error("Instagram media container ble ikke opprettet.");
  }

  const publishForm = new URLSearchParams();
  publishForm.set("access_token", input.accessToken ?? "");
  publishForm.set("creation_id", createPayload.id);
  const publishResponse = await fetch(
    `https://graph.facebook.com/${apiVersion}/${input.accountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishForm.toString(),
    },
  );
  const publishPayload = await ensureJson<{ id?: string }>(publishResponse);
  return publishPayload.id ?? `instagram_${input.idempotencyKey}`;
};

const publishLinkedIn = async (input: PublishInput): Promise<string> => {
  if (!input.accountId) {
    throw new Error("Mangler LinkedIn accountId.");
  }
  if (input.videoUrl) {
    throw new Error("LinkedIn video er ikke aktivert ennå i publiseringsmotoren.");
  }
  const author = input.accountId.startsWith("urn:li:")
    ? input.accountId
    : `urn:li:organization:${input.accountId}`;
  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken ?? ""}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: input.text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });
  const payload = await ensureJson<{ id?: string }>(response);
  const restliId = response.headers.get("x-restli-id");
  return payload.id ?? restliId ?? `linkedin_${input.idempotencyKey}`;
};

const refreshTikTokToken = async (
  refreshToken: string,
  userId: string,
  accountId: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error("TIKTOK_CLIENT_KEY eller TIKTOK_CLIENT_SECRET mangler.");
  }

  const body = new URLSearchParams();
  body.set("client_key", clientKey);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error ?? "Kunne ikke fornye TikTok-token.");
  }

  const expiresAt = new Date(Date.now() + (payload.expires_in ?? 86400) * 1000).toISOString();
  const newRefreshToken = payload.refresh_token ?? refreshToken;

  const admin = createSupabaseAdminClient();
  await admin
    .from("social_accounts")
    .update({
      access_token: payload.access_token,
      refresh_token: newRefreshToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("channel", "tiktok")
    .eq("account_id", accountId);

  return {
    accessToken: payload.access_token,
    refreshToken: newRefreshToken,
    expiresAt,
  };
};

const ensureTikTokToken = async (input: PublishInput): Promise<string> => {
  if (!input.accessToken) {
    throw new Error("Mangler TikTok tilgangstoken.");
  }

  const tokenExpired = input.tokenExpiresAt
    && new Date(input.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000;

  if (tokenExpired && input.refreshToken && input.accountId) {
    const refreshed = await refreshTikTokToken(
      input.refreshToken,
      input.userId,
      input.accountId,
    );
    return refreshed.accessToken;
  }

  return input.accessToken;
};

type TikTokCreatorInfo = {
  privacyLevel: string;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDuration: number;
};

const queryTikTokCreatorInfo = async (accessToken: string): Promise<TikTokCreatorInfo> => {
  const response = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: {
      privacy_level_options?: string[];
      comment_disabled?: boolean;
      duet_disabled?: boolean;
      stitch_disabled?: boolean;
      max_video_post_duration_sec?: number;
    };
    error?: { code?: string; message?: string };
  };

  if (!response.ok || payload.error?.code !== "ok") {
    const errMsg = payload.error?.message ?? `TikTok creator_info feilet: HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  const options = payload.data?.privacy_level_options ?? [];
  const privacyLevel = options.includes("PUBLIC_TO_EVERYONE")
    ? "PUBLIC_TO_EVERYONE"
    : options.includes("FOLLOWER_OF_CREATOR")
      ? "FOLLOWER_OF_CREATOR"
      : options.includes("MUTUAL_FOLLOW_FRIENDS")
        ? "MUTUAL_FOLLOW_FRIENDS"
        : "SELF_ONLY";

  logger.info("[queryTikTokCreatorInfo]", { privacyLevel, options });

  return {
    privacyLevel,
    commentDisabled: payload.data?.comment_disabled ?? false,
    duetDisabled: payload.data?.duet_disabled ?? false,
    stitchDisabled: payload.data?.stitch_disabled ?? false,
    maxVideoDuration: payload.data?.max_video_post_duration_sec ?? 300,
  };
};

const publishTikTokVideo = async (input: PublishInput, accessToken: string, creator: TikTokCreatorInfo): Promise<string> => {
  if (!input.videoUrl) {
    throw new Error("Mangler video-URL for TikTok video-publisering.");
  }

  const videoResponse = await fetch(input.videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Kunne ikke laste ned video: HTTP ${videoResponse.status}`);
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  const videoSize = videoBuffer.byteLength;

  logger.info("[publishTikTokVideo] FILE_UPLOAD init", { videoSize, privacy: creator.privacyLevel });

  const initResponse = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: input.text.slice(0, 2200),
        privacy_level: creator.privacyLevel,
        disable_duet: creator.duetDisabled,
        disable_stitch: creator.stitchDisabled,
        disable_comment: creator.commentDisabled,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
  });

  const initPayload = (await initResponse.json().catch(() => ({}))) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  };

  if (!initResponse.ok || initPayload.error?.code !== "ok") {
    const errMsg = initPayload.error?.message ?? `TikTok video init svarte med HTTP ${initResponse.status}`;
    throw new Error(errMsg);
  }

  const uploadUrl = initPayload.data?.upload_url;
  if (!uploadUrl) {
    throw new Error("TikTok returnerte ingen upload_url for video.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      "Content-Length": String(videoSize),
      "Content-Type": "video/mp4",
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    const uploadBody = await uploadResponse.text().catch(() => "");
    throw new Error(`TikTok video-opplasting feilet: HTTP ${uploadResponse.status} ${uploadBody}`);
  }

  logger.info("[publishTikTokVideo] Upload OK", { publishId: initPayload.data?.publish_id });
  return initPayload.data?.publish_id ?? `tiktok_video_${input.idempotencyKey}`;
};

const toProxyUrl = (originalUrl: string): string => {
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl) return originalUrl;
  return `${appUrl.replace(/\/+$/, "")}/api/media/proxy?url=${encodeURIComponent(originalUrl)}`;
};

const publishTikTokPhoto = async (input: PublishInput, accessToken: string, creator: TikTokCreatorInfo): Promise<string> => {
  const imageUrls = [input.imageUrl, ...input.additionalImageUrls]
    .filter((url): url is string => Boolean(url));

  if (imageUrls.length === 0) {
    throw new Error("TikTok krever minst ett bilde for foto-publisering.");
  }

  const proxiedUrls = imageUrls.map(toProxyUrl).slice(0, 35);
  logger.info("[publishTikTokPhoto] PULL_FROM_URL via proxy", { count: proxiedUrls.length, privacy: creator.privacyLevel });

  const initResponse = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: input.text.slice(0, 2200),
        privacy_level: creator.privacyLevel,
        disable_comment: creator.commentDisabled,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: proxiedUrls,
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
  });

  const initPayload = (await initResponse.json().catch(() => ({}))) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string; log_id?: string };
  };

  if (!initResponse.ok || initPayload.error?.code !== "ok") {
    const errMsg = initPayload.error?.message ?? `TikTok foto API svarte med HTTP ${initResponse.status}`;
    logger.warn("TikTok foto-publisering feilet", {
      status: initResponse.status,
      error: initPayload.error,
      userId: input.userId,
    });
    throw new Error(errMsg);
  }

  return initPayload.data?.publish_id ?? `tiktok_photo_${input.idempotencyKey}`;
};

const publishTikTok = async (input: PublishInput): Promise<string> => {
  const accessToken = await ensureTikTokToken(input);
  const creator = await queryTikTokCreatorInfo(accessToken);

  if (input.videoUrl) {
    return publishTikTokVideo(input, accessToken, creator);
  }

  return publishTikTokPhoto(input, accessToken, creator);
};

const publishToChannel = async (input: PublishInput): Promise<string> => {
  if (!input.accessToken || input.accessToken.startsWith("pending-")) {
    throw new Error(`Mangler gyldig tilgangstoken for ${input.channel}`);
  }

  if (input.channel === "facebook") {
    return publishFacebook(input);
  }
  if (input.channel === "instagram") {
    return publishInstagram(input);
  }
  if (input.channel === "tiktok") {
    return publishTikTok(input);
  }
  return publishLinkedIn(input);
};

export const runPublishWorker = async (input: RunPublishWorkerInput = {}): Promise<{
  processed: number;
  published: number;
  failed: number;
}> => {
  const admin = createSupabaseAdminClient();
  const limit = input.limit ?? 25;
  let processed = 0;
  let published = 0;
  let failed = 0;

  const now = new Date();
  const staleCutoff = new Date(now.getTime() - PROCESSING_STALE_MS).toISOString();
  const recoverQuery = admin
    .from("publish_jobs")
    .update({
      status: "retrying",
      run_at: now.toISOString(),
      last_error: "Forrige publiseringsforsøk ble avbrutt. Nytt forsøk planlagt.",
      updated_at: now.toISOString(),
    })
    .eq("status", "processing")
    .lte("updated_at", staleCutoff);

  if (input.userId) {
    await recoverQuery.eq("user_id", input.userId);
  } else {
    await recoverQuery;
  }

  let query = admin
    .from("publish_jobs")
    .select("id, post_id, user_id, channel, attempts, status, run_at")
    .lte("run_at", new Date().toISOString())
    .in("status", ["queued", "retrying"])
    .order("run_at", { ascending: true })
    .limit(limit);

  if (input.userId) {
    query = query.eq("user_id", input.userId);
  }

  const { data: jobs, error: jobsError } = await query;
  if (jobsError) {
    throw new Error(jobsError.message);
  }

  for (const job of jobs ?? []) {
    const claimAttempt = (job.attempts ?? 0) + 1;
    const claimed = await admin
      .from("publish_jobs")
      .update({
        status: "processing",
        attempts: claimAttempt,
        processing_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .in("status", ["queued", "retrying"])
      .eq("attempts", job.attempts ?? 0)
      .select("id, post_id, user_id, channel, attempts")
      .maybeSingle();

    if (!claimed.data) {
      continue;
    }

    const runAtMs = job.run_at ? new Date(job.run_at as string).getTime() : 0;
    if (runAtMs > 0 && now.getTime() - runAtMs > EXPIRE_AFTER_MS) {
      logger.warn(`[publishWorker] Jobb ${job.id} er ${Math.round((now.getTime() - runAtMs) / 3600000)}t forsinket — markert som expired`);
      await admin
        .from("publish_jobs")
        .update({
          status: "failed",
          last_error: "Posten har passert publiseringsvinduet (>48 timer forsinket).",
          updated_at: now.toISOString(),
        })
        .eq("id", job.id);
      await admin
        .from("posts")
        .update({ status: "failed", updated_at: now.toISOString() })
        .eq("id", job.post_id);
      processed += 1;
      failed += 1;
      continue;
    }

    processed += 1;
    try {
      const [{ data: post }, { data: social }, { data: mediaRows }] = await Promise.all([
        admin
          .from("posts")
          .select("id, text_content, image_url, video_url")
          .eq("id", job.post_id)
          .eq("user_id", job.user_id)
          .single(),
        admin
          .from("social_accounts")
          .select("account_id, access_token, refresh_token, token_expires_at")
          .eq("user_id", job.user_id)
          .eq("channel", job.channel)
          .limit(1)
          .maybeSingle(),
        admin
          .from("post_media_assets")
          .select("file_url, sort_order")
          .eq("post_id", job.post_id)
          .order("sort_order", { ascending: true }),
      ]);

      if (!post) {
        throw new Error("Fant ikke post for publish job");
      }

      const externalPostId = await publishToChannel({
        channel: job.channel as "facebook" | "instagram" | "linkedin" | "tiktok",
        accountId: social?.account_id ?? null,
        accessToken: social?.access_token ?? null,
        refreshToken: social?.refresh_token ?? null,
        tokenExpiresAt: social?.token_expires_at ?? null,
        text: post.text_content,
        imageUrl: post.image_url,
        additionalImageUrls: (mediaRows ?? []).map((row) => row.file_url).filter((url) => Boolean(url)),
        videoUrl: post.video_url,
        idempotencyKey: job.id,
        userId: job.user_id,
      });

      await admin
        .from("publish_jobs")
        .update({
          status: "completed",
          attempts: claimAttempt,
          external_post_id: externalPostId,
          processing_started_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      await admin
        .from("posts")
        .update({
          status: "published",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.post_id)
        .eq("user_id", job.user_id);

      published += 1;
      logger.info("Published post", { jobId: job.id, postId: job.post_id, externalPostId });
    } catch (error) {
      const exhausted = claimAttempt >= MAX_ATTEMPTS;
      const retryDelay = RETRY_DELAYS_MS[Math.min(claimAttempt - 1, RETRY_DELAYS_MS.length - 1)];
      const errorMessage = error instanceof Error ? error.message : "Ukjent feil";

      await admin
        .from("publish_jobs")
        .update({
          status: exhausted ? "failed" : "retrying",
          attempts: claimAttempt,
          last_error: errorMessage,
          processing_started_at: null,
          run_at: exhausted
            ? new Date().toISOString()
            : new Date(Date.now() + retryDelay).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (exhausted) {
        await admin
          .from("posts")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.post_id)
          .eq("user_id", job.user_id);
      }

      failed += 1;
      logger.error("Failed to publish post", {
        jobId: job.id,
        postId: job.post_id,
        attempt: claimAttempt,
        exhausted,
        error: errorMessage,
      });
    }
  }

  return { processed, published, failed };
};
