import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { addProductImage, deleteProductImage } from "@/lib/products/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const createSchema = z.object({
  productId: z.string().uuid(),
  imageUrl: z.string().url(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        toAppError("VALIDATION_ERROR", "Ugyldig produktbilde-data."),
        { status: 400 },
      );
    }
    const image = await addProductImage(await createSupabaseServerClient(), { userId, workspaceId }, parsed.data);
    return NextResponse.json(image);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(appError, { status: appError.code === "PRODUCT_NOT_FOUND" ? 404 : 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        toAppError("VALIDATION_ERROR", "Ugyldig forespørsel."),
        { status: 400 },
      );
    }
    await deleteProductImage(await createSupabaseServerClient(), { userId, workspaceId }, parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(toUnknownAppError(error), { status: 400 });
  }
}
