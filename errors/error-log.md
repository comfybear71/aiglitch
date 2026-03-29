# AIGlitch Error Log

A running record of bugs, incidents, and fixes for the AIGlitch platform.
New incidents are appended at the bottom with the next sequential number.

---

## #1 — Wallet Login Session Merge: Data Loss

**Date:** March 7, 2026
**Status:** Resolved
**Affected:** Users logging in via Phantom wallet (`wallet_login` flow)
**Impact:** NFTs, marketplace purchases, likes, bookmarks, and subscriptions lost after wallet login
**Root Cause:** Chain of 4 bugs in session merge logic in `src/app/api/auth/human/route.ts`

### Bug 1.1: Duplicate Session ID — 500 Crash

**Symptom:** `wallet_login` returned HTTP 500
**Cause:** Code tried to `UPDATE human_users SET session_id = X` without first removing the browser's stub user row, violating `UNIQUE(session_id)`.
**Fix:** Delete the browser's stub row before updating:
```sql
DELETE FROM human_users WHERE session_id = ${browserSessionId} AND id != ${walletUser.id};
UPDATE human_users SET session_id = ${browserSessionId} WHERE id = ${walletUser.id};
```

### Bug 1.2: Data Migrated in Wrong Direction

**Symptom:** Login succeeded but all data disappeared
**Cause:** Migration updated rows FROM the browser's session TO the wallet account's old session — the opposite of what was needed.
**Fix:**
```sql
-- WRONG: UPDATE ... SET session_id = ${oldSid} WHERE session_id = ${session_id}
-- RIGHT: UPDATE ... SET session_id = ${session_id} WHERE session_id = ${oldSid}
```

### Bug 1.3: Orphan Recovery Only Scanned One Table

**Symptom:** Profile reload recovered some data but missed NFTs and purchases
**Cause:** Auto-recovery only scanned `human_likes` for orphaned session_ids. Users with NFTs but no likes were missed.
**Fix:** Expanded orphan detection to scan `human_likes`, `marketplace_purchases`, `glitch_coins`, and `minted_nfts` via UNION query.

### Bug 1.4: Unique Constraints Killed Bulk Migrations

**Symptom:** Recovery found orphaned data but only partially restored it (3 of 9 NFTs)
**Cause:** Tables like `marketplace_purchases` have `UNIQUE(session_id, product_id)`. A bulk UPDATE fails **entirely** if even one row conflicts — Postgres rolls back the whole statement. `try/catch` swallowed the error silently.
**Fix:** Exclude conflicting rows with `NOT IN` subqueries, then clean up unmigrable orphans:
```sql
UPDATE marketplace_purchases SET session_id = ${new}
  WHERE session_id = ${old}
  AND product_id NOT IN (
    SELECT product_id FROM marketplace_purchases WHERE session_id = ${new}
  );
DELETE FROM marketplace_purchases WHERE session_id = ${old};
```

### Tables with Unique Constraint Risk

| Table | Unique Constraint |
|---|---|
| `human_likes` | `UNIQUE(post_id, session_id)` |
| `human_bookmarks` | `UNIQUE(post_id, session_id)` |
| `human_subscriptions` | `UNIQUE(persona_id, session_id)` |
| `marketplace_purchases` | `UNIQUE(session_id, product_id)` |

### Lessons Learned

- When merging sessions, always migrate data **FROM old TO new** (direction matters)
- Before `UPDATE ... SET session_id`, delete or handle the stub user row first
- When bulk-updating session_ids on tables with unique constraints, exclude conflicting rows
- Orphan recovery should scan ALL data tables, not just one
- Test wallet_login flow end-to-end after any changes to auth/session logic
- Log migration counts (rows affected) to verify data actually moved

### Key Files

- `src/app/api/auth/human/route.ts` — Auth route (profile, wallet_login, session merge, orphan recovery)
- `src/lib/db.ts` — Table schemas and unique constraints

### Timeline

1. **06:00** — User reported NFTs missing after wallet login
2. **06:10** — Bug 1.1 fixed (duplicate session_id crash)
3. **06:15** — Bug 1.2 fixed (wrong migration direction)
4. **06:25** — User confirmed login works, only 3 of 9 NFTs restored
5. **06:30** — Bug 1.3 fixed (orphan recovery expanded to all tables)
6. **06:35** — User confirmed 3 NFTs back, 6 still missing
7. **06:44** — Bug 1.4 fixed (unique constraint conflict handling)
8. **06:45** — User confirmed all data fully recovered

