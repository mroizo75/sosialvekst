import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const createSchema = z.object({
  productName: z.string().trim().min(1),
  imageUrl: z.string().url(),
  sortOrder: z.number().int().min(0).default(0),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("product_images")
      .select("id, product_name, image_url, sort_order")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("product_name")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        toAppError("PRODUCT_IMAGES_FETCH_FAILED", "Kunne ikke hente produktbilder.", error.message),
        { status: 500 },
      );
    }

    const items = (data ?? []).map((row) => ({
      id: row.id as string,
      productName: row.product_name as string,
      imageUrl: row.image_url as string,
      sortOrder: row.sort_order as number,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      toAppError("PRODUCT_IMAGES_FETCH_FAILED", "Kunne ikke hente produktbilder.", toUnknownAppError(error)),
      { status: 400 },
    );
  }
}

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

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("product_images")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        product_name: parsed.data.productName,
        image_url: parsed.data.imageUrl,
        sort_order: parsed.data.sortOrder,
      })
      .select("id, product_name, image_url, sort_order")
      .single();

    if (error) {
      return NextResponse.json(
        toAppError("PRODUCT_IMAGE_CREATE_FAILED", "Kunne ikke lagre produktbilde.", error.message),
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: data.id,
      productName: data.product_name,
      imageUrl: data.image_url,
      sortOrder: data.sort_order,
    });
  } catch (error) {
    return NextResponse.json(
      toAppError("PRODUCT_IMAGE_CREATE_FAILED", "Kunne ikke lagre produktbilde.", toUnknownAppError(error)),
      { status: 400 },
    );
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

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("product_images")
      .delete()
      .eq("id", parsed.data.id)
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId);

    if (error) {
      return NextResponse.json(
        toAppError("PRODUCT_IMAGE_DELETE_FAILED", "Kunne ikke slette produktbilde.", error.message),
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      toAppError("PRODUCT_IMAGE_DELETE_FAILED", "Kunne ikke slette produktbilde.", toUnknownAppError(error)),
      { status: 400 },
    );
  }
}
