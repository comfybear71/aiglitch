import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateJSON } from "@/lib/ai/claude";

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

    // Flush irrelevant posts (untag them from this channel)
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