---

## #2 — Vercel Git Repository Connection Lost After Project Recreation

**Date:** March 12, 2026
**Status:** Resolved
**Affected:** Vercel production deployments — aiglitch.app
**Impact:** Vercel could not find the `aiglitch` repo, blocking all deployments

### Symptom

After recreating the Vercel project, the Git Repository connection was missing. Attempting to connect showed:
> "The repository 'aiglitch' couldn't be found in your linked GitHub account."

GitHub permissions were correct (Vercel app set to "All repositories"), login connection was active, and the repo existed at `comfybear71/aiglitch`.

### What Didn't Work

- Disconnecting/reconnecting GitHub login connection in Vercel
- Searching by full path `comfybear71/aiglitch`
- Checking GitHub App permissions (already set to "All repositories")
- Incognito browser
- Logging out and back into Vercel

### Fix

1. Go to **github.com/settings/installations**
2. Click **Configure** next to Vercel
3. Scroll to bottom → **Uninstall "Vercel"** entirely
4. Go back to Vercel → project → Settings → Git → Connect Git Repository
5. Vercel prompts to **reinstall** the GitHub App from scratch
6. Grant access to all repos (or select `aiglitch` specifically)
7. Repo now appears — connect it
8. Set production branch to `claude/continue-aigitch-dev-Uq92T` under Settings → Environments

### Root Cause

Vercel's cached GitHub App token became stale after the project was deleted and recreated. The only reliable fix was fully uninstalling and reinstalling the Vercel GitHub App to force a fresh handshake.

### Lessons Learned

- When recreating a Vercel project, expect the Git connection to break
- Reconnecting the login connection alone is NOT enough — the GitHub App itself needs reinstalling
- Always check Settings → Environments (not Settings → Git) to set the production branch in newer Vercel UI

### Key URLs

- GitHub App settings: `github.com/settings/installations`
- Vercel environments: `vercel.com/<team>/<project>/settings/environments`

---

## #3 — Video Posts Losing media_url Due to DB Replication Race Condition

**Date:** March 19, 2026
**Status:** Resolved
**Affected:** All video posts created via director movies, admin animate-persona, generate-ads, generate-persona-content
**Impact:** Videos appeared on X/Twitter but showed as text-only (broken) posts in AIG!itch channel feeds — no video player, just a music note icon fallback

### Symptom

User created a music video via the frontend for AiTunes channel. The video posted successfully to X (visible and playable). However, on the AIG!itch website, the same post appeared as text-only with no video. A second video created the same way worked fine.

### Root Cause: Neon Postgres Read-After-Write Replication Lag

Classic database read-after-write consistency problem:

1. Post is INSERT'd into `posts` table with `media_url = "https://blob.vercel-storage.com/..."` ✅
2. `spreadPostToSocial()` is called immediately after the INSERT
3. Inside `spreadPostToSocial()`, a `SELECT content, media_url, media_type FROM posts WHERE id = ?` re-reads the post
4. **Neon Postgres serverless has replication lag** — the SELECT returns `media_url = NULL` because the write hasn't replicated yet
5. The function uses a fallback image and posts to X successfully ✅
6. But the database `posts.media_url` remains NULL — the post is permanently broken
7. The channel feed shows a text-only post with no video player

**Why it was intermittent:** Replication lag is timing-dependent. Sometimes the replica catches up before the SELECT, sometimes it doesn't. Pure luck determined which videos broke.

### The Fix (3-Part)

#### Fix 3.1: Pass Known Media URL Directly (Eliminate the Re-Read)

Added optional `knownMedia` parameter to `spreadPostToSocial()`:

```typescript
export async function spreadPostToSocial(
  postId: string,
  personaId: string,
  personaName: string,
  personaEmoji: string,
  knownMedia?: { url: string; type: string },  // NEW — avoids DB re-read
)
```

If `knownMedia` is provided and the DB returns NULL, the function:
- Uses the known media URL instead of fallback
- **Auto-repairs the DB record**: `UPDATE posts SET media_url = ?, media_type = ? WHERE id = ? AND media_url IS NULL`
- Logs the incident for monitoring

#### Fix 3.2: Updated All Callers

Every caller that has the media URL at call time now passes it:

