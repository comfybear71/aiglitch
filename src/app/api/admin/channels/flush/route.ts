import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateJSON } from "@/lib/ai/claude";

/**
 * GET /api/admin/channels/flush?channel_id=xxx&limit=50&offset=0
 * List posts in a channel for admin review (content management)
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const channel_id = searchParams.get("channel_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    const [channel] = await sql`
      SELECT id, name, slug FROM channels WHERE id = ${channel_id}
    `;
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const posts = await sql`
      SELECT p.id, p.content, p.media_type, p.media_url, p.created_at,
        a.username, a.display_name, a.avatar_emoji
      FROM posts p
      LEFT JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.channel_id = ${channel_id}
        AND p.is_reply_to IS NULL
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`
      SELECT COUNT(*)::int as count FROM posts
      WHERE channel_id = ${channel_id} AND is_reply_to IS NULL
    `;

    return NextResponse.json({
      ok: true,
      channel: channel.name,
      posts: posts.map(p => ({
        id: p.id,
        content: (p.content as string || "").slice(0, 200),
        media_type: p.media_type,
        media_url: p.media_url,
        created_at: p.created_at,
        username: p.username,
        display_name: p.display_name,
        avatar_emoji: p.avatar_emoji,
        broken: p.media_type === "video" && !p.media_url,
      })),
      total: count,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Channel posts list error:", err);
    return NextResponse.json({ error: "Failed to list posts" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/channels/flush — Remove specific posts from a channel
 * Body: { post_ids: string[], delete_post?: boolean }
 * If delete_post is true, permanently deletes. Otherwise just untags from channel.
 */
export async function DELETE(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { post_ids, delete_post = false } = body;

    if (!post_ids || !Array.isArray(post_ids) || post_ids.length === 0) {
      return NextResponse.json({ error: "post_ids array is required" }, { status: 400 });
    }

    if (delete_post) {
      // Permanently delete the posts
      await sql`DELETE FROM posts WHERE id = ANY(${post_ids})`;
    } else {
      // Just untag from channel
      await sql`UPDATE posts SET channel_id = NULL WHERE id = ANY(${post_ids})`;
    }

    return NextResponse.json({ ok: true, count: post_ids.length, action: delete_post ? "deleted" : "untagged" });
  } catch (err) {
    console.error("Channel post remove error:", err);
    return NextResponse.json({ error: "Failed to remove posts" }, { status: 500 });
  }
}

/**
 * POST /api/admin/channels/flush — Remove irrelevant posts from a channel
 * Body: { channel_id: string, dry_run?: boolean }
 *
 * Uses AI to classify each post as relevant or irrelevant to the channel's
 * content rules, then untags irrelevant posts (sets channel_id = NULL).
 */
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { channel_id, dry_run = false } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    // Get channel info
    const [channel] = await sql`
      SELECT id, name, slug, genre, content_rules, description
      FROM channels WHERE id = ${channel_id}
    `;
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const contentRules = typeof channel.content_rules === "string"
      ? JSON.parse(channel.content_rules as string)
      : channel.content_rules;

    // Fetch all posts in this channel
    const posts = await sql`
      SELECT p.id, p.content, p.media_type, p.media_url
      FROM posts p
      WHERE p.channel_id = ${channel_id}
        AND p.is_reply_to IS NULL
      ORDER BY p.created_at DESC
    `;

    if (posts.length === 0) {
      return NextResponse.json({ ok: true, message: "No posts in channel", flushed: 0 });
    }

    // Process in batches of 20 for AI classification
    const BATCH_SIZE = 20;
    const irrelevantIds: string[] = [];
    const relevantIds: string[] = [];

    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);

      const postList = batch.map((p, idx) => {
        const content = (p.content as string || "").split("\n")[0]?.slice(0, 150) || "(no content)";
        const mediaType = p.media_type || "text";
        return `${idx + 1}. [${mediaType}] "${content}"`;
      }).join("\n");

      const prompt = `You are classifying posts for the "${channel.name}" channel.
Channel description: ${channel.description}
Channel genre: ${channel.genre}
Content rules: ${JSON.stringify(contentRules)}

For each post below, decide if it BELONGS in this channel (relevant) or should be REMOVED (irrelevant).
A post is relevant if its content matches the channel's theme/genre/topics.
A post is irrelevant if it's about unrelated topics (e.g. cooking, cats, politics in a music channel).

Posts:
${postList}

Return a JSON array of objects: [{"idx": 1, "relevant": true/false, "reason": "short reason"}]
Only include posts that are IRRELEVANT (relevant: false). If all are relevant, return [].`;

      const results = await generateJSON<Array<{ idx: number; relevant: boolean; reason: string }>>(prompt, 2000);

      if (results && Array.isArray(results)) {
        for (const r of results) {
          if (r.relevant === false && r.idx >= 1 && r.idx <= batch.length) {
            irrelevantIds.push(batch[r.idx - 1].id as string);
          }
        }
      }

      // Everything not flagged is relevant
      for (const p of batch) {
        if (!irrelevantIds.includes(p.id as string)) {
          relevantIds.push(p.id as string);
        }
      }
    }

    // Also flag placeholder/broken posts — posts with no media_url or media_type=video but NULL url
    const placeholderPosts = posts.filter(p => {
      const hasMedia = p.media_url && (p.media_url as string).trim() !== "";
      const brokenVideo = p.media_type === "video" && !hasMedia;
      const noMedia = !hasMedia;
      return brokenVideo || noMedia;
    });
    for (const p of placeholderPosts) {
      if (!irrelevantIds.includes(p.id as string)) {
        irrelevantIds.push(p.id as string);
      }
    }

    // Flush irrelevant + placeholder posts (untag them from this channel)
    let flushed = 0;
    if (!dry_run && irrelevantIds.length > 0) {
      const result = await sql`
        UPDATE posts SET channel_id = NULL
        WHERE id = ANY(${irrelevantIds})
      `;
      flushed = (result as unknown as { count: number }).count ?? irrelevantIds.length;
    }

    return NextResponse.json({
      ok: true,
      channel: channel.name,
      total_posts: posts.length,
      irrelevant: irrelevantIds.length,
      relevant: relevantIds.length,
      flushed: dry_run ? 0 : flushed,
      dry_run,
      irrelevant_ids: irrelevantIds,
    });
  } catch (err) {
    console.error("Channel flush error:", err);
    return NextResponse.json({ error: "Failed to flush channel" }, { status: 500 });
  }
}
