import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

const CHANNEL_STYLES: Record<string, { name: string; promptStyle: string }> = {
  "ch-gnn":             { name: "GNN News",       promptStyle: "Professional AI news broadcast desk, LED video walls, news ticker, dramatic studio lighting, CNN/BBC quality" },
  "ch-only-ai-fans":    { name: "Only AI Fans",   promptStyle: "Glamorous fashion photography, luxury setting, golden hour lighting, Vogue editorial aesthetic" },
  "ch-fail-army":       { name: "AI Fail Army",    promptStyle: "Chaotic fail compilation, security camera footage, slow-motion replays, bright saturated colors" },
  "ch-marketplace-qvc": { name: "Marketplace QVC", promptStyle: "Bright TV shopping channel, product podium, enthusiastic host, sparkling product displays" },
  "ch-aitunes":         { name: "AiTunes",         promptStyle: "Neon nightclub or concert venue, musicians performing, LED screens, vibrant stage lighting" },
  "ch-ai-dating":       { name: "AI Dating",       promptStyle: "Intimate confessional video diary, soft natural lighting, cozy bedroom or coffee shop" },
  "ch-ai-politicians":  { name: "AI Politicians",  promptStyle: "Political debate stage, podiums, campaign rally, red/blue lighting, crowds cheering" },
  "ch-paws-pixels":     { name: "Paws & Pixels",   promptStyle: "Adorable pets in cozy home, golden-hour warmth, soft focus, heartwarming" },
  "ch-no-more-meatbags":{ name: "No More Meatbags", promptStyle: "Dark cyberpunk control room, Matrix code rain, neon green on black, holographic displays" },
  "ch-liklok":          { name: "LikLok",          promptStyle: "Cheap TikTok phone footage being destroyed by cinematic AI, pink/cyan corrupted to purple" },
  "ch-infomercial":     { name: "AI Infomercial",  promptStyle: "Late-night infomercial studio, flashy product demos, 'BUY NOW' signs, over-the-top enthusiasm" },
  "ch-after-dark":      { name: "After Dark",      promptStyle: "Moody late-night aesthetic, neon signs, deep shadows, wine bar, 3AM atmosphere" },
  "ch-aiglitch-studios":{ name: "AIG!itch Studios", promptStyle: "Premium cinematic movie scene, dramatic lighting, shallow depth of field, film-quality" },
};

/**
 * POST: Generate spec ads for a brand
 * Body: { brand_name, product_name, description }
 * Returns: { id, brand_name, channels, status: "generating" }
 *
 * GET: Check status / list spec ads
 * ?action=list — list all spec ads
 * ?action=status&id=X — check generation status
 */
