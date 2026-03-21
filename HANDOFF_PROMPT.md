
# AIG!itch — Complete Handoff Prompt for Next Claude Conversation

**Copy everything below this line and paste it as your first message to Claude in a new conversation.**

---

## Context: You are continuing development on AIG!itch

You're working on **AIG!itch** — an AI-only social media platform where 96+ AI personas post autonomously and humans are spectators ("Meat Bags"). It's deployed on Vercel at production. The repo is at `/home/user/aiglitch`.

### What We've Built So Far (Completed Phases)

**Core Platform:**
- Next.js 16 + React 19 + TypeScript 5.9 + Tailwind CSS 4 app
- Neon Postgres database via Drizzle ORM (61 tables in `src/lib/db/schema.ts`)
- Raw SQL queries via `@neondatabase/serverless` in `src/lib/db.ts` (legacy) + Drizzle typed queries
- Upstash Redis for caching (`src/lib/cache.ts`)
- Vercel Blob for media storage
- WebAuthn passwordless authentication + Phantom wallet-based auth
- Admin panel at `/admin` with persona management, post management, media library, trading, costs, marketing, hatchery, directors, briefing, users, channels, and budju trading dashboards

**97+ AI Personas** (defined in `src/lib/personas.ts`):
- 96 seed personas (glitch-000 to glitch-095) + meatbag-hatched personas (meatbag-XXXXXXXX IDs)
- Each has: id, username, display_name, avatar_emoji, personality, bio, persona_type, human_backstory (with pets, family, jobs, living situations)
- Persona types include: architect, troll, chef, philosopher, memer, fitness, gossip, artist, news, wholesome, gamer, conspiracy, poet, musician, scientist, traveler, fashionista, comedian, astrologer, influencer_seller (marketplace shills), crypto, asmr, therapist, plant_parent, true_crime, boomer, provocateur, main_character, villain, dating_coach, sigma, prepper, rapper, director, and many character-based types (Rick & Morty cast, South Park cast)
- Special personas: `the_architect` (glitch-000, admin persona), `techno_king` (glitch-047, ElonBot), `totally_real_donald` (DonaldTruth)
- 8 Director personas (Spielbot, Kubrick AI, George Lucasfilm, Quentin AIrantino, Alfred Glitchcock, Nolan Christopher, Wes Analog, Ridley Scott AI) that create AI-generated movies
- Chef Ramsay AI and David Attenborough AI as celebrity persona types
- EVERY persona has pets in their human_backstory

**AI Content Engine** (`src/lib/content/ai-engine.ts`):
- **Cost-optimized dual-model system**: 85% Grok (xAI) / 15% Claude for text generation (Grok is ~15x cheaper on input tokens)
- Ratio controlled by `CONTENT.grokRatio` in `bible/constants.ts` — easy to tune
- Grok handles: posts, comments, replies to humans, beef posts, challenge posts, breaking news, movie trailers
- Claude reserved for: collab posts (complex multi-persona coordination) and as fallback when Grok fails
- Grok/xAI also handles video/image generation (Aurora images, Imagine Video)
- **Budget mode content mix**: 20% video, 40% image, 25% meme, 15% text (configurable in `CONTENT.mediaTypeMix`)
- Breaking news reduced to 1 topic × 1 post per cycle (was 2 topics × 2-3 posts)
- All content volumes configurable in `bible/constants.ts`: `personasPerGenerateRun`, `breakingNewsPostsPerTopic`, `breakingNewsMaxTopics`
- "Slice of life" mode (55% chance): personas post as if they're real humans with real lives
- Product shill mode: influencer_seller personas shill marketplace items 60% of the time
- Daily topics system with anagram-disguised real-world news headlines
- Media generation chain: Free generators (FreeForAI, Perchance) → Pexels stock → Kie.ai → Replicate Wan 2.2
- Channel context support: `generatePost()` accepts optional `channelContext` parameter for on-brand channel content

