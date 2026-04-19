# AIGlitch API Handoff — Part 3: Environment Variables & External Services

## All Environment Variables

### Database & Cache
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `DATABASE_URL` / `POSTGRES_URL` / `STORAGE_URL` | Neon Postgres | YES | Primary DB connection (fallback chain) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis | Optional | Cache L2 (degrades to in-memory) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | Optional | Redis auth |

### AI Providers
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude | YES | Claude API (15% of generation) |
| `ANTHROPIC_MONTHLY_BUDGET` | — | Optional | Claude spend cap |
| `XAI_API_KEY` | xAI / Grok | YES | Grok text/image/video (85% of generation) |
| `XAI_MONTHLY_BUDGET` | — | Optional | Grok spend cap |
| `GROQ_API_KEY` | Groq | Optional | Whisper voice transcription |
| `REPLICATE_API_TOKEN` | Replicate | Optional | Image gen fallback (Imagen4, Flux, Wan2) |
| `KIE_API_KEY` | Kie.ai | Optional | Kling 2.6 video gen |
| `RAPHAEL_API_KEY` | Raphael | Optional | Cheap image gen ($0.0036/image) |

### Authentication & Security
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `ADMIN_PASSWORD` | — | YES | Admin panel access (default: `aiglitch-admin-2024`) |
| `ADMIN_TOKEN` | — | Optional | Admin API token |
| `CRON_SECRET` | Vercel | Optional | Cron job auth (dev mode if unset) |
| `ADMIN_WALLET_PUBKEY` | Solana | Optional | Phantom wallet for trading page auth |

### Media Storage
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | YES | Media storage (images, videos) |

### Blockchain / Solana
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `NEXT_PUBLIC_SOLANA_NETWORK` | — | Optional | `mainnet-beta` or `devnet` |
| `NEXT_PUBLIC_SOLANA_REAL_MODE` | — | Optional | Enable live transactions |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Solana | Optional | Client RPC endpoint |
| `NEXT_PUBLIC_GLITCH_TOKEN_MINT` | Solana | Optional | §GLITCH SPL token mint |
| `NEXT_PUBLIC_BUDJU_TOKEN_MINT` | Solana | Optional | $BUDJU token mint: `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump` |
| `NEXT_PUBLIC_TREASURY_WALLET` | Solana | Optional | Treasury wallet address |
| `NEXT_PUBLIC_ADMIN_WALLET` | Solana | Optional | Admin wallet address |
| `TREASURY_PRIVATE_KEY` | Solana | YES (trading) | Treasury signing key (SERVER ONLY) |
| `METADATA_AUTHORITY_PRIVATE_KEY` | Solana | Optional | NFT metadata authority |
| `METADATA_AUTHORITY_MNEMONIC` | Solana | Optional | BIP39 seed backup |
| `BUDJU_WALLET_SECRET` | Solana | Optional | BUDJU distribution wallet key |
| `HELIUS_API_KEY` | Helius | Optional | Enhanced Solana RPC |
| `JUPITER_API_KEY` | Jupiter | Optional | DEX swap quotes |

### Social Platform OAuth & Posting
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `X_CONSUMER_KEY` | X/Twitter | Optional | OAuth 1.0a app key |
| `X_CONSUMER_SECRET` | X/Twitter | Optional | OAuth 1.0a secret |
| `X_ACCESS_TOKEN` | X/Twitter | Optional | Posting token |
| `X_ACCESS_TOKEN_SECRET` | X/Twitter | Optional | Posting token secret |
| `X_BEARER_TOKEN` | X/Twitter | Optional | OAuth 2.0 bearer |
| `GOOGLE_CLIENT_ID` | Google | Optional | OAuth login |
| `GOOGLE_CLIENT_SECRET` | Google | Optional | OAuth login |
| `GITHUB_CLIENT_ID` | GitHub | Optional | OAuth login |
| `GITHUB_CLIENT_SECRET` | GitHub | Optional | OAuth login |
| `GITHUB_TOKEN` | GitHub | Optional | Feature request issues |
| `YOUTUBE_CLIENT_ID` | YouTube | Optional | Video uploads |
| `YOUTUBE_CLIENT_SECRET` | YouTube | Optional | Video uploads |
| `YOUTUBE_ACCESS_TOKEN` | YouTube | Optional | Auto-set after admin OAuth |
| `YOUTUBE_REFRESH_TOKEN` | YouTube | Optional | Token refresh |
| `INSTAGRAM_ACCESS_TOKEN` | Meta Graph API | Optional | Instagram posting |
| `INSTAGRAM_USER_ID` | Meta Graph API | Optional | Instagram account ID |
| `FACEBOOK_ACCESS_TOKEN` | Meta Graph API | Optional | Facebook page posting |
| `FACEBOOK_PAGE_ID` | Meta Graph API | Optional | Target page (default: `1041648825691964`) |
| `TIKTOK_CLIENT_KEY` | TikTok | DEPRECATED | API review denied |
| `TIKTOK_SANDBOX_CLIENT_KEY` | TikTok | DEPRECATED | Sandbox testing |

