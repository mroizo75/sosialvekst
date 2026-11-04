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
  resolveReelResolution,
  resolveReelVideoModel,
  type SpeechModel,
  type WanResolution,
} from "@/lib/ai/falClient";
import { isElevenLabsAvailable, synthesizeElevenLabsSpeech } from "@/lib/ai/elevenLabsClient";
import { deleteFilesByUrls, uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GenerationMeta, MediaFormat, MediaMode, PostDraft, ReelVoice, VideoStatus } from "@/lib/types";
import { chooseMood, getMusicTrackUrl } from "@/lib/video/musicLibrary";
import { renderPhotoMotionClip } from "@/lib/video/photoReel";
import { REEL_HEIGHT, REEL_WIDTH } from "@/lib/video/reelFrame";
import { scaleReelOverlay } from "@/lib/video/reelOverlay";
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

const DEFAULT_FAL_VOICE: Record<ReelVoice, string> = { female: "Charlotte", male: "George" };

// fal.ai only knows these built-in ElevenLabs voices; library voices need ELEVENLABS_API_KEY.
const FAL_VOICES = new Set([
  "aria", "roger", "sarah", "laura", "charlie", "george", "callum", "river", "liam", "charlotte",
  "alice", "matilda", "will", "jessica", "eric", "chris", "brian", "daniel", "lily", "bill", "rachel",
]);

// REEL_VOICE_FEMALE / REEL_VOICE_MALE: a voice ID from the ElevenLabs library (used with ELEVENLABS_API_KEY)
// or the name of a fal built-in voice.
const configuredVoice = (voice: ReelVoice): string | undefined =>
  (voice === "male" ? process.env.REEL_VOICE_MALE : process.env.REEL_VOICE_FEMALE)?.trim() || undefined;

export const falVoiceFor = (voice: ReelVoice): string => {
  const configured = configuredVoice(voice);
  return configured && FAL_VOICES.has(configured.toLowerCase()) ? configured : DEFAULT_FAL_VOICE[voice];
};

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
type Speech = { url: string; seconds: number; tempUrl?: string };

type SpeechAttempt =
  | { source: "elevenlabs"; voiceId: string }
  | { source: "fal"; model: SpeechModel; voice: string; speed: number };

const describeAttempt = (attempt: SpeechAttempt): string =>
  attempt.source === "elevenlabs" ? `elevenlabs/${attempt.voiceId}` : `fal/${attempt.model}/${attempt.voice}@${attempt.speed}`;

export const speechAttemptsFor = (voice: ReelVoice): SpeechAttempt[] => {
  const falVoice = falVoiceFor(voice);
  const configured = configuredVoice(voice);
  const direct: SpeechAttempt[] = isElevenLabsAvailable() && configured
    ? [{ source: "elevenlabs", voiceId: configured }]
    : [];
  const fal: SpeechAttempt[] = resolveSpeechModel() === "eleven-v3"
    ? [
      { source: "fal", model: "eleven-v3", voice: falVoice, speed: 1 },
      { source: "fal", model: "turbo-v2.5", voice: falVoice, speed: FALLBACK_SPEED },
    ]
    : [
      { source: "fal", model: "turbo-v2.5", voice: falVoice, speed: 1 },
      { source: "fal", model: "turbo-v2.5", voice: falVoice, speed: FALLBACK_SPEED },
    ];
  return [...direct, ...fal];
};

const speakOnce = async (script: string, attempt: SpeechAttempt, userId: string): Promise<Speech> => {
  if (attempt.source === "fal") {
    const url = await generateSpeech(script, attempt.voice, attempt.speed, attempt.model);
    return { url, seconds: await getMediaDuration(url) };
  }
  const audio = await synthesizeElevenLabsSpeech(script, attempt.voiceId);
  const uploaded = await uploadUserFile({
    userId,
    fileName: `reel-voice-${crypto.randomUUID()}.mp3`,
    contentType: "audio/mpeg",
    mediaKind: "video",
    body: audio,
  });
  return { url: uploaded.publicUrl, tempUrl: uploaded.publicUrl, seconds: await getMediaDuration(uploaded.publicUrl) };
};

// The voice is recorded before the video so the clip can be exactly as long as the voice needs.
// Native Norwegian voices go straight to ElevenLabs; fal's built-in voices are the backup.
export const recordVoiceSpeech = async (script: string, voice: ReelVoice, userId: string, postId?: string): Promise<Speech> => {
  let lastError: unknown;
  for (const attempt of speechAttemptsFor(voice)) {
    try {
      const speech = await speakOnce(script, attempt, userId);
      if (speech.seconds <= VOICE_MAX_SECONDS) {
        logger.info("Speakerstemme laget", { postId, via: describeAttempt(attempt), seconds: speech.seconds });
        return speech;
      }
      if (speech.tempUrl) await deleteFilesByUrls([speech.tempUrl]).catch(() => undefined);
      lastError = new Error(`Talen ble ${speech.seconds.toFixed(1)} s, maks ${VOICE_MAX_SECONDS} s.`);
    } catch (error) {
      lastError = error;
    }
    logger.warn("Taleforsøk feilet, prøver neste", { postId, via: describeAttempt(attempt), error: errorText(lastError) });
  }
  throw lastError instanceof Error ? lastError : new Error("Talen kunne ikke lages.");
};

