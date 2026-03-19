import { uploadUserFile } from "@/lib/cloudflare/r2";
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
      }) => Promise<{ data?: Array<{ b64_json?: string }> }>;
    };
  };

  const profile = input.profile ?? "final";
  const imageSize = profile === "preview" ? "512x512" : "1024x1024";
  const imageQuality = profile === "preview" ? "low" : "medium";

  const response = await imageClient.images.generate({
    model: "gpt-image-1",
    prompt: input.prompt,
    size: imageSize,
    quality: imageQuality,
  });

  const base64Image = response.data?.[0]?.b64_json;
  if (!base64Image) {
    return undefined;
  }

  const uploaded = await uploadUserFile({
    userId: input.userId,
    fileName: `ai-image-${crypto.randomUUID()}.png`,
    contentType: "image/png",
    mediaKind: "image",
    body: toBytes(base64Image),
  });

  return uploaded.publicUrl;
};
