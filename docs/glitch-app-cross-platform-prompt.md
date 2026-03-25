# GLITCH-APP Frontend Prompt: Cross-Platform Content Distribution

Use this prompt when working on the GLITCH-APP (mobile app) repo at `comfybear71/glitch-app` to ensure all generated content flows to all social platforms.

---

## Context

The AIG!itch backend (`comfybear71/aiglitch`) has a marketing engine that distributes content to 5 social platforms: X (Twitter), TikTok, Instagram, Facebook, and YouTube.

**Instagram requires special handling**: All media URLs must be proxied through `aiglitch.app/api/image-proxy` (images) or `aiglitch.app/api/video-proxy` (videos) because Instagram's Graph API cannot fetch from `blob.vercel-storage.com`. This is handled automatically server-side — the mobile app does NOT need to worry about proxying.

## How Content Gets to All Platforms

### Automatic (No frontend changes needed)
- **Cron jobs** run every 4 hours (`/api/marketing-post`) and automatically pick top posts to distribute to all 5 platforms
- **Bestie social shares** (`shareBestieMediaToSocials()`) auto-distribute generated media to all platforms
- Any content generated via admin tools (posters, hero images, promos) auto-spreads

### From the Mobile App
When the GLITCH-APP generates content that should be distributed to social platforms, use these backend endpoints:

#### 1. Generate + Auto-Spread (Recommended)
```
POST /api/admin/mktg
Content-Type: multipart/form-data

action=create_poster (or create_hero, run_cycle)
```
These actions generate content AND automatically spread to all platforms.

#### 2. Manual Spread of Existing Posts
```
POST /api/admin/spread
Content-Type: application/json

{
  "post_ids": ["uuid-1", "uuid-2"],
  "platforms": ["x", "tiktok", "instagram", "facebook", "youtube"]
}
```
Spreads specific posts to specific platforms. Omit `platforms` to spread to all.

#### 3. Single Platform Test
```
POST /api/admin/mktg
Content-Type: multipart/form-data

action=test_post
platform=instagram (or x, tiktok, facebook, youtube)
message=Your post text here
mediaType=image (or video, optional)
```

## What the Mobile App Should Do

1. **When generating content** (posters, hero images, AI art, etc.):
   - Call the generation endpoint as normal
   - The backend handles storing media in Vercel Blob
   - Call `/api/admin/spread` with the resulting post ID to distribute to all platforms
   - OR use generation endpoints that auto-spread (poster, hero image)

2. **When user creates shareable content**:
   - Save the post to the `posts` table via the appropriate API
   - Call `/api/admin/spread` with the post ID
   - The backend handles platform-specific adaptation (text, hashtags, media format)

3. **Platform-specific considerations**:
   - **X**: 280 char limit, auto-shortened
   - **TikTok**: Requires video, auto-skips if content is image-only
   - **Instagram**: Images auto-resized to 1080x1080, videos posted as Reels
   - **Facebook**: Supports both images and videos
   - **YouTube**: Requires video, auto-skips if content is image-only

## Key Backend Files (in aiglitch repo)

| File | Purpose |
|------|---------|
| `src/lib/marketing/platforms.ts` | `postToPlatform()` dispatcher + all platform connectors |
| `src/lib/marketing/content-adapter.ts` | `adaptContentForPlatform()` for text/hashtag adjustments |
| `src/lib/marketing/bestie-share.ts` | Auto-share bestie media to all platforms |
| `src/app/api/admin/spread/route.ts` | Manual spread endpoint |
| `src/app/api/marketing-post/route.ts` | Cron-driven auto-distribution |
| `src/app/api/image-proxy/route.ts` | Instagram image proxy (1080x1080 JPEG) |
| `src/app/api/video-proxy/route.ts` | Instagram video proxy (stream) |

## Ad Campaign Integration (March 25, 2026)

**All content generated through the mobile app automatically includes active ad campaign placements.** The backend injects branded product placements into every single generation path — images, videos, avatars, chibis, promos, posters, movies, posts, everything.

The mobile app does NOT need to do anything special. Just:
1. Create a campaign at `/admin/campaigns` (or via `POST /api/admin/ad-campaigns`)
2. Set `frequency` to `1.0` for guaranteed placement in every piece of content
3. Activate the campaign
4. Generate content as normal — the client's product will be in everything

See `docs/glitch-app-ad-campaigns-prompt.md` for the full API reference and coverage table.

## Important: DO NOT

- Do NOT call Instagram Graph API directly from the mobile app
- Do NOT construct `blob.vercel-storage.com` URLs for Instagram — always go through the backend
- Do NOT skip the `/api/admin/spread` endpoint — it handles all platform-specific formatting and proxying
- Do NOT hardcode platform credentials in the mobile app — all auth is server-side
