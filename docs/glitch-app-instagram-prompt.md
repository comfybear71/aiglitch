# GLITCH-APP Frontend Prompt: Ensuring Content Reaches Instagram & All Platforms

Use this prompt when working on the GLITCH-APP (mobile app) repo at `comfybear71/glitch-app` to ensure all generated content reaches Instagram and all 5 social platforms.

---

## How It Works — Backend Handles Everything

The AIG!itch backend automatically spreads content to all 5 platforms (X, TikTok, Instagram, Facebook, YouTube). **The frontend does NOT need to call any social media APIs directly.**

When the Bestie generates content via the `/api/messages` endpoint, the backend:
1. Generates the image/video via xAI Aurora/Grok
2. Persists it to Vercel Blob (permanent URL)
3. Saves it to the `messages` table (for chat display)
4. **Automatically calls `shareBestieMediaToSocials()`** which posts to ALL active platforms including Instagram
5. Instagram images are auto-proxied through `/api/image-proxy` (resized to 1080x1080 JPEG) because Instagram can't fetch from Vercel Blob directly

**This is already wired up in `/api/messages/route.ts` lines 588-607.** No frontend changes needed for the auto-share.

---

## Content Generation Paths & Social Spreading

Here is every generation path available from the mobile app and whether it auto-spreads:

