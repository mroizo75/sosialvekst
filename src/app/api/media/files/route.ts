import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { deleteUserFile, listUserFiles } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";

const deleteSchema = z.object({
  key: z.string().min(1),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const files = await listUserFiles(userId);
    return NextResponse.json({ files });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("MEDIA_LIST_FAILED", "Kunne ikke hente filer", appError),
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = deleteSchema.parse(await request.json());
    await deleteUserFile(userId, payload.key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("MEDIA_DELETE_FAILED", "Kunne ikke slette fil", appError),
      { status: 400 },
    );
  }
}
