import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getRequiredEnv } from "@/lib/env";
import { toAppError } from "@/lib/errors";

export type MediaKind = "image" | "video" | "logo";

type PresignedUploadInput = {
  userId: string;
  fileName: string;
  contentType: string;
  mediaKind: MediaKind;
};

type DirectUploadInput = {
  userId: string;
  fileName: string;
  contentType: string;
  mediaKind: MediaKind;
  body: Uint8Array;
};

export type ListedFile = {
  key: string;
  url: string;
  size: number;
  updatedAt: string;
};

const getBucket = (): string => getRequiredEnv("CLOUDFLARE_R2_BUCKET");

const getPublicBaseUrl = (): string =>
  getRequiredEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

const createR2Client = (): S3Client => {
  const accountId = getRequiredEnv("CLOUDFLARE_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getRequiredEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    },
  });
};

const sanitizeFileName = (fileName: string): string => {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const getFolderByKind = (kind: MediaKind): string => {
  if (kind === "video") {
    return "videos";
  }
  if (kind === "logo") {
    return "logos";
  }
  return "images";
};

const createObjectKey = (input: PresignedUploadInput): string => {
  const cleanedName = sanitizeFileName(input.fileName);
  const folder = getFolderByKind(input.mediaKind);
  const uniquePart = crypto.randomUUID();
  return `users/${input.userId}/${folder}/${uniquePart}-${cleanedName}`;
};

export const createPresignedUpload = async (input: PresignedUploadInput) => {
  if (!input.fileName.trim()) {
    throw toAppError("INVALID_FILE_NAME", "Filnavn er ugyldig");
  }
  if (!input.contentType.trim()) {
    throw toAppError("INVALID_CONTENT_TYPE", "Filtype mangler");
  }

  const client = createR2Client();
  const key = createObjectKey(input);
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: input.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });

  return {
    key,
    uploadUrl,
    publicUrl: `${getPublicBaseUrl()}/${key}`,
  };
};

export const uploadUserFile = async (input: DirectUploadInput) => {
  if (!input.fileName.trim()) {
    throw toAppError("INVALID_FILE_NAME", "Filnavn er ugyldig");
  }
  if (!input.contentType.trim()) {
    throw toAppError("INVALID_CONTENT_TYPE", "Filtype mangler");
  }
  if (input.body.byteLength === 0) {
    throw toAppError("EMPTY_FILE", "Filen er tom");
  }

  const client = createR2Client();
  const key = createObjectKey(input);
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: input.contentType,
      Body: input.body,
    }),
  );

  return {
    key,
    publicUrl: `${getPublicBaseUrl()}/${key}`,
  };
};

export const listUserFiles = async (userId: string): Promise<ListedFile[]> => {
  const client = createR2Client();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: `users/${userId}/`,
    }),
  );

  return (response.Contents ?? []).map((entry) => ({
    key: entry.Key ?? "",
    url: `${getPublicBaseUrl()}/${entry.Key ?? ""}`,
    size: entry.Size ?? 0,
    updatedAt: entry.LastModified?.toISOString() ?? "",
  }));
};

export const deleteUserFile = async (userId: string, key: string): Promise<void> => {
  if (!key.startsWith(`users/${userId}/`)) {
    throw toAppError("FORBIDDEN_FILE_ACCESS", "Kan ikke slette fil utenfor eget område");
  }

  const client = createR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
};

export const deleteFilesByUrls = async (urls: string[]): Promise<void> => {
  if (urls.length === 0) return;

  const baseUrl = getPublicBaseUrl();
  const keys = urls
    .map((url) => {
      if (!url.startsWith(baseUrl)) return null;
      return url.slice(baseUrl.length + 1);
    })
    .filter((key): key is string => Boolean(key));

  if (keys.length === 0) return;

  const client = createR2Client();
  const batches: { Key: string }[][] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    batches.push(keys.slice(i, i + 1000).map((Key) => ({ Key })));
  }

  for (const batch of batches) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: getBucket(),
        Delete: { Objects: batch, Quiet: true },
      }),
    );
  }
};

export const deleteAllUserFiles = async (userId: string): Promise<void> => {
  const client = createR2Client();
  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: `users/${userId}/`,
    }),
  );

  const objects = (listed.Contents ?? [])
    .map((item) => item.Key)
    .filter((key): key is string => Boolean(key))
    .map((key) => ({ Key: key }));

  if (objects.length === 0) {
    return;
  }

  await client.send(
    new DeleteObjectsCommand({
      Bucket: getBucket(),
      Delete: {
        Objects: objects,
        Quiet: true,
      },
    }),
  );
};
