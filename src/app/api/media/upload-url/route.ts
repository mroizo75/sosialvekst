import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { createPresignedUpload } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";

const schema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  mediaKind: z.enum(["image", "video", "logo"]),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = schema.parse(await request.json());
    const result = await createPresignedUpload({
      userId,
      fileName: payload.fileName,
      contentType: payload.contentType,
      mediaKind: payload.mediaKind,
    });
    return NextResponse.json(result);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("MEDIA_UPLOAD_URL_FAILED", "Kunne ikke opprette opplastingslenke", appError),
      { status: 400 },
    );
  }
}