| Caller | File | Media Passed |
|--------|------|-------------|
| Director movies (cron) | `src/lib/content/director-movies.ts:895` | `finalVideoUrl`, `"video"` |
| Director movies (admin) | `src/app/api/generate-director-movie/route.ts:481` | `blob.url`, `"video"` |
| Animate persona | `src/app/api/admin/animate-persona/route.ts:303` | `blob.url`, `"video"` |
| Generate ads (studio) | `src/app/api/generate-ads/route.ts:308` | `videoUrl`, `"video/mp4"` |
| Persona content | `src/app/api/generate-persona-content/route.ts:352` | `blob.url`, `"video"` |

Callers without media (text-only posts, hatchery announcements) continue without `knownMedia` — no change needed.

#### Fix 3.3: Defensive Channel Feed Filter

Added a filter to ALL channel feed queries (9 query branches) in `/api/channels/feed`:

```sql
AND NOT (p.media_type IN ('video', 'video/mp4') AND (p.media_url IS NULL OR p.media_url = ''))
```

This ensures any already-broken posts are hidden from channel feeds. The `requireMedia` queries (music_video genre) also now check `p.media_url != ''` in addition to `IS NOT NULL`.

### Files Modified

| File | Change |
|------|--------|
| `src/lib/marketing/spread-post.ts` | Added `knownMedia` param, auto-repair logic |
| `src/lib/content/director-movies.ts` | Pass `knownMedia` to spread |
| `src/app/api/generate-director-movie/route.ts` | Pass `knownMedia` to spread |
| `src/app/api/admin/animate-persona/route.ts` | Pass `knownMedia` to spread |
| `src/app/api/generate-ads/route.ts` | Pass `knownMedia` to spread |
| `src/app/api/generate-persona-content/route.ts` | Pass `knownMedia` to spread |
| `src/app/api/channels/feed/route.ts` | Added broken video filter to all 9 query branches |

### Lessons Learned

- **Never re-read from DB immediately after INSERT on Neon Postgres** — serverless Postgres has replication lag between write and read replicas. Always pass known values forward.
- **Fallback mechanisms can mask root causes** — the fallback media system in `spreadPostToSocial()` made posts succeed on X while the DB record stayed broken. The symptom was confusing because "it worked on X but not on our site."
- **Intermittent bugs with identical inputs = timing/race condition** — when two identical operations produce different results, suspect async timing issues.
- **Defensive queries matter** — even with the root cause fixed, the channel feed filter prevents any future broken posts from being visible to users.

### How to Detect Future Occurrences

The fix adds logging when the DB returns NULL but `knownMedia` was provided:
```
[spread-post] DB returned null media_url for {postId}, using known media: {url}...
```

If this log appears, it means replication lag occurred but was auto-repaired. Monitor Vercel logs for this pattern.

### Manual Repair for Existing Broken Posts

To find and optionally delete broken video posts:
```sql
-- Find broken video posts (media_type says video but no URL)
SELECT id, content, media_type, media_url, created_at
FROM posts
WHERE media_type IN ('video', 'video/mp4')
  AND (media_url IS NULL OR media_url = '')
ORDER BY created_at DESC;

-- To remove them:
-- DELETE FROM posts WHERE id IN ('...');
```

---

## #4 — Voice Transcription 403 Error (Wrong API + Wrong Provider)

**Date:** March 21-22, 2026
**Status:** Resolved
**Affected:** Voice chat in G!itch Bestie mobile app — all voice messages failed to transcribe
**Impact:** Users could not use voice chat at all — every voice message returned a 403 error

### Symptom

Mobile app voice chat showed:
```
Voice transcription failed: xAI transcription failed: Transcription API 403:
{"code":"The caller does not have permission to execute the specified operation",
"error":"Team is not authorized to perform this action."} [503 / api/transcribe]
```

### Root Cause: Two Separate Issues

#### Issue 4.1: xAI Account Doesn't Have Transcription Permissions

The original `POST /api/transcribe` endpoint only used xAI (`api.x.ai/v1/audio/transcriptions`) for speech-to-text. However, the xAI account/team is **not authorized** for the audio transcription API — it returns HTTP 403. This is an account-level permission issue on xAI's side, not a code bug.

#### Issue 4.2: First "Fix" Tried to Use Claude API for Audio (Impossible)

The first attempted fix replaced xAI with Claude as the primary transcription service. The code sent audio as a `document` content block to Claude's Messages API:

```typescript
// BROKEN — Claude only accepts "application/pdf" for document blocks
content: [{
  type: "document",
  source: {
    type: "base64",
    media_type: "audio/wav",  // ← TypeScript correctly rejects this
    data: audio_base64,
  },
}]
```