const recordSpeechSafely = async (post: ReelPostRow): Promise<Speech | undefined> => {
  const meta = post.generation_meta;
  if (!meta?.voiceScript) return undefined;
  try {
    return await recordVoiceSpeech(meta.voiceScript, meta.reelVoice ?? "female", post.user_id, post.id);
  } catch (error) {
    logger.warn("Speakerstemme kunne ikke lages, bruker kun musikk", { postId: post.id, error: errorText(error) });
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

const uploadScaledOverlay = async (userId: string, overlayUrl: string, clip: ReelClip): Promise<string> => {
  const response = await fetch(overlayUrl);
  if (!response.ok) throw new Error(`Kunne ikke hente tekstlaget (${response.status}).`);
  const scaled = await scaleReelOverlay(Buffer.from(await response.arrayBuffer()), clip.width, clip.height);
  const uploaded = await uploadUserFile({
    userId,
    fileName: `reel-overlay-${clip.width}-${crypto.randomUUID()}.gif`,
    contentType: "image/gif",
    mediaKind: "image",
    body: new Uint8Array(scaled),
  });
  return uploaded.publicUrl;
};

const addOverlay = async (videoUrl: string, post: ReelPostRow, clip: ReelClip): Promise<string> => {
  const overlayUrl = post.generation_meta?.reelOverlayUrl;
  if (!overlayUrl) return videoUrl;
  let scaledUrl: string | undefined;
  try {
    if (clip.width !== REEL_WIDTH) scaledUrl = await uploadScaledOverlay(post.user_id, overlayUrl, clip);
    return await overlayOnVideo(videoUrl, scaledUrl ?? overlayUrl);
  } catch (error) {
    logger.warn("Tekst og logo kunne ikke legges på reel, bruker video uten", { postId: post.id, error: errorText(error) });
    return videoUrl;
  } finally {
    if (scaledUrl) await deleteFilesByUrls([scaledUrl]).catch(() => undefined);
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
type ReelClip = { url: string; seconds: number; motion: ReelMotion; width: number; height: number };

const WAN_WIDTH: Record<WanResolution, number> = { "480p": 480, "720p": 720, "1080p": 1080 };

// Wan renders 9:16 at the chosen resolution; Kling and the photo clip come out at full 1080x1920.
export const wanClipSize = (resolution: WanResolution): { width: number; height: number } => {
  const width = WAN_WIDTH[resolution];
  return { width, height: Math.round((width * 16) / 9) };
};

const FULL_SIZE = { width: REEL_WIDTH, height: REEL_HEIGHT };

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
  return { url: clip.url, seconds: KLING_SECONDS, motion: "kling25", ...FULL_SIZE };
};

const createAiClip = async (post: ReelPostRow, sourceUrl: string, seconds: number): Promise<ReelClip> => {
  if (resolveReelVideoModel() === "kling25") {
    return createKlingClip(buildReelMotionPrompt(post.generation_meta, KLING_SECONDS), sourceUrl);
  }
  try {
    const resolution = resolveReelResolution();
    const clip = await generateWanVideo({
      prompt: buildReelMotionPrompt(post.generation_meta, seconds),
      imageUrl: sourceUrl,
      durationSeconds: seconds,
      aspectRatio: "9:16",
      resolution,
      audio: false,
    });
    return { url: clip.url, seconds, motion: "wan3", ...wanClipSize(resolution) };
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
  ...FULL_SIZE,
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
  let speech: Speech | undefined;
  try {
    if (!isFalAvailable()) throw new Error("FAL_KEY mangler, kan ikke lage video.");
    reserved = await reserveCredit(supabase, owner, postId);

    speech = await recordSpeechSafely(post);
    const seconds = reelDurationFor(speech?.seconds);
    const clip = reserved
      ? await createAiClip(post, sourceUrl, seconds)
      : await createPhotoClip(post, sourceUrl, seconds);

    const withAudio = await addAudio(clip, post.generation_meta, postId, speech);
    const finished = await addOverlay(withAudio.url, post, clip);
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
  } finally {
    if (speech?.tempUrl) await deleteFilesByUrls([speech.tempUrl]).catch(() => undefined);
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
