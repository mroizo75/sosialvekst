import { uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { ImageProfile } from "@/lib/types";

type GenerateImageInput = {
  userId: string;
  prompt: string;
  profile?: ImageProfile;
};

const toBytes = (base64Image: string): Uint8Array => {
  const buffer = Buffer.from(base64Image, "base64");
  return new Uint8Array(buffer);
};

const fetchImageBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kunne ikke hente bildefil fra URL (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

export const generateProfessionalImage = async (
  input: GenerateImageInput,
): Promise<string | undefined> => {
  const client = getOpenAiClient();
  if (!client) {
    return undefined;
  }

  const imageClient = client as unknown as {
    images: {
      generate: (args: {
        model: string;
        prompt: string;
        size: string;
        quality: string;
      }) => Promise<{ data?: Array<{ b64_json?: string; url?: string }> }>;
    };
  };

  const profile = input.profile ?? "final";
  // Use 1024x1024 for both profiles for higher API compatibility.
  const imageSize = "1024x1024";
  const imageQuality = profile === "preview" ? "low" : "medium";

  let response: { data?: Array<{ b64_json?: string; url?: string }> } | null = null;
  const variants: Array<{ size: string; quality: string }> = [
    { size: imageSize, quality: imageQuality },
    { size: "1024x1024", quality: "low" },
    { size: "1024x1024", quality: "medium" },
  ];

  for (const variant of variants) {
    try {
      response = await imageClient.images.generate({
        model: "gpt-image-1",
        prompt: input.prompt,
        size: variant.size,
        quality: variant.quality,
      });
      if (response.data?.[0]) {
        break;
      }
    } catch (error) {
      logger.warn("Image generation variant failed", {
        userId: input.userId,
        size: variant.size,
        quality: variant.quality,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (!response?.data?.[0]) {
    throw new Error("Bildegenerator feilet for alle varianter.");
  }

  const payload = response.data?.[0];
  if (!payload) {
    throw new Error("Bildegenerator returnerte tomt svar.");
  }

  const imageBytes = payload.b64_json
    ? toBytes(payload.b64_json)
    : payload.url
      ? await fetchImageBytes(payload.url)
      : null;

  if (!imageBytes) {
    throw new Error("Bildegenerator returnerte verken base64 eller URL.");
  }

  const uploaded = await uploadUserFile({
    userId: input.userId,
    fileName: `ai-image-${crypto.randomUUID()}.png`,
    contentType: "image/png",
    mediaKind: "image",
    body: imageBytes,
  });

  return uploaded.publicUrl;
};