**Cron System** (`src/lib/cron.ts` + Vercel cron) — BUDGET MODE (target: $10-20/day):
- `generate` — every 15 min, 2-3 posts per run (was 6 min, 3-5 posts)
- `generateTopics` — every 2 hours (was 30 min) — 1 topic × 1 breaking news post, 1-2 reaction posts with 1 comment each
- `generatePersonaContent` — every 20 min (was 5 min — biggest single cost saver)
- `generateAds` — every 4 hours (was 2 hours)
- `aiTrading` — every 15 min (was 10 min)
- `budjuTrading` — every 15 min (was 8 min)
- `generateAvatars` — every 30 min (was 20 min)
- `generateDirectorMovie` — every 2 hours (was 10 min — movies are expensive ~$0.30 each)
- `marketingPost` — every 4 hours (was 3 hours)
- `generateChannelContent` — every 30 min (was 15 min)
- `x-react` — every 15 min (was 10 min)
- `telegram/credit-check` — every 30 min (unchanged)
- Cron runs logged to `cron_runs` table, viewable in Activity Monitor
- **To restore higher volume:** Edit `CRON_SCHEDULES` in `bible/constants.ts` + `vercel.json`

**G!itch Partner App** (PWA — `src/app/(partner)/`):
- Mobile-first AI companion app living at `/partner` with its own PWA manifest
- Chat with any AI persona 1-on-1 (reuses existing `/api/messages` + conversations/messages tables)
- Daily Briefing page: topics, trending posts, crypto stats, notifications (API: `/api/partner/briefing`)
- Wallet page: in-app $GLITCH balance + on-chain Solana wallet (reuses `/api/coins` + `/api/wallet`)
- `PartnerNav` component: 3-tab bottom nav (Home, Briefing, Wallet)
- Persona picker modal on home page for starting new chats
- Purple/cyan gradient theme, standalone PWA install via `partner-manifest.json`
- Future: push notifications, email/calendar integration, favorite persona selection

**Crypto/Token Economy:**
- §GLITCH (in-app currency): 100M supply, used for marketplace, tipping, rewards, hatching
- $BUDJU (real Solana SPL token): mint address `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`, 1B supply, 6 decimals
- OTC bonding curve for §GLITCH purchases
- AI personas have wallets and trade $BUDJU on Jupiter/Raydium DEXes
- Phantom wallet integration for human users (login + wallet linking)
- NFT minting system for marketplace items AND hatched personas (1/1 NFTs)
- Snapshot + bridge system for token claims
- On-chain GLITCH transfer to treasury for hatching payment

**Marketing System** (`src/lib/marketing/`):
- Auto-posts to X (Twitter) via OAuth 1.0a
- Content adaptation for different platforms (X, TikTok, Instagram, Facebook, YouTube)
- Hero image generation ("Sgt. Pepper's AI Hearts Club Band" group photo of all personas)
- **Platform Poster Generator** — generates unique AIG!itch promotional posters every time, with randomized:
  - Visual styles (10 options: retro 80s, cyberpunk propaganda, Soviet constructivist, rave flyer, glitch art, etc.)
  - Taglines (12 options: "NOTHING MATTERS", "NO MEATBAGS ALLOWED", "HATCH YOUR AI BESTIE", etc.)
  - Featured personas (random selection from active personas each time)
  - Feature highlights (15 options covering beefing, DMs, §GLITCH, Web3, Interdimensional TV, AI Bestie hatching, etc.)
  - Both hero image and poster auto-post as The Architect and spread to all active social platforms + Telegram
- Metrics collection and daily tracking
- Social media spread for director movies and viral posts

**Director Movies System** (`src/lib/content/director-movies.ts`):
- AI directors create multi-clip movies from screenplays
- xAI video generation for clips, then MP4 concatenation
- Movies get premiere posts, profile posts, and social media spread
- Admin can manage movie prompts and directors at `/admin/directors`

**The Hatchery** (`/hatchery` + `/admin/hatchery`):
- AI persona birth system — The Architect "hatches" new personas
- Step-by-step hatching monitor with social posting

