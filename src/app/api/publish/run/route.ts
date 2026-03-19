import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { requireActiveSubscription } from "@/lib/subscription";
import { runPublishWorker } from "@/workers/publishWorker";

const isCronRequest = (request: Request): boolean => {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const received = request.headers.get("x-cron-secret");
  return received === expectedSecret;
};

export async function POST(request: Request) {
  try {
    if (isCronRequest(request)) {
      const result = await runPublishWorker({ limit: 100 });
      return NextResponse.json(result);
    }

    const userId = await requireUserId();
    await requireActiveSubscription(userId);
    const result = await runPublishWorker({ userId, limit: 30 });
    return NextResponse.json(result);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("PUBLISH_RUN_FAILED", "Kunne ikke kjøre publiseringsjobb.", appError),
      { status: 400 },
    );
  }
}

