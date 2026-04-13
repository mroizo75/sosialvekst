import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  connectSinglePage,
  META_PENDING_PAGES_COOKIE,
  type PendingMetaData,
} from "@/app/api/social/oauth/meta/callback/route";

export async function POST(request: Request) {
  const userId = await requireUserId();
  const workspaceId = await requireWorkspaceId(userId);

  const jar = await cookies();
  const raw = jar.get(META_PENDING_PAGES_COOKIE)?.value;

  if (!raw) {
    return NextResponse.json(
      { code: "SESSION_EXPIRED", message: "Sesjonen har utløpt. Koble til Meta på nytt." },
      { status: 400 },
    );
  }

  let pending: PendingMetaData;
  try {
    pending = JSON.parse(raw) as PendingMetaData;
  } catch {
    jar.delete(META_PENDING_PAGES_COOKIE);
    return NextResponse.json(
      { code: "INVALID_SESSION", message: "Ugyldig sesjonsdata. Koble til Meta på nytt." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { pageId?: string };
  if (!body.pageId) {
    return NextResponse.json(
      { code: "MISSING_PAGE_ID", message: "Velg en Facebook-side." },
      { status: 400 },
    );
  }

  const selectedPage = pending.pages.find((p) => p.id === body.pageId);
  if (!selectedPage) {
    return NextResponse.json(
      { code: "PAGE_NOT_FOUND", message: "Valgt side ble ikke funnet. Koble til Meta på nytt." },
      { status: 400 },
    );
  }

  if (!selectedPage.pageToken) {
    return NextResponse.json(
      {
        code: "NEEDS_REAUTH",
        message: "Denne siden krever ny autorisasjon. Koble til Facebook på nytt og velg denne siden i dialogen.",
        redirectUrl: "/dashboard/koble-meta",
      },
      { status: 400 },
    );
  }

  try {
    const statusMsg = await connectSinglePage(
      userId,
      workspaceId,
      selectedPage,
      pending.tokenExpiresIn,
    );

    jar.delete(META_PENDING_PAGES_COOKIE);

    logger.info("[meta/finalize] Side koblet", {
      userId,
      workspaceId,
      pageId: selectedPage.id,
      pageName: selectedPage.name,
      hasInstagram: Boolean(selectedPage.igId),
    });

    const returnPath = pending.returnPath || "/dashboard";
    const returnUrl = new URL(returnPath, getAppUrl());
    returnUrl.searchParams.set("social_connect", statusMsg);

    return NextResponse.json({ redirectUrl: returnUrl.toString() });
  } catch (error) {
    logger.error("[meta/finalize] Kobling feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return NextResponse.json(
      { code: "CONNECT_FAILED", message: "Kunne ikke koble til. Prøv igjen." },
      { status: 500 },
    );
  }
}
