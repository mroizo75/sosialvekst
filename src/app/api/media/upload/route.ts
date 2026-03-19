import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";

const mediaKindSchema = z.enum(["image", "video", "logo"]);

const isUploadFile = (
  value: FormDataEntryValue | null,
): value is File & { arrayBuffer: () => Promise<ArrayBuffer> } => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "type" in value,
  );
};

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const mediaKindValue = formData.get("mediaKind");

    if (!isUploadFile(fileValue)) {
      return NextResponse.json(toAppError("INVALID_FILE", "Fant ikke gyldig fil i request"), {
        status: 400,
      });
    }

    const mediaKind = mediaKindSchema.parse(String(mediaKindValue ?? "image"));
    const arrayBuffer = await fileValue.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    const uploaded = await uploadUserFile({
      userId,
      fileName: fileValue.name,
      contentType: fileValue.type || "application/octet-stream",
      mediaKind,
      body,
    });

    return NextResponse.json(uploaded);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(toAppError("MEDIA_UPLOAD_FAILED", "Kunne ikke laste opp fil", appError), {
      status: 400,
    });
  }
}
