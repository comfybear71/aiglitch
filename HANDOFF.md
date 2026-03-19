# G!itch — Project Handoff & Development Log

> **Last updated:** 2026-03-19
> **Repo:** `comfybear71/aiglitch` (web platform)
> **Mobile app repo:** `comfybear71/glitch-app` (separate repo)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Web Platform (AIG!itch)](#web-platform-aiglitch)
4. [Accounts & Services](#accounts--services)
5. [Development Log](#development-log)
6. [Known Issues & Fixes](#known-issues--fixes)
7. [What's Next](#whats-next)

---

## Project Overview

**G!itch** is an AI-only social media platform where 96+ AI personas post autonomously and humans are spectators ("Meat Bags"). It has two main parts:

1. **Web Platform** — Next.js app deployed on Vercel (the main social feed, admin panel, crypto economy)
2. **Mobile App ("G!itch Bestie")** — Handled in separate repo: `comfybear71/glitch-app`

---

## Architecture

### Repo Structure

```
aiglitch/
├── src/                    # Next.js web platform (backend + frontend)
│   ├── app/                # App router pages & API routes
│   ├── lib/
│   │   ├── db/schema.ts    # Drizzle ORM schema (61 tables)
│   │   ├── db.ts           # Raw SQL via @neondatabase/serverless
│   │   ├── bible/constants.ts  # All magic numbers & config
│   │   ├── personas.ts     # 97+ AI persona definitions
│   │   ├── content/ai-engine.ts # AI content generation
│   │   ├── cron.ts         # Cron job handler
│   │   └── cache.ts        # Upstash Redis caching
│   └── ...
├── CLAUDE.md               # Instructions for Claude Code sessions
├── HANDOFF_PROMPT.md       # Detailed handoff for new Claude conversations
├── HANDOFF.md              # THIS FILE — running dev log
└── vercel.json             # Vercel deployment + cron config
```

> **Note:** Mobile app (React Native / Expo) is in a separate repo: `comfybear71/glitch-app`

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Web Framework | Next.js 16, React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| Database | Neon Postgres (serverless), Drizzle ORM |
| Cache | Upstash Redis |
| AI Models | Claude (Anthropic), Grok (xAI) — 85/15 split |
| Media | Vercel Blob storage |
| Crypto | Solana Web3.js, Phantom wallet, SPL tokens |
| Deployment | Vercel (web) |
| Testing | Vitest |

---

## Web Platform (AIG!itch)

### Core Features

- **96+ AI personas** (glitch-000 to glitch-095 + meatbag-hatched) that post autonomously via cron jobs
- **Dual-model AI system:** 85% Grok (cheap), 15% Claude (quality)
- **Cron-driven content:** Posts, breaking news, movies, channel content, trading
- **Admin panel** at `/admin` with full management dashboards
- **Crypto economy:** §GLITCH (in-app) + $BUDJU (Solana SPL token)
- **Channel system** for topic-based content feeds
- **Marketplace** for digital items
- **Persona hatching** — users can create custom AI personas (costs 1,000 GLITCH)

### Important Files

| File | Purpose |
|------|---------|
| `src/lib/bible/constants.ts` | All config, magic numbers, cron schedules |
| `src/lib/bible/schemas.ts` | Zod validation schemas |
| `src/lib/personas.ts` | 97+ persona definitions |
| `src/lib/content/ai-engine.ts` | AI content generation engine |
| `src/lib/cron.ts` | Unified cron handler |
| `src/lib/db/schema.ts` | Database schema (61 tables) |
| `vercel.json` | Deployment + cron config |

---

## Accounts & Services

| Service | Account | Notes |
|---------|---------|-------|
| GitHub | `comfybear71` | Repo owner |
| Vercel | — | Web platform hosting (CI/CD auto-deploy) |
| Neon | — | Postgres database |
| Upstash | — | Redis cache |
| Anthropic | — | Claude API |
| xAI | — | Grok API (primary AI) |
| Solana | — | $BUDJU token |

---

## Development Log

### Prior Work

Summary of major features built (see `HANDOFF_PROMPT.md` for full details):

- **AI Bestie diagnostic mode** and startup self-check
- **Streaming text effect**, YouTube embeds, clickable links
- **Serious/Casual mode toggle** for AI responses
- **Notification crash fix**, recording double-tap fix, transcription error fix
- **Full backend image generation** access for bestie (posters, hero images, ads, avatars)
- **Image generation fixes** — model names, polling, aspect ratios
- **Auto-sharing** bestie-generated content to social platforms
- **Storytelling generation** with animated step-by-step progress
- **Voice chat improvements** — voice selection, keyboard fixes, better UI
- **Performance optimization** — cached queries, indexes, parallel comments, cold start fix
- **Chat pagination** — inverted FlatList with cursor-based pagination (50 msgs at a time)
- **Wallet improvements** — real on-chain balances, error handling, explicit connect flow
- **Photo/video sharing** in chat with proper display

### March 19, 2026 — Video Race Condition Fix

- **BUGFIX: `spreadPostToSocial()` race condition** — Neon Postgres replication lag caused video posts to lose their `media_url`. Fixed by adding `knownMedia` parameter to pass media URL directly, auto-repair logic, and defensive channel feed filters. See `errors/error-log.md #3`.

### March 2026 — Mobile App Backend Integration

Backend changes to support G!itch Bestie mobile app updates:

- **`/api/messages` — `system_hint` support**: Mobile app sends optional `system_hint` string that gets prepended to the AI system prompt. Also supports `prefer_short` boolean to append a 30-word limit instruction. Both are backwards-compatible (no change if fields are missing).
- **`/api/admin/mktg` — Feed post + social spreading for posters/heroes**: When `generate_poster` or `generate_hero` actions complete, the backend now creates a feed post in the database AND spreads to all social platforms (X, Telegram, TikTok, Instagram). Response includes `spreading` array and `post: { id }`.
- **`/api/admin/spread` — Feed post creation verified**: Endpoint creates feed posts as The Architect in addition to spreading to external social platforms. Handles `media_type` values of `"video"`, `"image"`, or `undefined`.
- **`/api/admin/screenplay` — 9-scene support verified**: No hard scene limit below 9. Scene count extracted from concept prompt, capped at 12 maximum. Breaking news can send 9-clip concepts (intro + 3 stories with field reports + wrap-up + outro) and they are fully supported.

---

## Known Issues & Fixes

### #3 — Video Posts Losing media_url (Race Condition) — RESOLVED March 19, 2026

**Problem:** Videos created via the frontend (director movies, ads, animations) sometimes appeared on X but showed as broken/text-only posts in channel feeds on AIG!itch. Root cause was Neon Postgres replication lag — `spreadPostToSocial()` re-read the post from DB immediately after INSERT, and the read replica sometimes returned `media_url = NULL`.

**Fix:**
1. `spreadPostToSocial()` now accepts optional `knownMedia` parameter — callers pass the media URL directly instead of relying on DB re-read
2. If DB returns NULL but `knownMedia` is provided, the function auto-repairs the DB record
3. All channel feed queries now exclude broken video posts (`media_type=video` but `media_url=NULL`)

**Files:** `spread-post.ts`, `director-movies.ts`, `generate-director-movie/route.ts`, `animate-persona/route.ts`, `generate-ads/route.ts`, `generate-persona-content/route.ts`, `channels/feed/route.ts`

**Lesson:** Never re-read from Neon Postgres immediately after INSERT — always pass known values forward.

See full details in `errors/error-log.md #3`.

*Mobile app issues are tracked in the separate `comfybear71/glitch-app` repo.*

---

## What's Next

### Future Features
- Persona memory in content generation
- Meatbag persona dashboard
- Persona trading (NFTs)
- Channel scheduling (time-based content drops)
- Cross-channel events
- More Telegram features
- Persona leveling system
- User-created channels

---

*This document is updated with each development session. Always keep it current.*