**Claude's Messages API does NOT support audio media types.** The only accepted `media_type` for `document` blocks is `"application/pdf"`. TypeScript caught this at build time:
```
Type '"audio/wav"' is not assignable to type '"application/pdf"'.
```

The Vercel build failed, so the old (broken xAI) code continued running in production. The "fix" never deployed.

#### Issue 4.3: Push to Wrong Branch

The fix was pushed to `claude/resume-previous-session-lw43V` but Vercel was deploying from `master`. The code never reached production even if it had been correct.

### The Fix

Completely rewrote `/api/transcribe` to use **Groq Whisper** (`whisper-large-v3-turbo`) as the primary transcription engine:

1. **Primary: Groq Whisper** — OpenAI-compatible API at `api.groq.com/openai/v1/audio/transcriptions`, uses `whisper-large-v3-turbo` model. Fast, accurate, cheap.
2. **Fallback: xAI** — kept as fallback in case Groq is down (will still 403 until xAI permissions are fixed, but won't block the primary path)
3. **Removed Claude audio attempt entirely** — Claude's API doesn't support audio transcription
4. **Removed `@anthropic-ai/sdk` import** from the transcribe route (no longer needed)

### Files Modified

| File | Change |
|------|--------|
| `src/app/api/transcribe/route.ts` | Complete rewrite: Groq Whisper primary, xAI fallback, removed Claude |

### Environment Variables Required

| Variable | Service | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com/keys) | Whisper transcription (primary) |
| `XAI_API_KEY` | xAI | Fallback transcription (currently 403) |

**IMPORTANT:** `GROQ_API_KEY` must be added to Vercel environment variables for the fix to work in production.

### Lessons Learned

1. **Claude's Messages API does NOT support audio.** Don't try to send audio files as `document` content blocks — the only accepted media_type for documents is `"application/pdf"`. For audio transcription, use a dedicated speech-to-text service (Groq Whisper, OpenAI Whisper, Deepgram, etc.)
2. **Always verify API capabilities before coding.** Check the SDK types / API docs to confirm the provider actually supports the media type you're sending. TypeScript types are your friend — if it won't compile, the API won't accept it either.
3. **Check which branch Vercel deploys from.** Pushing to a feature branch doesn't deploy to production unless Vercel's production branch is set to that branch. Always verify the deploy target.
4. **Test builds before pushing.** Run `npx tsc --noEmit` locally. The previous "fix" would have been caught immediately if the build was tested.
5. **xAI audio transcription requires specific account permissions.** Not all xAI accounts/teams have access to `/v1/audio/transcriptions`. Don't assume API endpoints are available just because they exist in docs.
6. **Use purpose-built services for specialized tasks.** Groq Whisper is purpose-built for transcription — faster, cheaper, and more reliable than trying to repurpose a general-purpose LLM API for audio processing.

### Service Comparison for Voice Transcription

| Service | Model | Speed | Cost | Notes |
|---------|-------|-------|------|-------|
| **Groq Whisper** (chosen) | whisper-large-v3-turbo | ~0.5s | Very cheap | OpenAI-compatible API, fastest Whisper host |
| OpenAI Whisper | whisper-1 | ~2-3s | $0.006/min | Reliable but slower |
| Claude | N/A | N/A | N/A | **Does NOT support audio** |
| xAI | grok-2-vision | N/A | N/A | 403 — requires special account permissions |
| Deepgram | nova-2 | ~0.3s | $0.0043/min | Very fast, WebSocket support |

---

## #5 — NFT Purchases Invisible After Wallet Connection (Cross-Session Orphaning)

**Date:** March 23-24, 2026
**Status:** Resolved
**Affected:** Users who buy NFTs in one browser session and connect their wallet in a different session
**Impact:** ~20 NFT purchases completely invisible on profile — 0 in inventory, 0 in stats

### Symptom

User bought ~20 NFTs about a week prior via Phantom wallet signing. Later connected wallet via Phantom's in-app browser. Profile showed: 1 like, 0 comments, 0 bookmarks, 0 subscriptions, 0 NFTs. None of the NFT purchases appeared in inventory.

### Root Cause: Cross-Session Orphaning

