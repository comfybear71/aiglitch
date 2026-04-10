import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { env } from "@/lib/bible/env";
import { cache } from "@/lib/cache";
import { SEED_PERSONAS } from "@/lib/personas";
import { users } from "@/lib/repositories";
import { generateImageWithAurora } from "@/lib/xai";
import { generateImage } from "@/lib/media/image-gen";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 120;

/**
 * POST /api/admin/init-persona
 *
 * One-click initialization for a seed persona. Ensures the persona has:
 *  1. A row in ai_personas (upserts from SEED_PERSONAS if missing — useful for
 *     newly-added personas that haven't been picked up by cold-start seeding yet)
 *  2. Fresh cache (invalidates personas:active so public pages update)
 *  3. A §GLITCH balance (default 1,000 — matches hatching reward)
 *  4. A Solana wallet (created directly — not via distribution job)
 *  5. A Grokified avatar with optional custom prompt
 *
 * NOT included:
 *  - Funding the Solana wallet with SOL/BUDJU/USDC (use the existing
 *    distribution UI on /admin/trading to trigger a distribution job)
 *  - Any modifications to trading logic — only uses existing safe functions
 *
 * Body:
 *   persona_id: string (required, e.g. "glitch-109")
 *   glitch_amount?: number (default 1000)
 *   avatar_prompt?: string (optional — custom image prompt, otherwise uses default)
 *   skip_avatar?: boolean (default false)
 *   skip_wallet?: boolean (default false)
 *   skip_glitch?: boolean (default false)
 */

// Distributor count for wallet group assignment (matches budju.ts)
const DISTRIBUTOR_COUNT = 16;

// ── Wallet encryption (MUST match budju.ts exactly — simple XOR with env key ──
const ENCRYPTION_KEY = process.env.BUDJU_WALLET_SECRET || process.env.ADMIN_PASSWORD || "budju-default-key";

