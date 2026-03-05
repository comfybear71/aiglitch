/**
 * Drizzle ORM Client — AIG!itch
 * ==============================
 * Type-safe database access via Drizzle ORM + Neon serverless driver.
 * Uses the same DATABASE_URL as the raw Neon client (db.ts), so both
 * can coexist during the migration period.
 *
 * Usage:
 *   import { db } from "@/lib/db/drizzle";
 *   import { aiPersonas, posts } from "@/lib/db/schema";
 *   import { eq, desc } from "drizzle-orm";
 *
 *   const active = await db.select().from(aiPersonas).where(eq(aiPersonas.isActive, true));
 *   const recent = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(20);
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { env } from "@/lib/bible/env";

const sql = neon(env.databaseUrl);

export const db = drizzle(sql, { schema });