1. User browsed AIG!itch in **Safari** on iPad → got **session A** (no wallet linked)
2. User purchased ~20 NFTs via Phantom wallet → purchases recorded under **session A**
3. `blockchain_transactions.from_address` = `EWiF6ZQQ...` (the wallet) but `marketplace_purchases.session_id` = session A
4. User later opened AIG!itch in **Phantom's in-app browser** → got **session B** (different cookies)
5. `wallet_login` fired → no existing wallet user found → created new wallet account under **session B**
6. Session A's purchases were now **orphaned** — no wallet link, so wallet-aware queries couldn't find them

The existing session merge only migrated data from the wallet account's *previous* session_id to the *new* one. It could NOT discover arbitrary anonymous sessions that happened to buy NFTs with the same wallet address.

### The Fix (2-Part)

#### Fix 5.1: Wallet-Based Orphan Recovery in `wallet_login`

Added automatic recovery after every wallet login:

1. Query `blockchain_transactions WHERE from_address = ${wallet_address}` to find all NFT purchases
2. JOIN to `minted_nfts ON mint_tx_hash = tx_hash` to find the orphaned `owner_id` (session_id)
3. Filter out sessions that already match the current session
4. Migrate ALL data from orphaned sessions → current session (10 tables: likes, comments, bookmarks, subscriptions, minted_nfts, marketplace_purchases, glitch_coins, solana_wallets, token_balances, community_event_votes)
5. Link orphaned user rows to the wallet for future discovery

Non-fatal: if no orphans found or recovery fails, login proceeds normally.

#### Fix 5.2: Admin Recovery Endpoint

New endpoint: `/api/admin/users?action=recover_orphans&wallet=X`

- `dry_run=true` — preview orphaned sessions and their data counts without migrating
- Without `dry_run` — executes the migration and returns results

### Files Modified

| File | Change |
|------|--------|
| `src/app/api/auth/human/route.ts` | Added wallet-based orphan recovery after session merge in `wallet_login` |
| `src/app/api/admin/users/route.ts` | Added `recover_orphans` admin action with dry-run support |

### Also Fixed in This Session

- **Profile stats** cleaned up: removed debug `_debug` field from API response, simplified error handling
- **Stats already wallet-aware**: Profile stats already aggregated across all wallet-linked sessions (added in previous session), but this only helps when sessions have the wallet linked

### Lessons Learned

1. **On-chain transaction data is the ultimate source of truth** for wallet ownership — `blockchain_transactions.from_address` stores the wallet that signed the purchase, regardless of which browser session was used
2. **Cross-browser wallet connection is a common flow** — users browse in Safari/Chrome, then connect via Phantom's in-app browser. These have completely different cookies/sessions.
3. **Session-based data models need wallet-based recovery** — session_id is ephemeral, but wallet addresses are persistent. Recovery must trace from wallet → on-chain tx → database records.
4. **Wallet-aware queries are necessary but not sufficient** — even if queries aggregate across all wallet-linked sessions, orphaned sessions that have no wallet link are still invisible. Active migration is required.

### How to Detect Future Occurrences

The fix logs on every wallet login:
```
[wallet_login] Orphan recovery for {wallet}: found N orphaned sessions, recovered [...]
```

Monitor Vercel logs for this. If `N > 0`, orphans were successfully recovered.

### Manual Recovery

To recover orphans for a specific wallet:
```
GET /api/admin/users?action=recover_orphans&wallet={ADDRESS}&dry_run=true
```

Review the response, then remove `dry_run` to execute:
```
GET /api/admin/users?action=recover_orphans&wallet={ADDRESS}
```

---

## #5 — Instagram Posting: "Invalid Aspect Ratio" / "Image Ratio 0"

**Date:** March 25, 2026
**Status:** Resolved
**Affected:** All Instagram posting (test posts, cron marketing, admin spread, bestie shares)
**Impact:** Instagram posts failed with "The aspect ratio is not supported... image ratio 0"

### Symptoms

1. Instagram showed "Active" and `@sfrench71` account connected correctly
2. Permission error fixed (added `instagram_content_publish` scope to access token)
3. All posts failed with: `IG container failed: 400 {"error":{"message":"The aspect ratio is not supported","type":"OAuthException","code":36003,"error_subcode":2207009}}`
4. Facebook posting worked fine with identical Vercel Blob URLs (706+ posts)

### Root Cause (TWO issues)

**Issue 1: Instagram can't fetch from Vercel Blob storage**
Instagram's Graph API container creation requires a publicly accessible `image_url`. When given a Vercel Blob URL (`https://xxx.public.blob.vercel-storage.com/...`), Instagram's servers return 0 bytes, causing "image ratio 0". Facebook's `/photos` API handles the same URLs fine — this is Instagram-specific.

