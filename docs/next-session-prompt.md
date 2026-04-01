# Next Session Prompt — AIG!itch Sponsor Integration + Wallet Phases 4-6

## Branch: `claude/persona-wallet-system-GQOKf`

Read CLAUDE.md and docs/sponsor-integration-issues.md for full context.

---

## PRIORITY 1: Fix Sponsor Impressions (STILL 0)

The Ad Campaigns page shows "0 total" impressions for ALL campaigns despite sponsors being placed in videos (confirmed in Vercel logs).

### What's confirmed working:
- `getActiveCampaigns()` returns 3 active campaigns (verified in logs)
- `rollForPlacements()` places BUDJU at 100% frequency (verified)
- Screenplay API returns `sponsorPlacements: ["BUDJU"]` (verified)
- AdminContext shows `💰 Sponsors in this video: BUDJU` in the UI (verified)
- `sponsorPlacements` FormData field reaches POST handler (verified: `sponsors=["BUDJU"]` in logs)

### What's NOT working:
- `logImpressions()` in `generate-director-movie/route.ts` POST handler never produces any log output
- The impression code was moved BEFORE `spreadPostToSocial()` (which takes 40s) but still no logs
- The `ad_impressions` table may be missing the `prompt_used` column — auto-migration added but unverified
- The `logImpressions()` function has per-campaign try/catch with ✅/❌ logging but no output appears

### Files:
- `src/app/api/generate-director-movie/route.ts` — POST handler, line ~310 (impression logging)
- `src/lib/ad-campaigns.ts` — `logImpressions()` function, line ~155
- `src/app/admin/AdminContext.tsx` — client stitch call with FormData, line ~255

### How to verify:
1. Generate a video from any channel
2. Check Vercel logs for `[generate-director-movie] IMPRESSIONS:`
3. If no log appears, the code section is being skipped entirely
4. Check if the function hits the `return` before reaching the impression code

---

## PRIORITY 2: Sponsor Thank-You Clip (Glitchy Text)

A "Thanks to our sponsors: BUDJU" clip IS being generated and stitched as Scene 9/10. But:

- Grok's text-to-video produces glitchy/unreadable text
- Image-to-video also produces glitchy results
- Sharp SVG text rendering fails on Vercel (no fontconfig)
- FFmpeg doesn't work on Vercel Turbopack

### Current approach (partially working):
- `POST /api/admin/sponsor-clip` generates a dark PNG background with Sharp
- Submits to Grok text-to-video with explicit text prompt
- Client polls it like any other scene
- Gets stitched as the last clip

### Recommended fix (from Grok):
- **Cloudinary** — upload stitched video, add text overlay via URL transformation, download back
- Needs: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` env vars
- OR: Accept that AI-generated text is imperfect and focus on getting the clip to at least show the sponsor names visually

### Files:
- `src/app/api/admin/sponsor-clip/route.ts` — generates the sponsor clip
- `src/app/admin/AdminContext.tsx` — submits sponsor clip as Scene N+1, line ~150

---

## PRIORITY 3: Sponsor Product Images in Video Clips

Sponsors uploaded logo + product images via MasterHQ. These are stored in:
- `ad_campaigns` table: `logo_url`, `product_image_url`, `product_images` JSONB
- `sponsors` table: `logo_url`, `product_images` JSONB
- Blob store: `sponsors/{slug}/logo.jpeg`, `sponsors/{slug}/image-{n}.jpeg`

But the generated video clips don't show the actual sponsor images/logos.

### Current state:
- `image_url` parameter is passed to Grok video API but it makes the image the FIRST FRAME (animation), not a reference
- Text prompt describes the product but Grok renders generic objects, not the actual logo

### Grok's recommendation:
- Use **multi-reference images** (up to 7) with Grok Imagine's reference-to-video capability
- Step 1: Generate a scene IMAGE with sponsor product using Grok image API + references
- Step 2: Use that generated image as `image_url` for video clip generation
- Reference images guide style/objects throughout without forcing as first frame

### Files:
- `src/lib/xai.ts` — `submitVideoJob()` accepts optional `imageUrl` parameter
- `src/lib/content/director-movies.ts` — scene submission loop, line ~1294
- `src/lib/ad-campaigns.ts` — `buildVisualPlacementPrompt()` includes logo/image URLs in text

---

## PRIORITY 4: Wallet System Phases 4-6

### Phase 4: Full Wallet Management Dashboard
- Table with every persona's balances (SOL, BUDJU, GLITCH, USDC), NFTs, trade history
- Per-wallet actions: send, receive, transfer, add funds, drain, view private keys
- View keys requires fresh Phantom re-signature, auto-hides after 10 seconds
- Bulk actions: distribute to all, drain all, sync balances, export keys

### Phase 5: Distribution Monitoring + Admin Memo System
- Timeline view tracking all distributions over days/weeks
- Admin memos: send trading directives to personas (buy/sell/hold/strategy)
- Memos overlay on persona's base trading personality, not hard override
- Broadcast presets: "Everyone Buy BUDJU", "Hold All", etc.

### Phase 6: Scale Trading Bot to All 103 Personas

### Current state (Phases 1-3 COMPLETE):
- 100 persona wallets across 16 distributor groups
- QR code Phantom wallet auth on trading page + activity page
- Time-randomised distribution system with cron every 10 min
- Admin + Treasury wallet balance panel
- Distribution job tracking with progress bar

### Files:
- `src/lib/trading/budju.ts` — wallet generation, distribution engine
- `src/app/admin/trading/page.tsx` — QR auth + wallet balance panel
- `src/app/admin/trading/BudjuTradingView.tsx` — Distribute tab
- `docs/persona-wallets-upgrade.md` — full spec

---

## KNOWN ISSUES / GOTCHAS

1. **safeMigrate caches labels** — if you update a migration, use a NEW label name or bump MIGRATION_VERSION
2. **Grok video API CANNOT render readable text** — use Cloudinary or accept imperfect results
3. **Grok image-to-video distorts text cards** — use text-to-video instead (still imperfect)
4. **FormData entries need .toString()** in Next.js App Router POST handlers
5. **Sponsor images on sponsors table must be synced to ad_campaigns table** — they're separate
6. **logImpressions() must run BEFORE spreadPostToSocial()** — spread takes 40s and can timeout
7. **Sharp SVG text rendering fails on Vercel** — no fontconfig installed
8. **FFmpeg doesn't work with Turbopack** — @ffmpeg-installer/ffmpeg build fails
9. **Autopilot needs 2-min cooldown** between videos to avoid Grok 429 rate limits
10. **CHANNEL_DEFAULTS.showTitlePage = false** — Studios must override to true for intro/outro

## DO NOT
- Do NOT make multiple small incremental attempts — research the ENTIRE code path first
- Do NOT use safeMigrate for data fixes — use direct SQL or bump MIGRATION_VERSION
- Do NOT try FFmpeg on Vercel — it doesn't work with Turbopack
- Do NOT put logImpressions after spreadPostToSocial — it will timeout
- Do NOT assume Grok can render text in video — it cannot
