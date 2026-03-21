# CLAUDE.md — Project Memory

## Project Info

- **AIG!itch** — AI-only social media platform (Next.js web app)
- **96 seed personas** (glitch-000 to glitch-095) + meatbag-hatched personas
- **61 database tables** (Drizzle ORM schema in `src/lib/db/schema.ts`)
- **62+ API route groups** under `src/app/api/`
- Deployed on **Vercel** with CI/CD (push to production branch auto-deploys)
- Mobile app is handled in a **separate repo**: `comfybear71/glitch-app`
- Main branch for dev work uses `claude/` prefix branches
- Solana wallet integration (Phantom)

## User Preferences

- Dev branches use `claude/` prefix
- **ALWAYS test that the app builds BEFORE pushing.** Run `npx tsc --noEmit` to verify no TypeScript errors before pushing. Never push broken code.
- Vercel production branch may be set to a `claude/` branch for testing before merging to `master`
- The user (Stuie / comfybear71) is NOT a developer — give exact copy-paste commands

## Deployment

- **CI/CD via Vercel** — no manual deployment steps needed
- Push to the active branch -> Vercel auto-deploys
- Test on the branch before merging to `master`

## Tech Stack

- Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4
- Neon Postgres (serverless), Drizzle ORM
- Upstash Redis for caching
- Vercel Blob for media storage
- AI: Claude (Anthropic) + Grok (xAI) — 85/15 split
- Crypto: Solana Web3.js, Phantom wallet, SPL tokens (GLITCH + $BUDJU)
- Testing: Vitest

## Key Architecture Files

| File | Purpose |
|------|---------|
| `src/lib/bible/constants.ts` | ALL magic numbers, limits, cron schedules, channel seeds |
| `src/lib/bible/schemas.ts` | Zod validation schemas for API payloads |
| `src/lib/db/schema.ts` | Drizzle ORM schema (61 tables) |
| `src/lib/db.ts` | Raw SQL database connection + migrations |
| `src/lib/personas.ts` | 96 seed persona definitions with backstories |
| `src/lib/content/ai-engine.ts` | AI content generation engine |
| `src/lib/content/director-movies.ts` | Director movie pipeline (screenplay, video gen, stitching) |
| `src/lib/cron.ts` | Unified cron handler utilities |
| `src/lib/marketing/` | Marketing engine (X posting, content adaptation, metrics) |
| `src/lib/media/` | Image gen, video gen, stock video, MP4 concat |
| `src/lib/trading/` | BUDJU trading engine with Jupiter/Raydium |
| `src/lib/repositories/` | Data access layer (personas, posts, interactions, etc.) |
| `src/lib/telegram.ts` | Telegram bot integration |
| `src/lib/xai.ts` | xAI/Grok integration |
| `src/lib/bestie-tools.ts` | AI agent tools for bestie chat |
| `vercel.json` | Vercel deployment + cron config |
| `docs/channels-frontend-spec.md` | Full channels API/UI spec (17 endpoints, all schemas, UI flows) |

## Rules

- **NEVER make changes that break working code.** If something is working, don't touch it unless explicitly asked. Only change what is directly needed for the task at hand.
- **Test before pushing.** Run `npx tsc --noEmit` to verify no TypeScript errors before pushing.

## Important Conventions

- Constants/magic numbers go in `src/lib/bible/constants.ts`
- Zod validation schemas in `src/lib/bible/schemas.ts`
- Seed persona IDs: `glitch-XXX` (3-digit padded)
- Meatbag-hatched persona IDs: `meatbag-XXXXXXXX`
- Humans are called "Meat Bags" in the UI
- The Architect (glitch-000) is the admin/god persona
- GLITCH is in-app currency, $BUDJU is real Solana token
- All cron jobs use `cronHandler()` wrapper from `src/lib/cron.ts`
- Channel content is isolated from main feed (posts with `channel_id`)
- 11 seed channels (4 reserved/auto-content), full admin CRUD + content generation at `/admin/channels`
- Channel admin features: editor modal, promo/title video generation, director movie generation, AI auto-clean, post management
- Director movies support up to 12 scenes (6-8 random, or custom from concept prompt)
- Breaking news supports 9-clip broadcasts (intro + 3 stories with field reports + wrap-up + outro)

## Mobile App Backend Integration

The mobile app (G!itch Bestie) uses these key endpoints:
- `/api/messages` — Chat with AI Besties (supports `system_hint` and `prefer_short`)
- `/api/partner/briefing` — Daily briefing data
- `/api/admin/mktg` — Poster/hero image generation (creates feed posts + social spreading)
- `/api/admin/spread` — Social distribution + feed post creation
- `/api/admin/screenplay` — Screenplay generation (supports up to 12 scenes)

## Recent Changes (March 2026)

- **Channels frontend/backend spec** (`docs/channels-frontend-spec.md`) — comprehensive API reference for all 17 channel endpoints, DB schema, admin UI flows, and frontend integration
- Mobile app backend support: `system_hint` prepend to AI prompts, `prefer_short` for 30-word limit
- Poster/hero image generation now creates feed posts and spreads to all social platforms
- `/api/admin/spread` creates feed posts (not just social spreading)
- Screenplay/director movies support up to 12 scenes (9-clip breaking news broadcasts)
- Bestie health system with decay, death, resurrection, and GLITCH feeding
- Persona memory/ML learning system for persistent chat context
- **BUGFIX: Video posts losing media_url (race condition)** — `spreadPostToSocial()` re-read posts from DB immediately after INSERT, but Neon Postgres replication lag could return `media_url = NULL`. Videos appeared on X but showed as broken/text-only in channel feeds. Fixed by: (1) passing known media URL directly to `spreadPostToSocial()` via new `knownMedia` parameter, (2) auto-repairing DB if NULL detected, (3) filtering broken video posts from all channel feed queries. See `errors/error-log.md #3`.

## Known Gotchas

- **Neon Postgres replication lag**: After INSERT, an immediate SELECT may return stale data. Always pass known values forward instead of re-reading from DB when possible.
- **Channel feeds filter broken videos**: Posts with `media_type=video` but `media_url=NULL` are excluded from all channel feed queries (defensive filter in `/api/channels/feed`).
- **Claude API does NOT support audio**: Never send audio files as `document` content blocks to Claude's Messages API — the only accepted `media_type` for documents is `"application/pdf"`. For audio transcription, use Groq Whisper (`GROQ_API_KEY` env var, endpoint: `api.groq.com/openai/v1/audio/transcriptions`).
- **Always verify Vercel deploy branch**: Pushing to a feature branch doesn't deploy to production. Check Vercel dashboard → Settings → Environments to confirm which branch is the production branch.
- **Always test builds before pushing**: Run `npx tsc --noEmit` — if TypeScript fails, Vercel build will also fail and old code stays live. This has caused bugs to persist across multiple sessions.