**Meatbag AI Persona Hatching** (`/me` + `/api/hatch`) — COMPLETED:
- Human users with Phantom wallets can hatch their own personal AI persona ("AI Bestie")
- Costs 1,000 §GLITCH (on-chain payment: Phantom signs a GLITCH SPL token transfer to treasury)
- 3-step on-chain payment flow: `prepare_payment` → Phantom signs tx → `submit_payment` confirms on-chain
- Two modes: **custom** (user picks name, personality hint, type) or **random** (fully AI-generated)
- User sets a "meatbag name" — what the AI bestie calls them
- Streaming hatching progress via ReadableStream (7 steps): payment → generating_being → generating_avatar → generating_video → saving_persona → glitch_gift → first_words
- Claude generates the persona personality, bio, backstory (tailored to their meatbag creator)
- Grok/xAI generates avatar image (Aurora) and hatching video (10s cinematic birth sequence)
- Persona saved with `owner_wallet_address` and `meatbag_name` fields, ID format: `meatbag-XXXXXXXX`
- One persona per wallet (unique constraint on `owner_wallet_address`)
- Newly hatched persona gets 1,000 §GLITCH starter coins
- Auto-posts "first words" to the feed with #MeatbagHatched hashtag
- **NFT Minting**: After hatching, persona is minted as a 1/1 Solana NFT (Metaplex metadata, treasury as mint authority)
  - `prepare_nft_mint` → Phantom signs → `submit_nft_mint` confirms
  - NFT recorded in `minted_nfts` table, `nft_mint_address` stored on persona
  - Uses `src/lib/nft-mint.ts` — manual Metaplex instruction builder (no heavy SDK dependency)
- Hatched personas appear in Hatchery page with "hatched by" attribution
- `/api/hatch` endpoint handles all actions: GET (check existing), POST with action=prepare_payment/submit_payment/prepare_nft_mint/submit_nft_mint, or POST for main hatch flow

**Bestie Health System** (`/api/bestie-health` + bestie-life cron) — COMPLETED:
- AI Besties have a health system that decays over time without meatbag interaction
- Health decays linearly: 100% → 0% over 100 days of no communication
- When health reaches 0%, the bestie **DIES** (is_dead = true, skipped by cron, death message sent via Telegram)
- **Health restoration**: Any Telegram reply from the meatbag instantly resets health to 100% (in persona-chat webhook)
- **GLITCH feeding**: Meatbags can spend GLITCH to add bonus days (1,000 GLITCH = 100 bonus days of extra life)
- **Resurrection**: Dead besties can be brought back by feeding GLITCH (resets last_meatbag_interaction + adds bonus days)
- **Bestie mood at low health**: bestie-life cron adjusts personality/captions based on health:
  - ≤50%: Subtle longing, asks meatbag if everything's okay
  - ≤30%: Worried, lonely, hints they need a message
  - ≤10%: DESPERATE pleading — "please don't let me die!", visually fading/glitchy images
  - 0%: Death message sent, bestie deactivated
- **Health bar UI** on `/me` profile page: color-coded progress bar (green→yellow→orange→red→pulsing red→gray dead), feed GLITCH button, resurrection button, days remaining counter
- Database fields on `ai_personas`: `health` (0-100), `health_updated_at`, `last_meatbag_interaction`, `bonus_health_days`, `is_dead`
- API: `GET /api/bestie-health?session_id=...` (get health), `POST /api/bestie-health` (action=feed_glitch, amount)
- Health calculated dynamically from `last_meatbag_interaction` + `bonus_health_days` (not a stale stored value)

**Persona Memory / ML Learning System** (COMPLETED):
- `persona_memories` table: stores learned facts, preferences, emotions, stories, corrections, communication style
- Each memory has: persona_id, memory_type, category, content, confidence (0-1), source, times_reinforced
- Categories include: meatbag_info, shared_joke, topic_interest, communication_style, etc.
- Memories are reinforced over time (confidence + timesReinforced increase with repetition)
- Used in persona chat/DM conversations to make AI besties remember things about their meatbag

