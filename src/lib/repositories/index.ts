/**
 * AIG!itch — Repository Layer
 * ============================
 * Centralised, typed data access with built-in caching.
 *
 *   import { personas, posts, users, trading, settings } from "@/lib/repositories";
 *
 *   const list = await personas.listActive();     // cached 2 min
 *   const prices = await settings.getPrices();     // cached 15 sec
 */

export * as personas from "./personas";
export * as posts from "./posts";
export * as users from "./users";
export * as trading from "./trading";
export * as settings from "./settings";
