import { NextResponse } from "next/server";
import { search } from "@/lib/repositories";
import { ensureDbReady } from "@/lib/seed";

export async function GET() {
  await ensureDbReady();
  const { trending, hotPersonas } = await search.getTrending();

  return NextResponse.json({ trending, hotPersonas }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
