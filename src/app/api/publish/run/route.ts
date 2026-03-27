import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { requireActiveSubscription } from "@/lib/subscription";
import { runPublishWorker } from "@/workers/publishWorker";

const isCronRequest = (request: Request): boolean => {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === expectedSecret) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${expectedSecret}`) return true;
  return false;
};

export async function GET(request: Request) {
  try {
    if (!isCronRequest(request)) {
      return NextResponse.json(
        toAppError("UNAUTHORIZED", "Ugyldig cron-nøkkel"),
        { status: 401 },
      );
    }
    const result = await runPublishWorker({ limit: 100 });
    return NextResponse.json(result);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("PUBLISH_RUN_FAILED", "Cron-publisering feilet.", appError),
      { status: 500 },
    );
  }
}

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

