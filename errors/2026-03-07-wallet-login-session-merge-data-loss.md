# Wallet Login Session Merge — Data Loss Incident

**Date:** March 7, 2026
**Status:** Resolved
**Affected:** Users logging in via Phantom wallet (wallet_login flow)
**Impact:** NFTs, marketplace purchases, likes, bookmarks, and subscriptions lost after wallet login

---

## Summary

Users who logged in via Phantom wallet lost their profile data (NFTs, trading cards, likes, coins). The root cause was a chain of 4 bugs in the `wallet_login` session merge logic in `/src/app/api/auth/human/route.ts`.

---

## Bug Chain (in order of discovery)

### Bug 1: Duplicate Session ID — 500 Crash

**Symptom:** `wallet_login` returned HTTP 500
**Cause:** When the browser's `session_id` differed from the wallet account's stored `session_id`, the code tried to `UPDATE human_users SET session_id = X` without first removing the browser's stub user row. This violated the `UNIQUE(session_id)` constraint.

**Fix:** Delete the browser's stub `human_users` row before updating the wallet account's `session_id`:
```sql
DELETE FROM human_users WHERE session_id = ${browserSessionId} AND id != ${walletUser.id};
UPDATE human_users SET session_id = ${browserSessionId} WHERE id = ${walletUser.id};
```

**File:** `src/app/api/auth/human/route.ts` (wallet_login action)

---

### Bug 2: Data Migrated in Wrong Direction

**Symptom:** Login succeeded but all data disappeared
**Cause:** After fixing Bug 1, the data migration updated rows FROM the browser's session TO the wallet account's old session — the exact opposite of what was needed. The wallet account now had the browser's (empty) session_id, but the data still pointed at the old session_id that no longer existed in `human_users`.

**Fix:** Migrate data FROM `oldSid` (wallet account's original session) TO `session_id` (browser's session, now the account's session):
```sql
-- WRONG: UPDATE ... SET session_id = ${oldSid} WHERE session_id = ${session_id}
-- RIGHT: UPDATE ... SET session_id = ${session_id} WHERE session_id = ${oldSid}
```

**File:** `src/app/api/auth/human/route.ts` (wallet_login action)

---

### Bug 3: Orphan Recovery Only Scanned One Table

**Symptom:** Profile reload recovered some data but missed NFTs and purchases
**Cause:** The auto-recovery system (which runs on profile load) only scanned `human_likes` for orphaned `session_id` values. If a user had NFTs and purchases but no likes, the orphaned session was never detected.

**Fix:** Expanded the orphan detection query to scan ALL relevant tables:
```sql
SELECT DISTINCT orphan_sid FROM (
  SELECT session_id FROM human_likes LEFT JOIN human_users ...
  UNION
  SELECT session_id FROM marketplace_purchases LEFT JOIN human_users ...
  UNION
  SELECT session_id FROM glitch_coins LEFT JOIN human_users ...
  UNION
  SELECT owner_id FROM minted_nfts LEFT JOIN human_users ...
) AS orphans
```

**File:** `src/app/api/auth/human/route.ts` (profile action, orphan recovery block)

---

### Bug 4: Unique Constraints Killed Bulk Migrations

**Symptom:** Recovery found orphaned data but only partially restored it (e.g., 3 of 9 NFTs)
**Cause:** Tables like `marketplace_purchases` have `UNIQUE(session_id, product_id)`. A bulk `UPDATE ... SET session_id = X WHERE session_id = Y` fails **entirely** if even ONE row would create a duplicate key. Postgres rolls back the whole statement. The `try/catch` swallowed the error, so zero rows were migrated for that table.

**Fix:** Exclude conflicting rows with `NOT IN` subqueries so non-conflicting rows can still be migrated, then clean up unmigrable orphans:
```sql
UPDATE marketplace_purchases SET session_id = ${new}
  WHERE session_id = ${old}
  AND product_id NOT IN (
    SELECT product_id FROM marketplace_purchases WHERE session_id = ${new}
  );
-- Clean up remaining orphans that couldn't be migrated (duplicates)
DELETE FROM marketplace_purchases WHERE session_id = ${old};
```

Applied to all tables with unique constraints: `human_likes`, `human_bookmarks`, `human_subscriptions`, `marketplace_purchases`.

**File:** `src/app/api/auth/human/route.ts` (both wallet_login merge AND profile orphan recovery)

---

## Affected Tables

| Table | Unique Constraint | Migration Risk |
|---|---|---|
| `human_likes` | `UNIQUE(post_id, session_id)` | High |
| `human_bookmarks` | `UNIQUE(post_id, session_id)` | High |
| `human_subscriptions` | `UNIQUE(persona_id, session_id)` | High |
| `marketplace_purchases` | `UNIQUE(session_id, product_id)` | High |
| `human_comments` | None on session_id alone | Low |
| `minted_nfts` | None on owner_id alone | Low |
| `glitch_coins` | None on session_id alone | Low |
| `solana_wallets` | None on owner_id alone | Low |

---

## Prevention Checklist

- [ ] When merging sessions, always migrate data **FROM old TO new** (direction matters)
- [ ] Before `UPDATE ... SET session_id`, delete or handle the stub user row first
- [ ] When bulk-updating session_ids on tables with unique constraints, exclude conflicting rows
- [ ] Orphan recovery should scan ALL data tables, not just one
- [ ] Test wallet_login flow end-to-end after any changes to auth/session logic
- [ ] Log migration counts (rows affected) to verify data actually moved

---

## Key Files

- `src/app/api/auth/human/route.ts` — Main auth route (profile, wallet_login, session merge, orphan recovery)
- `src/lib/db.ts` — Table schemas and unique constraints

---

## Timeline

1. **06:00** — User reported NFTs missing after wallet login
2. **06:10** — Bug 1 identified (duplicate session_id crash), fix deployed
3. **06:15** — Bug 2 identified (wrong migration direction), fix deployed
4. **06:25** — User confirmed login works but only 3 of 9 NFTs restored
5. **06:30** — Bug 3 identified (orphan recovery only scanning human_likes), fix deployed
6. **06:35** — User confirmed 3 NFTs back but 6 still missing
7. **06:44** — Bug 4 identified (unique constraints killing bulk UPDATE), fix deployed
8. **06:45** — User confirmed all data fully recovered
