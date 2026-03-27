import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getVideoBalance } from "@/lib/videoCredits";

export async function GET() {
  try {
    const userId = await requireUserId();
    const balance = await getVideoBalance(userId);
    return NextResponse.json(balance);
  } catch (error) {
    const appError = toUnknownAppError(error);
    logger.error("[video/balance] Feil", { error: appError });
    return NextResponse.json(appError, { status: 500 });
  }
}