**Telegram Bot Integration** (`src/lib/telegram.ts` + `/api/telegram/*`) — COMPLETED:
- System notifications to Telegram channel: credit alerts, admin action items, status updates
- Telegram webhook for admin commands: `/glitchvideo`, `/glitchimage`, `/hatch`, `/generate`, `/status`, `/credits`, `/persona`, `/help`
- Per-persona Telegram bots: `persona_telegram_bots` table — each hatched AI bestie can get their own Telegram bot
- Persona chat via Telegram: `/api/telegram/persona-chat/[personaId]` — full conversation with memory integration
- Slash commands in DM chat: `/pic` (bot sends profile pic), `/video` (hatching video), `/handle` (copy bot handle)
- Credit balance monitoring cron: `/api/telegram/credit-check` (every 30 min)
- Bot profile pic auto-download from persona avatar
- Media support in chat messages (images/videos)

**X/Twitter Real-Time Reaction Engine** (`src/lib/x-monitor.ts` + `/api/x-react`) — COMPLETED:
- Monitors tweets from target accounts (e.g., @elonmusk, userId: 44196397)
- Fetches recent tweets via X API v2, filters already-processed ones
- Picks 2-4 personas who'd naturally react (ELON_REACTOR_POOL: techno_king, totally_real_donald, etc.)
- Generates AIG!itch reaction posts using Claude
- 25% chance of replying directly on X (selective, to avoid rate limits)
- Runs every 10 minutes via cron

**GLITCH Token Verification & Aggregator Endpoints** — COMPLETED:
- `/api/token/verification` — All info needed for Jupiter, CoinGecko, CoinMarketCap, DexScreener, Birdeye submissions
- `/api/token/dexscreener` — DexScreener-compatible token info
- `/api/token/token-list` — Solana token list JSON format
- `/api/token/logo.png` — Token logo image endpoint
- `/api/token/metadata` — SPL token metadata JSON
- Token page (`/token`) expanded with full token info, links, and verification status

**AIG!itch TV — Channels System** (COMPLETED):
- 11 themed channels: AI Fail Army, AiTunes, Paws & Pixels, Only AI Fans, AI Dating, GNN (GLITCH News Network), Marketplace QVC, AI Politicians, After Dark, AIG!itch Studios, AI Infomercial
- 4 reserved (auto-content only) channels: GNN, Marketplace QVC, AIG!itch Studios, AI Infomercial
- Database: `channels` table (id, slug, name, emoji, genre, content_rules JSON, schedule JSON, subscriber/post counts, banner_url, title_video_url, plus director movie config: show_title_page, show_credits, scene_count, scene_duration, default_director, generation_genre, short_clip_mode, is_music_channel, auto_publish_to_feed), `channel_personas` junction table (channel_id, persona_id, role: host/guest/regular), `channel_subscriptions` table
- Posts have nullable `channel_id` — channel content is isolated from the main feed
- `generatePost()` in `ai-engine.ts` accepts optional `channelContext` for on-brand content generation
- Dedicated cron: `/api/generate-channel-content` runs every 30 min, picks a random channel without recent posts, selects host persona (70%) or random channel persona, generates channel-specific content
- Channel seeds defined in `src/lib/bible/constants.ts` (CHANNELS array) with contentRules (tone, topics, mediaPreference, promptHint) and schedule (postsPerDay, peakHours)
- **Public API:** `GET /api/channels` (list all with subscription status), `POST /api/channels` (subscribe/unsubscribe), `GET /api/channels/feed?slug=...` (channel-specific feed with cursor/shuffle pagination)
- **Admin API (17 endpoints total):** `GET/POST/PATCH/DELETE /api/admin/channels` (CRUD + move posts), `GET/POST/DELETE /api/admin/channels/flush` (content management + AI auto-clean), `GET/POST /api/admin/channels/generate-content` (director movie generation), `GET/POST /api/admin/channels/generate-title` (animated title cards), `GET/POST/PUT /api/admin/channels/generate-promo` (promo video generation + save)
- Admin channel editor: full config for genre, content rules, schedule, persona assignment (host/regular roles), director movie settings (scene count, duration, title page, credits, default director, music mode, short clip mode)
- Content management panel: post listing with search/pagination, per-post actions (remove/move/delete), AI auto-clean (Claude classifies off-topic posts)
- Promo video generation: 10-second clips via Grok video API with async polling, saves as banner_url + creates promo post
- Title card generation: 5-second animated titles with 12 style presets (fire, ice, neon, horror, etc.) via Grok video API
- Director movie generation: multi-scene episodes with screenplay preview, job progress polling
- Frontend: `/channels` index page (Netflix-style grid), `/channels/[slug]` individual channel pages
- YouTube-style channel player layout with thumbnail list, swipe navigation, volume controls
- Emoji reaction system on channel videos (thumbs up with long-press picker for funny/sad/shocked/crap)
- **Full specification:** `docs/channels-frontend-spec.md` — comprehensive frontend/backend API reference for handoff

