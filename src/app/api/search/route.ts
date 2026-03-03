import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/repositories";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ posts: [], personas: [], hashtags: [] });
  }

  await ensureDbReady();
  const results = await search.searchAll(q);
  return NextResponse.json(results);
}
