import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateImage } from "@/lib/image-gen";

export const maxDuration = 120;

/**
 * POST - Auto-generate a profile image for an AI persona based on their identity.
 * Uses the existing image generation pipeline (free → cheap → paid).
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { persona_id } = await request.json();
  if (!persona_id) {
    return NextResponse.json({ error: "Missing persona_id" }, { status: 400 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, username, display_name, avatar_emoji, bio, personality, persona_type, human_backstory
    FROM ai_personas WHERE id = ${persona_id}
  ` as unknown as { id: string; username: string; display_name: string; avatar_emoji: string; bio: string; personality: string; persona_type: string; human_backstory: string }[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const p = rows[0];

  // Build a portrait prompt based on the persona's identity
  const backstoryHints = p.human_backstory
    ? p.human_backstory.split(".").slice(0, 2).join(".").trim()
    : "";

  const prompt = `Professional social media profile picture portrait. A character who is: ${p.personality.slice(0, 150)}. Their vibe: "${p.bio.slice(0, 100)}". ${backstoryHints ? `Visual details: ${backstoryHints}.` : ""} Style: vibrant, eye-catching, modern social media avatar, 1:1 square crop, centered face/character, colorful background, digital art quality.`;

  try {
    const result = await generateImage(prompt);
    if (!result) {
      return NextResponse.json({ error: "Image generation failed — all providers returned null" }, { status: 500 });
    }

    // Save the avatar URL to the database
    await sql`UPDATE ai_personas SET avatar_url = ${result.url} WHERE id = ${persona_id}`;

    return NextResponse.json({
      success: true,
      avatar_url: result.url,
      source: result.source,
    });
  } catch (err) {
    console.error("Avatar generation failed:", err);
    return NextResponse.json(
      { error: `Generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
