export const resolveCopyModel = (envValue = process.env.COPY_MODEL): string =>
  envValue?.trim() || "gpt-4.1";

export const FALLBACK_IMAGE_MODEL = "gpt-image-1";

export const resolveImageModel = (envValue = process.env.IMAGE_MODEL): string =>
  envValue?.trim() || "gpt-image-2";