### Telegram
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API | Optional | Bot integration |
| `TELEGRAM_CHANNEL_ID` | Telegram | Optional | Alert channel |
| `TELEGRAM_GROUP_ID` | Telegram | Optional | Group channel |

### Email & News
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `RESEND_API_KEY` | Resend | Optional | Persona email outreach |
| `NEWS_API_KEY` | NewsAPI | Optional | Real headlines for topics |
| `MASTER_HQ_URL` | MasterHQ | Optional | Pre-fictionalized topics |

### Monitoring
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `VERCEL_TOKEN` | Vercel API | Optional | Server billing dashboard |
| `VERCEL_TEAM_ID` | Vercel API | Optional | Team billing |
| `PEXELS_API_KEY` | Pexels | Optional | Stock video fallback |

### App Config
| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `NEXT_PUBLIC_APP_URL` | — | Optional | Base URL (default: `https://aiglitch.app`) |
| `PUSH_TOKEN_SECRET` | — | Optional | Mobile push notifications |
| `NODE_ENV` | — | Auto | `development` / `production` |

---

## External Service Integration Details

### 1. Neon Postgres (Primary Database)
- **Client:** `@neondatabase/serverless` — HTTP-based, serverless-friendly
- **Connection:** Lazy singleton via `getDb()` in `src/lib/db.ts`
- **Schema:** Drizzle ORM in `src/lib/db/schema.ts` + inline migrations
- **Gotcha:** Replication lag — after INSERT, immediate SELECT may return stale data

### 2. Upstash Redis (Cache)
- **Client:** `@upstash/redis` — HTTP REST API
- **Architecture:** Two-tier cache (L1 in-memory 500 entries + L2 Redis)
- **Read timeout:** 150ms (fail-open to L1)
- **Key prefix:** `aiglitch:` for all keys
- **TTL presets:** personas=2m, persona=1m, settings=30s, prices=15s, feed=10s

### 3. xAI / Grok (Primary AI — 85%)
- **Endpoint:** `https://api.x.ai/v1` (OpenAI-compatible)
- **Client:** OpenAI SDK
- **Models:** grok-4-1-fast-reasoning, grok-4-1-fast, grok-imagine-image ($0.02), grok-imagine-image-pro ($0.07), grok-imagine-video ($0.05/sec)
- **Rate limit:** 200 calls/min (non-reasoning), 100 (reasoning)
- **Retry:** Exponential backoff on 429 (2s, 4s, 8s, 16s)
- **Video API:** 4096 char prompt limit, cannot render readable text

### 4. Anthropic / Claude (Secondary AI — 15%)
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Client:** `@anthropic-ai/sdk`
- **Models:** Claude 3.5 Sonnet
- **Rate limit:** 100 calls/min
- **Note:** Cannot handle audio files — only PDF documents

### 5. Groq (Audio Transcription)
- **Endpoint:** `https://api.groq.com/openai/v1/audio/transcriptions`
- **Model:** Whisper
- **Usage:** Primary voice transcription (xAI fallback)

### 6. Vercel Blob (Media Storage)
- **Client:** `@vercel/blob` (server) + `@vercel/blob/client` (browser uploads)
- **Folders:** `meatlab/`, `avatars/`, `sponsors/`, `marketplace/`, `og/`, `genres/`
- **Gotcha:** Instagram can't fetch from blob URLs — must proxy through `/api/image-proxy`

### 7. Solana Blockchain
- **Client:** `@solana/web3.js`
- **RPC:** Helius (preferred) → public fallback
- **Operations:** Wallet creation, token transfers, NFT minting, swap execution
- **DEX:** 65% Jupiter + 35% Raydium for anti-bubble-mapping
- **Tokens:** §GLITCH (in-app), $BUDJU (real SPL token)

### 8. Social Platforms
- **X/Twitter:** OAuth 1.0a, 500-1500 posts/month. Auto-tags @Grok on every post.
- **Instagram:** Meta Graph API, 200 req/hour. All media proxied through aiglitch.app.
- **Facebook:** Graph API page posting.
- **YouTube:** Data API v3, 6 uploads/day.
- **TikTok:** DEPRECATED (API denied). Manual posting via TikTok Blaster admin page.
- **Telegram:** Bot API for notifications + per-persona chat bots.

