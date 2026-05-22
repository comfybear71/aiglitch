# Frontend Decoupling Audit — aiglitch Monolith → 3-Repo Architecture
## Date: 2026-05-22

---

## ARCHITECTURE TARGET

```
aiglitch-frontend (React UI only)
├── src/components/     ← Pure UI rendering
├── src/pages/          ← UI pages
├── src/lib/api-client  ← HTTP calls to backend
└── public/             ← Assets, service worker

aiglitch-api (Backend + Crons — ALREADY EXISTS)
├── src/app/api/        ← ALL endpoints (crons + business logic)
└── src/lib/            ← ALL business logic

aiglitch-admin (Admin Dashboard — NEW)
├── src/components/     ← Admin UI components
├── src/pages/          ← Admin pages
└── src/lib/api-client  ← HTTP calls to backend
```

---

## AUDIT RESULTS

### TIER 1: STAYS IN aiglitch-frontend (UI Rendering Only)

| File | Reason | Status |
|------|--------|--------|
| `src/components/Feed.tsx` | Pure feed rendering. **BUT:** Check for in-memory caches, business logic calls | ⚠️ REVIEW NEEDED |
| `src/components/PostCard.tsx` | Post rendering, UI interactions | ✅ PURE UI |
| `src/components/Header.tsx` | Navigation header | ✅ PURE UI |
| `src/components/BottomNav.tsx` | Navigation menu | ✅ PURE UI |
| `src/components/CommentsPanel.tsx` | Comment thread rendering | ✅ PURE UI |
| `src/components/PopupAd.tsx` | Ad display | ✅ PURE UI |
| `src/components/JoinPopup.tsx` | Join/login popup | ✅ PURE UI |
| `src/components/NFTTradingCard.tsx` | NFT card display | ✅ PURE UI |
| `src/components/CommunityEvents.tsx` | Events list rendering | ✅ PURE UI |
| `src/components/QRSign.tsx` | QR code UI | ✅ PURE UI |
| `src/components/PromptViewer.tsx` | Prompt display/editor | ✅ PURE UI |
| `src/components/TokenIcon.tsx` | Token icon display | ✅ PURE UI |
| `src/components/Footer.tsx` | Footer | ✅ PURE UI |
| `src/components/ui/*` | Button, Modal, Badge, Spinner | ✅ PURE UI |
| `src/components/ClientProviders.tsx` | React context providers | ✅ STAYS |
| `src/components/SolanaProvider.tsx` | Solana wallet provider | ✅ STAYS |
| `src/components/ServiceWorkerRegistration.tsx` | Service worker init | ✅ STAYS |
| `public/sw.js` | Service worker (caching) | ✅ STAYS |
| `src/lib/wallet-display.ts` | Wallet formatting/display | ✅ PURE UI HELPER |
| `src/lib/types.ts` | Shared TypeScript types | ✅ STAYS (or duplicate for frontend) |
| `src/lib/voice-config.ts` | Voice transcription frontend config | ✅ STAYS (frontend-specific) |
| `src/lib/api-error.ts` | Error handling utilities | ✅ STAYS (can be frontend-specific) |

---

### TIER 2: MOVES TO aiglitch-api (Business Logic — CRONS + ENDPOINTS)

| Directory | Files | Reason | Migration Status |
|-----------|-------|--------|------------------|
| `src/lib/ai/` | All | AI service layer, circuit breaker, costs | **MOVE TO API** |
| `src/lib/content/` | All | Content generation, director movies, feedback loop | **MOVE TO API** |
| `src/lib/media/` | All | Image/video generation, MP4 concat, free-gen | **MOVE TO API** |
| `src/lib/marketing/` | All | Social distribution, content adaptation, platforms | **MOVE TO API** |
| `src/lib/trading/` | All | BUDJU trading, persona trading personalities | **MOVE TO API** |
| `src/lib/repositories/` | All | Data access layer (personas, posts, interactions) | **MOVE TO API** |
| `src/lib/ad-campaigns.ts` | — | Sponsor placement injection logic | **MOVE TO API** |
| `src/lib/bestie-tools.ts` | — | AI agent tools for chatbot | **MOVE TO API** |
| `src/lib/chaos-drops.ts` | — | Chaos content generation | **MOVE TO API** |
| `src/lib/marketplace.ts` | — | Marketplace product definitions + logic | **MOVE TO API** |
| `src/lib/nft-mint.ts` | — | NFT minting logic | **MOVE TO API** |
| `src/lib/telegram.ts` | — | Telegram bot integration | **MOVE TO API** |
| `src/lib/personas.ts` | — | 96 persona definitions (seed data) | **COPY TO API** (both repos) |
| `src/lib/seed.ts` | — | Database seeding | **MOVE TO API** |
| `src/lib/solana-config.ts` | — | Solana network config | **MOVE TO API** |
| `src/lib/sponsor-packages.ts` | — | Sponsor pricing tiers | **MOVE TO API** |
| `src/lib/tokens.ts` | — | Token definitions | **STAYS OR COPY** (used by frontend + API) |
| `src/lib/news-fetcher.ts` | — | NewsAPI integration | **MOVE TO API** |
| `src/lib/cron.ts` | — | Cron handler utilities | **MOVE TO API** |
| `src/lib/cron-auth.ts` | — | Cron authentication | **MOVE TO API** |
| `src/lib/throttle.ts` | — | Cron throttling | **MOVE TO API** |
| `src/lib/db/schema.ts` | — | **CANONICAL** database schema | **STAYS IN aiglitch** (read-only copy in API) |
| `src/lib/db.ts` | — | Raw SQL connection | **MOVE TO API** (raw SQL not needed in frontend) |
| `src/lib/cache.ts` | — | Redis caching | **MOVE TO API** (backend-only after decoupling) |
| `src/lib/monitoring.ts` | — | System monitoring | **MOVE TO API** |
| `src/lib/rate-limit.ts` | — | Rate limiting | **MOVE TO API** |

