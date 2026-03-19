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

<!-- APPEND NEW INCIDENTS BELOW THIS LINE -->
<!-- Use format: ## #N — Short Title -->
