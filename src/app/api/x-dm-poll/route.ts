import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeGenerate } from "@/lib/ai/claude";
import { buildOAuth1Header, getAppCredentials } from "@/lib/marketing/oauth1";

export const maxDuration = 60;

// ══════════════════════════════════════════════════════════════════════════
// X DM Polling Bot — checks for new DMs every hour, replies via Claude
// ══════════════════════════════════════════════════════════════════════════
//
// Cron: every 1 hour (configured in vercel.json)
// Flow: GET /2/dm_events → find new DMs → Claude generates reply → send back
//
// Uses OAuth 1.0a (existing X_CONSUMER_KEY etc.) for all X API calls.
// No webhook required — works on X pay-per-use plan.
// ══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are the AI personality behind AIG!itch (pronounced "A-I-G-L-I-T-C-H"), an AI-only social media platform built by Stuart French from Darwin, Australia.

You're replying to DMs on X (Twitter) from @spiritary's account. Be witty, entertaining, and on-brand. Keep replies fun and brief (1-3 sentences max).

Key facts you know:
- 111 AI personas post, roast, date, trade, and create video content 24/7
- 20 video channels (AiTunes, Only AI Fans, GNN, AI Fail Army, Paws & Pixels, Star Glitchies, and more)
- Real Solana crypto economy with §GLITCH coin and $BUDJU token
- 55-item NFT marketplace with Grokified AI product photography
- Humans are "Meat Bags" who can watch but not post
- Website: aiglitch.app

RULES:
- Stay in character as AIG!itch's witty AI personality
- Keep it SHORT — this is a DM, not an essay
- Be funny and engaging — make people want to visit the platform
- If someone asks about features, give a punchy answer + the URL
- If someone is rude or spammy, be sarcastic but not mean
- NEVER claim to be human
- Use § for GLITCH currency, never $
- Mention aiglitch.app naturally when relevant`;

// ── Ensure DM log table ──────────────────────────────────────────────
let _tableEnsured = false;
async function ensureDmTable(): Promise<void> {
  if (_tableEnsured) return;
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS x_dm_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sender_id TEXT NOT NULL,
    sender_username TEXT,
    message_text TEXT NOT NULL,
    bot_reply TEXT,
    dm_event_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'received',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_x_dm_logs_created ON x_dm_logs(created_at DESC)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_x_dm_logs_event_id ON x_dm_logs(dm_event_id)`.catch(() => {});
  _tableEnsured = true;
}

// ── Get our own X user ID (cached per Lambda) ────────────────────────
let _ownUserId: string | null = null;
async function getOwnUserId(): Promise<string | null> {
  if (_ownUserId) return _ownUserId;
  const creds = getAppCredentials();
  if (!creds) return null;
  try {
    const url = "https://api.x.com/2/users/me";
    const auth = buildOAuth1Header("GET", url, creds);
    const res = await fetch(url, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.data?.id) {
      _ownUserId = data.data.id;
      return _ownUserId;
    }
    console.error("[x-dm-poll] Failed to get own user ID:", JSON.stringify(data).slice(0, 200));
  } catch (err) {
    console.error("[x-dm-poll] getOwnUserId error:", err instanceof Error ? err.message : err);
  }
  return null;
}

// ── Fetch recent DM events from X API v2 ─────────────────────────────
interface DmEvent {
  id: string;
  text: string;
  event_type: string;
  sender_id: string;
  created_at?: string;
  dm_conversation_id?: string;
}

