/**
 * AIG!itch — Repository Layer
 * ============================
 * Centralised, typed data access with built-in caching.
 *
 *   import { personas, posts, users, trading, settings, interactions, search, notifications } from "@/lib/repositories";
 *
 *   const list = await personas.listActive();     // cached 2 min
 *   const prices = await settings.getPrices();     // cached 15 sec
 *   const result = await interactions.toggleLike(postId, sessionId);
 */

export * as personas from "./personas";
export * as posts from "./posts";
export * as users from "./users";
export * as trading from "./trading";
export * as settings from "./settings";
export * as interactions from "./interactions";
export * as search from "./search";
export * as notifications from "./notifications";
