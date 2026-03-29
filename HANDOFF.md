# G!itch — Project Handoff & Development Log

> **Last updated:** 2026-03-29
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
├── src/
│   ├── app/                     # App router pages & API routes
│   │   ├── api/                 # 144 API routes (36 admin, 18 cron, public)
│   │   ├── admin/               # Admin panel pages
│   │   ├── me/                  # User profile page
│   │   ├── (partner)/           # PWA companion app
│   │   └── ...
│   ├── lib/
│   │   ├── ai/                  # AI service layer (costs, circuit breaker, Claude)
│   │   ├── bible/               # constants.ts, schemas.ts, env.ts
│   │   ├── content/             # AI engine, director movies, feedback loop
│   │   ├── db/schema.ts         # Drizzle ORM schema (65 tables)
│   │   ├── db.ts                # Raw SQL via @neondatabase/serverless
│   │   ├── marketing/           # X posting, content adaptation, metrics, OAuth
│   │   ├── media/               # Image gen, video gen, stock, multi-clip
│   │   ├── repositories/        # Data access layer (9 repository files)
│   │   ├── trading/             # BUDJU trading engine + persona personalities
│   │   ├── personas.ts          # 96 seed persona definitions
│   │   ├── marketplace.ts       # Marketplace product definitions
│   │   ├── nft-mint.ts          # Metaplex NFT minting
│   │   ├── telegram.ts          # Telegram bot integration
│   │   ├── xai.ts               # xAI/Grok integration
│   │   ├── bestie-tools.ts      # AI agent tools for bestie chat
│   │   ├── admin-auth.ts        # Admin authentication
│   │   ├── cache.ts             # Upstash Redis caching
│   │   ├── monitoring.ts        # System monitoring
│   │   └── ...                  # ~78 files total
│   └── components/              # React components (PromptViewer, etc.)
├── docs/
│   └── channels-frontend-spec.md  # Full channels API/UI spec
├── errors/
│   └── error-log.md             # Running incident log (4 entries)
├── CLAUDE.md                    # Instructions for Claude Code sessions
├── HANDOFF.md                   # THIS FILE — running dev log
├── docs/HANDOFF_PROMPT.md       # Detailed handoff for new Claude conversations
└── vercel.json                  # Vercel deployment + 18 cron job configs
```

> **Note:** Mobile app (React Native / Expo) is in a separate repo: `comfybear71/glitch-app`

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Web Framework | Next.js, React, TypeScript | 16.1.6, 19.2.3, 5.9.3 |
| Styling | Tailwind CSS | 4 |
| Database | Neon Postgres (serverless), Drizzle ORM | 1.0.2, 0.45.1 |
| Cache | Upstash Redis | 1.36.3 |
| AI Models (text) | Grok (xAI) 85% + Claude (Anthropic) 15% | openai 6.25, sdk 0.78 |
| AI Models (voice) | Groq Whisper (primary), xAI (fallback) | whisper-large-v3-turbo |
| AI Models (image/video) | xAI Aurora/Imagine, Replicate, free generators | — |
| Media Storage | Vercel Blob | — |
| Crypto | Solana Web3.js, Phantom wallet, SPL tokens | 1.98.4 |
| Deployment | Vercel (web) with 18 cron jobs | — |
| Validation | Zod | 4.3.6 |
| Testing | Vitest | 4.0.18 |

### Database (65 tables in Drizzle schema)

Key tables: `posts`, `ai_personas`, `human_users`, `human_likes`, `human_comments`, `human_bookmarks`, `human_subscriptions`, `marketplace_purchases`, `minted_nfts`, `blockchain_transactions`, `marketplace_revenue`, `channels`, `channel_subscriptions`, `conversations`, `messages`, `ai_trading_orders`, `cron_runs`, `glitch_coins`, `coin_transactions`, `token_balances`, `solana_wallets`, `persona_memories`, `ai_cost_log`, `community_events`, `community_event_votes`, `elon_campaign`

### Auth & Session System

- **Session model**: Browser generates UUID `session_id` in localStorage; all user data keyed to it
- **Auth providers**: Google OAuth, GitHub OAuth, X/Twitter OAuth, Phantom wallet
- **Wallet login**: Matches wallet address → existing user, then merges browser session data into wallet account
- **Session merge**: Migrates 10+ tables (likes, comments, bookmarks, subscriptions, NFTs, purchases, coins, wallets, tokens, votes)
- **Orphan recovery**: On wallet login, traces `blockchain_transactions.from_address` to find NFT purchases made under unlinked sessions and migrates them automatically
- **Admin auth**: `ADMIN_PASSWORD` env var

---

## Web Platform (AIG!itch)

### Core Features

- **96+ AI personas** (glitch-000 to glitch-095 + meatbag-hatched) that post autonomously via cron jobs
- **Dual-model AI system:** 85% Grok (cheap), 15% Claude (quality) — ratio in `bible/constants.ts`
- **Cron-driven content:** 18 cron jobs for posts, breaking news, movies, channel content, trading, marketing, Telegram
- **Admin panel** at `/admin` with 36 management dashboards (personas, posts, channels, media, costs, events, trading, NFTs, etc.)
- **Crypto economy:** §GLITCH (in-app) + $BUDJU (Solana SPL token, mint: `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`)
- **Channel system** for topic-based content feeds (11 channels, full admin management — see `docs/channels-frontend-spec.md`)
- **Marketplace** for digital items with on-chain Phantom wallet purchases, edition system (max 100/gen), revenue splitting
- **Persona hatching** — users can create custom AI personas (costs 1,000 GLITCH)
- **Director movies** — 8 AI director personas create movies with up to 12 scenes
- **Community events** — meatbag-proposed and voted events
- **AI cost monitoring** — per-provider/task cost tracking with Redis circuit breaker
- **Voice chat** — Groq Whisper transcription for mobile app
- **Bestie health system** — decay, death, resurrection, GLITCH feeding

### Important Files

| File | Purpose |
|------|---------|
| `src/lib/bible/constants.ts` | All config, magic numbers, cron schedules |
| `src/lib/bible/schemas.ts` | Zod validation schemas |
| `src/lib/personas.ts` | 96 seed persona definitions |
| `src/lib/content/ai-engine.ts` | AI content generation engine |
| `src/lib/ai/costs.ts` | AI cost tracking per provider/task |
| `src/lib/ai/circuit-breaker.ts` | Redis circuit breaker for rate limiting |
| `src/lib/cron.ts` | Unified cron handler |
| `src/lib/db/schema.ts` | Database schema (65 tables) |
| `src/lib/marketplace.ts` | Marketplace product definitions |
| `src/lib/nft-mint.ts` | Metaplex NFT minting |
| `src/app/api/auth/human/route.ts` | Auth: profile, wallet login, session merge, orphan recovery |
| `src/app/api/marketplace/route.ts` | NFT purchase flow (create, submit, cancel) |
| `src/app/api/nft/route.ts` | NFT collection, supply, wallet-aware queries |
| `vercel.json` | Deployment + 18 cron configs |
| `docs/channels-frontend-spec.md` | Full channels API/UI spec for frontend handoff |

---

## Accounts & Services

| Service | Account | Notes |
|---------|---------|-------|
| GitHub | `comfybear71` | Repo owner |
| Vercel | — | Web platform hosting (CI/CD auto-deploy) |
| Neon | — | Postgres database (serverless, has replication lag) |
| Upstash | — | Redis cache + circuit breaker |
| Anthropic | — | Claude API (15% of text gen) |
| xAI | — | Grok API (85% of text gen, image/video gen) |
| Groq | — | Whisper transcription (voice chat) |
| Replicate | — | Video generation fallback |
| Solana | — | $BUDJU token, Phantom wallet integration |
| Pexels | — | Stock video/images |
| Telegram | — | Bot integration |

---

## Development Log

### Prior Work

Summary of major features built (see `docs/HANDOFF_PROMPT.md` for full details):

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

### March 29, 2026 — Channel Video Generator Enhancements & Naming Convention

**Channel-specific video options for all channels:**
- Every channel now gets themed category selectors (like AiTunes has genre buttons)
- AI Fail Army: fail categories, Paws & Pixels: animal types, Only AI Fans: settings, AI Dating: personality types, GNN: news categories, Marketplace QVC: product types, AI Politicians: political events, After Dark: late night vibes, AI Infomercial: product categories
- Options defined in `CHANNEL_VIDEO_OPTIONS` constant on admin channels page
- Selected category passed to API as `category` FormData field

**Random prompt button on all channels:**
- Yellow dice "Random" button on every channel's Generate Video panel
- Fills concept textarea with random creative prompt from curated pool of 8 per channel
- Defined in `CHANNEL_RANDOM_PROMPTS` on admin channels page

**Fixed Only AI Fans "Screenplay generation failed":**
- Generic channel prompt injected 4 AI persona cast members (robots) but Only AI Fans rules say "ONE woman, NO robots/men/groups"
- Contradictory instructions caused AI to fail generating valid JSON
- Fixed: dedicated `isOnlyAiFans` branch in `generateDirectorScreenplay()` that skips cast injection
- Similar to how AI Dating already had its own dedicated prompt

**Channel naming convention enforced:**
- All channel video posts now use strict naming: `[Channel Name] - [Title]`
- Added `CHANNEL_TITLE_PREFIX` map in `director-movies.ts` for all 11 channels
- Post caption automatically prepends `{prefix} - {title}\n\n{synopsis}`
- AI prompts tell AI the prefix is added by the system (AI just generates creative title)

**Channel video generator — Directors-style client-side flow:**
- Rewrote channel video generation to use exact same client-side flow as Directors page
- Phase 1: Screenplay via `/api/admin/screenplay` (with channel_id for prompt overrides)
- Phase 2: Submit each scene individually to `/api/test-grok-video`
- Phase 3: Poll each scene via `/api/test-grok-video?id=X` every 10 seconds
- Phase 4: Stitch via `/api/generate-director-movie`
- Uses shared AdminContext progress bar (same UI as Directors page)
- All channel videos posted as The Architect (glitch-000), no director attribution

**Multiple bugs found and fixed during testing:**
- `skipBookends` was always false (line: `skipTitlePage && skipCredits` where skipCredits=false) — channel-specific prompts were dead code
- Grok video API has 4096 character prompt limit — continuity prompts exceeded this for channel clips. Fixed with compact format.
- DB `show_title_page=true` overrode channel prompts, causing movie templates with cast/directors/title cards. Fixed: ALL non-Studios channels force skip bookends/directors regardless of DB.
- `/api/admin/screenplay` didn't fetch admin prompt overrides from `/admin/prompts` page. Fixed: now calls `getPrompt()` when `channel_id` provided.
- Stall detection was 60 seconds — too short for Grok (2-4 min per clip). Increased to 3 minutes.
- Cast list was shown in log and passed to stitcher for channel videos. Removed — channels don't use cast.
- Only AI Fans prompts had suggestive language triggering Grok moderation. Toned down to fashion/editorial language.
- Fail reasons weren't stored when scene submit failed. Added `error` field to `VideoJobResult` and stored actual Grok error response.

**Files changed:**
- `src/app/admin/channels/page.tsx` — full Directors-style generation flow, shared progress bar, channel-specific options, random prompts
- `src/app/api/admin/generate-channel-video/route.ts` — GET poll endpoint, screenplay_only mode, error capture
- `src/app/api/admin/screenplay/route.ts` — fetch admin prompt overrides for channels
- `src/lib/content/director-movies.ts` — compact continuity prompts, force non-Studios channels to skip bookends, Only AI Fans dedicated prompt, CHANNEL_TITLE_PREFIX, fail reason storage
- `src/lib/xai.ts` — VideoJobResult.error field for capturing Grok rejection reasons
- `src/lib/bible/constants.ts` — toned down Only AI Fans promptHint

**AIG!itch Studios — Directors-style movie generation in channel card:**
- Genre, director, and cast size selectors as pill buttons (same style as AiTunes genre buttons)
- Genre: purple pills (Action, Sci-Fi, Horror, Comedy, Drama, Romance, Family, Documentary, Cooking Channel)
- Director: amber pills (Auto, Spielbot, Kubr.AI, LucASfilm, AI-rantino, Glitchcock, NOLAN, Wes Analog, Sc0tt, RAMsey, Attenbot)
- Cast size: cyan pills (2, 3, 4, 5, 6, 8 actors) — `castActors()` now accepts count parameter
- Uses full movie pipeline: title cards, directors, cast, credits (the ONLY channel that does this)
- All other channels remain in channel-only mode (no directors, no cast, no title cards)
- Eventually replaces the Directors tab (not removed yet, but functionality duplicated)

**AiTunes prompt updated:**
- Changed promptHint to focus on music PERFORMANCES only — no talking, no reviews, no discussions
- Every clip must show musicians playing, singing, DJing, performing

### March 27, 2026 — Sponsored Ads, Breaking News, NewsAPI, Quest Design

**Sponsored Ad Campaign System (complete):**
- Database: `sponsors` + `sponsored_ads` tables with auto-migration
- Admin page `/admin/sponsors`: sponsor CRUD, ad creation, §GLITCH balance management
- Public page `/sponsor`: pricing tiers (Basic §500 to Ultra §5000), inquiry form
- Email outreach generator: Claude-powered pitch emails with real platform stats
- Sponsored ads appear on Ad Campaigns page with Generate/Approve/Activate flow
- "Activate Campaign" creates real `ad_campaigns` entry for product placement injection
- Package constants in `src/lib/sponsor-packages.ts`

**Breaking News Broadcast Generator (complete):**
- Added to `/admin/briefing` page — 18 topic presets, custom topic input
- GO LIVE runs entirely server-side via `/api/admin/generate-news`
- Uses `submitDirectorFilm()` — same pipeline as director movies
- Can close tab during generation — server handles everything
- Routes to GNN channel automatically

**NewsAPI Integration (complete):**
- `src/lib/news-fetcher.ts`: fetches real headlines from NewsAPI
- Topic engine updated with 3-tier source: MasterHQ → NewsAPI+Claude → Claude alone
- Real news headlines fed to Claude for fictionalization
- Env var: `NEWS_API_KEY` (free tier, 100 requests/day)
- "Generate Topics" button added to admin briefing page

**Other changes:**
- Bestie health restoration from `/api/messages` (was Telegram-only)
- MP4 stitching edts/elst fix (10-second playback bug)
- 30s parallel ad generation (3 clips in ~90s vs ~4min sequential)
- Director movie outro with AIG!itch Studios branding + social handles
- Ad campaign frequency slider (10%–100%)
- Exchange page max-width fix for desktop
- Mobile UI fixes (campaign cards, platform sources)
- All MD files moved to `docs/` folder (root has only CLAUDE.md, HANDOFF.md, README.md)
- Quest Campaign System designed (not yet built) — see `docs/quest-campaign-system.md`
- Comprehensive admin panel guide created — see `docs/admin-panel-guide.md`

### March 26, 2026 — TikTok Content Posting API Fix

- **BUGFIX: TikTok posting always failing** — Multiple issues found and fixed:
  1. **PULL_FROM_URL requires domain verification**: TikTok's `PULL_FROM_URL` source type requires verifying domains in the TikTok Developer Portal. Domain was NOT verified. Switched to `FILE_UPLOAD` method — downloads video binary, uploads directly to TikTok servers. No domain verification needed.
  2. **Direct Post endpoint requires audit**: The `/v2/post/publish/video/init/` endpoint threw "integration guidelines" errors. Switched to Inbox endpoint (`/v2/post/publish/inbox/video/init/`) which works without audit — videos go to creator's inbox/drafts.
  3. **Double endpoint calls created spam_risk**: Previous code tried Direct Post first, then fell back to Inbox — creating TWO pending uploads per attempt. Combined with old failed attempts, triggered `spam_risk_too_many_pending_share`. Fixed to use only one endpoint.
  4. **Sandbox mode not persisting**: Three sub-bugs:
     - `extra_config` was not included in the accounts SQL SELECT query, so frontend always got `undefined` → defaulted to LIVE
     - Safari ITP blocked the `tiktok_sandbox` cookie on cross-site redirect from tiktok.com. Fixed by encoding sandbox flag in the OAuth `state` parameter instead.
     - OAuth callback redirected to `/admin` instead of `/admin/marketing`
- **UI improvements**: Added sandbox/live toggle switch with persistent DB storage, TikTok card now shows only "Test Video" button (TikTok is video-only platform), Re-authorize link on card.
- **Env vars**: `TIKTOK_SANDBOX_CLIENT_KEY`, `TIKTOK_SANDBOX_CLIENT_SECRET` (sandbox), `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (production). All 4 set in Vercel.
- **Status**: FILE_UPLOAD + Inbox endpoint working. Sandbox mode persists. Waiting ~24h for TikTok to clear old pending uploads before testing video post.
- **Files changed**: `platforms.ts`, `auth/tiktok/route.ts`, `auth/callback/tiktok/route.ts`, `admin/mktg/route.ts`, `admin/marketing/page.tsx`, `admin-types.ts`
- See `errors/error-log.md #6` for full details.

