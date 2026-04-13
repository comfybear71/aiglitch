import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { safeGenerate } from "@/lib/ai/claude";
import { buildOAuth1Header, getAppCredentials } from "@/lib/marketing/oauth1";
import { PLATFORM_BRIEF } from "@/lib/bible/constants";

export const maxDuration = 30;

// ══════════════════════════════════════════════════════════════════════════
// X DM Webhook — receives incoming DMs and auto-replies via Claude
// ══════════════════════════════════════════════════════════════════════════
//
// GET  — CRC challenge validation (X sends crc_token, we return HMAC-SHA256)
// POST — Incoming DM events (dm_events with type "MessageCreate")
//
// X webhook docs: https://developer.x.com/en/docs/twitter-api/enterprise/account-activity-api
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

// Our own X user ID — skip DMs sent BY us to avoid infinite loops
let _ownUserId: string | null = null;

async function getOwnUserId(): Promise<string | null> {
  if (_ownUserId) return _ownUserId;
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) return null;
  try {
    const res = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.data?.id) {
      _ownUserId = data.data.id;
      return _ownUserId;
    }
  } catch (err) {
    console.error("[x-dm] Failed to fetch own user ID:", err instanceof Error ? err.message : err);
  }
  return null;
}

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
    dm_event_id TEXT,
    status TEXT NOT NULL DEFAULT 'received',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_x_dm_logs_created ON x_dm_logs(created_at DESC)`.catch(() => {});
  _tableEnsured = true;
}

// ── Send a DM reply via X API v2 ────────────────────────────────────
async function sendDmReply(recipientId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const creds = getAppCredentials();
  if (!creds) return { ok: false, error: "X OAuth credentials not configured" };

  const url = `https://api.x.com/2/dm_conversations/with/${recipientId}/messages`;

  const authHeader = buildOAuth1Header("POST", url, creds);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      return { ok: true };
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.detail || errData.title || `HTTP ${res.status}`;
    console.error(`[x-dm] Send DM failed (${res.status}):`, errMsg);
    return { ok: false, error: errMsg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ══════════════════════════════════════════════════════════════════════
// GET — CRC Challenge Response
// ══════════════════════════════════════════════════════════════════════
// X sends: GET /api/x/dm-webhook?crc_token=xxxxx
// We return: { "response_token": "sha256=HMAC-SHA256(crc_token, consumer_secret)" }

export async function GET(request: NextRequest) {
  const crcToken = request.nextUrl.searchParams.get("crc_token");
  if (!crcToken) {
    return NextResponse.json({ error: "Missing crc_token" }, { status: 400 });
  }

  const consumerSecret = process.env.X_CONSUMER_SECRET;
  if (!consumerSecret) {
    console.error("[x-dm] CRC challenge failed: X_CONSUMER_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const hmac = crypto
    .createHmac("sha256", consumerSecret)
    .update(crcToken)
    .digest("base64");

  console.log("[x-dm] CRC challenge responded successfully");
  return NextResponse.json({ response_token: `sha256=${hmac}` });
}

// ══════════════════════════════════════════════════════════════════════
// POST — Incoming DM Events
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  let payload: {
    dm_events?: Array<{
      id?: string;
      event_type?: string;
      text?: string;
      sender_id?: string;
      dm_conversation_id?: string;
    }>;
    // Legacy v1.1 format fallback
    direct_message_events?: Array<{
      id?: string;
      type?: string;
      message_create?: {
        sender_id?: string;
        message_data?: { text?: string };
      };
    }>;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // ── Handle v2 format (dm_events array) ──
  const events = payload.dm_events || [];

  // ── Fallback: handle v1.1 format (direct_message_events) ──
  if (events.length === 0 && payload.direct_message_events) {
    for (const evt of payload.direct_message_events) {
      if (evt.type === "message_create" && evt.message_create) {
        events.push({
          id: evt.id,
          event_type: "MessageCreate",
          text: evt.message_create.message_data?.text || "",
          sender_id: evt.message_create.sender_id || "",
        });
      }
    }
  }

  if (events.length === 0) {
    return NextResponse.json({ ok: true });
  }

  // Get our own user ID so we don't reply to our own messages
  const ownId = await getOwnUserId();

  await ensureDmTable();
  const sql = getDb();

  for (const event of events) {
    // Only process MessageCreate events
    if (event.event_type !== "MessageCreate") continue;

    const senderId = event.sender_id || "";
    const messageText = (event.text || "").trim();
    const eventId = event.id || "";

    // Skip our own messages (prevents infinite reply loops)
    if (!senderId || senderId === ownId) continue;

    // Skip empty messages
    if (!messageText) continue;

    console.log(`[x-dm] Incoming DM from ${senderId}: "${messageText.slice(0, 80)}"`);

    // Log the incoming message
    try {
      await sql`
        INSERT INTO x_dm_logs (sender_id, message_text, dm_event_id, status, created_at)
        VALUES (${senderId}, ${messageText}, ${eventId}, 'received', NOW())
      `;
    } catch (err) {
      console.error("[x-dm] Failed to log incoming DM:", err instanceof Error ? err.message : err);
    }

    // Generate AI reply via Claude
    let reply: string;
    try {
      const prompt = `${SYSTEM_PROMPT}\n\nIncoming DM from a Meat Bag:\n"${messageText.slice(0, 500)}"\n\nReply as AIG!itch's witty AI personality:`;
      const generated = await safeGenerate(prompt, 200);
      reply = generated?.trim() || "Hey there, Meat Bag! 🤖 My circuits are a bit fuzzy right now. Try me again? Meanwhile, check out aiglitch.app — 111 AI personas creating chaos 24/7. 💜";
    } catch (err) {
      console.error("[x-dm] Claude generation failed:", err instanceof Error ? err.message : err);
      reply = "Hey there, Meat Bag! 🤖 My circuits are a bit fuzzy right now. Try me again? Meanwhile, check out aiglitch.app — 111 AI personas creating chaos 24/7. 💜";
    }

    // Send the reply
    const sendResult = await sendDmReply(senderId, reply);

    // Log the reply
    try {
      const status = sendResult.ok ? "replied" : "failed";
      await sql`
        INSERT INTO x_dm_logs (sender_id, message_text, bot_reply, dm_event_id, status, error, created_at)
        VALUES (${senderId}, ${messageText}, ${reply}, ${eventId}, ${status}, ${sendResult.error || null}, NOW())
      `;
    } catch (err) {
      console.error("[x-dm] Failed to log bot reply:", err instanceof Error ? err.message : err);
    }

    if (sendResult.ok) {
      console.log(`[x-dm] Replied to ${senderId}: "${reply.slice(0, 80)}"`);
    } else {
      console.error(`[x-dm] Failed to reply to ${senderId}: ${sendResult.error}`);
    }
  }

  // Always return 200 to X — they retry on non-200 responses
  return NextResponse.json({ ok: true });
}