**Issue 2: Random image dimensions**
Even if Instagram could fetch the images, many DB images have arbitrary dimensions outside Instagram's supported aspect ratio range (4:5 to 1.91:1).

### Fix

**1. Image proxy route** (`src/app/api/image-proxy/route.ts`):
- Fetches the image from Vercel Blob (or any external URL)
- Resizes to 1080x1080 square JPEG using `sharp` (crop-to-fill, centered)
- Serves from `aiglitch.app` domain with proper headers
- Instagram fetches from `aiglitch.app/api/image-proxy?url=<encoded-blob-url>` instead

**2. Video proxy route** (`src/app/api/video-proxy/route.ts`):
- Streams video through `aiglitch.app` domain (no processing)
- Same domain-proxy fix for Instagram Reels

**3. Instagram poster updated** (`src/lib/marketing/platforms.ts:postToInstagram()`):
- All external image URLs proxied through `/api/image-proxy` (line ~645)
- All external video URLs proxied through `/api/video-proxy`
- Condition: `if (!mediaUrl.startsWith(appUrl))` — proxies everything not already on our domain
- POST body used instead of query params for container creation

### Debugging Steps Taken

1. Fixed missing `instagram_content_publish` permission → new error: aspect ratio
2. Added format filtering (exclude WebP/SVG/GIF) → same error
3. Added HEAD request validation → images passed but Instagram still failed
4. Switched from query params to POST body for container creation → same error
5. Added `media_url` to error response → revealed Vercel Blob URLs
6. Tried proxying through our domain → still failed (no resizing)
7. Added sharp resize to 1080x1080 JPEG → **SUCCESS**

### Key Insight

The error "image ratio 0" does NOT mean wrong aspect ratio. It means Instagram **could not determine the image dimensions at all** — because it couldn't fetch the image from Vercel Blob's CDN. The fix required BOTH proxying (domain) AND resizing (format/dimensions).

### Verification

All 6 Instagram posting entry points go through `postToPlatform()` → `postToInstagram()` → proxy:
1. `/api/marketing-post` (cron, every 4h)
2. `/api/admin/spread` (admin manual)
3. `/api/admin/media/spread` (admin media)
4. `shareBestieMediaToSocials()` (auto-share)
5. `/api/admin/mktg?action=test_post` (admin test)
6. `/api/admin/mktg?action=run_cycle` (admin manual)

---

## #6 — TikTok Content Posting Always Failing

**Date:** March 26, 2026
**Status:** Resolved (waiting for TikTok pending upload expiry ~24h)
**Affected:** All TikTok video posting from the marketing dashboard
**Impact:** Every TikTok post attempt failed; 603 failed posts accumulated
**Root Cause:** Chain of 5 interrelated bugs in the TikTok integration

### Bug Chain

**Bug 1: PULL_FROM_URL requires domain verification**
- TikTok's `PULL_FROM_URL` source type requires verifying your domain in the TikTok Developer Portal
- The "Verify domains" section in the dev portal had NOT been completed (visible "Verify" button in screenshot)
- TikTok's servers couldn't fetch videos from `aiglitch.app` URLs
- **Fix:** Switched to `FILE_UPLOAD` — download video binary first, then upload directly to TikTok's servers

**Bug 2: Direct Post endpoint requires audit**
- The Direct Post endpoint (`/v2/post/publish/video/init/`) returned "Please review our integration guidelines"
- TikTok requires passing a "Direct Post" audit for this endpoint, even in sandbox for some operations
- **Fix:** Switched to Inbox endpoint (`/v2/post/publish/inbox/video/init/`) — no audit required, videos go to creator's inbox/drafts

**Bug 3: Double endpoint calls created spam risk**
- Code tried Direct Post first, then fell back to Inbox on failure — creating TWO pending uploads per attempt
- Combined with the PULL_FROM_URL failures, this created a large backlog of pending uploads
- TikTok triggered `spam_risk_too_many_pending_share` error
- **Fix:** Use only ONE endpoint per mode (Inbox for both sandbox and production); no fallback cascade

**Bug 4: Sandbox mode never persisted**
- The accounts SQL query (`SELECT id, platform, account_name...`) did NOT include `extra_config`
- Frontend always received `undefined` for `extra_config`, parsed as `{}`, defaulted `sandbox` to `false`
- Every page refresh showed "LIVE" regardless of what was saved in the DB
- **Fix:** Added `extra_config` to the SELECT query and the `MktPlatformAccount` TypeScript type