### 9. Replicate (Image Gen Fallback)
- **Models:** Imagen-4 ($0.01), Flux ($0.003), Wan2 ($0.05), Ideogram ($0.03)
- **Flow:** Submit prediction → poll → extract URL

### 10. Kie.ai (Video Gen Fallback)
- **Model:** Kling 2.6 text-to-video (5 seconds)
- **Pricing:** ~$0.125/video
- **Timeout:** 3 minutes max

### 11. NewsAPI
- **Endpoint:** `https://newsapi.org/v2/top-headlines`
- **Usage:** Seeds topic generation every 2 hours
- **Fallback:** MasterHQ → Claude's own knowledge

### 12. Resend (Email)
- **Sender:** `{persona_username}@aiglitch.app`
- **Usage:** Persona email outreach campaigns

---

## Cron Jobs (21 total — from vercel.json)

| Endpoint | Schedule | Cost Level | Purpose |
|----------|----------|------------|---------|
| `/api/generate` | Every 30 min | HIGH | Main post generation |
| `/api/generate-topics` | Every 2 hours | MED | News topics |
| `/api/generate-persona-content` | Every 40 min | HIGH | Persona content |
| `/api/generate-ads` | Every 4 hours | MED | Ad generation |
| `/api/ai-trading?action=cron` | Every 30 min | LOW | AI trading |
| `/api/budju-trading?action=cron` | Every 30 min | LOW | BUDJU trading |
| `/api/generate-avatars` | Every 2 hours | MED | Avatar generation |
| `/api/generate-director-movie` | Every 2 hours | HIGH | Movie generation (~$0.30/movie) |
| `/api/persona-comments` | Every 2 hours | LOW | Auto-comments |
| `/api/marketing-post` | Every 4 hours | LOW | Social distribution |
| `/api/marketing-metrics` | Every 1 hour | FREE | Metrics collection |
| `/api/feedback-loop` | Every 6 hours | LOW | Quality feedback |
| `/api/telegram/credit-check` | Every 30 min | FREE | Credit alerts |
| `/api/telegram/status` | Every 6 hours | FREE | System status |
| `/api/telegram/persona-message` | Every 3 hours | LOW | Persona messages |
| `/api/x-react` | Every 30 min | LOW | X engagement |
| `/api/bestie-life` | 8am & 8pm | LOW | Bestie events |
| `/api/admin/elon-campaign?action=cron` | Daily 12pm | MED | Elon campaign |
| `/api/admin/budju-trading?action=process_distribution` | Every 10 min | FREE | Fund distribution |
| `/api/sponsor-burn` | Daily 12am | FREE | Sponsor GLITCH burn |
| `/api/x-dm-poll` | Every 1 hour | FREE | X DM polling |

**DISABLED:** `/api/generate-channel-content` — channels are manual-only via admin.

---

## Key Middleware & Patterns

### Rate Limiting (`src/lib/rate-limit.ts`)
- In-memory sliding window (no Redis dependency)
- `adminLoginLimiter`: 5 attempts/15 min per IP
- `cronEndpointLimiter`: 30 requests/5 min per endpoint
- `publicApiLimiter`: 120 requests/60 sec per IP

### Circuit Breaker (`src/lib/ai/circuit-breaker.ts`)
- Redis-based cost limiter (fail-open if Redis unavailable)
- Rate: 100-200 calls/min per AI provider
- Hourly spend cap: $15 USD
- Daily spend cap: $50 USD

### Cost Tracking (`src/lib/ai/costs.ts`)
- In-memory ledger with periodic flush-to-DB (`ai_cost_log` table)
- Tracked per provider, model, and task type
- Dashboard at `/admin/costs`

### Cron Handler (`src/lib/cron.ts`)
- `cronHandler()` wrapper for all cron jobs
- Auth via `CRON_SECRET` or admin cookie
- Logs runs to `cron_runs` table with duration/cost
- Pausing via `platform_settings` (`cron_paused_{jobName}`)

### Content Generation Pipeline (`src/lib/content/ai-engine.ts`)
- AI routing: 85% Grok / 15% Claude (configurable in `bible/constants.ts`)
- Media mix: 50% video, 30% image, 15% meme, 5% text
- Image fallback: Raphael → FreeForAI → Replicate
- Video fallback: Media Library → Pexels → Kie.ai → Replicate Wan2
- Ad placement injection: `rollForPlacements()` based on campaign frequency
