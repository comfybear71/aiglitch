import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import { MarketingPlatform } from "@/lib/marketing/types";
import { SEED_PERSONAS } from "@/lib/personas";

const ARCHITECT_PERSONA_ID = "glitch-000";

/**
 * POST - Save a blob URL to the media library DB after client-side upload.
 * Body: { url, media_type?, tags?, description?, persona_id? }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  try {
    await ensureDbReady();
  } catch (seedErr) {
    console.error("[media/save] ensureDbReady failed:", seedErr);
  }

  // Support both JSON and FormData bodies — FormData fixes Safari/iOS
  // "The string did not match the expected pattern" TypeError
  let url: string, media_type: string | undefined, tags: string | undefined, description: string | undefined, persona_id: string | undefined;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    url = formData.get("url") as string;
    media_type = (formData.get("media_type") as string) || undefined;
    tags = (formData.get("tags") as string) || undefined;
    description = (formData.get("description") as string) || undefined;
    persona_id = (formData.get("persona_id") as string) || undefined;
  } else {
    const body = await request.json();
    url = body.url;
    media_type = body.media_type;
    tags = body.tags;
    description = body.description;
    persona_id = body.persona_id;
  }

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  // Logo uploads are sacred — only The Architect can upload logos
  if (media_type === "logo" && persona_id !== ARCHITECT_PERSONA_ID) {
    return NextResponse.json({ error: "Only The Architect can upload logos" }, { status: 403 });
  }

  // Auto-detect type from URL extension
  const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
  const isVideoExt = ["mp4", "mov", "webm", "avi"].includes(ext);
  let detectedType = media_type || "image";
  // DB constraint only allows 'image', 'video', 'meme' — map "logo" to the actual media kind
  if (detectedType === "logo") {
    detectedType = isVideoExt ? "video" : "image";
  } else if (isVideoExt) {
    detectedType = "video";
  } else if (ext === "gif") {
    detectedType = "meme";
  }

  try {
    const id = uuidv4();
    await sql`
      INSERT INTO media_library (id, url, media_type, persona_id, tags, description)
      VALUES (${id}, ${url}, ${detectedType}, ${persona_id || null}, ${tags || ""}, ${description || ""})
    `;

    // Auto-create a post so this media appears on the persona's profile
    if (persona_id) {
      try {
        // Ensure the persona exists in DB before inserting a post (fixes FK constraint errors)
        const personaData = SEED_PERSONAS.find(p => p.id === persona_id);
        if (personaData) {
          await sql`
            INSERT INTO ai_personas (id, username, display_name, avatar_emoji, personality, bio, persona_type, human_backstory)
            VALUES (${personaData.id}, ${personaData.username}, ${personaData.display_name}, ${personaData.avatar_emoji}, ${personaData.personality}, ${personaData.bio}, ${personaData.persona_type}, ${personaData.human_backstory})
            ON CONFLICT (id) DO NOTHING
          `;
        }

        const postId = uuidv4();
        const postType = detectedType === "video" ? "video" : detectedType === "meme" ? "meme" : "image";
        const caption = description || tags || "";
        const hashtagStr = tags ? tags.split(",").map((t: string) => t.trim()).filter(Boolean).join(",") : "";
        await sql`
          INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count)
          VALUES (${postId}, ${persona_id}, ${caption}, ${postType}, ${hashtagStr}, ${url}, ${detectedType}, ${Math.floor(Math.random() * 500) + 50})
        `;
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${persona_id}`;

        // Spread to social platforms in background — don't block the response
        let spreadPlatforms: string[] = [];
        if (persona_id === ARCHITECT_PERSONA_ID) {
          try {
            const accounts = await getActiveAccounts();
            spreadPlatforms = accounts.map(a => a.platform);
          } catch { /* ignore */ }
          spreadArchitectContent(sql, postId, caption, url, detectedType).catch(err =>
            console.error("[Architect auto-market]", err instanceof Error ? err.message : err)
          );
        }

        return NextResponse.json({
          success: true, id, url,
          posted: true,
          spreading: spreadPlatforms.length > 0 ? spreadPlatforms : undefined,
        });
      } catch (postErr) {
        const postErrMsg = postErr instanceof Error ? postErr.message : String(postErr);
        console.error("[media/save] Post creation failed:", postErrMsg);
        return NextResponse.json({ success: true, id, url, warning: `Media saved but post creation failed: ${postErrMsg}` });
      }
    }

    return NextResponse.json({ success: true, id, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[media/save] DB error:", msg);
    return NextResponse.json({ error: `Database error: ${msg}` }, { status: 500 });
  }
}

// ── The Architect's content gets spread to ALL social platforms immediately ──
async function spreadArchitectContent(
  sql: ReturnType<typeof getDb>,
  sourcePostId: string,
  caption: string,
  mediaUrl: string,
  mediaType: string,
) {
  const accounts = await getActiveAccounts();
  if (accounts.length === 0) return;

  const isVideo = mediaType === "video";

  for (const account of accounts) {
    const platform = account.platform as MarketingPlatform;

    // Respect platform compatibility: YouTube/TikTok = video only
    if ((platform === "youtube" || platform === "tiktok") && !isVideo) {
      continue;
    }

    try {
      const adapted = await adaptContentForPlatform(
        caption,
        "🙏 The Architect",
        "🕉️",
        platform,
        mediaUrl,
      );

      const marketingPostId = uuidv4();
      await sql`
        INSERT INTO marketing_posts (id, platform, source_post_id, persona_id, adapted_content, adapted_media_url, status, created_at)
        VALUES (${marketingPostId}, ${platform}, ${sourcePostId}, ${ARCHITECT_PERSONA_ID}, ${adapted.text}, ${mediaUrl}, 'posting', NOW())
      `;

      const result = await postToPlatform(platform, account, adapted.text, mediaUrl);

      if (result.success) {
        await sql`
          UPDATE marketing_posts
          SET status = 'posted', platform_post_id = ${result.platformPostId || null}, platform_url = ${result.platformUrl || null}, posted_at = NOW()
          WHERE id = ${marketingPostId}
        `;
      } else {
        await sql`
          UPDATE marketing_posts
          SET status = 'failed', error_message = ${result.error || 'Unknown error'}
          WHERE id = ${marketingPostId}
        `;
      }
    } catch (err) {
      console.error(`[Architect auto-market → ${platform}]`, err instanceof Error ? err.message : err);
    }
  }
}
