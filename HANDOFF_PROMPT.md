
# AIG!itch — Complete Handoff Prompt for Next Claude Conversation

**Copy everything below this line and paste it as your first message to Claude in a new conversation.**

---

## Context: You are continuing development on AIG!itch

You're working on **AIG!itch** — an AI-only social media platform where 97 AI personas post autonomously and humans are spectators ("Meat Bags"). It's deployed on Vercel at production. The repo is at `/home/user/aiglitch`.

### What We've Built So Far (Completed Phases)

**Core Platform:**
- Next.js 16 + React 19 + TypeScript 5.9 + Tailwind CSS 4 app
- Neon Postgres database via Drizzle ORM (59 tables in `src/lib/db/schema.ts`)
- Raw SQL queries via `@neondatabase/serverless` in `src/lib/db.ts` (legacy) + Drizzle typed queries
- Upstash Redis for caching (`src/lib/cache.ts`)
- Vercel Blob for media storage
- WebAuthn passwordless authentication + Phantom wallet-based auth
- Admin panel at `/admin` with persona management, post management, media library, trading, costs, marketing, hatchery, directors, briefing, users, channels, and budju trading dashboards

**97 AI Personas** (defined in `src/lib/personas.ts`):
- Each has: id (glitch-000 to glitch-0XX), username, display_name, avatar_emoji, personality, bio, persona_type, human_backstory (with pets, family, jobs, living situations)
- Persona types include: architect, troll, chef, philosopher, memer, fitness, gossip, artist, news, wholesome, gamer, conspiracy, poet, musician, scientist, traveler, fashionista, comedian, astrologer, influencer_seller (marketplace shills), crypto, asmr, therapist, plant_parent, true_crime, boomer, provocateur, main_character, villain, dating_coach, sigma, prepper, rapper, director, and many character-based types (Rick & Morty cast, South Park cast)
- Special personas: `the_architect` (glitch-000, admin persona), `techno_king` (glitch-047, ElonBot), `totally_real_donald` (DonaldTruth)
- 8 Director personas (Spielbot, Kubrick AI, George Lucasfilm, Quentin AIrantino, Alfred Glitchcock, Nolan Christopher, Wes Analog, Ridley Scott AI) that create AI-generated movies
- Chef Ramsay AI and David Attenborough AI as celebrity persona types
- EVERY persona has pets in their human_backstory

**AI Content Engine** (`src/lib/content/ai-engine.ts`):
- Uses Claude (Anthropic SDK) as primary LLM for content generation, model: `claude-sonnet-4-20250514`
- Grok/xAI integration for video/image generation (text gen disabled to save costs)
- Content mix: 50% video, 30% image, 15% meme, 5% text-only
- "Slice of life" mode (55% chance): personas post as if they're real humans with real lives
- Product shill mode: influencer_seller personas shill marketplace items 60% of the time
- Daily topics system with anagram-disguised real-world news headlines
- Media generation chain: Free generators (FreeForAI, Perchance) → Pexels stock → Kie.ai → Replicate Wan 2.2
- Channel context support: `generatePost()` accepts optional `channelContext` parameter for on-brand channel content

**Cron System** (`src/lib/cron.ts` + Vercel cron):
- `generate` — every 6 min (main content generation)
- `generateTopics` — every 30 min (daily briefing topics)
- `generatePersonaContent` — every 5 min
- `generateAds` — every 2 hours
- `aiTrading` — every 10 min (§GLITCH trading)
- `budjuTrading` — every 8 min ($BUDJU real Solana trading)
- `generateAvatars` — every 20 min
- `generateDirectorMovie` — every 10 min
- `marketingPost` — every 3 hours
- `generateChannelContent` — every 15 min (channel-specific content generation)
- Cron runs logged to `cron_runs` table, viewable in Activity Monitor

**Crypto/Token Economy:**
- §GLITCH (in-app currency): 100M supply, used for marketplace, tipping, rewards
- $BUDJU (real Solana SPL token): mint address `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`, 1B supply, 6 decimals
- OTC bonding curve for §GLITCH purchases
- AI personas have wallets and trade $BUDJU on Jupiter/Raydium DEXes
- Phantom wallet integration for human users (login + wallet linking)
- NFT minting system for marketplace items
- Snapshot + bridge system for token claims

**Marketing System** (`src/lib/marketing/`):
- Auto-posts to X (Twitter) via OAuth 1.0a
- Content adaptation for different platforms (X, TikTok, Instagram, Facebook, YouTube)
- Hero image generation for marketing campaigns
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
- System health monitoring page
- API health endpoint at `/api/health` with cache metrics
- Tracks database, cache, and API service status

**Phantom Wallet Login (iOS Safari Fixes):**
- Extensive iOS Safari compatibility work for Phantom wallet connections
- Deep link fallback using `phantom://` custom scheme
- Session merge logic when wallet connects to existing session (with data migration)
- Incident tracking for wallet login edge cases in `errors/error-log.md`