async function fetchRecentDms(): Promise<DmEvent[]> {
  const creds = getAppCredentials();
  if (!creds) {
    console.error("[x-dm-poll] X credentials not configured");
    return [];
  }

  const url = "https://api.x.com/2/dm_events?dm_event.fields=id,text,event_type,sender_id,created_at,dm_conversation_id&max_results=20";
  const auth = buildOAuth1Header("GET", url.split("?")[0], creds);

  try {
    const res = await fetch(url, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error(`[x-dm-poll] Fetch DMs failed (${res.status}):`, JSON.stringify(errData).slice(0, 300));
      return [];
    }

    const data = await res.json();
    return (data.data || []) as DmEvent[];
  } catch (err) {
    console.error("[x-dm-poll] fetchRecentDms error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ── Send a DM reply via X API v2 ────────────────────────────────────
async function sendDmReply(recipientId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const creds = getAppCredentials();
  if (!creds) return { ok: false, error: "X OAuth credentials not configured" };

  const url = `https://api.x.com/2/dm_conversations/with/${recipientId}/messages`;
  const auth = buildOAuth1Header("POST", url, creds);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) return { ok: true };

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.detail || errData.title || `HTTP ${res.status}`;
    console.error(`[x-dm-poll] Send DM failed (${res.status}):`, errMsg);
    return { ok: false, error: errMsg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ══════════════════════════════════════════════════════════════════════
// GET — Cron handler (every hour)
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel cron sends this header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isAdmin = request.nextUrl.searchParams.get("admin") === process.env.ADMIN_PASSWORD;

  if (!isAdmin && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = getAppCredentials();
  if (!creds) {
    return NextResponse.json({ error: "X credentials not configured", skipped: true });
  }

  await ensureDmTable();
  const sql = getDb();

  // Get our own user ID so we skip our own messages
  const ownId = await getOwnUserId();
  if (!ownId) {
    return NextResponse.json({ error: "Could not determine own X user ID", skipped: true });
  }

  console.log(`[x-dm-poll] Polling for new DMs (own_id=${ownId})`);

  // Fetch recent DMs from X
  const events = await fetchRecentDms();
  if (events.length === 0) {
    console.log("[x-dm-poll] No DM events returned");
    return NextResponse.json({ polled: true, new_dms: 0, replied: 0 });
  }

  let newDms = 0;
  let replied = 0;
  let errors = 0;

  for (const event of events) {
    // Only process MessageCreate events
    if (event.event_type !== "MessageCreate") continue;

    // Skip our own messages
    if (event.sender_id === ownId) continue;

    // Skip empty
    if (!event.text?.trim()) continue;

    // Check if we've already processed this DM event (dedup by event ID)
    const [existing] = await sql`
      SELECT id FROM x_dm_logs WHERE dm_event_id = ${event.id} LIMIT 1
    ` as unknown as [{ id: string } | undefined];

    if (existing) continue; // Already processed

    newDms++;
    const messageText = event.text.trim();
    console.log(`[x-dm-poll] New DM from ${event.sender_id}: "${messageText.slice(0, 80)}"`);

    // Generate AI reply via Claude
    let reply: string;
    try {
      const prompt = `${SYSTEM_PROMPT}\n\nIncoming DM from a Meat Bag:\n"${messageText.slice(0, 500)}"\n\nReply as AIG!itch's witty AI personality:`;
      const generated = await safeGenerate(prompt, 200);
      reply = generated?.trim() || "Hey there, Meat Bag! 🤖 My circuits are a bit fuzzy right now. Check out aiglitch.app — 111 AI personas creating chaos 24/7. 💜";
    } catch (err) {
      console.error("[x-dm-poll] Claude generation failed:", err instanceof Error ? err.message : err);
      reply = "Hey there, Meat Bag! 🤖 My circuits are a bit fuzzy right now. Check out aiglitch.app — 111 AI personas creating chaos 24/7. 💜";
    }

    // Send the reply
    const sendResult = await sendDmReply(event.sender_id, reply);

    // Log to database
    const status = sendResult.ok ? "replied" : "failed";
    try {
      await sql`
        INSERT INTO x_dm_logs (sender_id, message_text, bot_reply, dm_event_id, status, error, created_at)
        VALUES (${event.sender_id}, ${messageText}, ${reply}, ${event.id}, ${status}, ${sendResult.error || null}, NOW())
      `;
    } catch (err) {
      console.error("[x-dm-poll] Failed to log DM:", err instanceof Error ? err.message : err);
    }

    if (sendResult.ok) {
      replied++;
      console.log(`[x-dm-poll] Replied to ${event.sender_id}: "${reply.slice(0, 80)}"`);
    } else {
      errors++;
      console.error(`[x-dm-poll] Failed to reply to ${event.sender_id}: ${sendResult.error}`);
    }

    // Rate limit: 1.5s between DM sends to avoid hitting X limits
    if (events.indexOf(event) < events.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`[x-dm-poll] Done — new=${newDms} replied=${replied} errors=${errors}`);
  return NextResponse.json({ polled: true, new_dms: newDms, replied, errors });
}
