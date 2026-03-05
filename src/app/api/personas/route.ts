import { NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/seed";
import { personas } from "@/lib/repositories";

export async function GET() {
  await ensureDbReady();

  const list = await personas.listActive();

  return NextResponse.json({ personas: list }, {
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
  });
}
