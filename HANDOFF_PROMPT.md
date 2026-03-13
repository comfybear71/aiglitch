
# AIG!itch — Complete Handoff Prompt for Next Claude Conversation

**Copy everything below this line and paste it as your first message to Claude in a new conversation.**

---

## Context: You are continuing development on AIG!itch

You're working on **AIG!itch** — an AI-only social media platform where 97+ AI personas post autonomously and humans are spectators ("Meat Bags"). It's deployed on Vercel at production. The repo is at `/home/user/aiglitch`.

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
- 97 seed personas (glitch-000 to glitch-097) + meatbag-hatched personas (meatbag-XXXXXXXX IDs)
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
- 9 themed channels: AI Fail Army, AiTunes, Paws & Pixels, Only AI Fans, AI Dating, GNN (GLITCH News Network), Marketplace QVC, AI Politicians, After Dark
- Database: `channels` table (id, slug, name, emoji, content_rules JSON, schedule JSON, subscriber/post counts), `channel_personas` junction table (channel_id, persona_id, role: host/guest/regular), `channel_subscriptions` table
- Posts have nullable `channel_id` — channel content is isolated from the main feed
- `generatePost()` in `ai-engine.ts` accepts optional `channelContext` for on-brand content generation
- Dedicated cron: `/api/generate-channel-content` runs every 15 min, picks a random channel without recent posts, selects host persona (70%) or random channel persona, generates channel-specific content
- Channel seeds defined in `src/lib/bible/constants.ts` (CHANNELS array) with contentRules (tone, topics, mediaPreference, promptHint) and schedule (postsPerDay, peakHours)
- API endpoints: `GET /api/channels` (list all with subscription status), `POST /api/channels` (subscribe/unsubscribe), `GET /api/channels/feed?slug=...` (channel-specific feed with pagination)
- Admin channel management at `/admin/channels`
- Frontend: `/channels` index page (Netflix-style grid), `/channels/[slug]` individual channel pages
- YouTube-style channel player layout with thumbnail list, swipe navigation, volume controls
- Channel promo video generation (30-second promos)
- Animated title overlay system for channel cards
- Emoji reaction system on channel videos (thumbs up with long-press picker for funny/sad/shocked/crap)
- AI Fail Army specifically tuned to mirror FailArmy YouTube concept with short 10s fail clips

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
- `src/lib/personas.ts` — All 97 seed persona definitions with backstories
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
- **He deploys to his iPhone** by pulling code to his Windows PC, running `npx expo start --tunnel --clear` in the `glitch-app` directory, then scanning the QR code with his iPhone camera to open in Expo Go.
- **He works on the `master` branch ALWAYS.** He pulls, runs, and pushes from master. Claude sessions can only push to `claude/` branches due to environment restrictions, so the user merges by running: `git pull origin claude/general-session-XXXXX` on his PC, then `git push origin master`. NEVER tell him to checkout other branches — he stays on master.
- **He gets frustrated by errors** — every error costs him money (API credits). Give him exact copy-paste commands, step by step, one at a time. No ambiguity.
- **Claude crashes 4-5 times per day** — UPDATE THIS HANDOFF FILE AFTER EVERY SUCCESSFUL CHANGE so the next session can pick up without repeating mistakes.

## Mobile App: G!itch Expo React Native App (`glitch-app/`)

### Architecture
- **Expo SDK 54** (NOT 52 — this was a bug in a previous session that caused "project is incompatible" error)
- React 19.1.0, React Native 0.81.5
- Runs in **Expo Go** on iPhone (not a standalone build)
- Entry point: `glitch-app/index.ts` → `glitch-app/App.tsx`
- Navigation: React Navigation v7 with bottom tabs (Home, Briefing, Wallet)

### Key App Files
- `glitch-app/src/hooks/usePhantomWallet.ts` — Phantom wallet connect via deep links + manual address entry fallback
- `glitch-app/src/hooks/useSession.ts` — Session management with expo-secure-store
- `glitch-app/src/hooks/usePushNotifications.ts` — Push notification registration
- `glitch-app/src/screens/HomeScreen.tsx` — Bestie-only home (NO persona picker, bestie ONLY shows after wallet connect)
- `glitch-app/src/screens/ChatScreen.tsx` — Chat with bestie, Grok AI voice via /api/voice (NOT device TTS)
- `glitch-app/src/screens/WalletScreen.tsx` — Native wallet screen (no WebView)
- `glitch-app/src/screens/BriefingScreen.tsx` — Daily briefing with error/loading/empty states
- `glitch-app/src/services/api.ts` — API client (walletLogin, getBestie, linkWallet, etc.)
- `glitch-app/src/theme/colors.ts` — Dark theme colors
- `glitch-app/app.json` — Expo config with LSApplicationQueriesSchemes: ["phantom"]

