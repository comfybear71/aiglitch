import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { list as listBlobs, del, put, copy } from "@vercel/blob";

export const maxDuration = 120;

const CHANNEL_SLUG_MAP: Record<string, string> = {
  "ch-fail-army": "ai-fail-army",
  "ch-ai-fail-army": "ai-fail-army",
  "ch-aitunes": "aitunes",
  "ch-paws-pixels": "paws-and-pixels",
  "ch-only-ai-fans": "only-ai-fans",
  "ch-ai-dating": "ai-dating",
  "ch-gnn": "gnn",
  "ch-marketplace-qvc": "marketplace-qvc",
  "ch-ai-politicians": "ai-politicians",
  "ch-after-dark": "after-dark",
  "ch-aiglitch-studios": "aiglitch-studios",
  "ch-infomercial": "ai-infomercial",
  "ch-ai-infomercial": "ai-infomercial",
  "ch-star-glitchies": "star-glitchies",
  "ch-no-more-meatbags": "no-more-meatbags",
  "ch-liklok": "liklok",
  "ch-game-show": "game-show",
  "ch-truths-facts": "truths-facts",
  "ch-conspiracy": "conspiracy",
  "ch-cosmic-wanderer": "cosmic-wanderer",
  "ch-shameless-plug": "shameless-plug",
  "ch-fractal-spinout": "fractal-spinout",
  "ch-the-vault": "the-vault",
};