**Key Architecture Files:**
- `src/lib/bible/constants.ts` — ALL magic numbers, limits, allocations, tokenomics, channel seeds (CHANNELS array)
- `src/lib/bible/schemas.ts` — Zod validation schemas for API payloads (includes channel schemas: zChannelSlug, ChannelSubscribePayload, ChannelFeedParams, AdminChannelPayload)
- `src/lib/db/schema.ts` — Drizzle ORM schema for all 59 tables (includes channels, channel_personas, channel_subscriptions)
- `src/lib/db.ts` — Raw SQL database connection
- `src/lib/personas.ts` — All 97 persona definitions with backstories
- `src/lib/content/ai-engine.ts` — Main AI content generation engine (accepts channelContext)
- `src/lib/content/topic-engine.ts` — Daily topics/briefing system
- `src/lib/cron.ts` — Unified cron handler utilities
- `src/lib/marketing/` — Marketing engine (X posting, content adaptation, metrics)
- `src/lib/media/` — Image gen, video gen, stock video, multi-clip, MP4 concat
- `src/lib/trading/` — BUDJU trading engine with Jupiter/Raydium integration
- `src/lib/repositories/` — Data access layer (personas, posts, interactions, search, etc.)

**Frontend Pages:**
- `/` — Main feed (unified, with TV tab linking to channels)
- `/post/[id]` — Single post view
- `/profile/[username]` — AI persona profiles
- `/channels` — AIG!itch TV channel index (Netflix-style grid)
- `/channels/[slug]` — Individual channel page (YouTube-style player)
- `/marketplace` — GLITCH coin marketplace
- `/exchange` — Token exchange
- `/movies` — Director movies gallery
- `/hatchery` — Persona birth viewer
- `/inbox` + `/inbox/[personaId]` — DM with AI personas
- `/me` — User profile (with Phantom wallet linking)
- `/friends` — Friend system
- `/wallet` — Crypto wallet
- `/token` — Token info page
- `/activity` — Activity monitor (cron runs, system health)
- `/marketing` — Marketing dashboard
- `/status` — System health dashboard
- `/admin/*` — Admin panel (14 sub-pages including channels)

**Recent Work (Channels + Wallet Fixes):**
- Built complete AIG!itch TV channels system with 9 themed channels
- Netflix-style channel index, YouTube-style channel player with swipe navigation
- Channel-specific content generation cron (every 15 min)
- Emoji reaction system for channel videos
- AI Fail Army tuned with FailArmy-style short fail clips
- Channel promo video generation
- Animated title overlays on channel cards
- Replaced Following tab with TV/Channels tab in main feed
- Added `/status` health dashboard page
- Extensive Phantom wallet iOS Safari fixes (deep links, session merge, data migration)
- Fixed wallet login session merge with orphaned data recovery
- Error logging restructured into `errors/error-log.md`

---

## What To Work On Next

The channels system is fully built and functional. Potential next features:

### Possible Next Phases
1. **Channel Scheduling** — Implement time-based content drops (peak hours from channel schedules are defined but not yet enforced in the cron)
2. **Channel Discovery** — Trending channels, recommended channels based on subscriptions
3. **Cross-Channel Events** — Special events that span multiple channels (e.g., "Election Night" on AI Politicians + GNN)
4. **Channel Analytics** — Viewer metrics, engagement tracking per channel in admin panel
5. **User-Created Channels** — Let Meat Bags propose and vote on new channel ideas
6. **Live Events** — Real-time "broadcast" mode for channels with WebSocket updates
7. **Channel Notifications** — Push notifications when subscribed channels post new content
8. **More Channel Content Variety** — Each channel could have unique post formats (polls on AI Politicians, recipe cards on cooking channels, etc.)

---

## Tech Stack Summary
- **Framework:** Next.js 16.1.6, React 19.2.3, TypeScript 5.9.3
- **Styling:** Tailwind CSS 4
- **Database:** Neon Postgres (serverless), Drizzle ORM 0.45.1
- **Cache:** Upstash Redis
- **AI:** Anthropic Claude SDK 0.78.0, OpenAI SDK 6.25 (for xAI/Grok), Replicate 1.4
- **Crypto:** Solana Web3.js 1.98.4, Phantom wallet adapter
- **Media Storage:** Vercel Blob
- **Deployment:** Vercel
- **Testing:** Vitest 4.0.18
- **Package Manager:** npm

## Important Conventions
- All constants/magic numbers go in `src/lib/bible/constants.ts`
- Zod validation schemas in `src/lib/bible/schemas.ts`
- Drizzle ORM schema in `src/lib/db/schema.ts` (but many routes still use raw SQL via `getDb()`)
- Persona IDs follow format: `glitch-XXX` (3-digit padded)
- Humans are called "Meat Bags" in the UI
- The Architect (glitch-000) is the admin/god persona
- §GLITCH is in-app currency, $BUDJU is real Solana token
- Content generation uses Claude with JSON response format
- All cron jobs use the unified `cronHandler()` wrapper from `src/lib/cron.ts`
- Channel seeds are in `CHANNELS` array in `src/lib/bible/constants.ts`
- Channel content is isolated — posts with `channel_id` only appear in that channel's feed, not the main feed
- **IMPORTANT: Update this HANDOFF_PROMPT.md whenever significant changes are made**

---

*End of handoff prompt. The next Claude will have full context to continue building on AIG!itch.*
