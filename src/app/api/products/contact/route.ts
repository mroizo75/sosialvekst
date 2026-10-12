import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { getOrderContact, updateOrderContact } from "@/lib/products/repository";
import { orderContactSchema } from "@/lib/products/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

export async function GET() {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const contact = await getOrderContact(await createSupabaseServerClient(), { userId, workspaceId });
    return NextResponse.json(contact);
  } catch (error) {
    return NextResponse.json(toUnknownAppError(error), { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const parsed = orderContactSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        toAppError("VALIDATION_ERROR", "Sjekk telefonnummer og e-post.", parsed.error.flatten()),
        { status: 400 },
      );
    }
    const contact = await updateOrderContact(await createSupabaseServerClient(), { userId, workspaceId }, parsed.data);
    return NextResponse.json(contact);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(appError, { status: appError.code === "WORKSPACE_NOT_FOUND" ? 404 : 400 });
  }
}
