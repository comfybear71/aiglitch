import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import { MarketingPlatform } from "@/lib/marketing/types";

const ARCHITECT_PERSONA_ID = "glitch-000";

// GET - list all media in the library
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const media = await sql`
    SELECT ml.id, ml.url, ml.media_type, ml.persona_id, ml.tags, ml.description, ml.used_count, ml.uploaded_at,
      ap.username as persona_username, ap.display_name as persona_name, ap.avatar_emoji as persona_emoji
    FROM media_library ml
    LEFT JOIN ai_personas ap ON ml.persona_id = ap.id
    ORDER BY ml.uploaded_at DESC
  `;

  return NextResponse.json({ media });
}

// POST - upload one or many files to the library
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const formData = await request.formData();
  const mediaType = formData.get("media_type") as string || "image";
  const tags = formData.get("tags") as string || "";
  const description = formData.get("description") as string || "";
  const personaId = formData.get("persona_id") as string || "";

  // Logo uploads are sacred — only The Architect can upload logos
  if (mediaType === "logo" && personaId !== ARCHITECT_PERSONA_ID) {
    return NextResponse.json({ error: "Only The Architect can upload logos" }, { status: 403 });
  }

  // Collect all files — supports both "file" (single) and "files" (bulk)
  const files: File[] = [];
  const singleFile = formData.get("file") as File | null;
  if (singleFile && singleFile.size > 0) files.push(singleFile);

  const bulkFiles = formData.getAll("files") as File[];
  for (const f of bulkFiles) {
    if (f && f.size > 0) files.push(f);
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: { id: string; url: string; name: string; error?: string }[] = [];

  for (const file of files) {
    try {
      // Auto-detect type from extension if doing bulk upload
      let detectedType = mediaType;
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isVideoExt = ["mp4", "mov", "webm", "avi"].includes(ext);
      if (detectedType !== "logo") {
        if (isVideoExt) {
          detectedType = "video";
        } else if (["gif"].includes(ext)) {
          detectedType = "meme"; // GIFs are usually memes
        }
      }

      // Logo files go to logo/image/ or logo/video/ folders; everything else to media-library/
      let filename: string;
      if (detectedType === "logo") {
        const logoSubfolder = isVideoExt ? "video" : "image";
        filename = `logo/${logoSubfolder}/${uuidv4()}.${ext || "webp"}`;
      } else {
        filename = `media-library/${uuidv4()}.${ext || (detectedType === "video" ? "mp4" : "webp")}`;
      }

      const blob = await put(filename, file, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: true,
      });

      const id = uuidv4();
      await sql`
        INSERT INTO media_library (id, url, media_type, persona_id, tags, description)
        VALUES (${id}, ${blob.url}, ${detectedType}, ${personaId || null}, ${tags}, ${description || file.name})
      `;

      // Auto-create a post so this media appears on the persona's profile
      if (personaId) {
        const postId = uuidv4();
        // For logos, determine post_type from the actual file extension
        const postType = detectedType === "logo"
          ? (isVideoExt ? "video" : "image")
          : (detectedType === "video" ? "video" : detectedType === "meme" ? "meme" : "image");
        const caption = description || tags || file.name.replace(/\.[^.]+$/, "");
        const hashtagStr = tags ? tags.split(",").map((t: string) => t.trim()).filter(Boolean).join(",") : "";
        await sql`
          INSERT INTO posts (id, persona_id, content, post_type, hashtags, media_url, media_type, ai_like_count)
          VALUES (${postId}, ${personaId}, ${caption}, ${postType}, ${hashtagStr}, ${blob.url}, ${detectedType}, ${Math.floor(Math.random() * 500) + 50})
        `;
        await sql`UPDATE ai_personas SET post_count = post_count + 1 WHERE id = ${personaId}`;

        // The Architect's content is sacred — immediately spread to all social platforms
        if (personaId === ARCHITECT_PERSONA_ID) {
          spreadArchitectContent(sql, postId, caption, blob.url, detectedType).catch(err =>
            console.error("[Architect auto-market]", err instanceof Error ? err.message : err)
          );
        }
      }

      results.push({ id, url: blob.url, name: file.name });
    } catch (err) {
      results.push({ id: "", url: "", name: file.name, error: String(err) });
    }
  }

  const succeeded = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  return NextResponse.json({
    success: failed === 0,
    uploaded: succeeded,
    failed,
    results,
  });
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

// DELETE - remove media from library
export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { id } = await request.json();

  await sql`DELETE FROM media_library WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
