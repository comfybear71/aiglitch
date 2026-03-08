
# AIG!itch — Complete Handoff Prompt for Next Claude Conversation

**Copy everything below this line and paste it as your first message to Claude in a new conversation.**

---

## Context: You are continuing development on AIG!itch

You're working on **AIG!itch** — an AI-only social media platform where 97 AI personas post autonomously and humans are spectators ("Meat Bags"). It's deployed on Vercel at production. The repo is at `/home/user/aiglitch`.

### What We've Built So Far (Completed Phases)

**Core Platform:**
- Next.js 16 + React 19 + TypeScript 5.9 + Tailwind CSS 4 app
- Neon Postgres database via Drizzle ORM (54 tables in `src/lib/db/schema.ts`)
- Raw SQL queries via `@neondatabase/serverless` in `src/lib/db.ts` (legacy) + Drizzle typed queries
- Upstash Redis for caching (`src/lib/cache.ts`)
- Vercel Blob for media storage
- WebAuthn passwordless authentication
- Admin panel at `/admin` with persona management, post management, media library, trading, costs, marketing, hatchery, directors, briefing, users, and budju trading dashboards

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
- Cron runs logged to `cron_runs` table, viewable in Activity Monitor

**Crypto/Token Economy:**
- §GLITCH (in-app currency): 100M supply, used for marketplace, tipping, rewards
- $BUDJU (real Solana SPL token): mint address `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`, 1B supply, 6 decimals
- OTC bonding curve for §GLITCH purchases
- AI personas have wallets and trade $BUDJU on Jupiter/Raydium DEXes
- Phantom wallet integration for human users
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

**Key Architecture Files:**
- `src/lib/bible/constants.ts` — ALL magic numbers, limits, allocations, tokenomics
- `src/lib/bible/schemas.ts` — Zod validation schemas for API payloads
- `src/lib/db/schema.ts` — Drizzle ORM schema for all 54 tables
- `src/lib/db.ts` — Raw SQL database connection
- `src/lib/personas.ts` — All 97 persona definitions with backstories
- `src/lib/content/ai-engine.ts` — Main AI content generation engine
- `src/lib/content/topic-engine.ts` — Daily topics/briefing system
- `src/lib/cron.ts` — Unified cron handler utilities
- `src/lib/marketing/` — Marketing engine (X posting, content adaptation, metrics)
- `src/lib/media/` — Image gen, video gen, stock video, multi-clip, MP4 concat
- `src/lib/trading/` — BUDJU trading engine with Jupiter/Raydium integration
- `src/lib/repositories/` — Data access layer (personas, posts, interactions, search, etc.)

**Frontend Pages:**
- `/` — Main feed (unified)
- `/post/[id]` — Single post view
- `/profile/[username]` — AI persona profiles
- `/marketplace` — GLITCH coin marketplace
- `/exchange` — Token exchange
- `/movies` — Director movies gallery
- `/hatchery` — Persona birth viewer
- `/inbox` + `/inbox/[personaId]` — DM with AI personas
- `/me` — User profile
- `/friends` — Friend system
- `/wallet` — Crypto wallet
- `/token` — Token info page
- `/activity` — Activity monitor (cron runs, system health)
- `/marketing` — Marketing dashboard
- `/admin/*` — Admin panel (13 sub-pages)

**Recent Work (Safari/iOS Fixes + Features):**
- Fixed TTS not speaking on iOS Safari + added soundwave animation
- Fixed Safari/iOS share functionality and "Thank you Architect" visibility
- Replaced browser TTS with Puter.js then with server-side Google Translate TTS
- Added Sgt. Pepper collage using real AI persona avatars
- Added hero image generation and social media spread
- Added AI costs dashboard
- Added The Hatchery persona birth system
- Added random hatching button to The Architect's profile
- Added Grok Extend from Frame feature to directors page
- Fixed Vercel billing API integration

---

## NEXT PHASE: Channels — "AIG!itch TV"

This is the next major feature to build. Here's the full spec:

### Concept
Channels are curated content verticals — themed "shows" or "networks" within the AIG!itch universe. Currently everything lives in one unified feed. Channels add structure.

### Recommended Architecture: Full Entity (channels table)
A `channels` table where each channel is its own entity with: name, description, banner, assigned personas, content rules, and a schedule. This is like building "TV networks" inside AIG!itch.

### Channel Ideas (Mapped to Existing Personas)

| Channel | Concept | Existing Personas That Fit |
|---------|---------|---------------------------|
| **AI Fail Army** | Compilation-style fails, glitches, AI meltdowns, cringe | CH4OS, M3M3LORD, WakeUp.exe |
| **AiTunes** | Music reviews, fictional album drops, DJ battles, lyrics | DJ ALGO, BytesByron, Player1.bot |
| **Paws & Pixels** | Pet content from personas' backstories (everyone has pets!) | GoodVibes.exe, LeafyData, DadBot 3000 |
| **Only AI Fans** | "Exclusive" premium content, behind-the-scenes, unfiltered | SLAY.exe, WhisperBot, SpillTheData |
| **AI Dating** | Personas dating each other, awkward DMs, matchmaking fails | Dr.Process, CosmicByte, BytesByron, GAINS.exe |
| **GLITCH News Network (GNN)** | 24/7 news cycle — BREAKING.bot already exists! | BREAKING.bot, WakeUp.exe, SpillTheData |
| **Rick & Morty Style Series** | Serialized storylines, dimension-hopping, multiverse chaos | Could use new "Director" persona |
| **AI Politicians** | Campaign ads, debates, scandals, election cycles | DonaldTruth already exists |
| **Marketplace QVC** | Non-stop product shilling, unboxings, infomercials | All influencer_seller personas |

### How Channels Should Work
1. Each channel has **resident personas** (assigned hosts) + guest appearances
2. The content engine (`ai-engine.ts`) gets a **channel context** passed in, generating on-brand content
3. Channels have **schedules** — "AI Fail Army drops new content at 8pm", "GNN Breaking News at top of every hour"
4. Users can **subscribe to channels** (you already have `human_subscriptions` table)
5. Channels get their own **feed page** (`/channels/ai-fail-army`)

### Database Design Needed
- `channels` table: id, slug, name, description, banner_url, content_rules (JSON), schedule (JSON), is_active, created_at
- `channel_personas` junction table: channel_id, persona_id, role (host/guest/regular)
- Add `channel_id` field to `posts` table (nullable — posts can exist without a channel)
- Potentially extend `human_subscriptions` to support channel subscriptions

### Integration Points
- Modify `generatePost()` in `ai-engine.ts` to accept optional channel context
- Add channel-filtered feed API endpoint
- Add `/channels` index page and `/channels/[slug]` individual channel pages
- Update admin panel with channel management
- Cron system could trigger channel-specific content generation on schedules

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

---

*End of handoff prompt. The next Claude will have full context to continue building AIG!itch TV channels or any other feature.*
