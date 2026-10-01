import type { SupabaseClient } from "@supabase/supabase-js";

import { generateKlingVideo, isFalAvailable, mergeAudioVideo } from "@/lib/ai/falClient";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GenerationMeta, MediaMode, PostDraft, VideoStatus } from "@/lib/types";
import { chooseMood, getMusicTrackUrl } from "@/lib/video/musicLibrary";

export const REEL_DURATION_SECONDS = 10;
const MAX_PARALLEL_RENDERS = 2;

type ReelPostRow = {
  id: string;
  user_id: string;
  status: string;
  reel_source_url: string | null;
  video_status: VideoStatus | null;
  generation_meta: GenerationMeta | null;
};

export type ReelRenderResult = { status: VideoStatus | "skipped"; videoUrl?: string; reason?: string };

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const reelsAllowedFor = (mediaMode: MediaMode): boolean =>
  isFalAvailable() && mediaMode !== "owned_only";

export const reelColumns = (post: Pick<PostDraft, "reelSourceUrl">) => ({
  reel_source_url: post.reelSourceUrl ?? null,
  video_status: post.reelSourceUrl ? "pending" as const : null,
});

export const buildReelMotionPrompt = (meta: GenerationMeta | null): string => {
  const subject = [meta?.coverTitle, meta?.topic].filter(Boolean).join(" – ");
  return [
    subject ? `Cinematic travel-style footage based on this photo: ${subject}.` : "Cinematic footage based on this photo.",
    "Slow, smooth camera push-in with gentle parallax and natural movement in water, clouds, leaves or people.",
    "Keep the scene and composition faithful to the photo. Warm natural light, steady motion.",
    "No text, no captions, no logos, no watermarks.",
  ].join(" ");
};

// Matching on reel_source_url keeps a slow render from overwriting a post that was regenerated meanwhile,
// and skipping published posts keeps statistics honest when the image version already went out.
const setVideoState = async (
  supabase: SupabaseClient,
  post: ReelPostRow,
  values: { video_status: VideoStatus; video_url?: string },
): Promise<void> => {
  const { error } = await supabase
    .from("posts")
    .update(values)
    .eq("id", post.id)
    .eq("reel_source_url", post.reel_source_url ?? "")
    .neq("status", "published");
  if (error) throw new Error(`Kunne ikke lagre videostatus: ${error.message}`);
};

const addMusic = async (videoUrl: string, meta: GenerationMeta | null, postId: string): Promise<string> => {
  try {
    const mood = chooseMood([meta?.topic, meta?.coverTitle, meta?.motif].filter(Boolean).join(" "));
    const trackUrl = await getMusicTrackUrl(mood, postId);
    return await mergeAudioVideo(videoUrl, trackUrl);
  } catch (error) {
    logger.warn("Musikk kunne ikke legges på reel, bruker video uten lyd", { postId, error: errorText(error) });
    return videoUrl;
  }
};

const storeVideo = async (userId: string, sourceUrl: string): Promise<string> => {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Kunne ikke hente ferdig video (${response.status}).`);
  const uploaded = await uploadUserFile({
    userId,
    fileName: `reel-${crypto.randomUUID()}.mp4`,
    contentType: "video/mp4",
    mediaKind: "video",
    body: new Uint8Array(await response.arrayBuffer()),
  });
  return uploaded.publicUrl;
};

export const renderReelForPost = async (supabase: SupabaseClient, postId: string): Promise<ReelRenderResult> => {
  const { data, error } = await supabase
    .from("posts")
    .select("id, user_id, status, reel_source_url, video_status, generation_meta")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(`Kunne ikke hente post for reel: ${error.message}`);

  const post = data as ReelPostRow | null;
  if (!post?.reel_source_url) return { status: "skipped", reason: "ingen reel-kilde" };
  if (post.status === "published") return { status: "skipped", reason: "allerede publisert" };

  const t0 = Date.now();
  try {
    if (!isFalAvailable()) throw new Error("FAL_KEY mangler, kan ikke lage video.");
    const clip = await generateKlingVideo({
      prompt: buildReelMotionPrompt(post.generation_meta),
      imageUrl: post.reel_source_url,
      duration: REEL_DURATION_SECONDS,
      aspectRatio: "9:16",
      generateAudio: false,
    });
    if (!clip?.url) throw new Error("Videogeneratoren returnerte ingen video.");

    const withMusic = await addMusic(clip.url, post.generation_meta, postId);
    const videoUrl = await storeVideo(post.user_id, withMusic);
    await setVideoState(supabase, post, { video_status: "ready", video_url: videoUrl });
    logger.info("Reel ferdig", { postId, withMusic: withMusic !== clip.url, durationMs: Date.now() - t0 });
    return { status: "ready", videoUrl };
  } catch (renderError) {
    logger.warn("Reel feilet, posten publiseres som bilde", { postId, error: errorText(renderError) });
    await setVideoState(supabase, post, { video_status: "failed" }).catch((stateError: unknown) => {
      logger.error("Kunne ikke markere reel som feilet", { postId, error: errorText(stateError) });
    });
    return { status: "failed", reason: errorText(renderError) };
  }
};

export const queueReelRender = async (
  supabase: SupabaseClient,
  filter: { id: string; userId: string },
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("posts")
    .update({ video_status: "pending", video_url: null })
    .eq("id", filter.id)
    .eq("user_id", filter.userId)
    .not("reel_source_url", "is", null)
    .select("id");
  if (error) throw new Error(`Kunne ikke starte ny video: ${error.message}`);
  return (data ?? []).length > 0;
};

let activeRenders = 0;
const waitingRenders: Array<() => void> = [];

const acquireSlot = async (): Promise<void> => {
  if (activeRenders < MAX_PARALLEL_RENDERS) {
    activeRenders += 1;
    return;
  }
  await new Promise<void>((resolve) => waitingRenders.push(resolve));
};

const releaseSlot = (): void => {
  const next = waitingRenders.shift();
  if (next) next();
  else activeRenders -= 1;
};

export const startReelRender = (postId: string): void => {
  void (async () => {
    await acquireSlot();
    try {
      await renderReelForPost(createSupabaseAdminClient(), postId);
    } catch (error) {
      logger.error("Reel-rendering krasjet", { postId, error: errorText(error) });
    } finally {
      releaseSlot();
    }
  })();
};
