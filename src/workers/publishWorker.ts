import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RunPublishWorkerInput = {
  userId?: string;
  limit?: number;
};

type PublishInput = {
  channel: "facebook" | "instagram" | "linkedin";
  accountId: string | null;
  accessToken: string | null;
  text: string;
  imageUrl: string | null;
  idempotencyKey: string;
};

const MAX_ATTEMPTS = 3;
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const RETRY_DELAYS_MS = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];

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
  const endpoint = input.imageUrl
    ? `https://graph.facebook.com/${apiVersion}/${input.accountId}/photos`
    : `https://graph.facebook.com/${apiVersion}/${input.accountId}/feed`;
  const form = new URLSearchParams();
  form.set("access_token", input.accessToken ?? "");
  form.set("message", input.text);
  if (input.imageUrl) {
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
  if (!input.imageUrl) {
    throw new Error("Instagram krever bilde for publisering.");
  }
  const apiVersion = process.env.FACEBOOK_GRAPH_API_VERSION ?? "v23.0";

  const createForm = new URLSearchParams();
  createForm.set("access_token", input.accessToken ?? "");
  createForm.set("image_url", input.imageUrl);
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
    .select("id, post_id, user_id, channel, attempts, status")
    .lte("run_at", new Date().toISOString())
    .in("status", ["queued", "retrying"])
    .order("created_at", { ascending: true })
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

    processed += 1;
    try {
      const [{ data: post }, { data: social }] = await Promise.all([
        admin
          .from("posts")
          .select("id, text_content, image_url")
          .eq("id", job.post_id)
          .eq("user_id", job.user_id)
          .single(),
        admin
          .from("social_accounts")
          .select("account_id, access_token")
          .eq("user_id", job.user_id)
          .eq("channel", job.channel)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!post) {
        throw new Error("Fant ikke post for publish job");
      }

      const externalPostId = await publishToChannel({
        channel: job.channel as "facebook" | "instagram" | "linkedin",
        accountId: social?.account_id ?? null,
        accessToken: social?.access_token ?? null,
        text: post.text_content,
        imageUrl: post.image_url,
        idempotencyKey: job.id,
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
