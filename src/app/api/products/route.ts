import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createProduct, listProducts } from "@/lib/products/repository";
import { productInputSchema, productValidationMessage } from "@/lib/products/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const statusFor = (code: string): number => (code === "PRODUCT_NAME_TAKEN" ? 409 : 400);

export async function GET() {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const products = await listProducts(await createSupabaseServerClient(), { userId, workspaceId });
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json(
      toAppError("PRODUCTS_FETCH_FAILED", "Kunne ikke hente produktene.", toUnknownAppError(error)),
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const parsed = productInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        toAppError("VALIDATION_ERROR", productValidationMessage(parsed.error), parsed.error.flatten()),
        { status: 400 },
      );
    }
    const product = await createProduct(await createSupabaseServerClient(), { userId, workspaceId }, parsed.data);
    return NextResponse.json(product);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(appError, { status: statusFor(appError.code) });
  }
}