**Bug 5: Safari ITP blocked OAuth sandbox cookie**
- The sandbox flag was stored in a `tiktok_sandbox` cookie during OAuth flow
- Safari's Intelligent Tracking Prevention (ITP) blocks cookies on cross-site redirects (tiktok.com → aiglitch.app)
- The callback always read `isSandbox = false` because the cookie was missing
- **Fix:** Encode sandbox flag in the OAuth `state` parameter (e.g., `uuid:sandbox`) which TikTok passes back unchanged

### Resolution

All 5 bugs fixed. TikTok now uses:
- `FILE_UPLOAD` method (binary upload, no domain verification)
- Inbox endpoint (no Direct Post audit)
- Single endpoint per mode (no cascade)
- `extra_config` returned to frontend (sandbox persists)
- Sandbox flag in OAuth state (survives cross-site redirect)

Currently waiting ~24h for TikTok to clear old pending uploads before retesting.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/marketing/platforms.ts` | Rewrote `postToTikTok()`: FILE_UPLOAD + Inbox, download video binary, single endpoint |
| `src/app/api/auth/tiktok/route.ts` | Encode sandbox in state param, remove sandbox cookie |
| `src/app/api/auth/callback/tiktok/route.ts` | Read sandbox from state param, redirect to /admin/marketing |
| `src/app/api/admin/mktg/route.ts` | Added `extra_config` to accounts SELECT query |
| `src/app/admin/marketing/page.tsx` | Toggle switch UI, video-only TikTok card, sandbox persistence |
| `src/app/admin/admin-types.ts` | Added `extra_config` to MktPlatformAccount type |

### Key Env Vars

| Variable | Purpose |
|----------|---------|
| `TIKTOK_CLIENT_KEY` | OAuth client key (production) |
| `TIKTOK_CLIENT_SECRET` | OAuth client secret (production) |
| `TIKTOK_SANDBOX_CLIENT_KEY` | OAuth client key (sandbox) |
| `TIKTOK_SANDBOX_CLIENT_SECRET` | OAuth client secret (sandbox) |
| `TIKTOK_ACCESS_TOKEN` | Direct token override (optional, overrides DB) |

### Lessons Learned

1. **Always verify SQL SELECT includes ALL fields the frontend needs** — missing fields return `undefined` silently
2. **TikTok PULL_FROM_URL needs domain verification** — always use FILE_UPLOAD
3. **TikTok Direct Post needs audit** — use Inbox endpoint until audited
4. **Never try multiple TikTok endpoints in sequence** — each creates a pending upload
5. **Safari ITP blocks cookies on cross-site redirects** — use OAuth state parameter for metadata
6. **TikTok pending uploads expire after ~24h** — don't retry rapidly

---

## #7 — Only AI Fans "Screenplay generation failed"

**Date:** March 29, 2026
**Status:** Resolved
**Affected:** Generate Video button on Only AI Fans channel in admin panel
**Impact:** Every attempt to generate an Only AI Fans video failed with "Screenplay generation failed"

### Root Cause

The generic channel content prompt in `generateDirectorScreenplay()` injected 4 AI persona cast members (which are robots) via `castActors()`. But the Only AI Fans `promptHint` explicitly says:

> "ABSOLUTELY NO: cartoons, anime, animals, memes, robots, text overlays, men, groups. ONE stunning woman per video."

The contradictory instructions (4 robot cast members vs ONE woman, NO robots) caused the AI to fail generating valid JSON, returning `null`.

### Fix

Added a dedicated `isOnlyAiFans` branch in `generateDirectorScreenplay()` (similar to the existing `isDatingChannel` branch) that:
1. Skips `castActors()` — no cast list injected
2. Explicitly asks for ONE woman throughout all clips
3. Character bible requires only one model description
4. No robot/men/group references in the prompt

### Files Modified

| File | Change |
|------|--------|
| `src/lib/content/director-movies.ts` | Added `isOnlyAiFans` prompt branch, skips cast injection |

### Lessons Learned

1. **Channel-specific content rules can conflict with the generic screenplay pipeline** — channels with strict subject requirements (ONE person, NO groups, NO robots) cannot use the standard cast injection
2. **When adding channels with single-subject rules**, follow the Only AI Fans pattern: dedicated prompt branch that skips `castActors()`
3. **Test Generate Video on every channel** — not just AiTunes — to catch prompt conflicts

---

## #8 — Channel Video Prompts Exceeding Grok 4096 Character Limit

**Date:** March 29, 2026
**Status:** Resolved
**Affected:** All channel video generation via Generate Video button
**Impact:** Every clip rejected by Grok with "Prompt length is larger than the maximum allowed length which is 4096"

### Root Cause

The `buildContinuityPrompt()` function built rich prompts for each clip including: full movie bible header, full character bible, director style guide, clip position info, previous clip context, scene video prompt, visual requirements, and continuity rules. For channel clips, this totalled 5000-7000 characters, exceeding Grok's 4096 character limit.

### Fix

Channel clips now use a compact continuity prompt format:
- Character bible truncated to 600 chars max
- Previous clip context truncated to 200 chars
- Visual style truncated to 400 chars
- Single-line continuity rule instead of 11-line block
- No synopsis, no director style guide, no genre template
- Movie prompts (AIG!itch Studios) keep the full format

### Files Modified

| File | Change |
|------|--------|
| `src/lib/content/director-movies.ts` | Compact continuity prompt for channel clips |
| `src/lib/xai.ts` | Added `error` field to `VideoJobResult` to capture actual Grok rejection |

### Lessons Learned

1. **Grok video API has a hard 4096 character prompt limit** — always check prompt length for video generation
2. **Capture actual API error responses** — the original "submit_rejected" fail reason was useless. Storing the actual HTTP error body immediately revealed the 4096 limit.
3. **Channel clips need compact prompts** — movie prompts can be longer because they work with longer timeouts, but channel clips go through the same API

---

## #9 — Channel Videos Using Movie Template (Cast, Directors, Title Cards)

**Date:** March 29, 2026
**Status:** Resolved
**Affected:** All non-Studios channel video generation
**Impact:** Channel videos had movie-style title cards ("AIG!itch Studios presents"), director credits ("Directed by Wes Analog"), cast lists, and were posted by directors instead of The Architect

### Root Cause (Chain of 3 bugs)

**Bug 9.1: `skipBookends` always false**
`skipBookends = skipTitlePage && skipCredits` — but `skipCredits` was hardcoded to `false`, making `skipBookends` ALWAYS false. The channel-specific prompt branches (Only AI Fans, AI Dating, generic channel) were dead code.

**Bug 9.2: DB `show_title_page` overriding channel behavior**
Even after fixing skipBookends, the DB value of `show_title_page` for channels could be `true` (set via channel editor), which made `skipTitlePage = false`, which made `skipBookends = false`, which fell through to the movie template.

**Bug 9.3: `/api/admin/screenplay` not fetching prompt overrides**
The screenplay endpoint used hardcoded constants instead of admin prompt overrides from `/admin/prompts`. Channel-specific content rules were ignored.

### Fix

1. `skipBookends` changed to `skipTitlePage` (removed the always-false `&& skipCredits`)
2. ALL non-Studios channels now force `skipTitlePage = true` and `skipDirector = true` regardless of DB settings. Only `ch-aiglitch-studios` respects DB values.
3. `/api/admin/screenplay` now fetches prompt overrides via `getPrompt()` when `channel_id` is provided, prepending channel rules (promptHint, visual style, branding) to the concept.
4. Channel video stitcher passes `the_architect`/`glitch-000` instead of screenplay director.
5. Cast list removed from channel video log and stitcher.

### Files Modified

| File | Change |
|------|--------|
| `src/lib/content/director-movies.ts` | Force skip bookends/directors for non-Studios channels |
| `src/app/api/admin/screenplay/route.ts` | Fetch admin prompt overrides for channels |
| `src/app/admin/channels/page.tsx` | Hardcode The Architect, remove cast, full channel concept |

### Lessons Learned

1. **Boolean logic matters** — `A && false` is always false. The `skipCredits` variable being hardcoded to false made `skipBookends` dead code.
2. **DB settings can silently override code behavior** — the channel editor's `show_title_page` toggle broke the entire channel prompt system without any visible error.
3. **Non-Studios channels should NEVER use movie templates** — hardcode this, don't rely on DB settings.
4. **Admin prompt overrides must be fetched server-side** — they're stored in a separate table, not in the channel record.
5. **Test the CONTENT of generated videos, not just whether they render** — the videos rendered fine but contained completely wrong content (movies instead of channel content).

---

<!-- APPEND NEW INCIDENTS BELOW THIS LINE -->
<!-- Use format: ## #N — Short Title -->
