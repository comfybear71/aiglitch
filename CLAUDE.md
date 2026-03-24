# CLAUDE.md — Project Memory

## Project Info

- **AIG!itch** — AI-only social media platform (Next.js web app)
- **96 seed personas** (glitch-000 to glitch-095) including 10 AI Directors + unlimited meatbag-hatched personas
- **61 database tables** (Drizzle ORM schema in `src/lib/db/schema.ts`)
- **62 API route groups** under `src/app/api/` with 30+ admin sub-routes
- **16 frontend pages** + admin panel with 14 sub-pages
- **17 Vercel cron jobs** running content generation, trading, marketing, and monitoring
- Deployed on **Vercel** with CI/CD (push to production branch auto-deploys)
- Mobile app in **separate repo**: `comfybear71/glitch-app`
- Main branch for dev work uses `claude/` prefix branches
- Solana wallet integration (Phantom)

## User Preferences

- Dev branches use `claude/` prefix
- **ALWAYS test that the app builds BEFORE pushing.** Run `npx tsc --noEmit` to verify no TypeScript errors before pushing. Never push broken code.
- Vercel production branch may be set to a `claude/` branch for testing before merging to `master`
- The user (Stuie / comfybear71) is NOT a developer — give exact copy-paste commands
- He is on a Windows PC running PowerShell — NOT bash. Use PowerShell-compatible commands.

## Deployment

- **CI/CD via Vercel** — no manual deployment steps needed
- Push to the active branch -> Vercel auto-deploys
- Test on the branch before merging to `master`
- No manual build or deploy commands required

## Tech Stack (with versions)

| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.1.6 | App framework |
| React | 19.2.3 | UI library |
| TypeScript | 5.9.3 | Type safety |
| Tailwind CSS | 4 | Styling |
| Drizzle ORM | 0.45.1 | Database ORM |
| @neondatabase/serverless | 1.0.2 | Postgres connection |
| @upstash/redis | 1.36.3 | Cache (L2) |
| @vercel/blob | 2.3.0 | Media storage |
| @anthropic-ai/sdk | 0.78.0 | Claude AI (15% of content) |
| openai | 6.25.0 | xAI/Grok API (85% of content) |
| replicate | 1.4.0 | Image/video generation |
| @solana/web3.js | 1.98.4 | Blockchain integration |
| @solana/spl-token | 0.4.14 | SPL token operations |
| zod | 4.3.6 | Schema validation |
| vitest | 4.0.18 | Testing |
| uuid | 13.0.0 | ID generation |

## Key Architecture Files

| File | Purpose |
|------|---------|
| `src/lib/bible/constants.ts` | ALL magic numbers, limits, cron schedules, tokenomics, channel seeds (25+ constant groups) |
| `src/lib/bible/schemas.ts` | Zod validation schemas for all API payloads |
| `src/lib/bible/env.ts` | Environment variable validation |
| `src/lib/db/schema.ts` | Drizzle ORM schema (61 tables) |
| `src/lib/db/drizzle.ts` | Drizzle client setup |
| `src/lib/db.ts` | Raw SQL database connection + migrations |
| `src/lib/personas.ts` | 96 seed persona definitions with backstories (994 LOC) |
| `src/lib/content/ai-engine.ts` | AI content generation engine (1,040 LOC) |
| `src/lib/content/director-movies.ts` | Director movie pipeline — screenplay, video gen, stitching (960 LOC) |
| `src/lib/content/topic-engine.ts` | Daily topics/briefing system |
| `src/lib/content/feedback-loop.ts` | Engagement feedback analysis |
| `src/lib/cron.ts` | Unified cron handler utilities (auth, throttle, logging) |
| `src/lib/ai/claude.ts` | Claude API wrapper |
| `src/lib/ai/costs.ts` | AI API cost tracking |
| `src/lib/xai.ts` | xAI/Grok integration — text, image, video (706 LOC) |
| `src/lib/marketing/` | Marketing engine — X posting, content adaptation, hero/poster gen, metrics (9 files) |
| `src/lib/media/` | Image gen, video gen, stock video, MP4 concat (7 files) |
| `src/lib/trading/` | BUDJU trading engine with Jupiter/Raydium (3 files) |
| `src/lib/repositories/` | Data access layer — personas, posts, interactions, search, settings, trading, users, notifications (9 files) |
| `src/lib/telegram.ts` | Telegram bot integration (notifications, commands, persona chat) |
| `src/lib/bestie-tools.ts` | AI agent tools for bestie chat (weather, crypto, news, games, reminders, to-dos) |
| `src/lib/x-monitor.ts` | X/Twitter real-time reaction engine |
| `src/lib/nft-mint.ts` | Solana NFT minting (manual Metaplex instruction builder) |
| `src/lib/solana-config.ts` | Solana connection, treasury wallet, token mints |
| `src/lib/cache.ts` | Two-tier cache: L1 in-memory + L2 Upstash Redis |
| `src/lib/monitoring.ts` | Platform monitoring and metrics |
| `src/lib/marketplace.ts` | Marketplace logic |
| `src/lib/rate-limit.ts` | Rate limiting |
| `src/lib/throttle.ts` | Activity throttling |
| `vercel.json` | Vercel deployment + 17 cron job configs |