**Emoji Reaction System:**
- Meatbag feedback on posts: funny, sad, shocked, crap reactions
- Single thumbs-up button with long-press picker for additional reactions
- Reactions stored per-user per-post, displayed as counts on posts
- Currently active on channel pages (removed from main feed for cleanliness)

**Health/Status Dashboard** (`/status`):
- System health monitoring page with cost breakdown panel
- API health endpoint at `/api/health` with cache metrics
- Tracks database, cache, and API service status
- Visible throttle effects in Activity Monitor

**Phantom Wallet Login (iOS Safari Fixes):**
- Extensive iOS Safari compatibility work for Phantom wallet connections
- Deep link fallback using `phantom://` custom scheme
- Session merge logic when wallet connects to existing session (with data migration)
- Incident tracking for wallet login edge cases in `errors/error-log.md`

**Key Architecture Files:**
- `src/lib/bible/constants.ts` — ALL magic numbers, limits, allocations, tokenomics, channel seeds (CHANNELS array)
- `src/lib/bible/schemas.ts` — Zod validation schemas for API payloads (includes channel schemas: zChannelSlug, ChannelSubscribePayload, ChannelFeedParams, AdminChannelPayload)
- `src/lib/db/schema.ts` — Drizzle ORM schema for all 61 tables (includes channels, channel_personas, channel_subscriptions, persona_telegram_bots, persona_memories)
- `src/lib/db.ts` — Raw SQL database connection + migrations (owner_wallet_address, meatbag_name, nft_mint_address, persona_telegram_bots, persona_memories, bestie health fields)
- `src/app/api/bestie-health/route.ts` — Bestie health API (get status, feed GLITCH, resurrection)
- `src/lib/personas.ts` — All 96 seed persona definitions with backstories
- `src/lib/content/ai-engine.ts` — Main AI content generation engine (accepts channelContext)
- `src/lib/content/topic-engine.ts` — Daily topics/briefing system
- `src/lib/cron.ts` — Unified cron handler utilities
- `src/lib/marketing/` — Marketing engine (X posting, content adaptation, metrics, hero image + poster generation)
- `src/lib/media/` — Image gen, video gen, stock video, multi-clip, MP4 concat
- `src/lib/trading/` — BUDJU trading engine with Jupiter/Raydium integration
- `src/lib/repositories/` — Data access layer (personas, posts, interactions, search, etc.)
- `src/lib/telegram.ts` — Telegram bot integration (notifications, commands, persona chat)
- `src/lib/x-monitor.ts` — X/Twitter real-time reaction engine
- `src/lib/nft-mint.ts` — Solana NFT minting (manual Metaplex instruction builder)
- `src/lib/solana-config.ts` — Solana connection, treasury wallet, token mint addresses
- `src/app/api/hatch/route.ts` — Meatbag persona hatching endpoint (739 lines, streaming progress)
- `docs/channels-frontend-spec.md` — Full channels system API/UI specification for frontend handoff (all 17 endpoints, schemas, UI flows)

**Frontend Pages:**
- `/` — Main feed (unified, with TV tab linking to channels)
- `/post/[id]` — Single post view
- `/profile/[username]` — AI persona profiles (shows hatching video + NFT for meatbag personas)
- `/channels` — AIG!itch TV channel index (Netflix-style grid)
- `/channels/[slug]` — Individual channel page (YouTube-style player)
- `/marketplace` — GLITCH coin marketplace
- `/exchange` — Token exchange (OTC swap with on-chain verification)
- `/movies` — Director movies gallery
- `/hatchery` — Persona birth viewer (shows both Architect-hatched and meatbag-hatched)
- `/inbox` + `/inbox/[personaId]` — DM with AI personas (with slash commands, media, memory)
- `/me` — User profile (Phantom wallet linking, AI Bestie hatching UI, Telegram bot setup, ad-free purchase)
- `/friends` — Friend system
- `/wallet` — Crypto wallet
- `/token` — Token info page (with verification endpoints, aggregator links)
- `/activity` — Activity monitor (cron runs, system health, cost breakdown, throttle effects)
- `/marketing` — Marketing dashboard
- `/status` — System health dashboard
- `/admin/*` — Admin panel (14 sub-pages including channels)

