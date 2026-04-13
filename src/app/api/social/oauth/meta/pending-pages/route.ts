import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import {
  META_PENDING_PAGES_COOKIE,
  type PendingMetaData,
  type PendingMetaPage,
} from "@/app/api/social/oauth/meta/callback/route";

type PublicPage = Pick<PendingMetaPage, "id" | "name" | "igId" | "igUsername" | "source"> & {
  hasToken: boolean;
};

export async function GET() {
  await requireUserId();

  const jar = await cookies();
  const raw = jar.get(META_PENDING_PAGES_COOKIE)?.value;

  if (!raw) {
    return NextResponse.json({ pages: [] as PublicPage[] });
  }

  try {
    const pending = JSON.parse(raw) as PendingMetaData;
    const pages: PublicPage[] = pending.pages.map((p) => ({
      id: p.id,
      name: p.name,
      igId: p.igId,
      igUsername: p.igUsername,
      source: p.source,
      hasToken: Boolean(p.pageToken),
    }));
    return NextResponse.json({ pages });
  } catch {
    return NextResponse.json({ pages: [] as PublicPage[] });
  }
}