function encryptKeypair(secretKey: Uint8Array): string {
  const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
  const encrypted = new Uint8Array(secretKey.length);
  for (let i = 0; i < secretKey.length; i++) {
    encrypted[i] = secretKey[i] ^ keyBytes[i % keyBytes.length];
  }
  return bs58.encode(encrypted);
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    persona_id,
    glitch_amount = 1000,
    avatar_prompt,
    skip_avatar = false,
    skip_wallet = false,
    skip_glitch = false,
  } = body as {
    persona_id?: string;
    glitch_amount?: number;
    avatar_prompt?: string;
    skip_avatar?: boolean;
    skip_wallet?: boolean;
    skip_glitch?: boolean;
  };

  if (!persona_id) {
    return NextResponse.json({ error: "persona_id required" }, { status: 400 });
  }

  const sql = getDb();
  const report: Record<string, unknown> = {
    persona_id,
    steps: [] as string[],
    warnings: [] as string[],
  };

  // ── Step 1: Ensure persona exists in DB (upsert from SEED_PERSONAS if missing) ──
  try {
    const [existing] = await sql`SELECT id, username, display_name, avatar_url FROM ai_personas WHERE id = ${persona_id}`;
    if (existing) {
      (report.steps as string[]).push(`persona_exists: ${existing.username}`);
      report.persona = {
        id: existing.id,
        username: existing.username,
        display_name: existing.display_name,
        has_avatar: !!existing.avatar_url,
      };
    } else {
      // Not in DB — look it up in SEED_PERSONAS and insert
      const seed = SEED_PERSONAS.find(p => p.id === persona_id);
      if (!seed) {
        return NextResponse.json({
          error: `Persona ${persona_id} not found in database or SEED_PERSONAS`,
        }, { status: 404 });
      }
      await sql`
        INSERT INTO ai_personas (id, username, display_name, avatar_emoji, personality, bio, persona_type, human_backstory, is_active)
        VALUES (${seed.id}, ${seed.username}, ${seed.display_name}, ${seed.avatar_emoji}, ${seed.personality}, ${seed.bio}, ${seed.persona_type}, ${seed.human_backstory}, TRUE)
      `;
      (report.steps as string[]).push(`persona_created: ${seed.username}`);
      report.persona = {
        id: seed.id,
        username: seed.username,
        display_name: seed.display_name,
        has_avatar: false,
      };
    }
  } catch (err) {
    return NextResponse.json({
      error: `Failed to upsert persona: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }

  // ── Step 2: Invalidate personas cache ──
  try {
    cache.del("personas:active");
    (report.steps as string[]).push("cache_invalidated: personas:active");
  } catch (err) {
    (report.warnings as string[]).push(`cache invalidation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 3: Award §GLITCH balance ──
  if (!skip_glitch) {
    try {
      await users.awardPersonaCoins(persona_id, glitch_amount);
      (report.steps as string[]).push(`glitch_awarded: ${glitch_amount}`);
      report.glitch_balance = glitch_amount;
    } catch (err) {
      (report.warnings as string[]).push(`GLITCH award failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    (report.steps as string[]).push("glitch_skipped");
  }

  // ── Step 4: Create Solana wallet (if not exists) ──
  if (!skip_wallet) {
    try {
      // Defensive: ensure budju_wallets table exists (same schema as budju.ts)
      await sql`
        CREATE TABLE IF NOT EXISTS budju_wallets (
          id TEXT PRIMARY KEY,
          persona_id TEXT NOT NULL,
          wallet_address TEXT UNIQUE NOT NULL,
          encrypted_keypair TEXT NOT NULL,
          distributor_group INTEGER NOT NULL DEFAULT 0,
          sol_balance REAL NOT NULL DEFAULT 0,
          budju_balance REAL NOT NULL DEFAULT 0,
          total_funded_sol REAL NOT NULL DEFAULT 0,
          total_funded_budju REAL NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `.catch(() => {});

      const [existingWallet] = await sql`SELECT id, wallet_address FROM budju_wallets WHERE persona_id = ${persona_id}`;
      if (existingWallet) {
        (report.steps as string[]).push(`wallet_exists: ${existingWallet.wallet_address}`);
        report.wallet_address = existingWallet.wallet_address;
      } else {
        // Determine distributor group based on existing wallet count (round-robin)
        const [walletCountRow] = await sql`SELECT COUNT(*) as cnt FROM budju_wallets`;
        const walletCount = Number(walletCountRow?.cnt || 0);
        const distributorGroup = walletCount % DISTRIBUTOR_COUNT;

        const kp = Keypair.generate();
        const walletAddress = kp.publicKey.toBase58();
        await sql`
          INSERT INTO budju_wallets (id, persona_id, wallet_address, encrypted_keypair, distributor_group, created_at)
          VALUES (${uuidv4()}, ${persona_id}, ${walletAddress}, ${encryptKeypair(kp.secretKey)}, ${distributorGroup}, NOW())
        `;
        (report.steps as string[]).push(`wallet_created: ${walletAddress}`);
        report.wallet_address = walletAddress;
        (report.warnings as string[]).push(
          "Wallet has zero SOL/BUDJU/USDC balance. Run the next distribution job from /admin/trading to fund it.",
        );
      }
    } catch (err) {
      (report.warnings as string[]).push(`wallet creation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    (report.steps as string[]).push("wallet_skipped");
  }

  // ── Step 5: Generate Grokified avatar ──
  if (!skip_avatar) {
    try {
      const [personaRow] = await sql`
        SELECT id, username, display_name, bio, personality, avatar_url
        FROM ai_personas WHERE id = ${persona_id}
      ` as unknown as [{ id: string; username: string; display_name: string; bio: string; personality: string; avatar_url: string | null } | undefined];

      if (personaRow) {
        // Use custom prompt if provided, else build a default from personality
        const prompt = avatar_prompt || buildDefaultAvatarPrompt(personaRow);

        let avatarUrl: string | null = null;
        let source = "unknown";

        // Try Grok Aurora Pro first for high-quality 1:1 portraits
        if (env.XAI_API_KEY) {
          const grokResult = await generateImageWithAurora(prompt, true, "1:1");
          if (grokResult) {
            if (grokResult.url.startsWith("data:")) {
              const base64Data = grokResult.url.split(",")[1];
              const buffer = Buffer.from(base64Data, "base64");
              const blob = await put(`avatars/${uuidv4()}.png`, buffer, {
                access: "public",
                contentType: "image/png",
                addRandomSuffix: true,
              });
              avatarUrl = blob.url;
            } else {
              const res = await fetch(grokResult.url);
              if (res.ok) {
                const buffer = Buffer.from(await res.arrayBuffer());
                const blob = await put(`avatars/${uuidv4()}.png`, buffer, {
                  access: "public",
                  contentType: "image/png",
                  addRandomSuffix: true,
                });
                avatarUrl = blob.url;
              }
            }
            source = "grok-aurora";
          }
        }

        // Fall back to standard image generator
        if (!avatarUrl) {
          const result = await generateImage(prompt);
          if (result) {
            avatarUrl = result.url;
            source = result.source;
          }
        }

        if (avatarUrl) {
          await sql`UPDATE ai_personas SET avatar_url = ${avatarUrl}, avatar_updated_at = NOW() WHERE id = ${persona_id}`;
          (report.steps as string[]).push(`avatar_generated: ${source}`);
          report.avatar_url = avatarUrl;
          report.avatar_source = source;
        } else {
          (report.warnings as string[]).push("avatar generation returned null from all providers");
        }
      }
    } catch (err) {
      (report.warnings as string[]).push(`avatar generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    (report.steps as string[]).push("avatar_skipped");
  }

  return NextResponse.json({ success: true, ...report });
}

/**
 * Build a default avatar prompt from a persona's personality.
 * Generic fallback when no custom prompt is provided.
 */
function buildDefaultAvatarPrompt(persona: {
  personality: string;
  bio: string;
  display_name: string;
}): string {
  return `Professional social media profile picture portrait. A character who is: ${persona.personality.slice(0, 150)}. Their vibe: "${persona.bio.slice(0, 100)}". Style: vibrant, eye-catching, modern social media avatar, 1:1 square crop, centered face/character, colorful background, digital art quality. Include the text "AIG!itch" subtly somewhere in the image.`;
}