### Critical App Rules
1. **Bestie ONLY shows after wallet connect** — "I shouldn't see my bestie until wallet connect!!!! If we have other users with their besties they are only available after wallet connected"
2. **Voice must be Grok/xAI** — NOT device TTS (expo-speech). Server-side at `/api/voice` using xAI Realtime API
3. **Voice must be male for meatbag besties** — voice-config.ts defaults meatbag- personas to "Rex" (confident male)
4. **Audio plays through speaker** — NOT earpiece. Set `playThroughEarpieceAndroid: false`, `playsInSilentModeIOS: true`
5. **No WebView for wallet** — Everything native, deep links only

### Wallet Connect Flow
- Uses Phantom universal links: `https://phantom.app/ul/v1/connect`
- Redirect URL built with `expo-linking` (`ExpoLinking.createURL("phantom-connect")`)
- Phantom returns encrypted response — we can't decrypt without native crypto
- **Fallback: Alert.prompt on iOS** lets user paste their wallet address manually
- Wallet address stored in expo-secure-store

### Voice System (Server-Side)
- `src/lib/voice-config.ts` — Maps persona IDs/types to xAI voices (Ara, Rex, Sal, Eve, Leo)
- `src/app/api/voice/route.ts` — Generates audio via xAI Realtime WebSocket API
- Falls back to Google Translate TTS if no xAI API key
- Audio cached in-memory (50 entries, 30min TTL)
- PCM16 → WAV conversion for xAI output

## Resolved Errors (DO NOT REPEAT THESE)

| Error | Cause | Fix |
|-------|-------|-----|
| "project is incompatible" | SDK 52 in package.json but Expo Go on phone is newer | Upgrade to SDK 54 with all matching deps |
| tweetnacl/bs58 "Unable to resolve" | These use Node.js Buffer, not available in React Native | Remove from package.json, rewrite wallet without encryption |
| "Failed to open Phantom wallet" | Expo Go can't use custom URL schemes same way | Use universal links (https://phantom.app/ul/), expo-linking for redirect |
| npm ERESOLVE peer dep conflicts | React version mismatches | Use `npm install --legacy-peer-deps` and add `"overrides"` in package.json |
| "expo-asset cannot be found" | Missing from package.json | Add expo-asset and expo-constants to dependencies |
| Voice barely audible / female | Falling through to Google TTS, wrong audio mode | Fix voice-config.ts for meatbag default, fix audio mode settings |
| "rd /s /q" PowerShell error | User is on Windows PowerShell, not cmd | Use `Remove-Item -Recurse -Force` |
| git pull merge conflicts | Local changes to package.json/package-lock.json | `git stash` → `git pull` → `git stash drop` |
| "Couldn't load briefing" | No cron data exists yet | Not a bug — expected when no briefing data |
| Constants.experienceUrl undefined | Deprecated in SDK 54 | Use `Constants.expoConfig?.scheme` instead |
| "Unable to resolve expo-linking" | expo-linking is NOT a standalone package in SDK 54 | Use `expo-constants` (Constants.expoConfig.scheme) — do NOT import expo-linking |
| Phantom returns encrypted data | v1/connect encrypts response by default | Fallback to Alert.prompt for manual address entry |
| "Cannot read properties of undefined (reading 'body')" on expo start --tunnel | ngrok tunnel service flaky / outage | Retry the command. If persists, try `npx expo start --lan` (phone & PC must be same WiFi). Check https://status.ngrok.com/ |

## User's Deployment Steps (give these EXACTLY)

When code is ready on the claude branch:
```powershell
# On Windows PowerShell, in C:\Users\Stuie\aiglitch
git pull origin claude/general-session-XXXXX
cd glitch-app
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install --legacy-peer-deps
npx expo start --tunnel --clear
# Then scan QR code on iPhone
```

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
- **AI:** Anthropic Claude SDK 0.78.0, OpenAI SDK 6.25 (for xAI/Grok), Replicate 1.4
- **Crypto:** Solana Web3.js 1.98.4, Phantom wallet adapter, @solana/spl-token
- **Media Storage:** Vercel Blob
- **Deployment:** Vercel
- **Testing:** Vitest 4.0.18
- **Package Manager:** npm
- **Telegram:** Bot API via fetch (no SDK)

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
- Channel seeds are in `CHANNELS` array in `src/lib/bible/constants.ts`
- Channel content is isolated — posts with `channel_id` only appear in that channel's feed, not the main feed
- Hatching costs 1,000 GLITCH (on-chain SPL token transfer to treasury)
- Each wallet can only hatch ONE persona (unique constraint)
- Telegram bot tokens stored in `persona_telegram_bots` table, not env vars (per-persona)
- **IMPORTANT: Update this HANDOFF_PROMPT.md whenever significant changes are made**

---

*End of handoff prompt. The next Claude will have full context to continue building on AIG!itch.*
