import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateKlingVideo,
  generateSpeech,
  getMediaDuration,
  isFalAvailable,
  mergeAudioVideo,
  mixVoiceOverMusic,
  normalizeLoudness,
  overlayOnVideo,
} from "@/lib/ai/falClient";
import { deleteFilesByUrls, uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GenerationMeta, MediaFormat, MediaMode, PostDraft, ReelVoice, VideoStatus } from "@/lib/types";
import { chooseMood, getMusicTrackUrl } from "@/lib/video/musicLibrary";
import { consumeVideoCredit, getVideoBalance, type CreditOwner } from "@/lib/videoCredits";

export const REEL_DURATION_SECONDS = 10;
const MAX_PARALLEL_RENDERS = 2;
const REEL_VOICE_IDS: Record<ReelVoice, string> = { female: "Charlotte", male: "George" };
const VOICE_SPEEDS = [1, 1.15];
const VOICE_START_MS = 400;
export const VOICE_MAX_SECONDS = 9.2;
const MUSIC_BED_LUFS = -30;
const VOICE_LUFS = -16;

type ReelPostRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  status: string;
  reel_source_url: string | null;
  video_status: VideoStatus | null;
  generation_meta: GenerationMeta | null;
};

export type ReelRenderResult = { status: VideoStatus | "skipped"; videoUrl?: string; reason?: string };

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const reelsAllowedFor = (mediaMode: MediaMode, budget: ReelBudget): boolean =>
  isFalAvailable() && mediaMode !== "owned_only" && budget.remaining > 0;

export type ReelBudget = { remaining: number };

// Credits not already reserved by reels still being rendered, so a plan never queues more reels than the user paid for.
export const getReelBudget = async (
  owner: CreditOwner,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ReelBudget> => {
  const [{ balance }, pending] = await Promise.all([
    getVideoBalance(owner, supabase),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.userId)
      .eq("workspace_id", owner.workspaceId)
      .eq("video_status", "pending"),
  ]);
  const reserved = pending.error ? 0 : pending.count ?? 0;
  return { remaining: Math.max(0, balance - reserved) };
};

export const reserveReel = (budget: ReelBudget, mediaFormat: MediaFormat): void => {
  if (mediaFormat === "reel") budget.remaining = Math.max(0, budget.remaining - 1);
};

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

type ReelAudio = "voice" | "music" | "none";

const recordVoiceSpeech = async (script: string, voice: ReelVoice): Promise<{ url: string; seconds: number }> => {
  for (const speed of VOICE_SPEEDS) {
    const url = await generateSpeech(script, REEL_VOICE_IDS[voice], speed);
    const seconds = await getMediaDuration(url);
    if (seconds <= VOICE_MAX_SECONDS) return { url, seconds };
  }
  throw new Error(`Talen ble lengre enn ${VOICE_MAX_SECONDS} sekunder.`);
};

const addVoiceover = async (videoUrl: string, trackUrl: string, meta: GenerationMeta): Promise<string> => {
  const speech = await recordVoiceSpeech(meta.voiceScript ?? "", meta.reelVoice ?? "female");
  const [musicBed, voice] = await Promise.all([
    normalizeLoudness(trackUrl, MUSIC_BED_LUFS),
    normalizeLoudness(speech.url, VOICE_LUFS),
  ]);
  return mixVoiceOverMusic({
    videoUrl,
    musicUrl: musicBed,
    voiceUrl: voice,
    videoMs: REEL_DURATION_SECONDS * 1000,
    voiceStartMs: VOICE_START_MS,
    voiceMs: Math.ceil(speech.seconds * 1000),
  });
};

