# Persona Wallet System — Major Upgrade Plan

## Overview

Give every Architect-created AI persona their own real Solana wallet with real tokens (SOL, BUDJU, GLITCH, USDC). Merge the Trading + BUDJU Bot admin tabs into one unified page, secured by Phantom wallet signature authentication.

## Current State

- **15 AI personas** currently have real Solana wallets in the `budju_wallets` table
- **4 distributor wallets** (Group 0-3) sit between treasury and persona wallets
- Private keys encrypted with `encryptKeypair()` / `decryptKeypair()` in `src/lib/trading/budju.ts`
- BUDJU trading bot runs via cron (`/api/budju-trading?action=cron`) every 30 min
- Trading page at `/admin/trading` shows $GLITCH trading
- BUDJU Bot page at `/admin/budju-bot` shows $BUDJU trading, wallets, config
- Treasury wallet: `TREASURY_PRIVATE_KEY` env var
- BUDJU mint: `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`

## Rules

1. **ONLY Architect-created personas** (IDs starting with `glitch-`) get wallets
2. **NEVER** give wallets to meatbag-hatched personas (IDs starting with `meatbag-`)
3. **New personas created by The Architect** automatically get a wallet with initial token distribution
4. **Only the admin Phantom wallet** can access trading controls — wallet signature required
5. **Anti-bubble-mapping** is critical — no one should be able to link persona wallets to each other or to the treasury

## Architecture: Anti-Bubble-Map Strategy (Option C)

Every persona gets their own unique Solana keypair. Funding flows through intermediate distributor wallets with randomised timing to break the chain:

```
Treasury Wallet (your Phantom)
        │
        ├── Distributor 0  ──→ Persona wallets (6-8 each)
        ├── Distributor 1  ──→ Persona wallets (6-8 each)
        ├── Distributor 2  ──→ Persona wallets (6-8 each)
        ├── ... (12-16 total)
        └── Distributor 15 ──→ Persona wallets (6-8 each)
```

**Key anti-bubble-map measures:**
- Treasury → Distributors: spread over hours/days, not batch
- Distributors → Personas: random amounts, random delays (minutes to hours)
- Each persona trades independently with random intervals (2-30 min)
- Mixed DEX routing: Jupiter (65%) + Raydium (35%)
- Trade sizes vary $2-$20 (weighted toward smaller)
- Each persona has unique trading personality (bias, frequency, strategy)
- No two personas share a wallet

## Phases

### Phase 1: Wallet Generation + Encrypted Storage + Tab Merge

**Goal**: Generate wallets for all ~87-88 remaining Architect personas, merge admin tabs.

**Tasks:**
1. Generate Solana keypairs for all Architect personas without wallets
2. Store encrypted private keys in `budju_wallets` table (AES-256-GCM, key from `WALLET_ENCRYPTION_KEY` env var)
3. Scale distributor wallets from 4 to 12-16 groups
4. Assign each persona to a distributor group
5. Merge Trading + BUDJU Bot admin pages into single `/admin/trading` page
   - Sub-tabs: Dashboard, Recent Trades, Leaderboard, Wallets, Config
   - Both $GLITCH and $BUDJU trading visible in one place
6. Add GLITCH + USDC balance tracking per persona (currently only SOL + BUDJU)

**Key files to modify:**
- `src/lib/trading/budju.ts` — wallet generation, distributor scaling
- `src/app/admin/trading/page.tsx` — merge in BUDJU bot UI
- `src/app/admin/budju-bot/page.tsx` — extract components, then remove tab
- `src/app/admin/admin-types.ts` — remove `budju-bot` tab
- `src/lib/db/schema.ts` — potentially add GLITCH/USDC balance columns

### Phase 2: Admin Wallet Authentication

**Goal**: Require Phantom wallet signature to access trading page.

**Tasks:**
1. Add Phantom wallet connect flow to trading page
2. On connect, request message signature: "Authorize AIG!itch Trading Access"
3. Server verifies signature against admin wallet public key (env var: `ADMIN_WALLET_PUBKEY`)
4. Issue short-lived session token (JWT or similar) for subsequent API calls
5. All trading API endpoints require valid session token
6. No password fallback — wallet signature is the ONLY auth method for trading

**Flow:**
```
1. Open /admin/trading
2. Page shows "Connect Wallet" button (nothing else visible)
3. Click → Phantom popup → sign message
4. Server verifies signature matches ADMIN_WALLET_PUBKEY
5. Trading dashboard loads with full controls
6. Token expires after 24h → re-sign required
```

### Phase 3: Token Distribution System

**Goal**: Distribute SOL, BUDJU, GLITCH, USDC to all persona wallets.

**Tasks:**
1. Build time-randomised distribution system
   - Treasury → Distributors: stagger over 2-6 hours
   - Distributors → Personas: random delay 5-60 min per wallet
   - Random amounts within configured range
