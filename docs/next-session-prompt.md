# Next Session Prompt — AIG!itch Trading Engine + Wallet Features

## Branch: `claude/sponsor-wallet-fix-IHHlZ`

Read CLAUDE.md for full project context.
Read `docs/sponsor-integration-issues.md` for sponsor system status (mostly resolved).

---

## PRIORITY 1: Real Trading Engine (GLITCH Trading Tab → Jupiter Trading Platform)

### The Vision
Transform the GLITCH Trading tab from "Simulated in-app token" into a **real autonomous trading platform** for 100 AI persona wallets. Event-driven architecture, NOT CRON polling.

### User's Existing Trading System
The user has a fully built trading platform at **https://github.com/comfybear71/budju-xyz** (also live at https://www.budju.xyz/trade). Key components:

**11 Perpetual Trading Strategies** (Python, in `api/perp_*.py`):
| Strategy | File | Leverage | Cooldown | Description |
|----------|------|----------|----------|-------------|
| **HF Scalper** (PRIORITY) | `perp_hf_scalper.py` | 5x | 5min | All 10 markets, 15 concurrent positions, 4 fast signals |
| Trend Following | `perp_strategies.py` | 5x | 2hr | EMA 9/21 crossover + RSI |
| Momentum | `perp_strategies.py` | 5x | 2hr | Breakout + range expansion |
| BB Squeeze | `perp_bb_squeeze.py` | 4x | 2hr | Bollinger squeeze release |
| Mean Reversion | `perp_strategies.py` | 3x | 2hr | Bollinger Band bounce |
| Keltner Channel | `perp_keltner.py` | 3x | 2hr | Squeeze breakout |
| Ninja Ambush | `perp_ninja_strategy.py` | 3x | — | Ultra-tight limit orders |
| Zone Recovery | `perp_zone_recovery.py` | 3x | 2hr | Hedge recovery |
| S/R Reversal | `perp_sr_reversal.py` | 3x | 30min | Support/resistance |
| Grid Trading | `perp_grid_strategy.py` | 2x | 1hr | ATR-based grid |
| Scalping | `perp_strategies.py` | 3x | 2hr | RSI(5) + EMA slope |

**HF Scalper Details** (the "highest trading" the user wants):
- 5-minute cooldown (vs 2hr for others)
- Trades ALL 10 markets simultaneously (no correlation guard)
- Up to 15 concurrent positions
- 0.5% equity per trade (~$50 on $10K), 5x leverage
- 4 signal types: Micro EMA Cross (3/8), RSI Snap (RSI 5), Price Rejection (wick), Momentum Burst
- Very tight SL/TP: 0.5x ATR stop, 1.0x ATR target, 0.5% trailing stop
- Philosophy: "1000 trades × $1-3 > 2 trades × $20"

**Core Engine** (`perp_engine.py`): Position lifecycle, PnL calc, liquidation, fees, partial close, pyramiding, position flipping, core/satellite positions, pending orders.

**VPS On-Chain Bot** (`vps/trader.py`): Real Jupiter swaps on Solana — quote → swap → sign → send via Helius RPC. Circuit breakers: $50 max trade, 50 daily trades, $200 daily loss cap.

**Jupiter Integration** (`api/jupiter.ts`): Proxy for frontend. Both paid (`api.jup.ag`) and free (`lite-api.jup.ag`) endpoints.

**Database**: MongoDB with 22 collections (15 for perps).

### Architecture Plan: Event-Driven (NOT CRON Polling)

**DO NOT** run CRONs every second. Use WebSocket + event-driven:

1. **Central WebSocket Listener** — One persistent connection receiving real-time price data
   - Options: Helius WebSocket, Jupiter Price Feed, QuickNode
   - On Vercel: Use Fluid Compute or offload to Railway/Fly.io/VPS
   - Pushes events to Upstash Redis Queue

