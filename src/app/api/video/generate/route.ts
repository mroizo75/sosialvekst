import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import {
  generateVeo3Video,
  generateKlingVideo,
  isFalAvailable,
} from "@/lib/ai/falClient";
import type { VideoModel } from "@/lib/ai/falClient";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { consumeVideoCredit } from "@/lib/videoCredits";

const requestSchema = z.object({
  prompt: z.string().min(5).max(1000),
  model: z.enum(["veo3", "kling"]).default("veo3"),
  duration: z.number().int().min(4).max(15).default(8),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
  generateAudio: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
});

const runGeneration = async (
  model: VideoModel,
  data: z.infer<typeof requestSchema>,
): Promise<string | null> => {
  if (model === "kling") {
    if (!data.imageUrl) {
      throw Object.assign(
        new Error("Kling krever et bilde."),
        toAppError("MISSING_IMAGE", "Last opp et bilde for å bruke Kling bilde-til-video."),
      );
    }
    const klingDuration = data.duration <= 5 ? 5 : 10;
    const klingAspect = data.aspectRatio === "1:1" ? "1:1" : data.aspectRatio;
    const result = await generateKlingVideo({
      prompt: data.prompt,
      imageUrl: data.imageUrl,
      duration: klingDuration as 5 | 10,
      aspectRatio: klingAspect as "16:9" | "9:16" | "1:1",
      generateAudio: data.generateAudio,
    });
    return result?.url ?? null;
  }

  const veoDuration = data.duration <= 4 ? 4 : data.duration <= 6 ? 6 : 8;
  const veoAspect = data.aspectRatio === "1:1" ? "16:9" : data.aspectRatio;
  const result = await generateVeo3Video({
    prompt: data.prompt,
    duration: veoDuration as 4 | 6 | 8,
    aspectRatio: veoAspect as "16:9" | "9:16",
    generateAudio: data.generateAudio,
  });
  return result?.url ?? null;
};

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();

    if (!isFalAvailable()) {
      return NextResponse.json(
        toAppError("FAL_UNAVAILABLE", "Videogenerering er ikke tilgjengelig akkurat nå."),
        { status: 503 },
      );
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        toAppError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Ugyldig input"),
        { status: 400 },
      );
    }

    const data = parsed.data;

    await consumeVideoCredit(
      userId,
      `${data.model === "kling" ? "Kling" : "Veo 3"} video: ${data.prompt.slice(0, 60)}`,
    );

    logger.info("[video/generate] Starter videogenerering", {
      userId,
      model: data.model,
      duration: data.duration,
      aspectRatio: data.aspectRatio,
      hasImage: Boolean(data.imageUrl),
    });

    const videoUrl = await runGeneration(data.model, data);

    if (!videoUrl) {
      return NextResponse.json(
        toAppError("VIDEO_GENERATION_FAILED", "Videogenerering feilet. Kreditten er allerede brukt."),
        { status: 500 },
      );
    }

    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      return NextResponse.json(
        toAppError("VIDEO_DOWNLOAD_FAILED", "Kunne ikke laste ned generert video."),
        { status: 500 },
      );
    }

    const videoBuffer = new Uint8Array(await videoResponse.arrayBuffer());
    const uploaded = await uploadUserFile({
      userId,
      fileName: `ai-video-${data.model}-${Date.now()}.mp4`,
      contentType: "video/mp4",
      mediaKind: "video",
      body: videoBuffer,
    });

    logger.info("[video/generate] Video generert og lastet opp", {
      userId,
      model: data.model,
      publicUrl: uploaded.publicUrl,
    });

    return NextResponse.json({ videoUrl: uploaded.publicUrl });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const appError = error as { code: string; message: string };
      const status = appError.code === "VIDEO_CREDITS_EXHAUSTED" ? 402 : 400;
      return NextResponse.json(appError, { status });
    }
    const appError = toUnknownAppError(error);
    logger.error("[video/generate] Feil", { error: appError });
    return NextResponse.json(appError, { status: 500 });
  }
}
