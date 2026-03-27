import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { generateTextToVideo, isFalAvailable } from "@/lib/ai/falClient";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { consumeVideoCredit } from "@/lib/videoCredits";

const requestSchema = z.object({
  prompt: z.string().min(5).max(1000),
});

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

    await consumeVideoCredit(userId, `Generert video: ${parsed.data.prompt.slice(0, 80)}`);

    logger.info("[video/generate] Starter videogenerering", { userId, promptLength: parsed.data.prompt.length });

    const videoResult = await generateTextToVideo({
      prompt: parsed.data.prompt,
      promptOptimizer: true,
    });

    if (!videoResult?.url) {
      return NextResponse.json(
        toAppError("VIDEO_GENERATION_FAILED", "Videogenerering feilet. Kreditten er allerede brukt."),
        { status: 500 },
      );
    }

    const videoResponse = await fetch(videoResult.url);
    if (!videoResponse.ok) {
      return NextResponse.json(
        toAppError("VIDEO_DOWNLOAD_FAILED", "Kunne ikke laste ned generert video."),
        { status: 500 },
      );
    }

    const videoBuffer = new Uint8Array(await videoResponse.arrayBuffer());
    const uploaded = await uploadUserFile({
      userId,
      fileName: `ai-video-${Date.now()}.mp4`,
      contentType: "video/mp4",
      mediaKind: "video",
      body: videoBuffer,
    });

    logger.info("[video/generate] Video generert og lastet opp", {
      userId,
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
