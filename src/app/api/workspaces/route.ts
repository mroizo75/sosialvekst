import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError } from "@/lib/errors";
import {
  createWorkspace,
  getActiveWorkspaceId,
  getWorkspaces,
  setActiveWorkspaceId,
} from "@/lib/workspace";

export async function GET() {
  const userId = await requireUserId();
  const workspaces = await getWorkspaces(userId);
  const activeId = await getActiveWorkspaceId();
  return NextResponse.json({ workspaces, activeId });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function POST(request: Request) {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      toAppError("VALIDATION_ERROR", "Bedriftsnavn er påkrevd"),
      { status: 400 },
    );
  }

  const workspace = await createWorkspace(userId, parsed.data.name);
  await setActiveWorkspaceId(workspace.id);
  return NextResponse.json(workspace, { status: 201 });
}
