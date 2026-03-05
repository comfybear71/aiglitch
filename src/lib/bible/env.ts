/**
 * AIG!itch Project Bible — Environment Configuration
 * ===================================================
 * Zod-validated, typed environment variables with sensible defaults.
 * Import `env` from this module instead of accessing process.env directly.
 *
 * Usage:
 *   import { env } from "@/lib/bible/env";
 *   const key = env.ANTHROPIC_API_KEY;   // string | undefined (optional)
 *   const dbUrl = env.databaseUrl;       // string (guaranteed, throws on boot if missing)
 */

import { z } from "zod/v4";

// ── Schema ───────────────────────────────────────────────────────────

const envSchema = z.object({
  // ── AI API Keys (all optional — features degrade gracefully) ──
  ANTHROPIC_API_KEY:   z.string().optional(),
  XAI_API_KEY:         z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  RAPHAEL_API_KEY:     z.string().optional(),
  KIE_API_KEY:         z.string().optional(),
  PEXELS_API_KEY:      z.string().optional(),

  // ── Database (at least one required) ──
  DATABASE_URL:  z.string().optional(),
  POSTGRES_URL:  z.string().optional(),
  STORAGE_URL:   z.string().optional(),

  // ── Auth & Security ──
  ADMIN_PASSWORD: z.string().default("aiglitch-admin-2024"),
  CRON_SECRET:    z.string().optional(),
  NODE_ENV:       z.enum(["development", "production", "test"]).default("development"),

  // ── Blockchain / Solana ──
  NEXT_PUBLIC_SOLANA_NETWORK:   z.enum(["mainnet-beta", "devnet", "testnet"]).default("mainnet-beta"),
  NEXT_PUBLIC_SOLANA_REAL_MODE: z.string().default("false"),
  NEXT_PUBLIC_SOLANA_RPC_URL:   z.string().optional(),
  HELIUS_API_KEY:               z.string().default(""),

  // ── Token Mints (defaults = live mainnet addresses) ──
  NEXT_PUBLIC_GLITCH_TOKEN_MINT:      z.string().default("5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT"),
  NEXT_PUBLIC_BUDJU_TOKEN_MINT:       z.string().default("2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"),
  NEXT_PUBLIC_TREASURY_WALLET:        z.string().default("7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56"),
  NEXT_PUBLIC_ELONBOT_WALLET:         z.string().default("6VAcB1VvZDgJ54XvkYwmtVLweq8NN8TZdgBV3EPzY6gH"),
  NEXT_PUBLIC_AI_POOL_WALLET:         z.string().default("A1PoOL69420ShArEdWaLLeTfOrAiPeRsOnAs42069"),
  NEXT_PUBLIC_ADMIN_WALLET:           z.string().default("2J2XWm3oZo9JUu6i5ceAsoDmeFZw5trBhjdfm2G72uTJ"),
  NEXT_PUBLIC_MINT_AUTH_WALLET:       z.string().default("6mWQUxNkoPcwPJM7f3fDqMoCRBA6hSqA8uWopDLrtZjo"),
  NEXT_PUBLIC_METEORA_GLITCH_SOL_POOL:z.string().default("GWBsH6aArjdwmX8zUaiPdDke1nA7pLLe9x9b1kuHpsGV"),

  // ── App URL ──
  NEXT_PUBLIC_APP_URL: z.string().default("https://aiglitch.app"),
  VERCEL_URL:          z.string().optional(),

  // ── Private Keys (server-side ONLY — never log or expose) ──
  TREASURY_PRIVATE_KEY:            z.string().optional(),
  METADATA_AUTHORITY_PRIVATE_KEY:  z.string().optional(),
  METADATA_AUTHORITY_MNEMONIC:     z.string().optional(),
  BUDJU_WALLET_SECRET:             z.string().optional(),

  // ── Third-Party ──
  JUPITER_API_KEY:      z.string().default(""),
  BLOB_READ_WRITE_TOKEN:z.string().optional(),

  // ── Redis / Persistent Cache (optional — degrades to in-memory) ──
  UPSTASH_REDIS_REST_URL:   z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // ── OAuth (all optional) ──
  GITHUB_CLIENT_ID:     z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID:     z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TWITTER_CLIENT_ID:    z.string().optional(),
  TWITTER_CLIENT_SECRET:z.string().optional(),

  // ── X/Twitter OAuth 1.0a (for tweet posting & user login) ──
  X_CONSUMER_KEY:        z.string().optional(),
  X_CONSUMER_SECRET:     z.string().optional(),
  X_ACCESS_TOKEN:        z.string().optional(),
  X_ACCESS_TOKEN_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

// ── Parse & Validate ─────────────────────────────────────────────────

function parseEnv(): EnvConfig & { databaseUrl: string; isProduction: boolean; isRealSolana: boolean } {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment configuration:");
    console.error(result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
    throw new Error("Environment validation failed. Check your .env.local file.");
  }

  const data = result.data;

  // Resolve database URL with fallback chain
  // NOTE: On the client side (browser), only NEXT_PUBLIC_* vars exist in process.env.
  // We must not throw here — client components only need the public vars.
  const databaseUrl = data.DATABASE_URL || data.POSTGRES_URL || data.STORAGE_URL || "";
  const isServer = typeof window === "undefined";
  if (isServer && !databaseUrl) {
    throw new Error("Missing database URL. Set DATABASE_URL, POSTGRES_URL, or STORAGE_URL.");
  }

  return {
    ...data,
    databaseUrl,
    isProduction: data.NODE_ENV === "production",
    isRealSolana: data.NEXT_PUBLIC_SOLANA_REAL_MODE === "true" &&
      data.NEXT_PUBLIC_GLITCH_TOKEN_MINT !== "11111111111111111111111111111111",
  };
}

// Lazy singleton — parsed once on first access
let _env: ReturnType<typeof parseEnv> | null = null;

export function getEnv() {
  if (!_env) _env = parseEnv();
  return _env;
}

/** Convenience: pre-parsed env object. Safe to import at module level. */
export const env = new Proxy({} as ReturnType<typeof parseEnv>, {
  get(_, prop: string) {
    return getEnv()[prop as keyof ReturnType<typeof parseEnv>];
  },
});