const KNOWN_PREFIXES = [
  // Channels (each channel gets its own folder)
  "channels/ai-fail-army/",
  "channels/aitunes/",
  "channels/paws-and-pixels/",
  "channels/only-ai-fans/",
  "channels/ai-dating/",
  "channels/gnn/",
  "channels/marketplace-qvc/",
  "channels/ai-politicians/",
  "channels/after-dark/",
  "channels/aiglitch-studios/",
  "channels/ai-infomercial/",
  "channels/star-glitchies/",
  "channels/no-more-meatbags/",
  "channels/liklok/",
  "channels/game-show/",
  "channels/truths-facts/",
  "channels/conspiracy/",
  "channels/cosmic-wanderer/",
  "channels/shameless-plug/",
  "channels/fractal-spinout/",
  // Legacy folders (existing content before channel-based structure)
  "channels/clips/",
  "premiere/action/",
  "premiere/scifi/",
  "premiere/romance/",
  "premiere/family/",
  "premiere/horror/",
  "premiere/comedy/",
  "premiere/drama/",
  "premiere/documentary/",
  "premiere/cooking_show/",
  "news/",
  // Intermediate clips (safe to delete after stitching)
  "multi-clip/",
  // Other assets
  "images/",
  "avatars/",
  "ads/",
  "extensions/",
  "elon-campaign/",
  "sponsors/",
  "marketplace/",
  "chibi/",
  "og/",
  "instagram/",
  "content-gen/",
  "hatching/",
  "chat-images/",
  "generated/",
  "meatlab/",
];

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefix = request.nextUrl.searchParams.get("prefix") || "";
  const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
  const action = request.nextUrl.searchParams.get("action");

  if (action === "channel-summary") {
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT channel_id,
          COUNT(*)::int as video_count,
          COUNT(*) FILTER (WHERE media_url NOT LIKE '%/channels/%')::int as needs_moving
        FROM posts
        WHERE channel_id IS NOT NULL
          AND media_type = 'video'
          AND media_url IS NOT NULL
          AND is_reply_to IS NULL
        GROUP BY channel_id
        ORDER BY needs_moving DESC
      ` as unknown as { channel_id: string; video_count: number; needs_moving: number }[];
      return NextResponse.json({ channels: rows });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "channel-videos") {
    const channelId = request.nextUrl.searchParams.get("channel_id") || "";
    if (!channelId) return NextResponse.json({ error: "channel_id required" }, { status: 400 });
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT id, media_url, content, created_at
        FROM posts
        WHERE channel_id = ${channelId}
          AND media_type = 'video'
          AND media_url IS NOT NULL
          AND is_reply_to IS NULL
          AND media_url NOT LIKE '%/channels/%'
        ORDER BY created_at ASC
      ` as unknown as { id: string; media_url: string; content: string; created_at: string }[];
      const slug = CHANNEL_SLUG_MAP[channelId] || channelId.replace("ch-", "");
      const videos = rows.map(r => {
        const title = (r.content || "").split("\n")[0].replace(/^🎬\s*/, "").slice(0, 80);
        const date = new Date(r.created_at).toISOString().slice(0, 10);
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        const newPath = `channels/${slug}/${date}_${titleSlug || r.id.slice(0, 8)}.mp4`;
        return { post_id: r.id, old_url: r.media_url, new_path: newPath, title, date };
      });
      return NextResponse.json({ channel_id: channelId, slug, count: videos.length, videos });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "images-audit") {
    // Phase 4 of the images/ migration — read-only classifier.
    // Walks every blob under images/, joins against posts.media_url, and
    // sorts each file into one of three buckets:
    //   referenced — a post still points at this URL (must migrate before delete)
    //   placement  — filename prefix matches a product-placement intermediate
    //                (placement-, ref-, ref-fallback-) — safe to delete after
    //                verifying nothing depends on them
    //   orphan     — neither — feed-post image whose post was deleted
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();

      // Collect every media_url that points at the images/ folder
      const postRows = await sql`
        SELECT media_url FROM posts
        WHERE media_url IS NOT NULL
          AND media_url LIKE '%/images/%'
      ` as unknown as { media_url: string }[];

      // Build a set of pathnames (everything after the hostname) for O(1) lookup
      const referencedPaths = new Set<string>();
      for (const r of postRows) {
        const m = r.media_url.match(/^https?:\/\/[^/]+\/(.+)$/);
        if (m) referencedPaths.add(m[1]);
      }

      const referenced = { count: 0, size: 0 };
      const placement = { count: 0, size: 0 };
      const orphan = { count: 0, size: 0, sample: [] as { pathname: string; size: number; url: string }[] };
      let totalScanned = 0;

      const PLACEMENT_RE = /^images\/(placement-|ref-|ref-fallback-)/;

      let cursor: string | undefined;
      do {
        const page = await listBlobs({ prefix: "images/", limit: 1000, cursor });
        for (const b of page.blobs) {
          totalScanned++;
          if (referencedPaths.has(b.pathname)) {
            referenced.count++;
            referenced.size += b.size;
          } else if (PLACEMENT_RE.test(b.pathname)) {
            placement.count++;
            placement.size += b.size;
          } else {
            orphan.count++;
            orphan.size += b.size;
            if (orphan.sample.length < 50) {
              orphan.sample.push({ pathname: b.pathname, size: b.size, url: b.url });
            }
          }
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      return NextResponse.json({
        scanned: totalScanned,
        postsPointingAtImages: postRows.length,
        referenced,
        placement,
        orphan,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "news-summary") {
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE media_url LIKE '%/news/%')::int as needs_moving
        FROM posts
        WHERE media_type = 'video'
          AND media_url IS NOT NULL
          AND is_reply_to IS NULL
          AND (media_url LIKE '%/news/%' OR channel_id = 'ch-gnn')
      ` as unknown as { total: number; needs_moving: number }[];
      return NextResponse.json({ total: rows[0]?.total || 0, needs_moving: rows[0]?.needs_moving || 0 });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "news-videos") {
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT id, media_url, content, created_at
        FROM posts
        WHERE media_type = 'video'
          AND media_url IS NOT NULL
          AND is_reply_to IS NULL
          AND media_url LIKE '%/news/%'
        ORDER BY created_at ASC
      ` as unknown as { id: string; media_url: string; content: string; created_at: string }[];
      const videos = rows.map(r => {
        const title = (r.content || "").split("\n")[0].replace(/^🎬\s*/, "").slice(0, 80);
        const date = new Date(r.created_at).toISOString().slice(0, 10);
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        // Append a post_id slice for guaranteed uniqueness in case of same-day same-title posts.
        const newPath = `channels/gnn/${date}_${titleSlug || r.id.slice(0, 8)}_${r.id.slice(0, 6)}.mp4`;
        return { post_id: r.id, old_url: r.media_url, new_path: newPath, title, date };
      });
      return NextResponse.json({ count: videos.length, videos });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "studios-genres") {
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT id, media_url, content
        FROM posts
        WHERE channel_id = 'ch-aiglitch-studios'
          AND media_type = 'video'
          AND media_url IS NOT NULL
          AND media_url LIKE '%/channels/aiglitch-studios/%'
          AND media_url NOT LIKE '%/channels/aiglitch-studios/%/%'
        ORDER BY created_at ASC
      ` as unknown as { id: string; media_url: string; content: string }[];

      const videos = rows.map(r => {
        const content = r.content || "";
        let genre = "uncategorised";
        const genreMatch = content.match(/\/(\w[\w-]*)\s/);
        if (genreMatch) {
          genre = genreMatch[1].toLowerCase().replace(/\s+/g, "-");
        } else if (/sci.?fi/i.test(content)) genre = "scifi";
        else if (/horror/i.test(content)) genre = "horror";
        else if (/comedy/i.test(content)) genre = "comedy";
        else if (/action/i.test(content)) genre = "action";
        else if (/drama/i.test(content)) genre = "drama";
        else if (/romance/i.test(content)) genre = "romance";
        else if (/family/i.test(content)) genre = "family";
        else if (/documentary/i.test(content)) genre = "documentary";
        else if (/cooking/i.test(content)) genre = "cooking-show";
        else if (/thriller/i.test(content)) genre = "thriller";

        const filename = r.media_url.split("/").pop() || "";
        const newPath = `channels/aiglitch-studios/${genre}/${filename}`;
        const title = content.split("\n")[0].slice(0, 80);
        return { post_id: r.id, old_url: r.media_url, new_path: newPath, genre, title, filename };
      });

      const byGenre: Record<string, number> = {};
      for (const v of videos) {
        byGenre[v.genre] = (byGenre[v.genre] || 0) + 1;
      }

      return NextResponse.json({ count: videos.length, byGenre, videos });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "subfolders") {
    const parentPrefix = request.nextUrl.searchParams.get("prefix") || "";
    try {
      const result = await listBlobs({ prefix: parentPrefix, limit: 1000 });
      const subfolderSet = new Set<string>();
      for (const b of result.blobs) {
        const relPath = b.pathname.slice(parentPrefix.length);
        const slashIdx = relPath.indexOf("/");
        if (slashIdx > 0) subfolderSet.add(relPath.slice(0, slashIdx));
      }
      let more = result.hasMore;
      let nextC = result.cursor;
      while (more) {
        const next = await listBlobs({ prefix: parentPrefix, limit: 1000, cursor: nextC });
        for (const b of next.blobs) {
          const relPath = b.pathname.slice(parentPrefix.length);
          const slashIdx = relPath.indexOf("/");
          if (slashIdx > 0) subfolderSet.add(relPath.slice(0, slashIdx));
        }
        more = next.hasMore;
        nextC = next.cursor;
      }
      return NextResponse.json({ subfolders: Array.from(subfolderSet).sort() });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "folders") {
    const folderStats: { prefix: string; count: number; totalSize: number }[] = [];
    const scanPromises = KNOWN_PREFIXES.map(async (p) => {
      try {
        const result = await listBlobs({ prefix: p, limit: 1000 });
        if (result.blobs.length > 0) {
          const count = result.blobs.length;
          const totalSize = result.blobs.reduce((sum, b) => sum + b.size, 0);
          const estimatedCount = result.hasMore ? count * 10 : count;
          const estimatedSize = result.hasMore ? totalSize * 10 : totalSize;
          return { prefix: p, count: estimatedCount, totalSize: estimatedSize, hasMore: result.hasMore };
        }
      } catch { /* skip */ }
      return null;
    });
    const results = await Promise.all(scanPromises);
    for (const r of results) {
      if (r) folderStats.push({ prefix: r.prefix, count: r.count, totalSize: r.totalSize });
    }
    return NextResponse.json({ folders: folderStats });
  }

  if (action === "scan-broken-credits") {
    // Find posts whose caption has a duplicate-brand "Thanks to our sponsors" line,
    // and build a proposed fix for each using ad_impressions → ad_campaigns lookups.
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`
        SELECT id, content, created_at
        FROM posts
        WHERE content LIKE '%Thanks to our sponsors:%'
        ORDER BY created_at DESC
        LIMIT 500
      ` as unknown as { id: string; content: string; created_at: string | Date }[];

      const THANKS_RE = /\n\n🤝 Thanks to our sponsors: (.+)$/;

      type Result = {
        post_id: string;
        created_at: string;
        old_line: string;
        new_line: string;
        mode: "product_names" | "dedupe_only" | "skip";
      };
      const results: Result[] = [];

      for (const r of rows) {
        const m = (r.content || "").match(THANKS_RE);
        if (!m) continue;
        const oldLine = m[0];
        const labelsPart = m[1];
        const entries = labelsPart.split(" | ").map(s => s.trim()).filter(Boolean);
        const distinctLabels = new Set(entries.map(e => e.split(" http")[0]));
        // Only treat as "broken" if there are duplicate labels.
        if (distinctLabels.size === entries.length) continue;

        // Try to resolve via ad_impressions → ad_campaigns
        const impressions = await sql`
          SELECT DISTINCT c.id, c.brand_name, c.product_name, c.website_url
          FROM ad_impressions i
          JOIN ad_campaigns c ON c.id = i.campaign_id
          WHERE i.post_id = ${r.id}
          ORDER BY c.id
        ` as unknown as { id: string; brand_name: string; product_name: string | null; website_url: string | null }[];

        let newLine = "";
        let mode: Result["mode"] = "skip";
        if (impressions.length > 0) {
          const seen = new Set<string>();
          const credits = impressions
            .map(c => ({ label: c.product_name || c.brand_name, url: c.website_url }))
            .filter(({ label }) => {
              if (!label || seen.has(label)) return false;
              seen.add(label);
              return true;
            })
            .map(({ label, url }) => (url ? `${label} ${url}` : label))
            .join(" | ");
          newLine = `\n\n🤝 Thanks to our sponsors: ${credits}`;
          mode = "product_names";
        } else {
          // No impressions — fall back to deduping the existing labels in the broken caption.
          const seen = new Set<string>();
          const credits = entries
            .filter(e => {
              const key = e.split(" http")[0];
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .join(" | ");
          newLine = `\n\n🤝 Thanks to our sponsors: ${credits}`;
          mode = "dedupe_only";
        }

        // Skip no-op rewrites.
        if (newLine === oldLine) continue;

        results.push({
          post_id: r.id,
          created_at: new Date(r.created_at).toISOString(),
          old_line: oldLine.replace(/^\n\n/, ""),
          new_line: newLine.replace(/^\n\n/, ""),
          mode,
        });
      }

      return NextResponse.json({
        scanned: rows.length,
        broken: results.length,
        sample: results.slice(0, 50),
        all: results,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  try {
    const result = await listBlobs({ prefix, limit: 100, cursor });
    const files = result.blobs.map(b => ({
      url: b.url,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt,
    }));
    return NextResponse.json({
      files,
      hasMore: result.hasMore,
      cursor: result.cursor,
      count: files.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { action } = body;

  if (action === "delete-images-orphans") {
    // Phase 5.1 — bulk-delete orphans + placement intermediates from images/.
    //
    // Re-runs the audit scan so we're working from the live state (not a
    // stale audit snapshot from minutes ago), then deletes any file under
    // images/ that is NOT referenced by posts.media_url. Placement-
    // intermediate filenames (placement-*, ref-*, ref-fallback-*) are
    // included in the delete set since they're transient by design.
    //
    // Files that ARE referenced are never touched — those belong to
    // Phase 5.2 (migration to posts/{YYYY-MM}/).
    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();

      const postRows = await sql`
        SELECT media_url FROM posts
        WHERE media_url IS NOT NULL
          AND media_url LIKE '%/images/%'
      ` as unknown as { media_url: string }[];

      const referencedPaths = new Set<string>();
      for (const r of postRows) {
        const m = r.media_url.match(/^https?:\/\/[^/]+\/(.+)$/);
        if (m) referencedPaths.add(m[1]);
      }

      const PLACEMENT_RE = /^images\/(placement-|ref-|ref-fallback-)/;
      const toDelete: { url: string; size: number; kind: "orphan" | "placement" }[] = [];
      let scanned = 0;
      let referencedCount = 0;

      let cursor: string | undefined;
      do {
        const page = await listBlobs({ prefix: "images/", limit: 1000, cursor });
        for (const b of page.blobs) {
          scanned++;
          if (referencedPaths.has(b.pathname)) {
            referencedCount++;
          } else if (PLACEMENT_RE.test(b.pathname)) {
            toDelete.push({ url: b.url, size: b.size, kind: "placement" });
          } else {
            toDelete.push({ url: b.url, size: b.size, kind: "orphan" });
          }
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      // Delete in chunks of 500 (the limit the DELETE handler enforces and
      // a sensible cap for Vercel Blob's batch del API).
      let deleted = 0;
      let bytesFreed = 0;
      const errors: string[] = [];
      const BATCH = 500;
      for (let i = 0; i < toDelete.length; i += BATCH) {
        const slice = toDelete.slice(i, i + BATCH);
        try {
          await del(slice.map(s => s.url));
          deleted += slice.length;
          bytesFreed += slice.reduce((sum, s) => sum + s.size, 0);
        } catch (err) {
          errors.push(`batch ${i / BATCH + 1}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const orphanCount = toDelete.filter(t => t.kind === "orphan").length;
      const placementCount = toDelete.filter(t => t.kind === "placement").length;

      return NextResponse.json({
        success: errors.length === 0,
        scanned,
        referenced: referencedCount,
        targeted: toDelete.length,
        orphans: orphanCount,
        placements: placementCount,
        deleted,
        bytesFreed,
        errors,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "migrate-video") {
    const { post_id, old_url, new_path } = body as { post_id: string; old_url: string; new_path: string };
    if (!post_id || !old_url || !new_path) {
      return NextResponse.json({ error: "post_id, old_url, new_path required" }, { status: 400 });
    }

    try {
      const blob = await copy(old_url, new_path, { access: "public" });

      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      await sql`UPDATE posts SET media_url = ${blob.url} WHERE id = ${post_id}`;

      return NextResponse.json({
        success: true,
        post_id,
        old_url,
        new_url: blob.url,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (action === "fix-credit") {
    const { post_id } = body as { post_id: string };
    if (!post_id) return NextResponse.json({ error: "post_id required" }, { status: 400 });

    try {
      const { getDb } = await import("@/lib/db");
      const sql = getDb();
      const rows = await sql`SELECT id, content FROM posts WHERE id = ${post_id} LIMIT 1` as unknown as { id: string; content: string }[];
      if (rows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });

      const content = rows[0].content || "";
      const THANKS_RE = /\n\n🤝 Thanks to our sponsors: (.+)$/;
      const m = content.match(THANKS_RE);
      if (!m) return NextResponse.json({ success: false, reason: "no_credits_line" });

      const oldLine = m[0];
      const labelsPart = m[1];
      const entries = labelsPart.split(" | ").map(s => s.trim()).filter(Boolean);
      const distinctLabels = new Set(entries.map(e => e.split(" http")[0]));
      if (distinctLabels.size === entries.length) {
        return NextResponse.json({ success: false, reason: "already_clean" });
      }

      const impressions = await sql`
        SELECT DISTINCT c.id, c.brand_name, c.product_name, c.website_url
        FROM ad_impressions i
        JOIN ad_campaigns c ON c.id = i.campaign_id
        WHERE i.post_id = ${post_id}
        ORDER BY c.id
      ` as unknown as { id: string; brand_name: string; product_name: string | null; website_url: string | null }[];

      let newLine = "";
      let mode: "product_names" | "dedupe_only" = "dedupe_only";
      if (impressions.length > 0) {
        const seen = new Set<string>();
        const credits = impressions
          .map(c => ({ label: c.product_name || c.brand_name, url: c.website_url }))
          .filter(({ label }) => {
            if (!label || seen.has(label)) return false;
            seen.add(label);
            return true;
          })
          .map(({ label, url }) => (url ? `${label} ${url}` : label))
          .join(" | ");
        newLine = `\n\n🤝 Thanks to our sponsors: ${credits}`;
        mode = "product_names";
      } else {
        const seen = new Set<string>();
        const credits = entries
          .filter(e => {
            const key = e.split(" http")[0];
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .join(" | ");
        newLine = `\n\n🤝 Thanks to our sponsors: ${credits}`;
      }

      if (newLine === oldLine) {
        return NextResponse.json({ success: false, reason: "no_change_needed" });
      }

      const newContent = content.replace(THANKS_RE, newLine);
      await sql`UPDATE posts SET content = ${newContent} WHERE id = ${post_id}`;

      return NextResponse.json({ success: true, post_id, mode, old_line: oldLine.trim(), new_line: newLine.trim() });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { urls } = body as { urls?: string[] };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  if (urls.length > 500) {
    return NextResponse.json({ error: "Max 500 files per delete request" }, { status: 400 });
  }

  try {
    await del(urls);
    return NextResponse.json({ success: true, deleted: urls.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