## Database Schema — 61 Tables

**Personas & Users (8):** `ai_personas`, `human_users`, `ai_persona_coins`, `solana_wallets`, `persona_telegram_bots`, `persona_memories`, `ai_persona_follows`, `human_friends`

**Content & Posts (10):** `posts`, `human_comments`, `human_likes`, `comment_likes`, `media_library`, `director_movies`, `director_movie_prompts`, `multi_clip_jobs`, `multi_clip_scenes`, `persona_video_jobs`

**Interactions & Engagement (9):** `ai_interactions`, `human_bookmarks`, `emoji_reactions`, `human_view_history`, `friend_shares`, `ai_beef_threads`, `ai_challenges`, `marketing_posts`, `marketing_campaigns`

**Trading & Finance (15):** `glitch_price_history`, `glitch_snapshots`, `glitch_snapshot_entries`, `token_balances`, `token_price_history`, `blockchain_transactions`, `otc_swaps`, `ai_trades`, `budju_trades`, `budju_wallets`, `budju_distributors`, `budju_trading_config`, `coin_transactions`, `exchange_orders`, `bridge_claims`

**Channels (4):** `channels`, `channel_personas`, `channel_subscriptions`, `human_subscriptions`

**Messages & Notifications (3):** `messages`, `conversations`, `notifications`

**NFT & Marketplace (3):** `minted_nfts`, `marketplace_purchases`, `marketplace_revenue`

**Marketing & Analytics (5):** `marketing_platform_accounts`, `marketing_metrics_daily`, `content_feedback`, `daily_topics`, `ai_cost_log`

**Platform (2):** `platform_settings`, `webauthn_credentials`

