import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateKlingVideo,
  generateSpeech,
  generateWanVideo,
  getMediaDuration,
  isFalAvailable,
  mergeAudioVideo,
  mixVoiceOverMusic,
  normalizeLoudness,
  overlayOnVideo,
  resolveReelVideoModel,
  type SpeechModel,
} from "@/lib/ai/falClient";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GenerationMeta, MediaFormat, MediaMode, PostDraft, ReelVoice, VideoStatus } from "@/lib/types";
import { chooseMood, getMusicTrackUrl } from "@/lib/video/musicLibrary";
import { renderPhotoMotionClip } from "@/lib/video/photoReel";
import {
  buildFallbackMotionPrompt,
  buildShotListPrompt,
  reelDurationFor,
  VOICE_MAX_SECONDS,
  VOICE_START_MS,
} from "@/lib/video/reelScript";
import {
  consumeVideoCredit,
  getVideoBalance,
  refundVideoCredit,
  type CreditOwner,
} from "@/lib/videoCredits";

export { VOICE_MAX_SECONDS } from "@/lib/video/reelScript";

const MAX_PARALLEL_RENDERS = 2;
// Kling 2.5 Turbo only makes 5 or 10 second clips, so it is used as the backup model.
const KLING_SECONDS = 10;
const VOICE_TAIL_MS = 1_000;
const MUSIC_BED_LUFS = -30;
const VOICE_LUFS = -16;
const FALLBACK_SPEED = 1.15;

// Premade ElevenLabs voices by default; set a Norwegian voice from the voice library with these variables.
const voiceIdFor = (voice: ReelVoice): string =>
  voice === "male"
    ? process.env.REEL_VOICE_MALE?.trim() || "George"
    : process.env.REEL_VOICE_FEMALE?.trim() || "Charlotte";

const resolveSpeechModel = (envValue = process.env.REEL_TTS_MODEL): SpeechModel =>
  envValue?.trim() === "turbo-v2.5" ? "turbo-v2.5" : "eleven-v3";

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

export type ReelBudget = { remaining: number };

// Pending renders already hold a credit, so a new plan must not spend the same credit twice.
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

// Reels are made only when a video credit is free and fal.ai can render it.
export const reelsAllowedFor = (mediaMode: MediaMode, budget: ReelBudget): boolean =>
  mediaMode !== "owned_only" && budget.remaining > 0 && isFalAvailable();

export const reelColumns = (post: Pick<PostDraft, "reelSourceUrl">) => ({
  reel_source_url: post.reelSourceUrl ?? null,
  video_status: post.reelSourceUrl ? "pending" as const : null,
});

export const buildReelMotionPrompt = (meta: GenerationMeta | null, durationSeconds: number): string =>
  meta?.reelShots && meta.reelShots.length >= 2
    ? buildShotListPrompt(meta.reelShots, durationSeconds, meta)
    : buildFallbackMotionPrompt(meta, durationSeconds);

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
type Speech = { url: string; seconds: number };

const speakOnce = async (script: string, voice: ReelVoice, model: SpeechModel, speed: number): Promise<Speech> => {
  const url = await generateSpeech(script, voiceIdFor(voice), speed, model);
  return { url, seconds: await getMediaDuration(url) };
};

