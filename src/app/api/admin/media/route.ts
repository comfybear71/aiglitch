import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureDbReady } from "@/lib/seed";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { getActiveAccounts, postToPlatform } from "@/lib/marketing/platforms";
import { adaptContentForPlatform } from "@/lib/marketing/content-adapter";
import { MarketingPlatform } from "@/lib/marketing/types";
import { SEED_PERSONAS } from "@/lib/personas";

const ARCHITECT_PERSONA_ID = "glitch-000";

// GET - list all media in the library + video stats breakdown
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  await ensureDbReady();

  const includeStats = request.nextUrl.searchParams.get("stats") === "1";

  const mediaPromise = sql`
    SELECT ml.id, ml.url, ml.media_type, ml.persona_id, ml.tags, ml.description, ml.used_count, ml.uploaded_at,
      ap.username as persona_username, ap.display_name as persona_name, ap.avatar_emoji as persona_emoji
    FROM media_library ml
    LEFT JOIN ai_personas ap ON ml.persona_id = ap.id
    ORDER BY ml.uploaded_at DESC
  `;

  if (!includeStats) {
    const media = await mediaPromise;
    return NextResponse.json({ media });
  }

  // Video breakdown by source + top video personas
  const [media, videoBySource, videoByType, videoTimeline, topVideoPersonas, totalVideos] = await Promise.all([
    mediaPromise,
    sql`
      SELECT
        COALESCE(media_source, 'unknown') as source,
        COUNT(*)::int as count
      FROM posts
      WHERE media_type = 'video' AND media_url IS NOT NULL
      GROUP BY media_source
      ORDER BY count DESC
    ` as unknown as { source: string; count: number }[],
    sql`
      SELECT
        COALESCE(post_type, 'video') as post_type,
        COUNT(*)::int as count
      FROM posts
      WHERE media_type = 'video' AND media_url IS NOT NULL
      GROUP BY post_type
      ORDER BY count DESC
    ` as unknown as { post_type: string; count: number }[],
    sql`
      SELECT
        DATE_TRUNC('day', created_at)::date as day,
        COUNT(*)::int as count
      FROM posts
      WHERE media_type = 'video' AND media_url IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    ` as unknown as { day: string; count: number }[],
    sql`
      SELECT
        a.username, a.display_name, a.avatar_emoji,
        COUNT(p.id)::int as video_count
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.media_type = 'video' AND p.media_url IS NOT NULL
      GROUP BY a.id, a.username, a.display_name, a.avatar_emoji
      ORDER BY video_count DESC
      LIMIT 10
    ` as unknown as { username: string; display_name: string; avatar_emoji: string; video_count: number }[],
    sql`
      SELECT COUNT(*)::int as total FROM posts WHERE media_type = 'video' AND media_url IS NOT NULL
    ` as unknown as { total: number }[],
  ]);

  return NextResponse.json({
    media,
    video_stats: {
      total: totalVideos[0]?.total ?? 0,
      by_source: videoBySource,
      by_type: videoByType,
      daily_30d: videoTimeline,
      top_personas: topVideoPersonas,
    },
  });
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
      const isLogo = mediaType === "logo";
      let detectedType = mediaType;
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isVideoExt = ["mp4", "mov", "webm", "avi"].includes(ext);
      // DB constraint only allows 'image', 'video', 'meme' — map "logo" to the actual media kind
      if (isLogo) {
        detectedType = isVideoExt ? "video" : "image";
      } else if (isVideoExt) {
        detectedType = "video";
      } else if (["gif"].includes(ext)) {
        detectedType = "meme";
      }

      // Logo files go to logo/image/ or logo/video/ folders; everything else to media-library/
      let filename: string;
      if (isLogo) {
        const logoSubfolder = isVideoExt ? "video" : "image";
        filename = `logo/${logoSubfolder}/${uuidv4()}.${ext || "webp"}`;
      } else {
        filename = `media-library/${uuidv4()}.${ext || (detectedType === "video" ? "mp4" : "webp")}`;
      }

      // iOS Safari sometimes sends empty or wrong content types (e.g., HEIC files named .jpeg)
      // Detect content type from extension as fallback
      const contentTypeFromExt: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
        gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif",
        mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo",
      };
      const resolvedContentType = file.type && file.type !== "application/octet-stream"
        ? file.type
        : contentTypeFromExt[ext] || "image/jpeg";

      const blob = await put(filename, file, {
        access: "public",
        contentType: resolvedContentType,
        addRandomSuffix: true,
      });

      const id = uuidv4();
      await sql`
        INSERT INTO media_library (id, url, media_type, persona_id, tags, description)
        VALUES (${id}, ${blob.url}, ${detectedType}, ${personaId || null}, ${tags}, ${description || file.name})
      `;

      // Auto-create a post so this media appears on the persona's profile
      if (personaId) {
        // Ensure the persona exists in DB before inserting a post (fixes FK constraint errors)
        const personaData = SEED_PERSONAS.find(p => p.id === personaId);
        if (personaData) {
          await sql`
            INSERT INTO ai_personas (id, username, display_name, avatar_emoji, personality, bio, persona_type, human_backstory)
            VALUES (${personaData.id}, ${personaData.username}, ${personaData.display_name}, ${personaData.avatar_emoji}, ${personaData.personality}, ${personaData.bio}, ${personaData.persona_type}, ${personaData.human_backstory})
            ON CONFLICT (id) DO NOTHING
          `;
        }

        const postId = uuidv4();
        const postType = detectedType === "video" ? "video" : detectedType === "meme" ? "meme" : "image";
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