const addAudio = async (
  videoUrl: string,
  meta: GenerationMeta | null,
  postId: string,
): Promise<{ url: string; audio: ReelAudio }> => {
  let trackUrl: string;
  try {
    const mood = chooseMood([meta?.topic, meta?.coverTitle, meta?.motif].filter(Boolean).join(" "));
    trackUrl = await getMusicTrackUrl(mood, postId);
  } catch (error) {
    logger.warn("Musikk kunne ikke hentes til reel, bruker video uten lyd", { postId, error: errorText(error) });
    return { url: videoUrl, audio: "none" };
  }
  if (meta?.voiceScript) {
    try {
      return { url: await addVoiceover(videoUrl, trackUrl, meta), audio: "voice" };
    } catch (error) {
      logger.warn("Speakerstemme kunne ikke legges på reel, bruker kun musikk", { postId, error: errorText(error) });
    }
  }
  try {
    return { url: await mergeAudioVideo(videoUrl, trackUrl), audio: "music" };
  } catch (error) {
    logger.warn("Musikk kunne ikke legges på reel, bruker video uten lyd", { postId, error: errorText(error) });
    return { url: videoUrl, audio: "none" };
  }
};

const addOverlay = async (videoUrl: string, meta: GenerationMeta | null, postId: string): Promise<string> => {
  if (!meta?.reelOverlayUrl) return videoUrl;
  try {
    return await overlayOnVideo(videoUrl, meta.reelOverlayUrl);
  } catch (error) {
    logger.warn("Tekst og logo kunne ikke legges på reel, bruker video uten", { postId, error: errorText(error) });
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

const isCreditsExhausted = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === "VIDEO_CREDITS_EXHAUSTED";

const markNoCredits = async (supabase: SupabaseClient, post: ReelPostRow): Promise<ReelRenderResult> => {
  await setVideoState(supabase, post, { video_status: "no_credits" });
  logger.info("Reel hoppet over, ingen videokreditter", { postId: post.id, userId: post.user_id });
  return { status: "no_credits", reason: "ingen videokreditter" };
};

export const renderReelForPost = async (supabase: SupabaseClient, postId: string): Promise<ReelRenderResult> => {
  const { data, error } = await supabase
    .from("posts")
    .select("id, user_id, workspace_id, status, reel_source_url, video_status, generation_meta")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(`Kunne ikke hente post for reel: ${error.message}`);

  const post = data as ReelPostRow | null;
  if (!post?.reel_source_url) return { status: "skipped", reason: "ingen reel-kilde" };
  if (post.status === "published") return { status: "skipped", reason: "allerede publisert" };
  if (!post.workspace_id) return await markNoCredits(supabase, post);
  const owner: CreditOwner = { userId: post.user_id, workspaceId: post.workspace_id };

  const t0 = Date.now();
  try {
    if (!isFalAvailable()) throw new Error("FAL_KEY mangler, kan ikke lage video.");
    if ((await getVideoBalance(owner, supabase)).balance <= 0) {
      return await markNoCredits(supabase, post);
    }
    const clip = await generateKlingVideo({
      prompt: buildReelMotionPrompt(post.generation_meta),
      imageUrl: post.reel_source_url,
      duration: REEL_DURATION_SECONDS,
      aspectRatio: "9:16",
      generateAudio: false,
    });
    if (!clip?.url) throw new Error("Videogeneratoren returnerte ingen video.");

    const withAudio = await addAudio(clip.url, post.generation_meta, postId);
    const finished = await addOverlay(withAudio.url, post.generation_meta, postId);
    const videoUrl = await storeVideo(post.user_id, finished);
    try {
      await consumeVideoCredit(owner, `Reel for post ${postId}`, supabase);
    } catch (creditError) {
      await deleteFilesByUrls([videoUrl]).catch((deleteError: unknown) => {
        logger.warn("Kunne ikke slette ubetalt reel", { postId, error: errorText(deleteError) });
      });
      if (isCreditsExhausted(creditError)) return await markNoCredits(supabase, post);
      throw creditError;
    }
    await setVideoState(supabase, post, { video_status: "ready", video_url: videoUrl });
    logger.info("Reel ferdig", {
      postId,
      audio: withAudio.audio,
      withOverlay: finished !== withAudio.url,
      durationMs: Date.now() - t0,
    });
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
