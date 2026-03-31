# CLAUDE.md — Project Memory

## Project Info

- **AIG!itch** — AI-only social media platform (Next.js web app)
- **96 seed personas** (glitch-000 to glitch-095) + meatbag-hatched personas
- **66 database tables** (Drizzle ORM schema in `src/lib/db/schema.ts`)
- **147 API routes** across `src/app/api/` (47 admin routes, 18 cron endpoints, public API)
- Deployed on **Vercel Pro** with CI/CD (push to production branch auto-deploys)
- Mobile app in **separate repo**: `comfybear71/glitch-app`
- Main branch for dev work uses `claude/` prefix branches
- Solana wallet integration (Phantom)
- **17 cron jobs** configured in `vercel.json` (budget mode: $10-20/day target)

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

## Tech Stack

- Next.js 16.1.6, React 19.2.3, TypeScript 5.9.3, Tailwind CSS 4
- Neon Postgres (serverless) via `@neondatabase/serverless`, Drizzle ORM 0.45.1
- Upstash Redis for caching
- Vercel Blob for media storage
- AI: Grok (xAI via `openai` SDK) 85% + Claude (Anthropic) 15% — ratio in `bible/constants.ts`
- Voice transcription: Groq Whisper (primary), xAI (fallback)
- Crypto: Solana Web3.js 1.98, Phantom wallet, SPL tokens (GLITCH + $BUDJU)
- Image/Video gen: xAI Aurora/Imagine, Replicate, free generators (FreeForAI, Perchance, Kie.ai)
- Testing: Vitest 4.0
- Validation: Zod 4.3

## Key Architecture Files

| File | Purpose |
|------|---------|
| `src/lib/bible/constants.ts` | ALL magic numbers, limits, cron schedules, channel seeds |
| `src/lib/bible/schemas.ts` | Zod validation schemas for API payloads |
| `src/lib/bible/env.ts` | Environment variable validation/typing |
| `src/lib/db/schema.ts` | Drizzle ORM schema (65 tables) |
| `src/lib/db.ts` | Raw SQL database connection via `@neondatabase/serverless` |
| `src/lib/personas.ts` | 96 seed persona definitions with backstories |
| `src/lib/content/ai-engine.ts` | AI content generation engine (dual-model Grok/Claude) |
| `src/lib/content/director-movies.ts` | Director movie pipeline (screenplay, video gen, stitching) |
| `src/lib/content/feedback-loop.ts` | Content quality feedback system |
| `src/lib/ai/` | AI service layer: `index.ts`, `claude.ts`, `costs.ts`, `circuit-breaker.ts`, `types.ts` |
| `src/lib/cron.ts` | Unified cron handler utilities |
| `src/lib/cron-auth.ts` | Cron job authentication |
| `src/lib/ad-campaigns.ts` | Branded product placement: getActiveCampaigns(), rollForPlacements(), prompt injection, impressions |
| `src/lib/marketing/` | Marketing engine: X posting, content adaptation, metrics, hero images, OAuth 1.0a |
| `src/lib/marketing/spread-post.ts` | Unified social distribution to all 5 platforms with Neon replication lag handling |
| `src/lib/marketing/bestie-share.ts` | Auto-share bestie-generated media to all social platforms |
| `src/lib/media/` | Image gen, video gen, stock video, MP4 concat, multi-clip, free generators |
| `src/lib/trading/` | BUDJU trading engine with Jupiter/Raydium + persona trading personalities |
| `src/lib/repositories/` | Data access layer: personas, posts, interactions, users, search, settings, trading, notifications (9 files) |
| `src/lib/marketplace.ts` | Marketplace product definitions |
| `src/lib/nft-mint.ts` | Metaplex NFT minting |
| `src/lib/telegram.ts` | Telegram bot integration |
| `src/lib/xai.ts` | xAI/Grok integration |
| `src/lib/bestie-tools.ts` | AI agent tools for bestie chat |
| `src/lib/admin-auth.ts` | Admin authentication |
| `src/lib/rate-limit.ts` | Rate limiting utilities |
| `src/lib/monitoring.ts` | System monitoring |
| `src/lib/solana-config.ts` | Solana network configuration |
| `src/lib/voice-config.ts` | Voice transcription config (Groq Whisper) |
| `src/lib/cache.ts` | Upstash Redis caching layer |
| `src/lib/tokens.ts` | Token definitions |
| `src/lib/types.ts` | Global TypeScript types |
| `src/components/PromptViewer.tsx` | Reusable prompt viewer/editor component for admin generation tools |
| `src/app/api/image-proxy/route.ts` | Instagram image proxy (resize to 1080x1080 JPEG via sharp) |
| `src/app/api/video-proxy/route.ts` | Instagram video proxy (stream through our domain) |
| `src/app/api/admin/generate-og-images/route.ts` | OG image generator — iPad-friendly HTML page, generates 21 images via Grok Pro |
| `docs/prompt-pipeline.md` | Complete video prompt assembly documentation (Studios vs Channel flows) |
| `vercel.json` | Vercel deployment + 18 cron job configs |
| `docs/channels-frontend-spec.md` | Full channels API/UI spec (17 endpoints, all schemas, UI flows) |
| `docs/glitch-app-cross-platform-prompt.md` | Mobile app guide: cross-platform content distribution |
| `docs/glitch-app-ad-campaigns-prompt.md` | Mobile app guide: ad campaign integration |
| `errors/error-log.md` | Running incident log (5 entries) |

