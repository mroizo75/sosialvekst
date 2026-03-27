import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import {
  generateVeo3Video,
  generateKlingVideo,
  isFalAvailable,
} from "@/lib/ai/falClient";
import type { VideoModel, FalProgressCallback } from "@/lib/ai/falClient";
import { buildVideoPrompt } from "@/lib/ai/videoPromptBuilder";
import type { VideoType } from "@/lib/ai/videoPromptBuilder";
import { getBrandContext } from "@/lib/branding/context";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { consumeVideoCredit } from "@/lib/videoCredits";
import { requireWorkspaceId } from "@/lib/workspace";

const requestSchema = z.object({
  prompt: z.string().min(3).max(1000),
  model: z.enum(["veo3", "kling"]).default("veo3"),
  videoType: z.enum(["product", "intro", "service", "event", "testimonial"]).default("intro"),
  duration: z.number().int().min(4).max(15).default(8),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
  generateAudio: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
});

const runGeneration = async (
  model: VideoModel,
  enrichedPrompt: string,
  data: z.infer<typeof requestSchema>,
  onProgress?: FalProgressCallback,
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
      prompt: enrichedPrompt,
      imageUrl: data.imageUrl,
      duration: klingDuration as 5 | 10,
      aspectRatio: klingAspect as "16:9" | "9:16" | "1:1",
      generateAudio: data.generateAudio,
    }, onProgress);
    return result?.url ?? null;
  }

  const veoDuration = data.duration <= 4 ? 4 : data.duration <= 6 ? 6 : 8;
  const veoAspect = data.aspectRatio === "1:1" ? "16:9" : data.aspectRatio;
  const result = await generateVeo3Video({
    prompt: enrichedPrompt,
    duration: veoDuration as 4 | 6 | 8,
    aspectRatio: veoAspect as "16:9" | "9:16",
    generateAudio: data.generateAudio,
  }, onProgress);
  return result?.url ?? null;
};

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const sendEvent = (
    controller: ReadableStreamDefaultController,
    event: string,
    data: Record<string, unknown>,
  ) => {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const userId = await requireUserId();

        if (!isFalAvailable()) {
          sendEvent(controller, "error", { message: "Videogenerering er ikke tilgjengelig akkurat nå." });
          controller.close();
          return;
        }

        const body = await request.json();
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          sendEvent(controller, "error", { message: parsed.error.issues[0]?.message ?? "Ugyldig input" });
          controller.close();
          return;
        }

        const data = parsed.data;

        sendEvent(controller, "progress", { percent: 2, detail: "Forbereder..." });

        const workspaceId = await requireWorkspaceId(userId);
        const brandContext = await getBrandContext(userId, workspaceId);

        const enrichedPrompt = buildVideoPrompt(
          data.videoType as VideoType,
          data.prompt,
          brandContext,
        );

        sendEvent(controller, "progress", { percent: 3, detail: "Trekker kreditt..." });

        await consumeVideoCredit(
          userId,
          `${data.model === "kling" ? "Kling" : "Veo 3"} ${data.videoType}: ${data.prompt.slice(0, 50)}`,
        );

        logger.info("[video/generate] Starter videogenerering", {
          userId,
          model: data.model,
          videoType: data.videoType,
          duration: data.duration,
          promptLength: enrichedPrompt.length,
        });

        const onProgress: FalProgressCallback = (p) => {
          sendEvent(controller, "progress", { percent: p.percent, detail: p.detail ?? p.stage });
        };

        const videoUrl = await runGeneration(data.model, enrichedPrompt, data, onProgress);

        if (!videoUrl) {
          sendEvent(controller, "error", { message: "Videogenerering feilet. Kreditten er allerede brukt." });
          controller.close();
          return;
        }

        sendEvent(controller, "progress", { percent: 92, detail: "Laster ned video fra AI..." });

        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          sendEvent(controller, "error", { message: "Kunne ikke laste ned generert video." });
          controller.close();
          return;
        }

        sendEvent(controller, "progress", { percent: 95, detail: "Lagrer video..." });

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

        sendEvent(controller, "progress", { percent: 100, detail: "Ferdig!" });
        sendEvent(controller, "done", { videoUrl: uploaded.publicUrl, enrichedPrompt });
        controller.close();
      } catch (error) {
        const message = error && typeof error === "object" && "message" in error
          ? (error as { message: string }).message
          : "Noe gikk galt.";
        const code = error && typeof error === "object" && "code" in error
          ? (error as { code: string }).code
          : undefined;
        sendEvent(controller, "error", { message, code });
        const appError = toUnknownAppError(error);
        logger.error("[video/generate] Feil", { error: appError });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
