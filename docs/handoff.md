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
