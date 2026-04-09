import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { ImageProfile } from "@/lib/types";

type GenerateImageInput = {
  userId: string;
  prompt: string;
  profile?: ImageProfile;
};

const execFileAsync = promisify(execFile);

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

const parseDataUrlToBytes = (value: string): Uint8Array | null => {
  if (!value.startsWith("data:image/")) return null;
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  const meta = value.slice(0, commaIndex);
  const payload = value.slice(commaIndex + 1);
  if (meta.includes(";base64")) {
    return new Uint8Array(Buffer.from(payload, "base64"));
  }
  return new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf8"));
};

const extractJsonObject = (stdout: string): Record<string, unknown> | null => {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const getBananaAspectRatio = (prompt: string): string => {
  const lower = prompt.toLowerCase();
  if (lower.includes("9:16") || lower.includes("story") || lower.includes("reel")) {
    return "9:16";
  }
  if (lower.includes("16:9") || lower.includes("landskap")) {
    return "16:9";
  }
  return "1:1";
};

const shouldUseBananaPrimary = (): boolean => {
  return process.env.IMAGE_PROVIDER?.toLowerCase() === "banana";
};

const escapeForSingleQuotes = (value: string): string => {
  return value.replace(/'/g, "'\"'\"'");
};

const runBananaCli = async (
  appRef: string,
  payloadJson: string,
): Promise<{ stdout: string; stderr: string }> => {
  try {
    return await execFileAsync(
      "infsh",
      ["app", "run", appRef, "--input", payloadJson],
      { timeout: 90_000, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (error) {
    const looksLikeMissingInfsh =
      error instanceof Error &&
      (error.message.includes("ENOENT") || error.message.toLowerCase().includes("not recognized"));

    if (process.platform !== "win32" || !looksLikeMissingInfsh) {
      throw error;
    }

    // Windows fallback: use infsh installed in WSL.
    const escapedJson = escapeForSingleQuotes(payloadJson);
    const escapedAppRef = escapeForSingleQuotes(appRef);
    return execFileAsync(
      "wsl",
      [
        "bash",
        "-lc",
        `infsh app run '${escapedAppRef}' --input '${escapedJson}'`,
      ],
      { timeout: 90_000, maxBuffer: 10 * 1024 * 1024 },
    );
  }
};

const tryGenerateWithBanana = async (input: GenerateImageInput): Promise<Uint8Array | null> => {
  const enabled = shouldUseBananaPrimary();
  if (!enabled) return null;

  const appRef = process.env.NANO_BANANA_APP_REF?.trim()
    || "google/gemini-3-1-flash-image-preview";
  const resolution = (input.profile ?? "final") === "preview" ? "1K" : "2K";
  const aspectRatio = getBananaAspectRatio(input.prompt);
  const payload = {
    prompt: input.prompt,
    num_images: 1,
    aspect_ratio: aspectRatio,
    resolution,
  };

  try {
    const { stdout, stderr } = await runBananaCli(appRef, JSON.stringify(payload));

    const parsed = extractJsonObject(stdout);
    const imagesRaw = parsed?.images;
    const images = Array.isArray(imagesRaw) ? imagesRaw : [];
    if (images.length === 0) {
      logger.warn("Nano Banana returnerte ingen bilder", {
        userId: input.userId,
        stderr: stderr?.slice(0, 300) ?? "",
      });
      return null;
    }

    const first = images[0];
    const imageValue = typeof first === "string"
      ? first
      : (first as Record<string, unknown>)?.url
        ?? (first as Record<string, unknown>)?.data
        ?? (first as Record<string, unknown>)?.data_url
        ?? (first as Record<string, unknown>)?.b64_json;

    if (typeof imageValue !== "string" || imageValue.length === 0) {
      logger.warn("Nano Banana svarte uten gyldig bildeverdi", {
        userId: input.userId,
      });
      return null;
    }

    const maybeDataUrl = parseDataUrlToBytes(imageValue);
    if (maybeDataUrl) {
      return maybeDataUrl;
    }
    if (/^[A-Za-z0-9+/=]+$/.test(imageValue) && imageValue.length > 200) {
      return new Uint8Array(Buffer.from(imageValue, "base64"));
    }

    return await fetchImageBytes(imageValue);
  } catch (error) {
    logger.warn("Nano Banana feilet, faller tilbake til OpenAI", {
      userId: input.userId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
};

export const generateProfessionalImage = async (
  input: GenerateImageInput,
): Promise<string | undefined> => {
  const bananaBytes = await tryGenerateWithBanana(input);
  if (bananaBytes) {
    const uploaded = await uploadUserFile({
      userId: input.userId,
      fileName: `ai-image-banana-${crypto.randomUUID()}.png`,
      contentType: "image/png",
      mediaKind: "image",
      body: bananaBytes,
    });
    return uploaded.publicUrl;
  }

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
  const imageQuality = profile === "preview" ? "medium" : "high";

  let response: { data?: Array<{ b64_json?: string; url?: string }> } | null = null;
  const variants: Array<{ size: string; quality: string }> = [
    { size: imageSize, quality: imageQuality },
    { size: "1024x1024", quality: "medium" },
    { size: "1024x1024", quality: "low" },
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

type BrandedImageInput = {
  userId: string;
  prompt: string;
  logoUrl: string;
  profile?: ImageProfile;
};

export const generateBrandedImage = async (
  input: BrandedImageInput,
): Promise<string | undefined> => {
  const client = getOpenAiClient();
  if (!client) return undefined;

  const imageClient = client as unknown as {
    images: {
      edit: (args: {
        model: string;
        prompt: string;
        image: Array<{ url: string; detail?: string }>;
        size: string;
        quality: string;
      }) => Promise<{ data?: Array<{ b64_json?: string; url?: string }> }>;
    };
  };

  const imageQuality = (input.profile ?? "final") === "preview" ? "medium" : "high";

  try {
    const response = await imageClient.images.edit({
      model: "gpt-image-1",
      prompt: input.prompt,
      image: [{ url: input.logoUrl, detail: "high" }],
      size: "1024x1024",
      quality: imageQuality,
    });

    const payload = response.data?.[0];
    if (!payload) return undefined;

    const imageBytes = payload.b64_json
      ? toBytes(payload.b64_json)
      : payload.url
        ? await fetchImageBytes(payload.url)
        : null;

    if (!imageBytes) return undefined;

    const uploaded = await uploadUserFile({
      userId: input.userId,
      fileName: `branded-scene-${crypto.randomUUID()}.png`,
      contentType: "image/png",
      mediaKind: "image",
      body: imageBytes,
    });

    logger.info("Scene-integrert logo-bilde generert", {
      userId: input.userId,
    });

    return uploaded.publicUrl;
  } catch (error) {
    logger.warn("generateBrandedImage feilet, faller tilbake til standard", {
      userId: input.userId,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return undefined;
  }
};