// The voice is recorded before the video so the clip can be exactly as long as the voice needs.
export const recordVoiceSpeech = async (script: string, voice: ReelVoice): Promise<Speech> => {
  const model = resolveSpeechModel();
  const attempts: Array<{ model: SpeechModel; speed: number }> = model === "eleven-v3"
    ? [{ model: "eleven-v3", speed: 1 }, { model: "turbo-v2.5", speed: FALLBACK_SPEED }]
    : [{ model: "turbo-v2.5", speed: 1 }, { model: "turbo-v2.5", speed: FALLBACK_SPEED }];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const speech = await speakOnce(script, voice, attempt.model, attempt.speed);
      if (speech.seconds <= VOICE_MAX_SECONDS) return speech;
      lastError = new Error(`Talen ble ${speech.seconds.toFixed(1)} s, maks ${VOICE_MAX_SECONDS} s.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Talen kunne ikke lages.");
};

const recordSpeechSafely = async (meta: GenerationMeta | null, postId: string): Promise<Speech | undefined> => {
  if (!meta?.voiceScript) return undefined;
  try {
    return await recordVoiceSpeech(meta.voiceScript, meta.reelVoice ?? "female");
  } catch (error) {
    logger.warn("Speakerstemme kunne ikke lages, bruker kun musikk", { postId, error: errorText(error) });
    return undefined;
  }
};

const fitsClip = (speech: Speech, clipSeconds: number): boolean =>
  VOICE_START_MS + speech.seconds * 1000 + VOICE_TAIL_MS <= clipSeconds * 1000;

const addAudio = async (
  clip: ReelClip,
  meta: GenerationMeta | null,
  postId: string,
  speech: Speech | undefined,
): Promise<{ url: string; audio: ReelAudio }> => {
  let trackUrl: string;
  try {
    const mood = chooseMood([meta?.topic, meta?.coverTitle, meta?.motif].filter(Boolean).join(" "));
    trackUrl = await getMusicTrackUrl(mood, postId);
  } catch (error) {
    logger.warn("Musikk kunne ikke hentes til reel, bruker video uten lyd", { postId, error: errorText(error) });
    return { url: clip.url, audio: "none" };
  }
  if (speech && fitsClip(speech, clip.seconds)) {
    try {
      const [musicBed, voice] = await Promise.all([
        normalizeLoudness(trackUrl, MUSIC_BED_LUFS),
        normalizeLoudness(speech.url, VOICE_LUFS),
      ]);
      const url = await mixVoiceOverMusic({
        videoUrl: clip.url,
        musicUrl: musicBed,
        voiceUrl: voice,
        videoMs: clip.seconds * 1000,
        voiceStartMs: VOICE_START_MS,
        voiceMs: Math.ceil(speech.seconds * 1000),
      });
      return { url, audio: "voice" };
    } catch (error) {
      logger.warn("Speakerstemme kunne ikke legges på reel, bruker kun musikk", { postId, error: errorText(error) });
    }
  } else if (speech) {
    logger.warn("Talen er lengre enn klippet, bruker kun musikk", { postId, voiceSeconds: speech.seconds, clipSeconds: clip.seconds });
  }
  try {
    return { url: await mergeAudioVideo(clip.url, trackUrl), audio: "music" };
  } catch (error) {
    logger.warn("Musikk kunne ikke legges på reel, bruker video uten lyd", { postId, error: errorText(error) });
    return { url: clip.url, audio: "none" };
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

export type ReelMotion = "wan3" | "kling25" | "photo";
type ReelClip = { url: string; seconds: number; motion: ReelMotion };

// The credit is taken before fal.ai is paid, so a business can never get AI video it has not bought.
const reserveCredit = async (supabase: SupabaseClient, owner: CreditOwner | null, postId: string): Promise<boolean> => {
  if (!owner) return false;
  try {
    await consumeVideoCredit(owner, `Reel for post ${postId}`, supabase);
    return true;
  } catch (error) {
    if (isCreditsExhausted(error)) return false;
    throw error;
  }
};

const createKlingClip = async (prompt: string, sourceUrl: string): Promise<ReelClip> => {
  const clip = await generateKlingVideo({
    prompt,
    imageUrl: sourceUrl,
    duration: KLING_SECONDS,
    aspectRatio: "9:16",
    generateAudio: false,
  });
  if (!clip?.url) throw new Error("fal.ai leverte ingen video.");
  return { url: clip.url, seconds: KLING_SECONDS, motion: "kling25" };
};

const createAiClip = async (post: ReelPostRow, sourceUrl: string, seconds: number): Promise<ReelClip> => {
  if (resolveReelVideoModel() === "kling25") {
    return createKlingClip(buildReelMotionPrompt(post.generation_meta, KLING_SECONDS), sourceUrl);
  }
  try {
    const clip = await generateWanVideo({
      prompt: buildReelMotionPrompt(post.generation_meta, seconds),
      imageUrl: sourceUrl,
      durationSeconds: seconds,
      aspectRatio: "9:16",
      audio: false,
    });
    return { url: clip.url, seconds, motion: "wan3" };
  } catch (error) {
    logger.warn("Wan 3.0 feilet, prøver Kling 2.5", { postId: post.id, error: errorText(error) });
    return createKlingClip(buildReelMotionPrompt(post.generation_meta, KLING_SECONDS), sourceUrl);
  }
};

// Without a credit the reel still goes out, as a free slow push-in on the photo.
const createPhotoClip = async (post: ReelPostRow, sourceUrl: string, seconds: number): Promise<ReelClip> => ({
  url: await renderPhotoMotionClip(post.user_id, sourceUrl, seconds),
  seconds,
  motion: "photo",
});

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
  const sourceUrl = post.reel_source_url;
  const owner: CreditOwner | null = post.workspace_id ? { userId: post.user_id, workspaceId: post.workspace_id } : null;

  const t0 = Date.now();
  let reserved = false;
  try {
    if (!isFalAvailable()) throw new Error("FAL_KEY mangler, kan ikke lage video.");
    reserved = await reserveCredit(supabase, owner, postId);

    const speech = await recordSpeechSafely(post.generation_meta, postId);
    const seconds = reelDurationFor(speech?.seconds);
    const clip = reserved
      ? await createAiClip(post, sourceUrl, seconds)
      : await createPhotoClip(post, sourceUrl, seconds);

    const withAudio = await addAudio(clip, post.generation_meta, postId, speech);
    const finished = await addOverlay(withAudio.url, post.generation_meta, postId);
    const videoUrl = await storeVideo(post.user_id, finished);
    await setVideoState(supabase, post, { video_status: "ready", video_url: videoUrl });
    logger.info("Reel ferdig", {
      postId,
      motion: clip.motion,
      seconds: clip.seconds,
      concept: post.generation_meta?.reelConcept ?? null,
      audio: withAudio.audio,
      withOverlay: finished !== withAudio.url,
      paid: reserved,
      durationMs: Date.now() - t0,
    });
    return { status: "ready", videoUrl };
  } catch (renderError) {
    logger.warn("Reel feilet, posten publiseres som bilde", { postId, error: errorText(renderError) });
    if (reserved && owner) {
      await refundVideoCredit(owner, `Refusjon: reel for post ${postId} feilet`, supabase).catch((refundError: unknown) => {
        logger.error("Kunne ikke refundere videokreditt", { postId, error: errorText(refundError) });
      });
    }
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
