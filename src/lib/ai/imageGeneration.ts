import { execFile } from "node:child_process";
import { promisify } from "node:util";

import sharp from "sharp";

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
const BANANA_COOLDOWN_MS = 15 * 60 * 1000;
let bananaDisabledUntil = 0;

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
  if (process.env.IMAGE_PROVIDER?.toLowerCase() !== "banana") {
    return false;
  }
  return Date.now() >= bananaDisabledUntil;
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
      { timeout: 25_000, maxBuffer: 10 * 1024 * 1024 },
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
      { timeout: 25_000, maxBuffer: 10 * 1024 * 1024 },
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
      bananaDisabledUntil = Date.now() + BANANA_COOLDOWN_MS;
      logger.warn("Nano Banana returnerte ingen bilder", {
        userId: input.userId,
        cooldownMinutes: Math.floor(BANANA_COOLDOWN_MS / 60000),
        stdoutPreview: stdout.slice(0, 200),
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
      bananaDisabledUntil = Date.now() + BANANA_COOLDOWN_MS;
      logger.warn("Nano Banana svarte uten gyldig bildeverdi", {
        userId: input.userId,
        cooldownMinutes: Math.floor(BANANA_COOLDOWN_MS / 60000),
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
    bananaDisabledUntil = Date.now() + BANANA_COOLDOWN_MS;
    logger.warn("Nano Banana feilet, faller tilbake til OpenAI", {
      userId: input.userId,
      cooldownMinutes: Math.floor(BANANA_COOLDOWN_MS / 60000),
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

  const profile = input.profile ?? "final";
  const imageSize = "1024x1024" as const;
  const imageQuality = profile === "preview" ? ("medium" as const) : ("high" as const);

  type ImageVariant = { size: string; quality: string };
  const variants: ImageVariant[] = [
    { size: imageSize, quality: imageQuality },
    { size: "1024x1024", quality: "medium" },
    { size: "1024x1024", quality: "low" },
  ];

  let lastVariantError: string | undefined;
  let imageBytes: Uint8Array | null = null;

  for (const variant of variants) {
    try {
      const response = await client.images.generate({
        model: "gpt-image-1",
        prompt: input.prompt,
        size: variant.size as "1024x1024",
        quality: variant.quality as "low" | "medium" | "high",
      });

      const first = response.data?.[0];
      if (!first) {
        lastVariantError = `Tom data-array. Keys: ${Object.keys(response).join(",")}, dataLen: ${response.data?.length ?? "undefined"}`;
        logger.warn("Image generation variant returned empty data", {
          userId: input.userId,
          size: variant.size,
          quality: variant.quality,
          responseKeys: Object.keys(response),
          dataLength: response.data?.length ?? 0,
        });
        continue;
      }

      if (first.b64_json) {
        imageBytes = toBytes(first.b64_json);
      } else if (first.url) {
        imageBytes = await fetchImageBytes(first.url);
      }

      if (imageBytes) break;

      lastVariantError = "Variant returnerte data men verken b64_json eller url";
      logger.warn("Image generation variant missing image data", {
        userId: input.userId,
        size: variant.size,
        quality: variant.quality,
        hasB64: Boolean(first.b64_json),
        hasUrl: Boolean(first.url),
        firstKeys: Object.keys(first),
      });
    } catch (error) {
      lastVariantError = error instanceof Error ? error.message : "unknown";
      logger.warn("Image generation variant failed", {
        userId: input.userId,
        size: variant.size,
        quality: variant.quality,
        error: lastVariantError,
      });
    }
  }

  if (!imageBytes) {
    throw new Error(`Bildegenerator feilet for alle varianter. Siste: ${lastVariantError ?? "ukjent"}`);
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

const LOGO_MAX_WIDTH_RATIO = 0.27;
const LOGO_PADDING_RATIO = 0.03;

export const overlayLogoOnImage = async (
  imageUrl: string,
  logoUrl: string,
  userId: string,
): Promise<string | undefined> => {
  try {
    const [imageResponse, logoResponse] = await Promise.all([
      fetch(imageUrl),
      fetch(logoUrl),
    ]);

    if (!imageResponse.ok || !logoResponse.ok) {
      logger.warn("overlayLogoOnImage: kunne ikke laste bilde/logo", {
        userId,
        imageStatus: imageResponse.status,
        logoStatus: logoResponse.status,
      });
      return undefined;
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());

    const baseImage = sharp(imageBuffer);
    const metadata = await baseImage.metadata();
    const width = metadata.width ?? 1024;
    const height = metadata.height ?? 1024;

    const maxLogoWidth = Math.round(width * LOGO_MAX_WIDTH_RATIO);
    const padding = Math.round(width * LOGO_PADDING_RATIO);

    const resizedLogo = await sharp(logoBuffer)
      .resize({ width: maxLogoWidth, withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMeta = await sharp(resizedLogo).metadata();
    const logoW = logoMeta.width ?? maxLogoWidth;
    const logoH = logoMeta.height ?? maxLogoWidth;

    const composited = await baseImage
      .composite([
        {
          input: resizedLogo,
          top: height - logoH - padding,
          left: width - logoW - padding,
        },
      ])
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer();

    const uploaded = await uploadUserFile({
      userId,
      fileName: `ai-image-branded-${crypto.randomUUID()}.jpg`,
      contentType: "image/jpeg",
      mediaKind: "image",
      body: new Uint8Array(composited),
    });

    logger.info("Logo-overlay lagt til på bilde", { userId });
    return uploaded.publicUrl;
  } catch (error) {
    logger.warn("overlayLogoOnImage feilet", {
      userId,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return undefined;
  }
};