2. **Decision Layer** — When price event arrives, only evaluate relevant personas
   - Each persona has a strategy config in Redis (type, entry threshold, TP%, SL%, etc.)
   - Only personas whose strategy matches the signal get evaluated
   - Example: "BUDJU +4% in 30s with volume spike" → only Momentum personas evaluate

3. **Strategy Assignment per Persona Group** (map to Grok's 4-group plan):
   - Group 1 (25 personas): **Light Traders** — HF Scalper / Momentum
   - Group 2 (25 personas): **Ecosystem Boosters** — small BUDJU tips, sponsor appreciation
   - Group 3 (25 personas): **LP Providers** — Raydium LP, liquid staking
   - Group 4 (25 personas): **Content Integrators** — trade → video pipeline

4. **Execution** — Jupiter SDK for on-chain swaps (already integrated)
   - Queue trade decisions → worker executes via persona wallet
   - Risk controls: max trade size, daily loss cap, correlation guard

5. **CRON Jobs** — Only for housekeeping (every 15-60 min):
   - Portfolio rebalancing, P&L logging, stale position cleanup
   - Content generation about trades
   - Random idle actions (tips, small LP adds)

### Copy Trading Option
Instead of building all strategies from scratch, some personas could copy "smart money" wallets:
- **GMGN.AI** — copy trading + smart money tracking, multi-wallet, AI triggers
- **Trojan Bot** — fast execution, custom amounts/slippage/TP/SL per wallet
- **BullX NEO** — multi-wallet, limit orders, DCA
- Open-source repos exist for Solana copy trading (monitor via gRPC/Yellowstone, execute via Jupiter)

### Implementation Plan
1. Port HF Scalper from Python → Node.js/TypeScript
2. Set up WebSocket price listener (Helius or Jupiter)
3. Redis state per persona (position, entry, TP/SL, strategy config)
4. Assign strategies to 4 persona groups
5. Wire into GLITCH Trading tab with real-time positions dashboard
6. Add copy trading for some personas (GMGN/Trojan integration)

### Files to Modify/Create:
- `src/app/admin/trading/GlitchTradingView.tsx` — replace simulated UI with real trading dashboard
- `src/lib/trading/budju.ts` — extend with new strategies (HF Scalper, Momentum, etc.)
- `src/lib/trading/strategies/` — new directory for strategy implementations
- `src/lib/trading/ws-listener.ts` — WebSocket price listener
- `src/app/api/admin/budju-trading/route.ts` — new actions for position management
- `src/app/admin/trading/WalletDashboard.tsx` — add position display per wallet

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
- `glitch_balance` and `usdc_balance` columns
- Sync from chain via `syncWalletBalances()`
- Show in wallet table columns + expanded detail
- Per-wallet GLITCH/USDC in the Dashboard tab

---

## COMPLETED LAST SESSION (April 1, 2026)

### Sponsor Integration (ALL WORKING)
- ✅ Impression tracking fixed (schema mismatch: ad_impressions table had wrong columns)
- ✅ Grokify pipeline — Grok Image Edit API (`/v1/images/edits`) edits actual sponsor product images into video scenes
- ✅ Per-campaign controls: frequency slider, grokify scenes count (0-6), mode (logo only / images only / all)
- ✅ Sponsor thanks in post captions: "🤝 Thanks to our sponsors: BUDJU https://budju.xyz"
- ✅ Sponsor thanks visible on channel player with clickable links to sponsor websites
- ✅ Post titles clickable on channel player → links to /post/{id}
- ✅ Sponsored videos list on campaign cards (collapsible, thumbnails, clickable links)
- ✅ Campaign edit form saves correctly (was using PUT instead of POST — 405 error)
- ✅ Website URL field added to campaign edit form
- ✅ Re-activate button for expired/completed campaigns
- ✅ Sponsor image organization in Blob (sponsors/{slug}/ folder structure)
- ✅ Grokified images named: sponsors/grokified/{brand}-{channel}-scene{N}-{id}.png
- ✅ All sponsor logos/images/URLs force-synced from sponsors table to ad_campaigns on deploy
- ✅ TikTok 6-hour spam cooldown (avoids downloading 30MB videos for nothing)
- ✅ Stall detection fixed (breaks after 3min of no progress on ANY scene)
- ✅ Removed broken sponsor thank-you clip (Grok can't render text in video)
- ✅ Impression counters (🎬 🖼 💬) clickable → opens sponsored videos list
- ✅ Per-campaign Grokify budget: each sponsor gets their own scene count (not shared)

### Wallet System Phases 4-6 (ALL COMPLETE)
- ✅ Phase 4: Dashboard tab — summary bar (SOL/BUDJU/GLITCH/USDC totals), search, filter, sort
- ✅ Phase 4: Expandable wallet rows with per-token controls (→ Treasury / + Add for each token)
- ✅ Phase 4: Private key viewer (auto-hides after 10 seconds)
- ✅ Phase 4: Per-wallet trade history (last 20 trades)
- ✅ Phase 5: Memo system — 6 broadcast presets + custom memos with configurable TTL
- ✅ Phase 6: Memo-aware trading (buy/sell/hold/aggressive/conservative override personas)
- ✅ Process Now actually processes ALL transfers immediately (was only processing scheduled ones)
- ✅ Fund check endpoint: `/api/admin/budju-trading?action=fund_check` — all 4 tokens across treasury/distributors/personas
- ✅ Cancel distribution: `/api/admin/budju-trading?action=cancel_distribution`
- ✅ Per-token drain (flush BUDJU/USDC/GLITCH from all wallets, keep SOL for gas):
  - `?action=drain_token&token=BUDJU`
  - `?action=drain_token&token=USDC`
  - `?action=drain_token&token=GLITCH`
- ✅ Drain distributors with refuel: `?action=refuel_and_drain_distributors`
- ✅ Per-wallet token transfer: `wallet_transfer` action (to/from treasury, any token, any amount)
- ✅ Wallet data refresh without re-login (cache busting)
- ✅ 85 out of 100 personas funded with SOL + BUDJU (52.1M BUDJU distributed)
- ✅ Wallets tab: 4 buttons on single equal row (Generate, Sync, Drain, Export)
- ✅ maxDuration=300s on budju-trading route for long drain operations

### Key Admin URLs:
| Action | URL |
|--------|-----|
| Fund check | `/api/admin/budju-trading?action=fund_check` |
| Cancel distribution | `/api/admin/budju-trading?action=cancel_distribution` |
| Drain all BUDJU | `/api/admin/budju-trading?action=drain_token&token=BUDJU` |
| Drain all USDC | `/api/admin/budju-trading?action=drain_token&token=USDC` |
| Drain all GLITCH | `/api/admin/budju-trading?action=drain_token&token=GLITCH` |
| Drain distributors | `/api/admin/budju-trading?action=drain_distributors` |
| Refuel + drain distributors | `/api/admin/budju-trading?action=refuel_and_drain_distributors` |
| Share grokified images to feed | `/api/admin/blob-upload?action=share_grokified` |
| Organize sponsor images | `/api/admin/blob-upload?action=organize_sponsors` |

---

## KNOWN ISSUES

1. **15 personas still unfunded** — distribution completed 192/232, 40 failed (distributor SOL insufficient for SPL transfer fees)
2. **GLITCH + USDC not tracked per wallet** — only totals shown, per-persona balances show "—"
3. **Grokified images sometimes 400 errors** — Grok Image Edit API rejects some multi-image requests, auto-retries with single image
4. **BUDJU holdings uneven** — some personas have 1.1M, others 47.5K. Use `drain_token&token=BUDJU` then redistribute evenly
5. **YouTube OAuth token expired** — user re-authenticated but may expire again
6. **TikTok in sandbox mode** — `spam_risk_too_many_pending_share` cooldown active

## DO NOT
- Do NOT use CRONs every second for trading — use WebSocket event-driven architecture
- Do NOT touch channel prompts, naming conventions, or the prompt override system
- Do NOT change existing working sponsor integration code
- Do NOT make changes that break working code — test before pushing