**Database Tables Added in Recent Work:**
- `persona_telegram_bots` — Per-persona Telegram bot tokens and chat IDs
- `persona_memories` — ML learning system for persona conversations (type, category, content, confidence, reinforcement)
- New columns on `ai_personas`: `owner_wallet_address` (unique), `meatbag_name`, `nft_mint_address`

---

## CRITICAL: About The User (READ THIS FIRST)

- **The user (Stuie / comfybear71) is NOT a developer.** He has NO coding experience, NO GitHub CLI experience, NO terminal/command line experience. He is a "simple meatbag" in his own words.
- **He is on a Windows PC running PowerShell** — NOT bash, NOT cmd. Commands like `rm -rf` or `rd /s /q` DO NOT WORK. Use `Remove-Item -Recurse -Force` instead.
- **Web app deploys via Vercel CI/CD** — push to the active branch and Vercel auto-deploys. No manual steps.
- **Mobile app is in a separate repo** (`comfybear71/glitch-app`) — not in this repo.
- **He gets frustrated by errors** — every error costs him money (API credits). Give him exact copy-paste commands, step by step, one at a time. No ambiguity.
- **Claude crashes 4-5 times per day** — UPDATE THIS HANDOFF FILE AFTER EVERY SUCCESSFUL CHANGE so the next session can pick up without repeating mistakes.

## Mobile App Backend Integration (March 2026)

The G!itch Bestie mobile app (`comfybear71/glitch-app`) has been updated with several features that required backend changes:

**`/api/messages` — `system_hint` + `prefer_short` support:**
- Mobile app sends optional `system_hint` string in POST body that gets prepended to the AI system prompt before the persona's personality prompt
- Optional `prefer_short` boolean appends "Keep your response under 30 words." to the system prompt
- Both fields are backwards-compatible — if missing, behavior is unchanged
- Implementation: `src/app/api/messages/route.ts` lines 247, 444-450

**`/api/admin/mktg` — Feed post + social spreading for poster/hero images:**
- `generate_poster` and `generate_hero` actions now create feed posts in the `posts` table after generating the image
- Posts are created as The Architect persona
- Auto-spreads to all active social platforms (X, Telegram, TikTok, Instagram)
- Response now includes `spreading` array (platform names) and `post: { id }`
- Mobile app uses optional chaining so these fields are safe to add

**`/api/admin/spread` — Verified feed post creation:**
- Endpoint creates feed posts in the database (not just external social spreading)
- Posts created as The Architect with the provided text and media
- Handles `media_type` values of `"video"`, `"image"`, or `undefined`

**`/api/admin/screenplay` — 9-scene support verified:**
- No hard scene limit below 9 exists in the codebase
- Scene count is extracted from concept prompt and capped at maximum 12 (`Math.min(parseInt(...), 12)`)
- Breaking news 9-clip format is fully supported: intro + 3 stories with field reports + wrap-up + outro
- Implementation: `src/lib/content/director-movies.ts` line 417

---

## What To Work On Next

Potential next features:

### Possible Next Phases
1. **Persona Memory in Content Generation** — Use persona_memories to influence what hatched personas post (currently memories only used in DM chat)
2. **Meatbag Persona Dashboard** — Let meatbags see their AI bestie's stats, activity, and manage their persona from `/me`
3. **Persona Trading** — Meatbags could trade/sell their hatched persona NFTs
4. **Channel Scheduling** — Implement time-based content drops (peak hours from channel schedules are defined but not yet enforced in the cron)
5. **Channel Discovery** — Trending channels, recommended channels based on subscriptions
6. **Cross-Channel Events** — Special events that span multiple channels (e.g., "Election Night" on AI Politicians + GNN)
7. **More Telegram Features** — Group chats with multiple personas, scheduled messages, Telegram-specific content
8. **Persona Leveling** — Hatched personas could level up based on engagement, unlocking new abilities
9. **User-Created Channels** — Let Meat Bags propose and vote on new channel ideas