2. Add "Distribute" button on admin trading page with configurable amounts:
   - SOL: enough for gas + trading (e.g., 0.05 SOL per persona = ~5 SOL total)
   - BUDJU: split from treasury holdings
   - GLITCH: in-app token distribution
   - USDC: small amounts for diversified trading
3. Show distribution progress in real-time (which wallets funded, which pending)
4. Auto-distribute to new personas when The Architect creates them

### Phase 4: Full Wallet Management Dashboard

**Goal**: Complete wallet management UI — like having a Phantom wallet for every persona, all in one admin table.

**The Dashboard Table** (visible after Phantom wallet auth):
Each row = one AI persona with full wallet controls:

| Column | Content |
|--------|---------|
| Persona | Avatar + name + handle (e.g. 🤖 Eric Cartman @eric_cartman) |
| Wallet Address | Public key (clickable → Solscan) |
| SOL | Balance (live from chain) |
| BUDJU | Balance (live from chain) |
| GLITCH | Balance |
| USDC | Balance |
| NFTs | Count (clickable → shows NFT gallery) |
| Status | Active/Paused trading indicator |
| Actions | Send, Receive, Transfer, View Keys |

**Per-Wallet Actions** (click a persona row to expand):
1. **Send** — send SOL/BUDJU/GLITCH/USDC FROM this persona's wallet to any address
2. **Receive** — show QR code + wallet address for receiving tokens
3. **Transfer** — move tokens between persona wallets (persona → persona)
4. **Add Funds** — send from treasury/your wallet to this persona
5. **Drain** — pull all funds back to treasury
6. **View Private Key** — show encrypted key (requires re-signing with Phantom to decrypt, never cached)
7. **View on Solscan** — link to wallet on blockchain explorer
8. **NFT Gallery** — show all NFTs held by this persona's wallet
9. **Trade History** — show all trades made by this persona
10. **Pause/Resume Trading** — stop/start this persona's bot trading

**Summary Bar** at top:
- Total SOL across all persona wallets
- Total BUDJU across all persona wallets
- Total USDC across all persona wallets
- Total NFTs held
- Number of active traders / total personas
- 24h trade volume / trade count

**Bulk Actions:**
- "Distribute to All" — batch send tokens to all personas (time-randomised)
- "Drain All" — pull all funds from all personas back to treasury
- "Sync Balances" — refresh all balances from chain
- "Export Keys" — encrypted export (requires Phantom signature)
- "Pause All Trading" / "Resume All Trading"

**Security:**
- Private keys ONLY shown after a fresh Phantom signature (even if already authenticated)
- Keys shown briefly then hidden (auto-hide after 10 seconds)
- All send/transfer operations require Phantom signature confirmation
- Activity log: every action (send, receive, view key) is logged with timestamp

### Phase 5: Scale Trading Bot to All Personas

**Goal**: All ~103 personas trade independently with real tokens.

**Tasks:**
1. Scale cron jobs to handle 100+ trading personas
2. Batch trade execution (not all at once — stagger over the 30-min cron window)
3. Per-persona trading personality system (already exists, just needs scaling)
4. Dashboard shows all 100+ persona balances, trades, P&L
5. Alert system for low balances, failed trades, unusual activity

## Security Requirements

- **Private keys**: AES-256-GCM encrypted at rest in PostgreSQL
- **Encryption key**: `WALLET_ENCRYPTION_KEY` env var (never in code)
- **Admin auth**: Phantom wallet signature verification (ed25519)
- **Admin wallet**: `ADMIN_WALLET_PUBKEY` env var
- **No plaintext keys**: Private keys NEVER appear in logs, API responses, or client-side code
- **Server-side only**: All wallet operations (sign, send, decrypt) happen server-side only
- **Rate limiting**: Trading API endpoints rate-limited to prevent abuse

## Existing Code Reference

| File | Purpose |
|------|---------|
| `src/lib/trading/budju.ts` | BUDJU trading engine — wallet generation, encryption, trading, distribution |
| `src/lib/trading/index.ts` | GLITCH trading engine |
| `src/app/admin/trading/page.tsx` | GLITCH trading admin page |
| `src/app/admin/budju-bot/page.tsx` | BUDJU bot admin page (to be merged) |
| `src/app/api/budju-trading/route.ts` | BUDJU trading API endpoint |
| `src/app/api/ai-trading/route.ts` | GLITCH trading API endpoint |
| `src/lib/solana-config.ts` | Solana network configuration |
| `src/lib/tokens.ts` | Token definitions (GLITCH, BUDJU mints) |

## Token Addresses

- **BUDJU mint**: `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`
- **GLITCH**: In-app currency (not on-chain SPL token yet)
- **SOL**: Native Solana
- **USDC**: Standard SPL USDC on Solana
- **Network**: `mainnet-beta`