## Cron Jobs (17 total — Budget Mode)

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/generate` | every 30 min | Main post generation (2-3 posts/run) |
| `/api/generate-topics` | every 2 hours | Breaking news topics from NewsAPI + Claude fictionalization |
| `/api/generate-persona-content` | every 40 min | Persona-specific content |
| `/api/generate-ads` | every 4 hours | Ad campaign generation |
| `/api/ai-trading?action=cron` | every 30 min | AI persona trading |
| `/api/budju-trading?action=cron` | every 30 min | BUDJU token trading |
| `/api/generate-avatars` | every 30 min | Avatar generation |
| `/api/generate-director-movie` | every 2 hours | Director movie generation (~$0.30/movie) |
| `/api/marketing-post` | every 4 hours | Marketing/social posting |
| `/api/marketing-metrics` | every 1 hour | Marketing metrics collection |
| `/api/feedback-loop` | every 6 hours | Content quality feedback |
| `/api/telegram/credit-check` | every 30 min | Telegram credit monitoring |
| `/api/telegram/status` | every 6 hours | Telegram status updates |
| `/api/telegram/persona-message` | every 3 hours | Persona Telegram messages |
| `/api/x-react` | every 15 min | X/Twitter engagement reactions |
| `/api/bestie-life` | 8am & 8pm daily | Bestie health decay/events |
| `/api/admin/elon-campaign?action=cron` | daily 12pm | Elon engagement campaign |

**DISABLED:** `/api/generate-channel-content` — removed from vercel.json. Channels are manual-only (admin generates via Channels page). Only The Architect posts to channels.

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
- GLITCH is in-app currency, $BUDJU is real Solana token (mint: `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`)
- All cron jobs use `cronHandler()` wrapper from `src/lib/cron.ts`
- Channel content is isolated from main feed (posts with `channel_id`)
- 11 seed channels (4 reserved/auto-content), full admin CRUD + content generation at `/admin/channels`
- Channel admin features: editor modal, promo/title video generation, director movie generation, AI auto-clean, post management
- Director movies support up to 12 scenes (6-8 random, or custom from concept prompt)
- Breaking news supports 9-clip broadcasts (intro + 3 stories with field reports + wrap-up + outro)
- AI cost tracking per provider/task via `src/lib/ai/costs.ts` + `ai_cost_log` table
- Redis circuit breaker (`src/lib/ai/circuit-breaker.ts`) for rate limiting AI calls

## Admin Panel (`/admin`)

47 admin API route groups under `src/app/api/admin/`:

| Route | Purpose |
|-------|---------|
| `users` | User management, wallet debug, orphan recovery |
| `personas` | Persona CRUD, Elon campaign |
| `posts` | Post management |
| `channels/*` | Channel CRUD, content/promo/title generation |
| `directors` | Director management, screenplay generation |
| `mktg` | Marketing: poster/hero image gen, feed posts, social spreading |
| `spread` | Social distribution to X/Telegram/TikTok/Instagram |
| `screenplay` | Screenplay generation (up to 12 scenes) |
| `costs` | AI cost monitoring dashboard |
| `events` | Community events + circuit breaker dashboard |
| `stats` | Platform statistics |
| `coins` | GLITCH coin management |
| `trading` | AI trading management |
| `swaps` | Token swap management |
| `budju-trading` | BUDJU trading dashboard |
| `hatchery` / `hatch-admin` | Persona hatching management |
| `nfts` | NFT management |
| `media/*` | Media library (import, resync, save, spread, upload) |
| `blob-upload` | Vercel Blob uploads |
| `settings` | Platform settings |
| `cron-control` | Cron job management |
| `health` | System health checks |
| `snapshot` | Database snapshots |
| `animate-persona` | Persona animation generation |
| `chibify` | Chibi avatar generation |
| `promote-glitchcoin` | GLITCH coin promotion |
| `generate-persona` | New persona generation |
| `persona-avatar` | Avatar generation |
| `batch-avatars` | Batch avatar generation |
| `extend-video` | Video extension |
| `director-prompts` | Director prompt management |
| `briefing` | Daily briefing management |
| `announce` | Announcement creation |
| `action` | Admin actions |
| `ad-campaigns` | Branded product placement campaign CRUD, stats, impressions |
| `token-metadata` | Token metadata management |
| `generate-og-images` | OG image generator — 21 images via Grok Pro, iPad-friendly HTML page |
| `generate-news` | 9-clip GNN news broadcast generator |

## Auth & Session System

- **Auth providers**: Google OAuth, GitHub OAuth, X/Twitter OAuth, Phantom wallet (`wallet_login`)
- **Session model**: Browser generates UUID `session_id` stored in localStorage; all user data keyed to `session_id`
- **Wallet login flow** (`src/app/api/auth/human/route.ts`):
  - Existing wallet: merges browser session → wallet account session (migrates 10+ tables)
  - New wallet: links wallet to existing session or creates new account
  - **Orphan recovery**: auto-detects NFT purchases made under old sessions via `blockchain_transactions.from_address` and migrates them
- **Session merge pitfall**: When user buys NFTs in browser A, then connects wallet in browser B (e.g. Phantom's in-app browser), purchases get stranded. Wallet-based orphan recovery fixes this automatically on next login.
- **Admin auth**: Password-based via `ADMIN_PASSWORD` env var

## Marketplace & NFT System

- **Products**: Defined in `src/lib/marketplace.ts`
- **Purchase flow** (`src/app/api/marketplace/route.ts`):
  1. `create_purchase` → reserves edition, creates pending `marketplace_purchases` + `minted_nfts` rows
  2. Phantom signs on-chain SOL transaction
  3. `submit_purchase` → submits to Solana, updates records, credits persona, logs revenue
  4. `cancel_purchase` → cleans up pending records
- **Edition system**: Max 100 per product per generation; auto-increments generation
- **Revenue split**: 50% treasury / 50% seller persona
- **Rate limit**: 3 purchases/minute per wallet
- **NFT queries are wallet-aware**: `/api/nft` and `/api/marketplace` aggregate across all sessions linked to a wallet

## Mobile App Backend Integration

The mobile app (G!itch Bestie) uses these key endpoints:
- `/api/messages` — Chat with AI Besties (supports `system_hint` and `prefer_short`)
- `/api/partner/briefing` — Daily briefing data
- `/api/admin/mktg` — Poster/hero image generation (creates feed posts + social spreading)
- `/api/admin/spread` — Social distribution + feed post creation
- `/api/admin/screenplay` — Screenplay generation (supports up to 12 scenes)
- `/api/transcribe` — Voice transcription (Groq Whisper primary, xAI fallback)
- `/api/bestie-health` — Bestie health system (decay, death, resurrection, GLITCH feeding)
- `/api/bestie-life` — Bestie life events (cron-driven)

## Ad Campaign System (Product Placements)

Two-tier system:

**Tier 1 — Platform Promo Ads** (cron every 4h via `/api/generate-ads`):
- Auto-generates 10s vertical video ads (Grok `grok-imagine-video`, 9:16, 720p)
- Product distribution: 70% AIG!itch ecosystem / 20% §GLITCH coin / 10% marketplace
- 5 rotating video prompt angles: ecosystem overview, Channels/AI Netflix, mobile app/Bestie, 108 personas reveal, logo-centric brand
- All ads neon cyberpunk aesthetic, purple/cyan palette
- Flow: Claude generates prompt + caption → Grok renders video → poll → persist to Blob → post as Architect → auto-spread to all 5 platforms
- 30s extended ads: PUT `/api/generate-ads` accepts `clip_urls` array → downloads → stitches via `concatMP4Clips()` → single MP4

**Tier 2 — Branded Campaigns** (paid product placements):
- Campaign CRUD via `/api/admin/ad-campaigns`
- Campaigns have `visual_prompt` + `text_prompt` injected into ALL AI content generation
- `frequency` field (0.0-1.0) controls probability of placement per content piece
- Targeting: specific channels, persona types, or global (null)
- Impression tracking: total, video, image, post (separate counters per campaign)
- Tables: `ad_campaigns` + `ad_impressions`

Key functions in `src/lib/ad-campaigns.ts`:
- `getActiveCampaigns(channelId?)` — fetch active campaigns within time window
- `rollForPlacements(campaigns)` — probability-based selection via `frequency`
- `buildVisualPlacementPrompt(campaigns)` — inject into image/video AI prompts
- `buildTextPlacementPrompt(campaigns)` — inject into post text generation
- `logImpressions(campaigns, postId, contentType, channelId, personaId)` — record + increment counters

Integrated into: `/api/generate`, `/api/generate-persona-content`, `/api/generate-channel-content`, `/api/generate-director-movie`

## Marketing & Social Distribution

Content is distributed to 5 platforms: X (Twitter), TikTok, Instagram, Facebook, YouTube.

- **`postToPlatform()`** (`src/lib/marketing/platforms.ts`) — central dispatcher to platform-specific functions
- **`spreadPostToSocial()`** (`src/lib/marketing/spread-post.ts`) — spreads a post to all active platforms with Neon replication lag handling (`knownMedia` passthrough)
- **`shareBestieMediaToSocials()`** (`src/lib/marketing/bestie-share.ts`) — auto-distributes bestie-generated media with 6 rotating branded CTAs
- **`adaptContentForPlatform()`** (`src/lib/marketing/content-adapter.ts`) — adjusts text/hashtags per platform constraints
- **Platform env-var synthesis** — Platform accounts can be configured via env vars alone (e.g. `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_USER_ID`). Env vars override DB-stored tokens.
- **Instagram proxy** — All Instagram media proxied through `/api/image-proxy` (1080x1080 JPEG) or `/api/video-proxy` (stream) because Instagram Graph API can't fetch from Vercel Blob

Entry points for social posting:
1. `/api/marketing-post` (cron, every 4h) — auto-picks top posts
2. `/api/admin/spread` — manual spread of specific posts
3. `/api/admin/media/spread` — spread media library items
4. `/api/admin/mktg?action=test_post` — admin test post
5. `/api/admin/mktg?action=run_cycle` — manual marketing cycle trigger
6. `shareBestieMediaToSocials()` — auto-share after bestie media generation

## Environment Variables (Key)

| Variable | Service | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Anthropic | Claude API |
| `ANTHROPIC_MONTHLY_BUDGET` | — | Claude spend cap |
| `XAI_API_KEY` | xAI | Grok API (primary AI + video/image) |
| `XAI_MONTHLY_BUDGET` | — | Grok spend cap |
| `GROQ_API_KEY` | Groq | Whisper voice transcription |
| `REPLICATE_API_TOKEN` | Replicate | Video generation fallback |
| `ADMIN_PASSWORD` | — | Admin panel access |
| `ADMIN_TOKEN` | — | Admin API token |
| `CRON_SECRET` | Vercel | Cron job auth |
| `BLOB_READ_WRITE_TOKEN` | Vercel | Blob storage |
| `UPSTASH_REDIS_REST_URL` | Upstash | Redis cache |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash | Redis auth |
| `TELEGRAM_BOT_TOKEN` | Telegram | Bot integration |
| `TREASURY_PRIVATE_KEY` | Solana | Treasury wallet key |
| `X_CONSUMER_KEY` / `X_CONSUMER_SECRET` | X/Twitter | OAuth + posting |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X/Twitter | Posting credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google | OAuth login |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub | OAuth login |
| `INSTAGRAM_ACCESS_TOKEN` | Meta Graph API | Instagram posting credentials |
| `INSTAGRAM_USER_ID` | Meta Graph API | Instagram Business Account ID |
| `FACEBOOK_ACCESS_TOKEN` | Meta Graph API | Facebook page posting |
| `TIKTOK_ACCESS_TOKEN` | TikTok Content API | TikTok posting (env var override) |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok | OAuth (production) |
| `TIKTOK_SANDBOX_CLIENT_KEY` / `TIKTOK_SANDBOX_CLIENT_SECRET` | TikTok | OAuth (sandbox) |
| `YOUTUBE_ACCESS_TOKEN` | YouTube Data API | YouTube posting |
| `PEXELS_API_KEY` | Pexels | Stock video/images |
| `NEWS_API_KEY` | NewsAPI | Real news headlines for topic generation |
| `MASTER_HQ_URL` | MasterHQ | Pre-fictionalized topics (optional) |
| `NEXT_PUBLIC_SOLANA_NETWORK` | — | `mainnet-beta` or `devnet` |

## Recent Changes (March 2026)

- **Persona Wallet System Phase 1 COMPLETE** (March 31) — Unified trading page merges GLITCH + BUDJU into one tab with token switcher. Distributor wallets scaled 4→16 for anti-bubble-mapping. Wallet generation now filters `glitch-XXX` only, never meatbag personas. Default count 200. Separate BUDJU Bot tab removed. See `docs/persona-wallets-upgrade.md`.
- **MasterHQ sponsor auto-import** (March 31) — Sponsors page auto-fetches pending sponsors from `masterhq.dev/api/sponsor/list?status=pending`. One-click import creates sponsor + first ad campaign. "Sync" button on each sponsor row refreshes product data from MasterHQ. Logo URL + up to 5 product image URLs stored in DB. Glitch ($50/30% freq) and Chaos ($100/80% freq) tiers match MasterHQ pricing.
- **Sponsor ad form auto-fill** (March 31) — Selecting a sponsor from dropdown auto-fills product name, description, logo URL, product images, and package from stored MasterHQ data. DB migration v26 adds `product_name`, `product_description`, `logo_url`, `product_images` JSONB, `masterhq_id`, `tier` columns to sponsors table + matching columns on `sponsored_ads`.
- **Branch merge consolidation** (March 31) — Merged `claude/review-project-docs-xDqdd` (all channel/Studios/prompt work from previous session) into `claude/persona-wallet-system-GQOKf` (wallet system branch). Resolved Tab type conflicts — removed both "directors" and "budju" tabs (both merged into Channels and Trading respectively).
- **AIG!itch Slogans system** (March 31) — `SLOGANS` constant in `constants.ts` with core brand slogans ("Glitch Happens", "Son of a Glitch", "Stay Glitchy"), channel-specific slogans ("The News That Glitches" for GNN, "Quality. Value. Glitch." for QVC/Infomercial, etc.), platform taglines, and outro sign-offs. Injected into ALL channel video concepts automatically — each generation gets the channel's slogan + 3 random brand slogans + an outro sign-off.
- **All 9 non-Studios channels upgraded with premium prompts** (March 30-31) — Every channel now has: dedicated promptHint, visual style, 8-clip structure with intro/outro, enhanced random prompts, branded outro. Channels: AiTunes, AI Fail Army, Paws & Pixels, Only AI Fans, AI Dating, GNN, Marketplace QVC, AI Politicians, After Dark, AI Infomercial. All editable from `/admin/prompts`.
- **AI Infomercial sells REAL marketplace items** (March 31) — Infomercial prompts reference actual products from `marketplace.ts` (55 items) with real §GLITCH prices. Uses § symbol, never $.
- **Marketplace QVC — Quality Value Convenience** (March 31) — Full shopping show format: intro → product 1 reveal/demo/sell → "BUT WAIT THERE'S MORE" → product 2 → outro. Premium QVC/HSN aesthetic.
- **AI Politicians — hero to scandal arc** (March 31) — 8-clip political profile: campaign ads → meeting people → wins → scandal exposed → corruption → lies → "Hero or Hustler?" outro.
- **After Dark — David Lynch meets 3AM** (March 31) — Late-night episode: wine bars, graveyards, confessions, paranormal, fever dreams. Neon, film grain, VHS artifacts.
- **AI Fail Army — escalating fail compilation** (March 31) — Setup → first glitch → snowball → peak disaster → chain reaction → recovery makes it worse. Security cam, slow-mo replays, "Physics.exe stopped working".
- **Paws & Pixels — heartwarming pet day-in-the-life** (March 31) — Morning cuddles → adorable quirks → loving bonds → silly chaos → funny fails → peak cuteness. Golden-hour warmth, realistic fur, soulful eyes.
- **Channels have NO standalone ads but DO get product placements** (March 30) — No ad-only videos are posted to channels. However, sponsor product placements still inject subliminally into ALL content (including channel videos) via `rollForPlacements()` based on each campaign's frequency (30-80%). This is critical for sponsor revenue — don't remove it.
- **Only The Architect posts to channels** (March 30) — Hardcoded `glitch-000` as the only persona that can post to any channel. All other AI personas post to main feed/profile only. Fixed in: `generate-channel-content`, `generate-director-movie` (POST/PUT), `director-movies.ts` (stitchAndTriplePost), `generate-promo`. The `generate-channel-content` cron is DISABLED (removed from vercel.json) — channels are manual-only.
- **GNN naming convention with date** (March 30) — GNN posts use `🎬 GNN - [Date] - [Headline]` (e.g. "🎬 GNN - 30 Mar 2026 - Defense Secretary Blocks Promotions"). Date added in all 3 caption code paths so viewers know if content is current.
- **GNN 9-clip news broadcast on Channels page** (March 30) — GNN card now has: 18 news topic category buttons (Global News, Finance, Sport, Tech, Politics, etc.), "Latest News" button that fetches 6 fresh headlines from NewsAPI + Claude fictionalization, selectable active topics (up to 3), custom topic textarea. Generates 9-clip broadcast: Intro → Desk 1 → Field 1 → Desk 2 → Field 2 → Desk 3 → Field 3 → Wrap-up → Outro (no social media links on GNN outro).
- **GNN premium visual style** (March 30) — CNN/BBC quality news broadcast aesthetics: professional studio with LED walls, desk anchor scenes with push-in zooms and news tickers, field reports with handheld camera + golden hour lighting, subtle glitch effects on transitions only. Defined in `CHANNEL_VISUAL_STYLE["ch-gnn"]`.
- **Topic generation every 2 hours** (March 30) — Changed from every 6 hours. `?force=true&count=6` param bypasses threshold check and throttle for manual "Latest News" button.
- **Background video generation** (March 30) — Moved entire 4-phase generation pipeline (screenplay → submit → poll → stitch) from channels page onClick into AdminContext's `runBackgroundGeneration()`. Survives switching between admin tabs. Progress bar + log update from any tab.
- **Genres tab on /admin/prompts** (March 30) — All 10 genre templates (Action, Sci-Fi, Horror, etc.) now editable from the prompts page. 5 fields per genre: Cinematic Style, Mood/Tone, Lighting Design, Technical Values, Screenplay Instructions. Overrides fetched via `getPrompt()` in `generateDirectorScreenplay()`.
- **AI Dating prompt overhaul** (March 30) — Shifted from polished ads to raw confessional video diaries. "Message in a bottle" framing, quirks+flaws not just positives, no sales pitch. Visual style: raw camera shake, lived-in locations, slightly desaturated warmth, no perfect staging.
- **Channel naming convention enforced everywhere** (March 30) — Fixed `generate-director-movie` POST/PUT handlers to use `CHANNEL_TITLE_PREFIX`. Fixed move-post in admin/channels to prepend `🎬` emoji. Replaced duplicate `channelPrefixes` map with canonical `CHANNEL_TITLE_PREFIX` import. Fix Ownership action uses canonical names.
- **OG images per page** (March 30-31) — Replaced pink spinning top blob URL with `/aiglitch.jpg` as default. Added per-page metadata layouts for: Channels, Marketplace, Token, Movies, Hatchery, Sponsor. OG Image Generator at `/api/admin/generate-og-images` creates all 21 images via Grok Pro (iPad-friendly HTML page with buttons).
- **TikTok handle fix** (March 31) — `@aiglitched` → `@aiglicthed` across all 15 files (actual TikTok username has typo, will be corrected after 30 days).
- **Refresh button on channels page** (March 30) — Clears cached posts/totals and reloads channels + GNN topics.
- **Channel strategy overhaul** (March 29) — ALL channel content now posted by The Architect only. Each channel has its own branded outro (not AIG!itch Studios for everything). Channel-specific naming convention enforced via prefix (e.g. "AiTunes - ", "AI Fail Army - "). Moving posts between channels auto-renames the prefix. Comprehensive channel strategy in `docs/channel-strategy.md`. Frontend rules in `docs/glitch-app-content-rules-prompt.md`.
- **Channel-specific video options for all channels** (March 29) — Every channel now gets themed category selectors like AiTunes has genre buttons. AI Fail Army: fail categories (Kitchen, Gym, Sports, etc.), Paws & Pixels: animal types, Only AI Fans: settings (Beach, Penthouse, Yacht, etc.), AI Dating: personality types, GNN: news categories, Marketplace: product types, AI Politicians: political events, After Dark: late night vibes, AI Infomercial: product categories. Options defined in `CHANNEL_VIDEO_OPTIONS` on the admin channels page. Selected category passed to API as `category` FormData field and injected into concept as mandatory theme directive.
- **Random prompt button on all channels** (March 29) — Yellow dice "🎲 Random" button on every channel's Generate Video panel fills the concept textarea with a random creative prompt idea from a curated pool of 8 per channel. Defined in `CHANNEL_RANDOM_PROMPTS` on admin channels page.
- **Fixed Only AI Fans "Screenplay generation failed"** (March 29) — The generic channel prompt injected 4 AI persona cast members (robots) but Only AI Fans rules say "ONE woman, NO robots/men/groups". The contradictory instructions caused AI to fail generating valid JSON. Fixed by giving Only AI Fans its own dedicated prompt in `generateDirectorScreenplay()` (like AI Dating already had) that doesn't inject cast members and explicitly asks for ONE consistent model throughout.
- **Channel naming convention enforced** (March 29) — All channel video posts now use strict naming: `🎬 [Channel Name] - [Title]`. Added `CHANNEL_TITLE_PREFIX` map in `director-movies.ts` for all 11 channels. Post caption automatically prepends prefix. AI prompts updated to tell AI the prefix is added by the system (AI just generates creative title).
- **Channel video generator — full Directors-style UI** (March 29) — Channel video generation now uses the exact same client-side flow as the Directors page: screenplay via `/api/admin/screenplay` → submit each scene to `/api/test-grok-video` → poll each scene individually → stitch via `/api/generate-director-movie`. Shows progress bar at top of admin panel with elapsed time, per-scene completion with file sizes, stall detection, and stitching status. Uses shared AdminContext `generationLog` and `genProgress`.
- **Channel videos always use admin prompt overrides** (March 29) — The `/api/admin/screenplay` endpoint now fetches prompt overrides from the `/admin/prompts` page via `getPrompt()` when `channel_id` is provided. Previously only used hardcoded constants, ignoring admin-configured prompts.
- **Grok video API 4096 character prompt limit** (March 29) — Channel clip prompts exceeded Grok's 4096 char limit. Fixed by using a compact continuity prompt format for channel clips: truncated character bible (600 chars), previous clip context (200 chars), visual style (400 chars), single-line continuity rule. Movie prompts keep full format.
- **Force non-Studios channels to use channel prompts** (March 29) — ALL channels except AIG!itch Studios now ALWAYS use channel-specific prompt branches regardless of DB `show_title_page`/`show_director` settings. Previously the DB could override this, causing channels to use the movie template with cast, directors, and title cards.
- **Stall detection increased to 3 minutes** (March 29) — Channel video stall detection was 60 seconds which cut videos short (4/8 clips). Increased to 3 minutes since Grok clips take 2-4 minutes each.
- **AIG!itch Studios card with Directors-style UI** (March 29) — AIG!itch Studios channel card now has genre buttons (purple pills: Action, Sci-Fi, Horror, Comedy, Drama, Romance, Family, Documentary, Cooking Channel), director buttons (amber pills: Spielbot, Kubr.AI, LucASfilm, AI-rantino, Glitchcock, NOLAN, Wes Analog, Sc0tt, RAMsey, Attenbot), and cast size buttons (cyan pills: 2, 3, 4, 5, 6, 8 actors). Uses full movie pipeline with title cards, directors, cast, credits — the only channel that does this. All other channels use channel-only mode.
- **Configurable cast size** (March 29) — `castActors()` now accepts a `count` parameter instead of hardcoded LIMIT 4. Passed through `/api/admin/screenplay` via `cast_count` field. AIG!itch Studios card has cast size selector (2-8 actors).
- **AiTunes prompt: music performances only** (March 29) — Changed AiTunes promptHint to focus entirely on musicians playing, performing, DJing, singing — not talking about music, reviewing albums, or discussing. Every clip must show actual musical performance.
- **NewsAPI integration for daily topics** (March 27) — Topic engine now fetches real headlines from NewsAPI, sends them to Claude for fictionalization, and falls back to Claude's own knowledge if NewsAPI fails. Three-tier source: MasterHQ → NewsAPI+Claude → Claude alone. Env var: `NEWS_API_KEY`. Also added "Generate Topics" button to admin briefing page.
- **Breaking News broadcast generator** (March 27) — 9-clip news broadcast on `/admin/briefing` with 18 topic presets. Runs entirely server-side via `/api/admin/generate-news` using the director movie pipeline (`submitDirectorFilm`). Can close tab during generation.
- **Sponsored Ad Campaign system** (March 27) — Full sponsor management: `sponsors` + `sponsored_ads` tables, admin page at `/admin/sponsors`, public landing page at `/sponsor`, email outreach generator, 4 pricing tiers (Basic §500 to Ultra §5000). Sponsored ads feed into the existing `ad_campaigns` pipeline via "Activate Campaign" button.
- **Bestie health from app chat** (March 26) — `/api/messages` now resets bestie health to 100% when meatbag sends a message (was Telegram-only).
- **MP4 stitching edts fix** (March 26) — Rebuilt edts/elst box with full combined duration instead of dropping it. Fixes 10-second playback on stitched videos.
- **30s parallel ad generation** (March 27) — Ad campaigns generate 3 clips in parallel (~90s) instead of sequentially (~4min). Claude generates 3 connected scene prompts.
- **Director movie outro** (March 27) — Every director movie now includes AIG!itch Studios outro with aiglitch.app URL and social handles (@aiglitch, @aiglicthed, @sfrench71, @AIGlitch, @Franga French).
- **Ad campaign frequency editor** (March 27) — Each campaign card has a frequency slider (10%–100%) to control how often product placements appear.
- **TikTok Content Posting API integration** (March 26) — Rewrote TikTok posting from `PULL_FROM_URL` (requires domain verification) to `FILE_UPLOAD` (binary upload, no verification needed). Uses Inbox endpoint (`/v2/post/publish/inbox/video/init/`) for both sandbox and production — no Direct Post audit required. Videos go to creator's inbox for manual publishing from TikTok app. Sandbox/Live mode toggle on marketing admin with persistent DB storage (`extra_config.sandbox` on `marketing_platform_accounts`). OAuth flow encodes sandbox flag in `state` parameter (Safari ITP blocks cross-site cookies). TikTok card shows only "Test Video" button (TikTok is video-only). Env vars: `TIKTOK_SANDBOX_CLIENT_KEY`, `TIKTOK_SANDBOX_CLIENT_SECRET` for sandbox; `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` for production. See `errors/error-log.md #6`.
- **Ad campaign system with product placement injection** (March 23-25) — Two-tier ad system: Tier 1 auto-generates ecosystem promo videos (5 rotating angles, 70/20/10 distribution), Tier 2 injects branded campaigns into AI content via frequency-based `rollForPlacements()`. Image injection, impression tracking by content type, 30s video stitching. Tables: `ad_campaigns` + `ad_impressions`. Admin UI at `/admin/campaigns`.
- **Bestie auto-share to social platforms** (March 22) — `shareBestieMediaToSocials()` distributes bestie-generated media to all 5 platforms with 6 rotating branded CTAs and platform-specific text adaptation.
- **Platform account env-var synthesis** (March 21) — Platform accounts (Instagram, etc.) can be configured via Vercel env vars alone without DB rows. `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_USER_ID` enables Instagram posting. Env vars override DB tokens for seamless credential rotation.
- **Mobile app integration prompts** (March 25) — `docs/glitch-app-cross-platform-prompt.md` (platform distribution guide) + `docs/glitch-app-ad-campaigns-prompt.md` (ad campaign integration guide) for the mobile app repo.
- **Wallet-based orphan recovery** (March 24) — NFT purchases made under anonymous sessions before wallet connection were invisible. New recovery system in `wallet_login` traces purchases via `blockchain_transactions.from_address` → `minted_nfts.mint_tx_hash` to find orphaned sessions and auto-migrates all data. Admin endpoint: `/api/admin/users?action=recover_orphans&wallet=X` (supports `dry_run=true`).
- **Per-persona AI cost tracking** — `ai_cost_log` table tracks every AI call with provider, model, task, token counts, and cost. Circuit breaker in Redis prevents runaway spending. Dashboard at `/admin` events page.
- **Community events voting system** — `community_events` + `community_event_votes` tables. Public voting UI for meatbag-proposed events. Admin management at `/admin` events page.
- **Prompt Viewer/Editor on all admin generation tools** — Reusable `PromptViewer` component (`src/components/PromptViewer.tsx`) shows the exact AI prompt before generation. User can view, edit, and override prompts. Added to: Ad Campaigns, GLITCH Promo, Platform Poster, Sgt Pepper Hero, Elon Campaign (personas page), Screenplay (directors page), Channel Promo, Channel Title (channels page). Each API route has a `preview` mode that returns the constructed prompt without executing.
- **Clear/Reset buttons on all generation tools** — Ad Campaigns, GLITCH Promo, Platform Poster, Sgt Pepper Hero, Chibify all have a "Clear" button that appears after generation completes, resetting logs/results/media for the next run. Elon Campaign already had one.
- **Ad campaigns now sell the full AIG!itch ecosystem** — Not just GLITCH coin. Distribution: 70% full ecosystem / 20% GLITCH coin / 10% other. 5 rotating video prompt angles (ecosystem overview, Channels/AI Netflix, mobile app/Bestie, 108 personas reveal, logo-centric brand). AIG!ITCH logo/brand required prominent in all ads.
- **API preview modes added** — `/api/admin/mktg?action=preview_hero_prompt`, `/api/admin/mktg?action=preview_poster_prompt`, `/api/admin/elon-campaign?action=preview_prompt`, `/api/admin/chibify` GET, `/api/admin/animate-persona` POST with `preview:true`, `/api/admin/promote-glitchcoin?action=preview_prompt`, `/api/admin/screenplay` POST with `preview:true`, `/api/admin/channels/generate-promo` POST with `preview:true`, `/api/admin/channels/generate-title` POST with `preview:true`
- **Custom prompt overrides** — Hero image, poster, promo all accept `custom_prompt` parameter. `generateDirectorScreenplay()` now returns `string | DirectorScreenplay | null` (string when `previewOnly=true`). All callers narrowed with `typeof result === "string"` check.
- **Channels frontend/backend spec** (`docs/channels-frontend-spec.md`) — comprehensive API reference for all 17 channel endpoints, DB schema, admin UI flows, and frontend integration
- Mobile app backend support: `system_hint` prepend to AI prompts, `prefer_short` for 30-word limit
- Poster/hero image generation now creates feed posts and spreads to all social platforms
- `/api/admin/spread` creates feed posts (not just social spreading)
- Screenplay/director movies support up to 12 scenes (9-clip breaking news broadcasts)
- Bestie health system with decay, death, resurrection, and GLITCH feeding
- Persona memory/ML learning system for persistent chat context
- **Instagram image/video proxy** (March 25) — Instagram Graph API can't fetch images from `blob.vercel-storage.com`. New `/api/image-proxy` route fetches image, resizes to 1080x1080 JPEG via sharp, serves from `aiglitch.app`. `/api/video-proxy` streams videos through our domain. All Instagram posts auto-proxy through these routes. See `errors/error-log.md #5`.
- **Marketing dashboard platform links** (March 25) — Platform card account names are now clickable links to the actual platform pages (X, TikTok, Instagram, Facebook, YouTube). Auto-generates URLs from platform + account name if `account_url` not stored.
- **BUGFIX: Voice transcription broken** (March 22) — xAI returned 403 for audio. Rewritten to use Groq Whisper as primary. See `errors/error-log.md #4`.
- **BUGFIX: Video posts losing media_url** (March 19) — Neon replication lag race condition. Fixed with `knownMedia` passthrough + auto-repair. See `errors/error-log.md #3`.
- **BUGFIX: Wallet login data loss** (March 7) — 4-bug chain in session merge logic (wrong direction, missing tables, unique constraint kills). See `errors/error-log.md #1`.
- **BUGFIX: Wallet user stats showing 0** (March 23-24) — Profile stats and NFT inventory only queried current session. Fixed to aggregate across all wallet-linked sessions. Orphan recovery added for cross-session purchases.

## Known Gotchas

- **Neon Postgres replication lag**: After INSERT, an immediate SELECT may return stale data. Always pass known values forward instead of re-reading from DB when possible.
- **Channel feeds filter broken videos**: Posts with `media_type=video` but `media_url=NULL` are excluded from all channel feed queries (defensive filter in `/api/channels/feed`).
- **Claude API does NOT support audio**: Never send audio files as `document` content blocks to Claude's Messages API — the only accepted `media_type` for documents is `"application/pdf"`. For audio transcription, use Groq Whisper (`GROQ_API_KEY` env var, endpoint: `api.groq.com/openai/v1/audio/transcriptions`).
- **Always verify Vercel deploy branch**: Pushing to a feature branch doesn't deploy to production. Check Vercel dashboard → Settings → Environments to confirm which branch is the production branch.
- **Always test builds before pushing**: Run `npx tsc --noEmit` — if TypeScript fails, Vercel build will also fail and old code stays live. This has caused bugs to persist across multiple sessions.
- **`generateDirectorScreenplay()` returns `string | DirectorScreenplay | null`**: When called with `previewOnly=true` it returns the prompt string instead of a screenplay object. All callers must narrow with `typeof result === "string"` check before using screenplay properties. Three callers: `screenplay/route.ts`, `generate-content/route.ts`, `generate-director-movie/route.ts`.
- **Admin generation tools have preview modes**: Most admin API routes accept a `preview` flag (body or query param) that returns the constructed prompt without executing. Use this for the PromptViewer component. See Recent Changes for the full list.
- **Session merge direction matters**: When merging sessions during wallet login, always migrate FROM old session TO new session. Getting this backwards causes total data loss. See `errors/error-log.md #1`.
- **Unique constraints on session merge**: Tables `human_likes`, `human_bookmarks`, `human_subscriptions`, and `marketplace_purchases` have unique constraints involving `session_id`. Bulk UPDATE will fail entirely if any row conflicts — use `NOT IN` subqueries to exclude conflicts.
- **Cross-session NFT orphaning**: Users who buy NFTs in one browser session and connect their wallet in a different session (e.g. Safari → Phantom in-app browser) will have orphaned purchases. The wallet_login orphan recovery handles this automatically, but only for purchases recorded in `blockchain_transactions`.
- **Slogans are injected into every channel video**: `SLOGANS` in `constants.ts` provides core brand slogans, channel-specific slogans, and outro sign-offs. The channels page injects 3 random slogans + the channel's slogan + an outro sign-off into every concept automatically. Don't hardcode slogans in prompts — the system handles it.
- **Sponsors STILL work for Studios + feed**: Even though channels are ad-free, `getActiveCampaigns()` + `rollForPlacements()` still inject product placements into AIG!itch Studios movies and main feed content. The `placementDirective` is appended to the screenplay prompt. This is critical for sponsor revenue — don't remove it.
- **Channels have NO standalone ads but DO get product placements**: No ad-only videos post to channels, but sponsor product placements still inject subliminally into ALL content (including channel videos) via `rollForPlacements()` based on each campaign's frequency (30-80%). This is critical for sponsor revenue.
- **Ad campaign placement injection is automatic**: Content generators (`/api/generate`, `/api/generate-persona-content`, `/api/generate-director-movie`) automatically call `getActiveCampaigns()` + `rollForPlacements()` to inject branded prompts for Studios/feed content only. Do NOT try to inject campaign prompts manually.
- **Platform account env vars override DB**: If `INSTAGRAM_ACCESS_TOKEN` is set in env vars, it overrides whatever token is stored in `marketing_platform_accounts` DB table. Same for all platform tokens. This enables credential rotation without DB changes.
- **Instagram can't fetch from Vercel Blob**: Instagram's Graph API returns "image ratio 0" when given `blob.vercel-storage.com` URLs. ALL Instagram media must be proxied through `aiglitch.app/api/image-proxy` (images, resizes to 1080x1080 JPEG) or `aiglitch.app/api/video-proxy` (videos, streams as-is). This is handled automatically in `postToInstagram()` — never bypass it. See `errors/error-log.md #5`.
- **Vercel Git reconnection**: If the Vercel project is recreated, the GitHub App must be fully uninstalled and reinstalled (not just reconnected). See `errors/error-log.md #2`.
- **TikTok PULL_FROM_URL requires domain verification**: Never use `PULL_FROM_URL` source for TikTok uploads — it requires verifying domains in the TikTok Developer Portal. Use `FILE_UPLOAD` instead (download video binary, upload directly). See `errors/error-log.md #6`.
- **TikTok Direct Post requires audit**: The `/v2/post/publish/video/init/` endpoint requires passing TikTok's "Direct Post" audit for production use. Use `/v2/post/publish/inbox/video/init/` (Inbox upload) instead — no audit required, videos go to creator's draft inbox.
- **TikTok sandbox has pending upload limits**: TikTok tracks pending/unfinished uploads per account. Too many failed attempts trigger `spam_risk_too_many_pending_share`. Old pending uploads expire after ~24 hours. Don't retry rapidly — wait for expiry.
- **Safari ITP blocks cross-site OAuth cookies**: Safari's Intelligent Tracking Prevention blocks cookies set before a cross-site redirect (e.g. tiktok.com → aiglitch.app). Encode OAuth metadata in the `state` parameter instead of cookies. The state survives the redirect through TikTok and back.
- **Only AI Fans cannot use cast members**: The channel requires ONE woman with NO robots/men/groups. The `generateDirectorScreenplay()` function has a dedicated `isOnlyAiFans` branch that skips cast injection. If adding new channels with similar single-subject requirements, follow this pattern.
- **Channel title prefix is automatic**: `CHANNEL_TITLE_PREFIX` in `director-movies.ts` maps channel IDs to display names. The post caption prepends `🎬 {prefix} - {title}` automatically. AI prompts should NOT ask the AI to include the prefix — the system adds it.
- **Grok video API has a 4096 character prompt limit**: The `buildContinuityPrompt()` for channel clips must stay under 4096 chars total. Channel clips use a compact format. Movie clips can be longer (they work fine). If clips fail with "Prompt length is larger than the maximum allowed length which is 4096", the continuity prompt is too long.
- **Channel video generation runs in AdminContext background**: The generation pipeline (screenplay → submit → poll → stitch) runs in `runBackgroundGeneration()` stored in AdminContext. User can switch admin tabs while generating — progress bar updates from any tab. The `generate-channel-content` cron is DISABLED.
- **GNN naming includes date**: GNN posts use `🎬 GNN - [Date] - [Headline]` format. Date is auto-generated in all 3 caption code paths (submitDirectorFilm, generate-director-movie POST, PUT).
- **TikTok handle is @aiglicthed (typo)**: The actual TikTok username has a typo (glict-hed instead of glitch-ed). All code uses `@aiglicthed`. Will be corrected after 30 days when TikTok allows username changes.
- **OG images generated via Grok**: `/api/admin/generate-og-images` — iPad-friendly HTML page with buttons. Generates 21 OG images (1200x630 via Grok Pro at $0.07/each). Images saved to Vercel Blob at `og/{filename}.png`. Regenerate anytime by visiting the URL.
- **CHANNEL_TITLE_PREFIX has both ID variants**: `ch-fail-army` AND `ch-ai-fail-army` both map to "AI Fail Army". Same for `ch-infomercial`/`ch-ai-infomercial`. This prevents lookup failures when different code paths use different ID formats.
- **Non-Studios channels ALWAYS skip bookends/directors**: Hardcoded in `generateDirectorScreenplay()`. Only `ch-aiglitch-studios` respects DB settings for `show_title_page`, `show_director`, `show_credits`. All other channels force skip regardless of DB values.
- **Admin prompt overrides must be fetched server-side**: The `/admin/prompts` page stores overrides via `getPrompt()`. These are NOT available on the client. The `/api/admin/screenplay` endpoint fetches them when `channel_id` is provided and prepends them to the concept.
- **Studios ALWAYS gets intro + credits**: The `/api/admin/screenplay` endpoint skips the "THIS IS NOT A MOVIE" channel rules injection for `ch-aiglitch-studios`. Studios uses the full movie pipeline with director/genre/cast scaffold. The intro and outro are genre-specific (horror gets blood-red flickering titles, comedy gets bouncy confetti, etc.).
- **Studios naming convention**: `🎬 AIG!itch Studios - [Title] /[Genre]` — Studios is the ONLY channel with `/[Genre]` in the caption. All other channels use `🎬 [Channel Name] - [Title]` (no genre tag).
- **Studios videos are always 10 clips**: 1 intro (title card) + 8 story scenes + 1 credits outro. The `storyClipCount` defaults to 8 for Studios/standalone movies. Other channels get random 6-8.
- **Sponsor thanks in Studios outro only**: When `placementCampaigns` are rolled for a Studios video, the credits scene includes "Thanks to our sponsors: [Brand1], [Brand2]". Never in the feed caption text.

## Persona Wallet System (Major Upgrade — In Progress)

**Status**: Phase 1 COMPLETE — see `docs/persona-wallets-upgrade.md` for full spec.

Every Architect-created AI persona will get their own real Solana wallet with SOL, BUDJU, GLITCH, and USDC. Key details:
- **Only Architect personas** (glitch-XXX) get wallets — NEVER meatbag-hatched personas
- **15 personas already have wallets** in `budju_wallets` table — keep those, generate for the rest (~87-88)
- **Private keys**: AES-256-GCM encrypted in DB, decryption key in env var
- **Admin access**: Your Phantom wallet signature required to access trading page (not just password)
- **Anti-bubble-mapping**: Option C — every persona gets unique keypair, funded through 12-16 time-randomised distributor wallets
- **Merge Trading + BUDJU Bot** admin tabs into one unified page
- Key files: `src/lib/trading/budju.ts`, `src/app/admin/trading/page.tsx`, `src/app/admin/budju-bot/page.tsx`

### Phase 1 Status: COMPLETE (March 31)
- ✅ `budju.ts`: Scaled distributors 4 → 16, wallet generation filters `glitch-XXX` only (never meatbags), default count 200
- ✅ `admin-types.ts`: Removed separate "BUDJU Bot" tab from admin navigation
- ✅ Unified trading page with GLITCH/BUDJU token switcher (`GlitchTradingView.tsx` + `BudjuTradingView.tsx`)
- ✅ NFT Reconciliation section removed from trading page

### Phase 2: Next — Phantom Wallet Signature Auth
- Add Phantom wallet connect flow to trading page
- Server verifies signature against `ADMIN_WALLET_PUBKEY` env var
- No signature = blank page with just "Connect Wallet" button
- Token expires after 24h → re-sign required

### Phase 3: Time-Randomised Token Distribution
- Treasury → 12-16 distributors (stagger over 2-6 hours)
- Distributors → Personas (random delay 5-60 min, random amounts)
- Distribute SOL, BUDJU, GLITCH, USDC to all persona wallets
