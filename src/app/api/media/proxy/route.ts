import { NextResponse } from "next/server";

const ALLOWED_BASE = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !ALLOWED_BASE || !url.startsWith(ALLOWED_BASE)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const body = upstream.body;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
