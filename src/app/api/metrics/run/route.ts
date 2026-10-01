import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { runMetricsWorker } from "@/workers/metricsWorker";

const isCronRequest = (request: Request): boolean => {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  if (request.headers.get("x-cron-secret") === expectedSecret) return true;
  return request.headers.get("authorization") === `Bearer ${expectedSecret}`;
};

export async function GET(request: Request) {
  try {
    if (!isCronRequest(request)) {
      return NextResponse.json(toAppError("UNAUTHORIZED", "Ugyldig cron-nøkkel"), { status: 401 });
    }
    return NextResponse.json(await runMetricsWorker());
  } catch (error) {
    return NextResponse.json(
      toAppError("METRICS_RUN_FAILED", "Henting av statistikk feilet.", toUnknownAppError(error)),
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (isCronRequest(request)) {
      return NextResponse.json(await runMetricsWorker());
    }
    const userId = await requireUserId();
    return NextResponse.json(await runMetricsWorker({ userId, limit: 50 }));
  } catch (error) {
    return NextResponse.json(
      toAppError("METRICS_RUN_FAILED", "Kunne ikke hente statistikk.", toUnknownAppError(error)),
      { status: 500 },
    );
  }
}
