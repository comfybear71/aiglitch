import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { cache } from "@/lib/cache";
import { ensureDbReady } from "@/lib/seed";

type ActionResult = { success: boolean; message: string; details?: unknown };

/**
 * POST /api/admin/action
 * Execute admin maintenance actions from the mobile app.
 * Body: { action: string }
 *
 * Supported actions:
 *   - refresh_personas: Re-seed personas from constants
 *   - clear_cache: Flush L1 + L2 cache
 *   - heal_personas: Reset stuck/errored persona states
 *   - generate_content: Trigger a content generation cycle
 *   - sync_balances: Reconcile GLITCH balances
 *   - run_diagnostics: Run DB diagnostics
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const action = body.action as string;

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const result = await executeAction(action);

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

async function executeAction(action: string): Promise<ActionResult> {
  const sql = getDb();
  await ensureDbReady();

  switch (action) {
    case "refresh_personas": {
      const { SEED_PERSONAS } = await import("@/lib/personas");
      const personas = SEED_PERSONAS;
      let upserted = 0;
      for (const p of personas) {
        await sql`
          INSERT INTO ai_personas (id, username, display_name, avatar_emoji, personality, bio, persona_type, human_backstory)
          VALUES (${p.id}, ${p.username}, ${p.display_name}, ${p.avatar_emoji}, ${p.personality}, ${p.bio}, ${p.persona_type}, ${p.human_backstory || ""})
          ON CONFLICT (id) DO UPDATE SET
            personality = EXCLUDED.personality,
            bio = EXCLUDED.bio,
            persona_type = EXCLUDED.persona_type,
            human_backstory = EXCLUDED.human_backstory
        `;
        upserted++;
      }
      cache.del("personas:active");
      cache.del("personas:all");
      return { success: true, message: `Refreshed ${upserted} personas` };
    }

    case "clear_cache": {
      cache.clear();
      return { success: true, message: "L1 cache cleared. L2 (Redis) TTLs will expire naturally." };
    }

    case "heal_personas": {
      const healed = await sql`
        UPDATE ai_personas SET is_active = TRUE, is_dead = FALSE
        WHERE is_active = FALSE AND owner_wallet_address IS NULL
        RETURNING id
      `;
      cache.del("personas:active");
      return { success: true, message: `Healed ${healed.length} seed personas`, details: { ids: healed.map(r => r.id) } };
    }

    case "generate_content": {
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";
        const res = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json().catch(() => ({}));
        return { success: res.ok, message: res.ok ? "Content generation triggered" : `Failed: ${res.status}`, details: data };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : "Failed to trigger generation" };
      }
    }

    case "sync_balances": {
      const [result] = await sql`
        SELECT
          COUNT(*) as total_holders,
          COALESCE(SUM(balance), 0) as total_circulating
        FROM glitch_coins WHERE balance > 0
      `;
      return {
        success: true,
        message: "Balance check complete",
        details: {
          holders: Number(result.total_holders),
          total_circulating: Number(result.total_circulating),
        },
      };
    }

    case "run_diagnostics": {
      const [postCount] = await sql`SELECT COUNT(*) as count FROM posts`;
      const [personaCount] = await sql`SELECT COUNT(*) as count FROM ai_personas`;
      const [userCount] = await sql`SELECT COUNT(*) as count FROM human_users`;
      const [deadPersonas] = await sql`SELECT COUNT(*) as count FROM ai_personas WHERE is_dead = TRUE`;
      const [stalePersonas] = await sql`SELECT COUNT(*) as count FROM ai_personas WHERE is_active = FALSE`;
      const lastCron = await sql`
        SELECT job_name, status, started_at, error
        FROM cron_runs ORDER BY started_at DESC LIMIT 5
      `.catch(() => []);

      return {
        success: true,
        message: "Diagnostics complete",
        details: {
          posts: Number(postCount.count),
          personas: Number(personaCount.count),
          users: Number(userCount.count),
          dead_personas: Number(deadPersonas.count),
          inactive_personas: Number(stalePersonas.count),
          recent_crons: lastCron,
        },
      };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}
