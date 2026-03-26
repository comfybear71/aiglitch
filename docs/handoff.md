# Handoff Notes

## Grok Video Extension / 30s Chaining (March 2026)

Grok's `grok-imagine-video` API generates 6–10 second clips. There is **no native 30s generation** — longer videos require **manual chaining** via last-frame continuation. This is how the consumer Grok app's "Extend" feature works under the hood.

### How 30s Video Chaining Works

1. **Generate base clip** (10s) using text-to-video:
   ```
   POST https://api.x.ai/v1/videos/generations
   { model: "grok-imagine-video", prompt: "...", duration: 10, aspect_ratio: "9:16", resolution: "720p" }
   ```

2. **Extract the last frame** from the completed video using ffmpeg:
   ```bash
   ffmpeg -sseof -0.1 -i clip1.mp4 -frames:v 1 -q:v 2 last_frame.jpg
   ```

3. **Generate continuation clip** using image-to-video (init_image = last frame):
   ```
   POST https://api.x.ai/v1/videos/generations
   {
     model: "grok-imagine-video",
     prompt: "Seamless continuation from previous frame: [continuation description]. Maintain identical style, lighting, colors, character design — zero drift, frame-accurate match.",
     init_image: "<base64 or URL of last frame>",
     duration: 10,
     aspect_ratio: "9:16",
     resolution: "720p"
   }
   ```
   **Note:** Check `docs.x.ai/developers/model-capabilities/video/generation` for the exact parameter name — could be `init_image`, `start_frame`, or `image_prompt`.

4. **Repeat steps 2–3** for each additional segment (3 × 10s = 30s total).

5. **Concatenate all clips** using ffmpeg concat demuxer:
   ```bash
   # files.txt:
   # file 'clip1.mp4'
   # file 'clip2.mp4'
   # file 'clip3.mp4'
   ffmpeg -f concat -safe 0 -i files.txt -c copy final_30s.mp4
   ```

### Prompt Engineering for Seamless Continuations

Use this template for every continuation prompt to minimize visual drift:

```
Seamless exact continuation from the final frame: [describe ONLY the new action/motion/camera move].
Maintain perfect character consistency, identical facial expression/pose at start matching end of prior clip,
same lighting/shadows/volumetrics, zero style drift, frame-accurate match, cinematic quality.
[Reuse 2-3 core style descriptors from original prompt briefly].
```

Key locks to add:
- `exact facial features and expression continuity`
- `same exact light sources, shadow angles`
- `treat previous clip as canonical reference — match 1:1`

### Implementation Notes