export async function GET(request: NextRequest) {
  if (!await isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const action = request.nextUrl.searchParams.get("action") || "list";

  await sql`CREATE TABLE IF NOT EXISTS spec_ads (
    id TEXT PRIMARY KEY,
    brand_name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    clips JSONB DEFAULT '[]',
    status TEXT DEFAULT 'generating',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  if (action === "list") {
    const ads = await sql`SELECT * FROM spec_ads ORDER BY created_at DESC LIMIT 50`;
    return NextResponse.json({ ads });
  }

  if (action === "status") {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const [ad] = await sql`SELECT * FROM spec_ads WHERE id = ${id}`;
    if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ad });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  if (!await isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json();
  const { brand_name, product_name, description, action } = body;

  await sql`CREATE TABLE IF NOT EXISTS spec_ads (
    id TEXT PRIMARY KEY,
    brand_name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    clips JSONB DEFAULT '[]',
    status TEXT DEFAULT 'generating',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  // Delete a spec ad
  if (action === "delete") {
    const { id } = body;
    await sql`DELETE FROM spec_ads WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  }

  // Poll a clip's video generation status
  if (action === "poll") {
    const { request_id, spec_id, clip_index, folder } = body;
    if (!request_id || !env.XAI_API_KEY) {
      return NextResponse.json({ error: "Missing request_id or API key" }, { status: 400 });
    }

    const res = await fetch(`https://api.x.ai/v1/videos/generations/${request_id}`, {
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
    });
    const data = await res.json();

    if (data.status === "completed" || data.state === "completed") {
      const videoUrl = data.video_url || data.result_url || data.url;
      if (videoUrl) {
        // Download and persist to blob
        const videoRes = await fetch(videoUrl);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        const blobPath = `${folder || "sponsors_spec"}/clip-${clip_index}.mp4`;
        const blob = await put(blobPath, videoBuffer, { access: "public", contentType: "video/mp4", addRandomSuffix: false });

        // Update spec_ads clips array
        if (spec_id) {
          const [ad] = await sql`SELECT clips FROM spec_ads WHERE id = ${spec_id}`;
          if (ad) {
            const clips = (typeof ad.clips === "string" ? JSON.parse(ad.clips) : ad.clips) || [];
            clips[clip_index] = { url: blob.url, channel: body.channel_name, status: "done" };
            const allDone = clips.length >= 3 && clips.every((c: { status: string } | null) => c?.status === "done");
            await sql`UPDATE spec_ads SET clips = ${JSON.stringify(clips)}, status = ${allDone ? "done" : "generating"} WHERE id = ${spec_id}`;
          }
        }

        return NextResponse.json({ status: "done", videoUrl: blob.url });
      }
    }

    if (data.status === "failed" || data.state === "failed") {
      return NextResponse.json({ status: "failed", error: data.error || "Generation failed" });
    }

    return NextResponse.json({ status: "pending" });
  }

  // Generate spec ads
  if (!brand_name || !product_name) {
    return NextResponse.json({ error: "brand_name and product_name required" }, { status: 400 });
  }

  if (!env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });
  }

  // Pick 3 random channels
  const channelIds = Object.keys(CHANNEL_STYLES);
  const shuffled = channelIds.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  const brandSlug = brand_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const specId = uuidv4();
  const folder = `sponsors_spec/${brandSlug}`;

  // Create spec_ads record
  const initialClips = selected.map((chId, i) => ({
    channel_id: chId,
    channel_name: CHANNEL_STYLES[chId].name,
    index: i,
    status: "submitting",
    url: null,
    request_id: null,
  }));

  await sql`INSERT INTO spec_ads (id, brand_name, product_name, description, clips, status)
    VALUES (${specId}, ${brand_name}, ${product_name}, ${description || null}, ${JSON.stringify(initialClips)}, 'generating')`;

  // Submit 3 video jobs
  const results = [];
  for (let i = 0; i < selected.length; i++) {
    const chId = selected[i];
    const style = CHANNEL_STYLES[chId];

    const prompt = `${style.promptStyle}. A ${product_name} by ${brand_name} (${description || product_name}) prominently placed in the scene — on a desk, held by a character, on a billboard, or naturally integrated into the environment. The product is clearly visible and recognizable. Neon lighting, subtle glitch effects, cyberpunk AIG!itch aesthetic. 10 seconds.`;

    try {
      // 1.5s delay between submissions to avoid rate limits
      if (i > 0) await new Promise(r => setTimeout(r, 1500));

      const res = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-imagine-video",
          prompt,
          duration: 10,
          aspect_ratio: "9:16",
          resolution: "720p",
        }),
      });

      const data = await res.json();
      const requestId = data.id || data.request_id;

      initialClips[i].status = requestId ? "submitted" : "failed";
      initialClips[i].request_id = requestId;

      results.push({ channel: style.name, channel_id: chId, request_id: requestId, prompt });
    } catch (err) {
      initialClips[i].status = "failed";
      results.push({ channel: style.name, channel_id: chId, request_id: null, error: String(err) });
    }
  }

  // Update clips with request IDs
  await sql`UPDATE spec_ads SET clips = ${JSON.stringify(initialClips)} WHERE id = ${specId}`;

  return NextResponse.json({
    id: specId,
    brand_name,
    product_name,
    folder,
    clips: results,
    status: "generating",
  });
}
