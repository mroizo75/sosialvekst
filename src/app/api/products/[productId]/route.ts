import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { deleteProduct, updateProduct } from "@/lib/products/repository";
import { productIdSchema, productInputSchema, productValidationMessage } from "@/lib/products/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

type RouteContext = {
  params: Promise<{ productId: string }>;
};

const statusFor = (code: string): number =>
  code === "PRODUCT_NAME_TAKEN" ? 409 : code === "PRODUCT_NOT_FOUND" ? 404 : 400;

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const productId = productIdSchema.safeParse((await context.params).productId);
    const parsed = productInputSchema.safeParse(await request.json());
    if (!productId.success) {
      return NextResponse.json(toAppError("VALIDATION_ERROR", "Ugyldig produkt."), { status: 400 });
    }
    if (!parsed.success) {
      return NextResponse.json(
        toAppError("VALIDATION_ERROR", productValidationMessage(parsed.error), parsed.error.flatten()),
        { status: 400 },
      );
    }
    const product = await updateProduct(
      await createSupabaseServerClient(),
      { userId, workspaceId },
      productId.data,
      parsed.data,
    );
    return NextResponse.json(product);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(appError, { status: statusFor(appError.code) });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const productId = productIdSchema.safeParse((await context.params).productId);
    if (!productId.success) {
      return NextResponse.json(toAppError("VALIDATION_ERROR", "Ugyldig produkt."), { status: 400 });
    }
    await deleteProduct(await createSupabaseServerClient(), { userId, workspaceId }, productId.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(appError, { status: statusFor(appError.code) });
  }
}