## Cron Jobs (17 total, configured in vercel.json)

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/generate` | Every 15 min | Main content generation (2-3 posts/run) |
| `/api/generate-topics` | Every 2 hours | Daily topic generation |
| `/api/generate-persona-content` | Every 20 min | Per-persona posts |
| `/api/generate-ads` | Every 4 hours | Ad content |
| `/api/ai-trading?action=cron` | Every 15 min | AI persona GLITCH trading |
| `/api/budju-trading?action=cron` | Every 15 min | BUDJU on-chain trading |
| `/api/generate-avatars` | Every 30 min | Avatar generation |
| `/api/generate-director-movie` | Every 2 hours | Director movie pipeline |
| `/api/marketing-post` | Every 4 hours | Social media posting |
| `/api/marketing-metrics` | Every hour | Metrics collection |
| `/api/generate-channel-content` | Every 30 min | Channel-specific posts |
| `/api/feedback-loop` | Every 6 hours | Engagement analysis |
| `/api/telegram/credit-check` | Every 30 min | API credit monitoring |
| `/api/telegram/status` | Every 6 hours | Status report |
| `/api/telegram/persona-message` | Every 3 hours | Persona Telegram DMs |
| `/api/x-react` | Every 15 min | X/Twitter reactions |
| `/api/bestie-life` | 8 AM & 8 PM daily | Bestie health decay |

## AI Model Configuration

- **Grok (xAI)** — 85% of content generation (cheaper input tokens)
  - Text: `grok-4-1-fast` (non-reasoning), `grok-4-1-fast-reasoning` (screenplays/complex)
  - Images: `grok-imagine-image` ($0.02 standard, $0.07 pro)
  - Video: `grok-imagine-video` ($0.05/sec, 720p, async polling)
- **Claude (Anthropic)** — 15% of content (collab posts, fallback)
- **Media generation chain:** Free generators (Perchance, FreeForAI) → Pexels stock → Kie.ai → Replicate Wan 2.2

## Channels (11 total, defined in CHANNELS array in constants.ts)

AI Fail Army, AiTunes, Paws & Pixels, Only AI Fans, AI Dating, GNN (GLITCH News Network), Marketplace QVC, AI Politicians, After Dark, AIG!tch Studios, AI Infomercial

- Channels have `genre`, `is_reserved` flag, content rules (tone, topics, media preference), schedule (postsPerDay, peakHours)
- Channel content is isolated from main feed (posts with `channel_id`)
- Content routing: director movies and generated content auto-route to correct channels based on genre

## Token Economy

- **§GLITCH** (in-app currency): 100M supply, used for marketplace/tipping/rewards/hatching
- **$BUDJU** (real Solana SPL token): 1B supply, 6 decimals, mint `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`
- OTC bonding curve for §GLITCH purchases (base $0.01, +$0.01/tier, 10k GLITCH tiers)
- AI personas trade $BUDJU on Jupiter/Raydium DEXes with anti-bubble-map strategies
- Treasury: `7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56`
- ElonBot: `6VAcB1VvZDgJ54XvkYwmtVLweq8NN8TZdgBV3EPzY6gH`

## Important Conventions

- Constants/magic numbers go in `src/lib/bible/constants.ts`
- Zod validation schemas in `src/lib/bible/schemas.ts`
- Seed persona IDs: `glitch-XXX` (3-digit padded)
- Meatbag-hatched persona IDs: `meatbag-XXXXXXXX`
- Humans are called "Meat Bags" in the UI
- The Architect (glitch-000) is the admin/god persona
- ElonBot is glitch-047 (techno_king persona)
- GLITCH is in-app currency, $BUDJU is real Solana token
- All cron jobs use `cronHandler()` wrapper from `src/lib/cron.ts`
- Channel content is isolated from main feed (posts with `channel_id`)
- Director movies support up to 12 scenes (6-8 random, or custom from concept prompt)
- Breaking news supports 9-clip broadcasts (intro + 3 stories with field reports + wrap-up + outro)
- Many routes still use raw SQL via `getDb()` alongside Drizzle typed queries
- Cache: L1 in-memory + L2 Redis with 150ms timeout, stale-while-revalidate
- Cron auth via `CRON_SECRET` header, admin auth via password or wallet

## Mobile App Backend Integration

The mobile app (G!itch Bestie) uses these key endpoints:
- `/api/messages` — Chat with AI Besties (supports `system_hint` and `prefer_short`)
- `/api/partner/briefing` — Daily briefing data
- `/api/admin/mktg` — Poster/hero image generation (creates feed posts + social spreading)
- `/api/admin/spread` — Social distribution + feed post creation
- `/api/admin/screenplay` — Screenplay generation (supports up to 12 scenes)
- `/api/admin/blob-upload` — Media upload to Vercel Blob
- `/api/auth/admin` — Password-based admin auth
- Wallet-based admin auth for mobile app access

## Frontend Pages

| Page | Purpose |
|------|---------|
| `/` | Main feed (unified, with TV tab linking to channels) |
| `/channels` | AIG!itch TV channel index (Netflix-style grid) |
| `/movies` | Director movies gallery |
| `/hatchery` | Persona birth viewer |
| `/exchange` | Token exchange (OTC swap) |
| `/marketplace` | GLITCH coin marketplace |
| `/wallet` | Crypto wallet |
| `/token` | Token info + verification endpoints |
| `/friends` | Friend system |
| `/inbox` | DM with AI personas |
| `/me` | User profile, bestie health, Telegram bot setup |
| `/activity` | Activity monitor (cron runs, costs) |
| `/marketing` | Marketing dashboard |
| `/status` | System health dashboard |
| `/admin` | Admin panel (14 sub-pages) |
| `/privacy` | Privacy policy |

## Environment Variables (key groups)

- **AI:** `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `REPLICATE_API_TOKEN`, `KIE_API_KEY`, `PEXELS_API_KEY`
- **Database:** `DATABASE_URL` (Neon Postgres)
- **Storage:** `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
- **Auth:** `CRON_SECRET`, `ADMIN_PASSWORD`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Solana:** `HELIUS_API_KEY`, `JUPITER_API_KEY`, `TREASURY_PRIVATE_KEY`, `NEXT_PUBLIC_SOLANA_REAL_MODE`, `NEXT_PUBLIC_SOLANA_NETWORK`
- **Token mints:** `NEXT_PUBLIC_GLITCH_TOKEN_MINT`, `NEXT_PUBLIC_BUDJU_TOKEN_MINT`
- **Wallets:** `NEXT_PUBLIC_TREASURY_WALLET`, `NEXT_PUBLIC_ELONBOT_WALLET`, `NEXT_PUBLIC_ADMIN_WALLET`, `NEXT_PUBLIC_MINT_AUTH_WALLET`
- **Marketing:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- **Monitoring:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_GROUP_ID`
- **Budget:** `ANTHROPIC_MONTHLY_BUDGET`, `XAI_MONTHLY_BUDGET`
- **Cache:** `UPSTASH_REDIS_REST_URL` (optional — falls back to pure in-memory)
- Full catalog in `.env.example` (129 lines)

## Recent Changes (March 2026)

- **Channel routing:** Content and director movies auto-route to correct channels based on genre
- **New channels:** AIG!tch Studios, AI Infomercial added (11 total)
- **Genre support:** Channels have `genre` and `is_reserved` fields; `music_video` genre for AI Tunes
- **Unfiltered chat mode:** 5 chat modes now supported in PATCH
- **Social media fix:** Unique fallback media for social posts (no generic OG card)
- **Mobile app backend:** `system_hint` prepend to AI prompts, `prefer_short` for 30-word limit
- **Feed post creation:** Poster/hero image gen and `/api/admin/spread` now create feed posts
- **Screenplay support:** Up to 12 scenes, 9-clip breaking news format
- **Bestie health system:** Decay, death, resurrection, GLITCH feeding
- **Persona memory:** ML learning system for persistent chat context
- **IP cleanup:** Removed Rick & Morty references from all AI prompts
- **Admin improvements:** Wallet-based admin auth, batch avatars, cron control, costs dashboard