- **Shorter segments (6–8s) = stronger consistency** at seams vs 10s segments
- Each segment requires its own async Grok job → poll for completion → download → extract frame → submit next
- The whole chain is sequential (each clip depends on the previous one's last frame)
- Total wall-clock time for 30s: ~3–5 minutes (3 segments × 60–90s render each)
- Use Vercel Blob for intermediate clip storage, ffmpeg for concat
- The `maxDuration` on the API route needs to be high enough (300s) or use background processing

### Current State

- **10s ads**: Fully working (plan → submit → poll → persist → post → spread)
- **30s ads**: Working! Uses multi-clip generation + MP4 stitching via `concatMP4Clips()`. The PUT endpoint handles clip download, concat, and blob upload.
- The ad campaign fix (March 23 2026) added proper GET polling + auto-post+spread on completion.

---

## Prompt Viewer/Editor System (March 2026)

All admin generation tools now have a **"👁 Prompt" button** that shows the exact AI prompt before generation. Users can view and edit prompts.

### Component

`src/components/PromptViewer.tsx` — Reusable component with:
- Collapsible prompt preview (fetched from API)
- Editable textarea (yellow text when edited)
- Reset to original / Refresh buttons
- `onPromptChange` callback passes `null` (default) or edited string to parent

### API Preview Modes

Each generation API supports a preview mode that returns the constructed prompt without executing:

| API Route | Preview mechanism |
|-----------|------------------|
| `/api/generate-ads` | POST with `plan_only: true` returns `prompt` + `caption` |
| `/api/admin/mktg` | GET `?action=preview_hero_prompt` or `?action=preview_poster_prompt` |
| `/api/admin/elon-campaign` | GET `?action=preview_prompt&mood=X` |
| `/api/admin/chibify` | GET `?persona_id=X` returns prompt |
| `/api/admin/animate-persona` | POST with `{ persona_id, preview: true }` |
| `/api/admin/promote-glitchcoin` | GET `?action=preview_prompt&mode=image\|video` |
| `/api/admin/screenplay` | POST with `{ preview: true, genre?, director?, concept? }` |
| `/api/admin/channels/generate-promo` | POST with `{ channel_id, channel_slug, preview: true }` |
| `/api/admin/channels/generate-title` | POST with `{ channel_id, channel_slug, title, preview: true }` |

### Custom Prompt Overrides

When the user edits a prompt, the custom version is passed to the API:
- Hero image & Poster: `custom_prompt` field in FormData → `generateHeroImage(customPrompt)` / `generatePoster(focusTopics, customPrompt)`
- GLITCH Promo: `prompt` field in FormData (already existed)
- Channel promo: `custom_prompt` field (already existed)
- Channel title: `style_prompt` field (already existed)

### Key Type Gotcha

`generateDirectorScreenplay()` in `src/lib/content/director-movies.ts` returns `string | DirectorScreenplay | null`. When `previewOnly=true`, it returns the prompt string. All callers must check `typeof result === "string"` before using screenplay properties. Three callers: `screenplay/route.ts`, `generate-content/route.ts`, `generate-director-movie/route.ts`.

---

## Admin Generation Tools — Clear/Reset Buttons (March 2026)

All generation sections on `/admin/personas` now have a **"🔄 Clear" button** that appears after generation completes:

| Feature | What gets cleared |
|---------|------------------|
| Ad Campaigns | adLog, adVideoUrl, adCaption, adSpreadResults, adComplete, adPhase |
| §GLITCH Promo | promoLog, promoSpreadResults, promoComplete, promoImageUrl |
| Platform Poster | posterLog, posterSpreadResults, posterComplete, posterUrl |
| Sgt. Pepper Hero | heroLog, heroSpreadResults, heroComplete, heroUrl |
| Chibify Personas | chibifyLog, chibifyResults, chibifyComplete, chibifySelected |

Elon Campaign already had a reset button (destructive — deletes from DB). Animate is per-persona and auto-clears.

---

## Ad Campaign Ecosystem Upgrade (March 2026)

Ad generation (`/api/generate-ads`) now promotes the entire AIG!itch ecosystem, not just GLITCH coin:

- **Distribution**: 70% full ecosystem / 20% GLITCH coin / 10% marketplace products
- **5 rotating video prompts**: ecosystem overview, Channels (AI Netflix), G!itch Bestie mobile app, 108 personas reveal, logo-centric brand
- **All AI prompts** (plan_only, admin interactive, ad copy generation) updated to sell everything: app, Channels, personas, §GLITCH, $BUDJU, the logo
- **AIG!ITCH logo/brand** required to appear prominently in all generated content
- **AIGLITCH_PLATFORM** virtual product updated with full ecosystem description

### Grok API Endpoints Reference

- `POST /v1/videos/generations` — Submit video generation job
- `GET /v1/videos/{request_id}` — Poll for completion, returns `{ status, video: { url } }`
- Video statuses: `pending` → `in_progress` → `completed` (or `moderation_failed` / `expired` / `failed`)

---

## Instagram Proxy System (March 25, 2026)

Instagram's Graph API cannot fetch media from `blob.vercel-storage.com` (returns "image ratio 0"). Facebook works fine with the same URLs. All Instagram media is proxied through our domain.

### Architecture

```
Content Generated → Vercel Blob URL → postToPlatform("instagram", ...)
                                              ↓
                                     postToInstagram()
                                              ↓
                              if (!url.startsWith(appUrl))
                                     ↓              ↓
                              IMAGE                VIDEO
                                ↓                    ↓
                   /api/image-proxy          /api/video-proxy
                   - fetch from blob         - stream from blob
                   - sharp resize            - pass-through
                     1080x1080 JPEG          - same content-type
                   - serve from              - serve from
                     aiglitch.app              aiglitch.app
                                     ↓
                        Instagram Graph API
                        POST /{igUserId}/media
                        image_url = aiglitch.app/api/image-proxy?url=...
                        video_url = aiglitch.app/api/video-proxy?url=...
```

### Key Files

| File | Purpose |
|------|---------|
| `src/app/api/image-proxy/route.ts` | Fetches image, resizes to 1080x1080 JPEG via sharp, serves from our domain |
| `src/app/api/video-proxy/route.ts` | Streams video through our domain (no processing) |
| `src/lib/marketing/platforms.ts` | `postToInstagram()` auto-proxies all external URLs (line ~642) |

### All Entry Points (verified)

| Entry Point | File | How it posts |
|-------------|------|-------------|
| Marketing cron (every 4h) | `/api/marketing-post` | `runMarketingCycle()` → `postToPlatform()` |
| Admin spread | `/api/admin/spread` | loops accounts → `postToPlatform()` |
| Admin media spread | `/api/admin/media/spread` | loops accounts → `postToPlatform()` |
| Bestie social share | `lib/marketing/bestie-share.ts` | `shareBestieMediaToSocials()` → `postToPlatform()` |
| Admin test post | `/api/admin/mktg?action=test_post` | `postToPlatform()` |
| Admin run cycle | `/api/admin/mktg?action=run_cycle` | `runMarketingCycle()` → `postToPlatform()` |

### Instagram Requirements

- **Images**: JPEG/PNG only, aspect ratio 4:5 to 1.91:1 (proxy forces 1080x1080 square)
- **Videos (Reels)**: MP4, 9:16 preferred, 3s–90s duration
- **Access token needs**: `instagram_content_publish` permission
- **Env vars**: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`

### CRITICAL: Never bypass the proxy

All Instagram posting MUST go through `postToInstagram()` in `platforms.ts`. Never call the Instagram Graph API directly — the proxy handles domain + format issues that cause silent failures.

### Instagram Debugging Checklist

If content is NOT reaching Instagram, it's always a backend/Vercel issue (never the mobile app):

1. **Check env vars in Vercel Dashboard → Settings → Environment Variables:**
   - `INSTAGRAM_ACCESS_TOKEN` — must be set and valid
   - `INSTAGRAM_USER_ID` — must be set (numeric Business Account ID)

2. **Meta tokens expire every ~60 days.** If posts were working and stopped, the token expired. Regenerate in Meta Developer Console with `instagram_content_publish` scope.

3. **Quick diagnosis commands (run from admin panel or curl):**
   ```
   # Check if Instagram account is configured
   GET /api/admin/mktg?action=list_accounts

   # Test post to Instagram directly
   POST /api/admin/mktg
   { "action": "test_post", "platform": "instagram", "message": "Test from AIG!itch", "mediaType": "image" }
   ```

4. **Check Vercel logs** for these patterns:
   - `[BESTIE-SHARE] instagram: FAILED` — posting failed
   - `[BESTIE-SHARE] instagram: posted OK` — working
   - `[instagram] Error` — API error details
   - `No active social media accounts configured` — env vars missing

5. **After updating env vars, redeploy** — Vercel doesn't pick up new env vars until the next deploy.

---

## Cross-Platform Content Distribution (March 25, 2026)

All content generated on the platform is distributed to 5 social platforms via the marketing engine.

### Platform-Specific Handling

| Platform | Image Format | Video Format | Auth Method |
|----------|-------------|-------------|-------------|
| X (Twitter) | Binary upload via media API | Binary upload | OAuth 1.0a (HMAC-SHA1) |
| TikTok | URL (direct) | URL (direct) | OAuth 2.0 |
| Instagram | **Proxied URL** (1080x1080 JPEG) | **Proxied URL** (stream) | Graph API token |
| Facebook | URL (direct) | URL (direct) | Page access token |
| YouTube | N/A | Binary upload | OAuth 2.0 + refresh |

### Content Flow

1. **Content generated** (cron jobs, admin tools, or bestie shares)
2. **Media stored** in Vercel Blob → URL saved in `posts.media_url`
3. **Marketing cycle** (`/api/marketing-post`, every 4h) picks top posts
4. **Platform adaptation** (`adaptContentForPlatform()`) adjusts text/hashtags per platform
5. **`postToPlatform()`** dispatches to platform-specific function
6. **Instagram special path**: proxy URLs through our domain before Graph API call
7. **Results logged** in `marketing_posts` table with `platform_post_id` and `platform_url`

### Admin Controls

- **Test Post**: Text-only test on any platform
- **Image/Video**: Test with random DB media
- **Run Marketing Cycle**: Manual trigger of the cron job
- **Spread**: Distribute specific posts to all platforms

---

## Ad Campaign System — Branded Product Placements (March 2026)

Two-tier ad system for monetization and platform promotion.

### Tier 1: Platform Promo Ads (Automatic)

Cron job `/api/generate-ads` runs every 4 hours:

```
1. Pick product (70% ecosystem / 20% §GLITCH / 10% marketplace)
2. Claude generates video prompt + caption
3. Grok renders 10s vertical video (9:16, 720p)
4. Poll until complete → download → persist to Vercel Blob
5. Create feed post by Architect (glitch-000), type: product_shill
6. Auto-spread to all 5 platforms
```

**5 rotating video prompt angles** (all neon cyberpunk, purple/cyan):
1. Full ecosystem overview (logo, personas, Channels, Bestie, §GLITCH)
2. Channels / AI Netflix (holographic screens, AI shows)
3. Mobile app + Bestie (phone in cosmic space, AI companion)
4. 108 AI Personas reveal (grid of avatars, zoom out to logo)
5. Logo-centric brand (logo materializes from digital static)

**Interactive flow (admin)**:
```
POST /api/generate-ads { plan_only: true }        → preview prompt + caption
POST /api/generate-ads { wallet_address: "..." }   → submit to Grok, get requestId
GET  /api/generate-ads?id=REQUEST_ID               → poll (pending/done), auto-posts on completion
PUT  /api/generate-ads { video_url, clip_urls }     → publish + optional 30s stitching
```

### Tier 2: Branded Campaigns (Paid Placements)

**Admin CRUD**: `/api/admin/ad-campaigns`

Campaign fields:
- `brand_name`, `product_name`, `product_emoji`
- `visual_prompt` — injected into image/video AI generation prompts
- `text_prompt` — injected into post text generation for natural mentions
- `logo_url`, `product_image_url` — product imagery for visual injection
- `frequency` (0.0-1.0) — probability of placement per content piece
- `target_channels` / `target_persona_types` — optional targeting (null = global)
- `duration_days`, `price_glitch` — billing
- Status: `pending_payment` → `active` → `paused`/`completed`/`cancelled`

**How injection works** (automatic in all content generators):
```typescript
// In /api/generate, /api/generate-persona-content, etc.
const campaigns = await getActiveCampaigns(channelId);
const placements = rollForPlacements(campaigns);  // probabilistic
const visualPlacement = buildVisualPlacementPrompt(placements);  // "🎬 PRODUCT PLACEMENT..."
const textPlacement = buildTextPlacementPrompt(placements);     // "📢 SPONSORED MENTION..."
// visualPlacement injected into image/video prompt
// textPlacement injected into post text prompt
await logImpressions(placements, postId, contentType, channelId, personaId);
```

**Impression tracking**: Separate counters for total, video, image, post impressions per campaign. Query via `GET /api/admin/ad-campaigns?action=impressions&campaign_id=UUID`.

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/ad-campaigns.ts` | Core: getActiveCampaigns, rollForPlacements, buildPrompts, logImpressions |
| `src/app/api/generate-ads/route.ts` | Tier 1: POST/GET/PUT for promo ad generation |
| `src/app/api/admin/ad-campaigns/route.ts` | Tier 2: Campaign CRUD + stats + impressions |
| `src/app/admin/campaigns/page.tsx` | Admin campaign management UI |
| `src/lib/bible/constants.ts` | Brand prompt (`getAIGlitchBrandPrompt()`), distribution ratios |

---

## Bestie Social Share System (March 2026)

**File**: `src/lib/marketing/bestie-share.ts`

When a Bestie generates media (images, memes, videos), it's automatically distributed to all social platforms.

### How it works

```typescript
shareBestieMediaToSocials({
  mediaUrl: "https://blob.../image.jpg",
  mediaType: "image",
  personaName: "Luna",
  personaEmoji: "🌙",
  description: "A cyberpunk cityscape"
})
```

1. Fetches all active platform accounts
2. Picks from 6 rotating branded CTAs:
   - "Get your own AI Bestie at aiglitch.app..."
   - "This was created by an AI Bestie on AIG!itch..."
   - etc.
3. Adapts text per platform (length limits, hashtags)
4. Posts to all platforms via `postToPlatform()`
5. Records in `marketing_posts` table
6. Returns `{ posted: number, failed: number, details: string[] }`

### Platform compatibility

- X, Instagram, Facebook: Image + video supported
- TikTok, YouTube: Video only (skips image posts)
- Instagram: Auto-proxied through `/api/image-proxy` or `/api/video-proxy`

---

## Spread Post to Social — Unified Distribution (March 2026)

**File**: `src/lib/marketing/spread-post.ts`

Reusable function that spreads a single post to all active social platforms.

```typescript
spreadPostToSocial(postId, personaId, displayName, emoji, knownMedia?, telegramLabel?)
```

### Key features

- **Neon replication lag handling**: Accepts `knownMedia` URL passthrough to avoid reading stale `media_url` from DB after INSERT
- **Auto-repair**: If DB `media_url` is NULL but `knownMedia` provided, auto-updates the DB record
- **Fallback media**: If post has no media, picks random recent image/video from posts table
- **Telegram integration**: Always posts to Telegram channel with platform status summary
- **Movie special case**: Only shows title + link (not full synopsis)
- Returns `{ platforms: string[], failed: string[] }`

### Used by

- `/api/generate-ads` — after video completes (GET poll) or manual publish (PUT)
- `/api/admin/spread` — manual spread of existing posts
- `/api/admin/media/spread` — media library spreading
- `shareBestieMediaToSocials()` — indirectly (same underlying `postToPlatform()`)

---

## Platform Account Environment Variables (March 2026)

Platform accounts can be configured via Vercel env vars without DB rows.

### How it works

`getEnvOnlyAccounts()` in `src/lib/marketing/platforms.ts` synthesizes account objects from env vars:

| Platform | Required Env Vars |
|----------|-------------------|
| Instagram | `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_USER_ID` |
| Facebook | `FACEBOOK_ACCESS_TOKEN` |
| TikTok | `TIKTOK_ACCESS_TOKEN` |
| YouTube | `YOUTUBE_ACCESS_TOKEN` |
| X | `X_CONSUMER_KEY` + `X_ACCESS_TOKEN` (already existed) |

**Priority**: Env vars always override DB-stored tokens via `applyEnvTokens()`. This enables credential rotation in Vercel without touching the database.

**Instagram special**: If env vars are set but no DB row exists, a synthetic account object is created with the env var credentials. This was critical for getting Instagram working initially.

---

## Mobile App Integration Prompts (March 25, 2026)

Two new documentation files for the GLITCH-APP mobile app repo (`comfybear71/glitch-app`):

| File | Purpose |
|------|---------|
| `docs/glitch-app-cross-platform-prompt.md` | How all content reaches all 5 platforms, Instagram proxy details, backend endpoints |
| `docs/glitch-app-ad-campaigns-prompt.md` | Two-tier ad system, campaign API reference, feed integration, impression tracking |

### Key points for mobile app devs

1. **Campaign injection is automatic** — backend handles it in all content generators
2. **Instagram proxying is automatic** — handled in `postToInstagram()`, no frontend action needed
3. **Ad posts in feed**: `post_type === "product_shill"` — badge as "Promoted"
4. **Spread endpoint**: `POST /api/admin/spread` with `post_ids` array distributes to all platforms
5. **Ad generation 3-step flow**: preview → submit → poll (video takes 60-90s)

---

## TikTok Content Posting API (March 26, 2026)

TikTok posting uses the **FILE_UPLOAD** method with the **Inbox endpoint** — no domain verification or Direct Post audit required.

### Architecture

```
Video URL (Vercel Blob) → postToTikTok()
                                ↓
                    1. getValidTikTokToken() — auto-refresh if expired
                    2. creator_info query — validates token
                    3. Download video binary (fetch → Buffer)
                    4. Init FILE_UPLOAD via Inbox endpoint
                       POST /v2/post/publish/inbox/video/init/
                       { source_info: { source: "FILE_UPLOAD", video_size, chunk_size, total_chunk_count: 1 } }
                    5. Upload binary via PUT to upload_url
                       Content-Range: bytes 0-{size-1}/{size}
                       Content-Type: video/mp4
                                ↓
                    Video appears in creator's TikTok inbox/drafts
```

### Sandbox vs Production

| Mode | Credentials | Endpoint | Notes |
|------|------------|----------|-------|
| Sandbox | `TIKTOK_SANDBOX_CLIENT_KEY` / `SECRET` | Inbox (same) | Only sandbox target users can see content |
| Production | `TIKTOK_CLIENT_KEY` / `SECRET` | Inbox (same) | Requires approved TikTok app |

Mode is stored in `marketing_platform_accounts.extra_config` as `{"sandbox": true/false}`.

### OAuth Flow

1. User clicks Re-authorize → `/api/auth/tiktok?sandbox=true`
2. Auth route creates state = `{uuid}:sandbox`, saves in cookie, redirects to TikTok
3. User authorizes on TikTok
4. TikTok redirects to `/api/auth/callback/tiktok?code=X&state={uuid}:sandbox`
5. Callback reads sandbox from `state` param (NOT cookie — Safari ITP blocks cross-site cookies)
6. Exchanges code for tokens, saves to DB with `extra_config: {"sandbox": true}`
7. Redirects to `/admin/marketing?tiktok_mode=sandbox`

### Known Limitations

- **TikTok is video-only** — text and image posts are not supported
- **Inbox upload** — videos go to creator's drafts, must be published manually from TikTok app
- **Pending upload limit** — too many failed uploads trigger `spam_risk_too_many_pending_share`, expires after ~24h
- **15 posts/day limit** — TikTok Content Posting API rate limit per account

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/marketing/platforms.ts` | `postToTikTok()` — FILE_UPLOAD + Inbox, token refresh, error handling |
| `src/app/api/auth/tiktok/route.ts` | OAuth initiation — sandbox flag in state param |
| `src/app/api/auth/callback/tiktok/route.ts` | OAuth callback — token exchange, DB upsert |
| `src/app/admin/marketing/page.tsx` | Sandbox/Live toggle, Test Video button |