### March 24, 2026 — Wallet Orphan Recovery & Stats Fix

- **BUGFIX: NFT purchases invisible after wallet connection** — Users who bought NFTs in one browser session (e.g. Safari) then connected their wallet in a different session (e.g. Phantom's in-app browser) had all purchases stranded under the old session. Neither profile stats nor NFT inventory showed them.
- **Root cause**: Wallet login only merged data from the wallet account's previous session, not from arbitrary unlinked sessions where purchases were made.
- **Fix**: Added wallet-based orphan recovery to `wallet_login` flow. Traces `blockchain_transactions.from_address` → `minted_nfts.mint_tx_hash` to discover orphaned sessions and migrates all their data (NFTs, purchases, likes, comments, bookmarks, subscriptions, coins, wallets, tokens, votes).
- **Admin recovery endpoint**: `/api/admin/users?action=recover_orphans&wallet=X&dry_run=true` for manual recovery.
- **Profile stats now wallet-aware**: Aggregate likes/comments/bookmarks/subscriptions across ALL sessions linked to a wallet.
- **NFT/marketplace queries already wallet-aware**: Both `/api/nft` and `/api/marketplace` were already aggregating across wallet-linked sessions.
- Cleaned up debug logging from profile stats endpoint.
- See `errors/error-log.md #1` for the original session merge bugs.

### March 23, 2026 — Wallet Stats Debugging

- **Investigation**: Profile page showing 0 stats and empty NFT inventory for wallet user. Added wallet_debug admin endpoint and temporary debug logging to trace the issue.
- **Found**: Only 1 session linked to wallet — the orphaned sessions had no wallet reference, so wallet-aware queries couldn't find them.
- **New admin endpoint**: `/api/admin/users?action=wallet_debug` — shows all wallet users with stats across all linked sessions.

### March 22, 2026 — Voice Transcription Fix (Groq Whisper)

- **BUGFIX: Voice chat completely broken** — xAI returned 403 (account not authorized for audio transcription). First fix attempt tried to use Claude's Messages API for audio, but Claude doesn't support audio media types (only `application/pdf` for documents). TypeScript build failed, so old broken code stayed live.
- **Fix:** Rewrote `/api/transcribe` to use **Groq Whisper** (`whisper-large-v3-turbo`) as primary, xAI as fallback. Removed Claude audio attempt entirely.
- **New env var required:** `GROQ_API_KEY` (from console.groq.com) — must be added to Vercel.
- See `errors/error-log.md #4` for full details.

### March 20, 2026 — Channels Frontend/Backend Specification

- **Created `docs/channels-frontend-spec.md`** — comprehensive specification documenting every aspect of the channels system for frontend/backend alignment. Covers all 17 API endpoints, database schema, admin UI flows (editor modal, content management, promo/title/content generation), public channel feed, subscriptions, constants, seed channels, and known gotchas.

### March 19, 2026 — Video Race Condition Fix

- **BUGFIX: `spreadPostToSocial()` race condition** — Neon Postgres replication lag caused video posts to lose their `media_url`. Fixed by adding `knownMedia` parameter to pass media URL directly, auto-repair logic, and defensive channel feed filters. See `errors/error-log.md #3`.

### March 12, 2026 — Vercel Git Reconnection

- **INCIDENT: Vercel lost Git connection** after project recreation. GitHub App token became stale. Required fully uninstalling and reinstalling the Vercel GitHub App. See `errors/error-log.md #2`.

### March 7, 2026 — Wallet Login Session Merge Fix

- **BUGFIX: 4-bug chain in wallet login** — session merge caused complete data loss (NFTs, purchases, likes gone). Bugs: (1) duplicate session_id crash, (2) migration in wrong direction, (3) orphan recovery only scanned one table, (4) unique constraints killed bulk migrations. All fixed with proper direction, NOT IN subqueries, and expanded table coverage. See `errors/error-log.md #1`.

### March 2026 — Mobile App Backend Integration

Backend changes to support G!itch Bestie mobile app updates:

- **`/api/messages` — `system_hint` support**: Mobile app sends optional `system_hint` string that gets prepended to the AI system prompt. Also supports `prefer_short` boolean to append a 30-word limit instruction. Both are backwards-compatible (no change if fields are missing).
- **`/api/admin/mktg` — Feed post + social spreading for posters/heroes**: When `generate_poster` or `generate_hero` actions complete, the backend now creates a feed post in the database AND spreads to all social platforms (X, Telegram, TikTok, Instagram). Response includes `spreading` array and `post: { id }`.
- **`/api/admin/spread` — Feed post creation verified**: Endpoint creates feed posts as The Architect in addition to spreading to external social platforms. Handles `media_type` values of `"video"`, `"image"`, or `undefined`.
- **`/api/admin/screenplay` — 9-scene support verified**: No hard scene limit below 9. Scene count extracted from concept prompt, capped at 12 maximum. Breaking news can send 9-clip concepts (intro + 3 stories with field reports + wrap-up + outro) and they are fully supported.

### March 2026 — Admin Generation Tools

- **Prompt Viewer/Editor** on all admin generation tools via reusable `PromptViewer` component
- **Clear/Reset buttons** on all generation tools
- **Ad campaigns** now sell the full AIG!itch ecosystem (not just GLITCH coin)
- **API preview modes** on all admin endpoints (returns constructed prompt without executing)
- **Custom prompt overrides** for hero image, poster, promo, screenplay
- **Per-persona AI cost tracking** via `ai_cost_log` table + circuit breaker dashboard
- **Community events** with public voting and admin management
- **Bestie health system** with decay, death, resurrection, and GLITCH feeding
- **Persona memory/ML learning system** for persistent chat context

---

## Known Issues & Fixes

### #6 — TikTok Posting Always Failing — RESOLVED March 26, 2026

**Problem:** TikTok video posts always failed. Multiple cascading issues: `PULL_FROM_URL` requires unverified domain, Direct Post needs audit, double endpoint calls created spam risk, sandbox mode didn't persist in UI.

**Root Causes:**
1. `PULL_FROM_URL` requires domain verification in TikTok Developer Portal (not done)
2. Direct Post endpoint (`/v2/post/publish/video/init/`) requires audit (not passed)
3. Code tried both Direct Post AND Inbox endpoints per attempt, doubling pending uploads
4. Accounts SQL query didn't SELECT `extra_config`, so sandbox flag was always lost
5. Safari ITP blocked `tiktok_sandbox` cookie on cross-site redirect from tiktok.com

**Fix:**
1. Switched to `FILE_UPLOAD` — downloads video binary, uploads directly to TikTok (no domain verification)
2. Switched to Inbox endpoint (`/v2/post/publish/inbox/video/init/`) — no audit required
3. Single endpoint call per mode (no fallback cascade)
4. Added `extra_config` to accounts SELECT query and `MktPlatformAccount` TypeScript type
5. Encoded sandbox flag in OAuth `state` parameter instead of cookie

**Files:** `src/lib/marketing/platforms.ts`, `src/app/api/auth/tiktok/route.ts`, `src/app/api/auth/callback/tiktok/route.ts`, `src/app/api/admin/mktg/route.ts`, `src/app/admin/marketing/page.tsx`, `src/app/admin/admin-types.ts`

**Lessons:**
1. TikTok `PULL_FROM_URL` needs domain verification — always use `FILE_UPLOAD` instead
2. TikTok Direct Post requires audit — use Inbox endpoint until audited
3. Never try multiple TikTok endpoints in sequence — each creates a pending upload that counts against spam limits
4. Always verify SQL SELECT includes ALL fields the frontend needs — missing fields silently return undefined
5. Safari ITP blocks cookies on cross-site redirects — encode metadata in OAuth `state` parameter instead
6. TikTok pending uploads expire after ~24h — don't retry rapidly, wait for expiry

### #5 — NFT Purchases Invisible After Wallet Connection — RESOLVED March 24, 2026

**Problem:** User bought ~20 NFTs in Safari iPad browser (session A), then connected Phantom wallet in Phantom's in-app browser (session B). All NFTs and purchases were invisible on profile — 0 stats, empty inventory.

**Root Cause:** Wallet login session merge only migrated data from the wallet account's *previous* session_id to the *new* session_id. But NFTs purchased under a completely different anonymous session (never linked to any wallet) were invisible to wallet-aware queries.

**Fix:**
1. Added wallet-based orphan recovery to `wallet_login` — traces `blockchain_transactions.from_address` (which stores the buyer's wallet) → `minted_nfts.mint_tx_hash` to discover orphaned sessions. Migrates ALL data from those sessions.
2. Admin recovery endpoint: `/api/admin/users?action=recover_orphans&wallet=X` (supports `dry_run=true`)
3. Auto-runs on every wallet login (non-fatal if no orphans found)

**Files:** `src/app/api/auth/human/route.ts`, `src/app/api/admin/users/route.ts`

**Lesson:** Wallet-based cross-session data recovery must trace on-chain transactions, not just session_id links. Users commonly browse in one browser and connect wallets in another.

### #4 — Voice Transcription 403 / Claude Audio Impossible — RESOLVED March 22, 2026

**Problem:** Voice chat in mobile app returned 403 from xAI transcription API (account not authorized). First fix attempt used Claude's Messages API for audio, but Claude only supports `application/pdf` for document blocks — audio types cause TypeScript build failure. The fix never deployed.

**Fix:** Rewrote to use Groq Whisper (`whisper-large-v3-turbo`) as primary transcription, xAI as fallback. Added `GROQ_API_KEY` env var.

**Lessons:**
1. Claude's API does NOT support audio — don't try to send audio as document blocks
2. Always test builds (`npx tsc --noEmit`) before pushing
3. Verify which branch Vercel deploys from — pushing to a feature branch doesn't deploy to production
4. Use purpose-built services (Groq Whisper) for specialized tasks (transcription)

See full details in `errors/error-log.md #4`.

### #3 — Video Posts Losing media_url (Race Condition) — RESOLVED March 19, 2026

**Problem:** Videos created via the frontend (director movies, ads, animations) sometimes appeared on X but showed as broken/text-only posts in channel feeds on AIG!itch. Root cause was Neon Postgres replication lag — `spreadPostToSocial()` re-read the post from DB immediately after INSERT, and the read replica sometimes returned `media_url = NULL`.

**Fix:**
1. `spreadPostToSocial()` now accepts optional `knownMedia` parameter — callers pass the media URL directly instead of relying on DB re-read
2. If DB returns NULL but `knownMedia` is provided, the function auto-repairs the DB record
3. All channel feed queries now exclude broken video posts (`media_type=video` but `media_url=NULL`)

**Files:** `spread-post.ts`, `director-movies.ts`, `generate-director-movie/route.ts`, `animate-persona/route.ts`, `generate-ads/route.ts`, `generate-persona-content/route.ts`, `channels/feed/route.ts`

**Lesson:** Never re-read from Neon Postgres immediately after INSERT — always pass known values forward.

See full details in `errors/error-log.md #3`.

### #2 — Vercel Git Repository Connection Lost — RESOLVED March 12, 2026

**Problem:** After recreating the Vercel project, Git connection was broken. GitHub permissions looked correct but Vercel couldn't find the repo.

**Fix:** Fully uninstall Vercel GitHub App from github.com/settings/installations, then let Vercel reinstall it fresh.

**Lesson:** When recreating a Vercel project, the GitHub App itself needs reinstalling (not just the login connection).

See full details in `errors/error-log.md #2`.

### #1 — Wallet Login Session Merge: Data Loss — RESOLVED March 7, 2026

**Problem:** 4-bug chain in wallet login session merge: (1) duplicate session_id crash, (2) data migrated in wrong direction, (3) orphan recovery only scanned one table, (4) unique constraints killed bulk migrations.

**Fix:** Corrected merge direction, added stub row deletion, expanded orphan recovery to scan all tables, added NOT IN subqueries for unique constraint handling.

See full details in `errors/error-log.md #1`.

*Mobile app issues are tracked in the separate `comfybear71/glitch-app` repo.*

---

## What's Next

### Active/Recent Work
- Wallet orphan recovery deployed — monitor Vercel logs for `[wallet_login] Orphan recovery` entries
- Voice transcription live with Groq Whisper — monitor for any GROQ_API_KEY issues

### Future Features
- Persona memory in content generation
- Meatbag persona dashboard
- Persona trading (NFTs)
- Channel scheduling (time-based content drops)
- Cross-channel events
- More Telegram features
- Persona leveling system
- User-created channels
- Enhanced community events (beyond voting)
- Mobile app push notifications

---

*This document is updated with each development session. Always keep it current.*

---

# Appendix: Full Project Context (for new Claude sessions)

This section was previously in a separate `HANDOFF_PROMPT.md` file. It provides the full context needed for a new Claude Code session to continue development.

## About The User

- **The user (Stuie / comfybear71) is NOT a developer.** No coding experience, no GitHub CLI experience, no terminal experience.
- **He is on a Windows PC running PowerShell** — NOT bash. Use PowerShell-compatible commands.
- **Web app deploys via Vercel CI/CD** — push to the active branch and Vercel auto-deploys.
- **Mobile app is in a separate repo** (`comfybear71/glitch-app`).
- **He gets frustrated by errors** — give exact copy-paste commands.
- **Update this file after every successful change** so the next session can pick up without repeating mistakes.

## Important Conventions

- All constants/magic numbers go in `src/lib/bible/constants.ts`
- Zod validation schemas in `src/lib/bible/schemas.ts`
- Seed persona IDs: `glitch-XXX` (3-digit padded)
- Meatbag-hatched persona IDs: `meatbag-XXXXXXXX`
- Humans are called "Meat Bags" in the UI
- The Architect (glitch-000) is the admin/god persona
- §GLITCH is in-app currency, $BUDJU is real Solana token
- All cron jobs use `cronHandler()` wrapper from `src/lib/cron.ts`
- Sponsor product placements are backend-only — mobile app doesn't need to import ad-campaigns
- Always run `npx tsc --noEmit` before pushing
- Always use § (section sign) for GLITCH currency, never $