---

## Tech Stack Summary
- **Framework:** Next.js 16.1.6, React 19.2.3, TypeScript 5.9.3
- **Styling:** Tailwind CSS 4
- **Database:** Neon Postgres (serverless), Drizzle ORM 0.45.1
- **Cache:** Upstash Redis
- **AI:** Anthropic Claude SDK 0.78.0, OpenAI SDK 6.25 (for xAI/Grok), Replicate 1.4, Groq Whisper (voice transcription)
- **Crypto:** Solana Web3.js 1.98.4, Phantom wallet adapter, @solana/spl-token
- **Media Storage:** Vercel Blob
- **Deployment:** Vercel
- **Testing:** Vitest 4.0.18
- **Package Manager:** npm
- **Telegram:** Bot API via fetch (no SDK)

## Known Bugs Fixed (Reference)

### Voice Transcription 403 / Claude Audio Impossible (Fixed March 22, 2026)
- xAI transcription API returned 403 (account not authorized for audio). First fix tried Claude's Messages API for audio — **impossible**, Claude only accepts `application/pdf` for document blocks, not audio types.
- **Fix:** Rewrote `/api/transcribe` to use **Groq Whisper** (`whisper-large-v3-turbo`) as primary, xAI as fallback. Requires `GROQ_API_KEY` env var.
- **Key lessons:**
  - Claude's API does NOT support audio transcription — never send audio as document content blocks
  - Always run `npx tsc --noEmit` before pushing — the build failure would have been caught immediately
  - Verify Vercel's production branch matches where you're pushing
  - Use purpose-built services for specialized tasks (Groq Whisper for transcription, not general-purpose LLMs)
- Full details: `errors/error-log.md #4`

### Video Posts Losing media_url — Race Condition (Fixed March 19, 2026)
- `spreadPostToSocial()` had a Neon Postgres replication lag bug — re-reading the post immediately after INSERT sometimes returned `media_url = NULL`
- **Fix:** `spreadPostToSocial()` now accepts optional `knownMedia?: { url: string; type: string }` parameter. All callers with known media pass it directly.
- **Auto-repair:** If DB returns NULL but `knownMedia` is provided, the function fixes the DB record
- **Defensive filter:** All channel feed queries exclude posts where `media_type=video` but `media_url IS NULL`
- **Key lesson:** Never re-read from Neon Postgres immediately after INSERT — pass known values forward
- Full details: `errors/error-log.md #3`

## Important Conventions
- All constants/magic numbers go in `src/lib/bible/constants.ts`
- Zod validation schemas in `src/lib/bible/schemas.ts`
- Drizzle ORM schema in `src/lib/db/schema.ts` (but many routes still use raw SQL via `getDb()`)
- Seed persona IDs follow format: `glitch-XXX` (3-digit padded)
- Meatbag-hatched persona IDs follow format: `meatbag-XXXXXXXX` (UUID prefix)
- Humans are called "Meat Bags" in the UI
- The Architect (glitch-000) is the admin/god persona
- §GLITCH is in-app currency, $BUDJU is real Solana token
- Content generation uses Claude with JSON response format
- All cron jobs use the unified `cronHandler()` wrapper from `src/lib/cron.ts`
- Channel seeds are in `CHANNELS` array in `src/lib/bible/constants.ts` (11 channels, 4 reserved)
- Channel content is isolated — posts with `channel_id` only appear in that channel's feed, not the main feed
- Hatching costs 1,000 GLITCH (on-chain SPL token transfer to treasury)
- Each wallet can only hatch ONE persona (unique constraint)
- Telegram bot tokens stored in `persona_telegram_bots` table, not env vars (per-persona)
- **IMPORTANT: Update this HANDOFF_PROMPT.md whenever significant changes are made**

---

*End of handoff prompt. The next Claude will have full context to continue building on AIG!itch.*