| Mobile App Action | Backend Endpoint | Auto-Spreads to Instagram? | How |
|---|---|---|---|
| Bestie generates image | `/api/messages` → `generate_image` tool | **YES** | `shareBestieMediaToSocials()` called automatically after generation |
| Bestie generates video | `/api/messages` → `generate_video` tool | **YES** | `shareBestieMediaToSocials()` called automatically |
| Generate poster | `/api/admin/mktg` `action: generate_poster` | **YES** | Auto-creates feed post + spreads to all platforms |
| Generate hero image | `/api/admin/mktg` `action: generate_hero` | **YES** | Auto-creates feed post + spreads to all platforms |
| Generate ad video | `/api/generate-ads` POST | **YES** | Auto-creates feed post + spreads on completion |
| Generate director movie | `/api/generate-director-movie` POST | **YES** | Auto-creates feed post + spreads on completion |
| Generate breaking news | `/api/generate-breaking-videos` POST | **YES** | Auto-creates feed post + spreads on completion |
| Generate content | `/api/generate-persona-content` | **YES** | Cron auto-picks top posts for marketing cycle |
| Generate avatars | `/api/generate-avatars` | NO (avatars aren't social posts) | N/A |
| Manual spread | `/api/admin/spread` POST | **YES** | Explicitly spreads specific posts to all platforms |

---

## If Content Is NOT Reaching Instagram — Debugging Checklist

### 1. Check Instagram Account Is Active

The backend needs valid Instagram credentials. Verify in Vercel:

**Required Vercel Environment Variables:**
```
INSTAGRAM_ACCESS_TOKEN=<Meta Graph API token with instagram_content_publish permission>
INSTAGRAM_USER_ID=<Instagram Business Account ID (numeric)>
```

If these are missing or expired, Instagram posts will silently fail.

### 2. Check Vercel Logs for Errors

Look for these log patterns in Vercel:
```
[BESTIE-SHARE] instagram: FAILED — ...
[BESTIE-SHARE] instagram: ERROR — ...
[instagram] Error: ...
```

Common errors:
- `"The access token has expired"` → Regenerate token in Meta Developer Console
- `"The aspect ratio is not supported"` → Image proxy issue (should not happen with current code)
- `"instagram_content_publish permission missing"` → Token needs this scope
- `"No active social media accounts configured"` → No `INSTAGRAM_ACCESS_TOKEN` env var set

### 3. Check Marketing Platform Accounts

```
GET /api/admin/mktg?action=list_accounts
```

Response should include an Instagram account with `is_active: true`. If not present, set the env vars above.

### 4. Test Instagram Posting Manually

```
POST /api/admin/mktg
Content-Type: application/json

{
  "action": "test_post",
  "platform": "instagram",
  "message": "Test post from AIG!itch",
  "mediaType": "image"
}
```

This will attempt to post a random image to Instagram. Check the response for errors.

---

## How Instagram Posting Works (Technical)

```
Content Generated
    ↓
Vercel Blob URL (e.g. blob.vercel-storage.com/xxx.jpg)
    ↓
postToPlatform("instagram", account, text, mediaUrl)
    ↓
postToInstagram(account, text, mediaUrl)
    ↓
if (!mediaUrl.startsWith(appUrl)) {
    → /api/image-proxy?url=<encoded-blob-url>     (images: resize to 1080x1080 JPEG)
    → /api/video-proxy?url=<encoded-blob-url>      (videos: stream through our domain)
}
    ↓
Instagram Graph API: POST /{igUserId}/media
    with image_url = https://aiglitch.app/api/image-proxy?url=...
    ↓
Poll for container status (videos only)
    ↓
Instagram Graph API: POST /{igUserId}/media_publish
    ↓
Posted!
```

**Why the proxy is needed:** Instagram's Graph API cannot fetch images from `blob.vercel-storage.com` — it returns "image ratio 0". All media is proxied through `aiglitch.app/api/image-proxy` (images) or `aiglitch.app/api/video-proxy` (videos) so Instagram fetches from our domain.

---

## For the Mobile App Frontend — What You Need to Do

### Nothing for auto-spreading
All Bestie image/video generation already auto-spreads to Instagram. No code changes needed.

### To manually spread a specific post
```typescript
// Spread a post to all platforms (including Instagram)
const response = await fetch('/api/admin/spread', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    post_ids: ['post-uuid-here'],
    // Omit platforms to spread to ALL, or specify:
    // platforms: ['instagram', 'x', 'tiktok', 'facebook', 'youtube']
  })
});
```

### To generate content and ensure it spreads
Just call the normal generation endpoints. They all auto-spread:

```typescript
// Generate a poster (auto-spreads to Instagram + all platforms)
await fetch('/api/admin/mktg', {
  method: 'POST',
  body: JSON.stringify({ action: 'generate_poster' })
});

// Generate a hero image (auto-spreads)
await fetch('/api/admin/mktg', {
  method: 'POST',
  body: JSON.stringify({ action: 'generate_hero' })
});

// Generate an ad video (auto-spreads on completion)
await fetch('/api/generate-ads', {
  method: 'POST',
  body: JSON.stringify({})
});
```

### To check if Instagram is working
```typescript
// Test post to Instagram specifically
const result = await fetch('/api/admin/mktg', {
  method: 'POST',
  body: JSON.stringify({
    action: 'test_post',
    platform: 'instagram',
    message: 'Test from GLITCH-APP',
    mediaType: 'image'
  })
});
```

---

## Key Backend Files (in aiglitch repo)

| File | Purpose |
|------|---------|
| `src/app/api/messages/route.ts` (lines 588-607) | Auto-calls `shareBestieMediaToSocials()` after Bestie generates media |
| `src/lib/marketing/bestie-share.ts` | `shareBestieMediaToSocials()` — posts to all platforms with branded CTAs |
| `src/lib/marketing/platforms.ts` | `postToPlatform()` dispatcher, `postToInstagram()` with proxy |
| `src/app/api/image-proxy/route.ts` | Resizes images to 1080x1080 JPEG for Instagram |
| `src/app/api/video-proxy/route.ts` | Streams video through our domain for Instagram Reels |
| `src/app/api/admin/spread/route.ts` | Manual spread endpoint |
| `src/app/api/admin/mktg/route.ts` | Poster/hero generation + auto-spread |

---

## Important: DO NOT

- Do NOT call Instagram Graph API directly from the mobile app — the backend handles it
- Do NOT construct Vercel Blob URLs for Instagram — they must be proxied
- Do NOT assume Instagram is broken if posts don't appear — check Vercel logs first
- Do NOT create separate Instagram posting logic — use `/api/admin/spread` or let auto-share handle it

## Important: DO

- DO verify `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID` are set in Vercel env vars
- DO check the Instagram token hasn't expired (Meta tokens expire in ~60 days)
- DO use `/api/admin/mktg?action=test_post&platform=instagram` to verify Instagram works
- DO check Vercel logs for `[BESTIE-SHARE]` and `[instagram]` entries when debugging
- DO ensure the Instagram account has `instagram_content_publish` permission on the access token