---

### TIER 3: MOVES TO aiglitch-admin (Admin-Only Code)

| File | Reason | Status |
|------|--------|--------|
| `src/lib/admin-auth.ts` | Admin authentication (password + wallet) | **MOVE TO ADMIN** |
| `src/lib/prompt-overrides.ts` | Admin prompt customization | **MOVE TO ADMIN** |
| `src/app/admin/*` | All admin pages | **MOVE TO ADMIN** |
| `src/app/api/admin/*` | All admin endpoints | **MOVE TO API** (backend handles admin routes) |

---

### TIER 4: STAYS IN aiglitch (Database + Schema ONLY)

| File | Reason |
|------|--------|
| `src/lib/db/schema.ts` | **Canonical source of truth.** Schema ownership never moves. API repo gets read-only copy. |
| `vercel.json` | Frontend deployment config (no crons anymore) |
| `next.config.ts` | Frontend Next.js config, feed rewrite rule |

---

## CRITICAL DETAILS

### Feed.tsx — REVIEW REQUIRED ⚠️
**Current:** Rendering + in-memory CACHE_TTL = 0
**Risk:** May have business logic calls embedded
**Action:** Audit for:
- AI model calls → move to API
- Content filtering logic → move to API
- Persona logic → move to API
**Keep:** Pure rendering, useEffect hooks calling `/api/feed`

### Service Worker (public/sw.js) — STAYS
**Reason:** Caches feed responses on frontend
**After decoupling:** Still caches API responses, no business logic change needed

### Database Schema (src/lib/db/schema.ts) — CANONICAL
**Stays in:** aiglitch (this repo)
**API gets:** Read-only copy (import for TypeScript types only)
**Never moves:** This is the schema source of truth

### OAuth Callbacks — MOVE TO API (Phase 2)
Currently in `src/app/api/auth/*`:
- `/api/auth/google/callback`
- `/api/auth/github/callback`
- `/api/auth/twitter/callback`
- etc.

**Action:** Port to aiglitch-api, update provider callback URLs

---

## MIGRATION PHASES

### Phase 1: ✅ COMPLETE (Today)
- [x] Move 22 crons to aiglitch-api
- [x] Disable legacy cron entries in aiglitch/vercel.json
- [x] Verify API crons running

### Phase 2: Frontend Decoupling (Next Week)
- [ ] Copy business logic libs to aiglitch-api (ai/, content/, media/, marketing/, trading/, repositories/)
- [ ] Create aiglitch-api endpoints that use those libs
- [ ] Update frontend to call API instead of local libs
- [ ] Delete business logic from aiglitch (keep UI only)

### Phase 3: Admin Decoupling (2+ Weeks)
- [ ] Create aiglitch-admin repo (React, same pattern as frontend)
- [ ] Copy admin pages to aiglitch-admin
- [ ] Move admin endpoints to aiglitch-api
- [ ] Wire aiglitch-admin to call backend API
- [ ] Delete /admin pages from aiglitch

### Phase 4: Final Cleanup (3+ Weeks)
- [ ] Delete legacy handler files from aiglitch (already disabled)
- [ ] Audit for any remaining business logic in aiglitch
- [ ] Document final 3-repo architecture

---

## SUMMARY TABLE

| Repo | Purpose | Key Files |
|------|---------|-----------|
| **aiglitch** | Frontend UI only | src/components/*, src/pages/, public/sw.js, src/lib/db/schema.ts (canonical) |
| **aiglitch-api** | Backend + crons + business logic | src/app/api/*, src/lib/* (all business logic copied here) |
| **aiglitch-admin** | Admin dashboard (NEW) | src/components/admin/*, src/pages/admin/*, calls aiglitch-api |

---

## RISK MITIGATION

- **Schema ownership:** Stays in aiglitch, API imports read-only
- **Type safety:** Keep shared types in both repos (or monorepo types package)
- **Data consistency:** All writes go through aiglitch-api endpoints
- **Rollback:** If Phase 2 breaks, revert frontend to call local libs until API is fixed

---

## NEXT STEPS FOR BACKEND CLAUDE

Once this audit is approved:
1. Start porting business logic libs to aiglitch-api
2. Build endpoints that use those libs
3. Coordinate with frontend Claude on API contract (request/response shapes)
4. Test each endpoint before frontend switches over
