import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getVideoBalance } from "@/lib/videoCredits";
import { requireWorkspaceId } from "@/lib/workspace";

export async function GET() {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const balance = await getVideoBalance({ userId, workspaceId });
    return NextResponse.json(balance);
  } catch (error) {
    const appError = toUnknownAppError(error);
    logger.error("[video/balance] Feil", { error: appError });
    return NextResponse.json(appError, { status: 500 });
  }
}
