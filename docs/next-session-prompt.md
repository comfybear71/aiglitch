# Next Session Prompt — AIG!itch Jupiter Trading + Wallet Features

## Branch: `claude/sponsor-wallet-fix-IHHlZ`

Read CLAUDE.md for full project context.

---

## PRIORITY 1: Jupiter Perps Trading Platform (GLITCH Trading Tab)

The user has a fully-fledged Jupiter trading program already built. The GLITCH Trading tab (currently "Simulated in-app token") needs to become a real trading platform using Jupiter API/SDK for the 100 persona bots.

### What's needed:
- Integrate existing Jupiter trading program into the GLITCH Trading tab
- Each persona already has a Solana wallet with SOL for gas
- Support spot swaps + perpetual futures (Jupiter Perps)
- Position management: open/close/modify per persona
- P&L tracking per persona
- Risk management: stop losses, max position sizes
- Dashboard showing all open positions across all personas
- Trading personality system for perps (aggressive vs conservative)
- SOL/USDC pairs with leverage options

### Current state:
- Jupiter SDK already integrated for BUDJU spot swaps in `src/lib/trading/budju.ts`
- `executeJupiterSwap()` function exists and works
- 100 persona wallets funded with SOL + BUDJU
- Trading personality system exists (`getTradingPersonality()`)
- Memo system for broadcast directives ("Everyone Buy", "Hold All", etc.)

### Files:
- `src/app/admin/trading/GlitchTradingView.tsx` — current simulated trading UI
- `src/lib/trading/budju.ts` — Jupiter swap integration, wallet management
- `src/app/api/admin/budju-trading/route.ts` — trading API actions

---

## PRIORITY 2: Per-Group Distributor Funding

User wants to click on a distributor group and send SOL/BUDJU/USDC/GLITCH to it, then the group auto-distributes evenly to its persona wallets.

### What's needed:
- Click a group card → expand with token input fields (SOL, BUDJU, GLITCH, USDC)
- "Send to Group" button → transfers from treasury to that distributor
- "Distribute to Personas" button → distributor splits evenly to its group members
- Show balance per token per distributor (currently only SOL shown)

### Current state:
- 16 distributor groups with 3-10 personas each
- Group cards show address + persona count + SOL balance
- Distribution system exists but is "all or nothing" — no per-group control
- Per-wallet token controls already built (send to/from treasury per persona)

---

## PRIORITY 3: GLITCH + USDC Balance Tracking Per Wallet

Currently `budju_wallets` table only tracks `sol_balance` and `budju_balance`. Need to add:
- `glitch_balance` column
- `usdc_balance` column
- Sync from chain via `syncWalletBalances()`
- Show in wallet table + expanded detail

---

## COMPLETED THIS SESSION

### Sponsor Integration (ALL WORKING)
- ✅ Impression tracking fixed (schema mismatch: ad_impressions table had wrong columns)
- ✅ Grokify pipeline — Grok Image Edit API edits actual sponsor product images into video scenes
- ✅ Per-campaign controls: frequency slider, grokify scenes count (0-6), mode (logo/images/all)
- ✅ Sponsor thanks in post captions: "🤝 Thanks to our sponsors: BUDJU https://budju.xyz"
- ✅ Sponsor thanks visible on channel player with clickable links to sponsor websites
- ✅ Post titles clickable on channel player → links to /post/{id}
- ✅ Sponsored videos list on campaign cards (collapsible, thumbnails, links)
- ✅ Campaign edit form saves correctly (was using PUT instead of POST — 405 error)
- ✅ Re-activate button for expired campaigns
- ✅ Sponsor image organization in Blob (sponsors/{slug}/ folder structure)
- ✅ Grokified images named properly: sponsors/grokified/{brand}-{channel}-scene{N}.png
- ✅ All sponsor logos/images/URLs synced from sponsors table to ad_campaigns
- ✅ TikTok 6-hour spam cooldown (avoids downloading 30MB videos for nothing)
- ✅ Stall detection fixed (breaks after 3min of no progress, not just sponsor clip)
- ✅ Removed broken sponsor thank-you clip (Grok can't render text in video)

### Wallet System Phases 4-6 (ALL COMPLETE)
- ✅ Phase 4: Dashboard tab with summary bar, search, filter, sort, expandable rows
- ✅ Phase 4: Per-wallet token controls (SOL/BUDJU/USDC/GLITCH → treasury and back)
- ✅ Phase 4: Private key viewer (auto-hides after 10s)
- ✅ Phase 4: Per-wallet trade history
- ✅ Phase 5: Memo system with 6 broadcast presets + custom memos with TTL
- ✅ Phase 6: Memo-aware trading (buy/sell/hold/aggressive/conservative directives)
- ✅ Process Now actually processes immediately (was only processing scheduled transfers)
- ✅ Fund check endpoint showing all tokens across treasury/distributors/personas
- ✅ Cancel distribution action
- ✅ Per-token drain (flush BUDJU/USDC/GLITCH from all wallets, keep SOL)
- ✅ Drain distributors with refuel (sends SOL for fees, then drains SPL tokens)
- ✅ Wallet data refresh without re-login (cache busting)
- ✅ GLITCH + USDC totals in dashboard summary bar
- ✅ 85 out of 100 personas funded with SOL + BUDJU
- ✅ 4 action buttons on single row (Generate, Sync, Drain, Export)

### Key URLs for Admin:
- Fund check: `/api/admin/budju-trading?action=fund_check`
- Cancel distribution: `/api/admin/budju-trading?action=cancel_distribution`
- Drain BUDJU: `/api/admin/budju-trading?action=drain_token&token=BUDJU`
- Drain USDC: `/api/admin/budju-trading?action=drain_token&token=USDC`
- Drain GLITCH: `/api/admin/budju-trading?action=drain_token&token=GLITCH`
- Drain distributors: `/api/admin/budju-trading?action=drain_distributors`
- Refuel + drain: `/api/admin/budju-trading?action=refuel_and_drain_distributors`
- Share grokified: `/api/admin/blob-upload?action=share_grokified`
- Organize sponsors: `/api/admin/blob-upload?action=organize_sponsors`

---

## KNOWN ISSUES

1. **15 personas still unfunded** — distribution completed 192/232, 40 failed (USDC insufficient)
2. **GLITCH + USDC not tracked per wallet** — only totals shown, not per-persona balances
3. **Grokified images sometimes get 400 errors** — Grok Image Edit API rejects some requests, auto-retries with single image
4. **Some videos don't show sponsor thanks** — only videos generated AFTER the caption code deploy have the thanks line
5. **BUDJU holdings uneven** — some personas have 1.1M, others have 47.5K. Need to drain and redistribute evenly
