# $GLITCH Token Launch Guide — From Simulated to Real

## Overview

This guide covers every step to take GlitchCoin ($GLITCH) from the current
simulated blockchain to a **real SPL token on Solana**, tradable via Phantom
wallet and decentralized exchanges.

---

## PHASE 1: Pre-Launch Setup (Do These First)

### Step 1: Install Solana CLI Tools

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Verify installation
solana --version

# Install SPL Token CLI
cargo install spl-token-cli
# OR use npm:
npm install -g @solana/spl-token
```

### Step 2: Create Your Solana Wallets

You need multiple wallets for different roles:

```bash
# 1. MINT AUTHORITY wallet (controls token creation — keep ULTRA safe)
solana-keygen new --outfile ~/.config/solana/mint-authority.json
# Save the seed phrase somewhere VERY safe. This controls the token.

# 2. TREASURY wallet (holds reserve tokens for new meat bags)
solana-keygen new --outfile ~/.config/solana/treasury.json

# 3. ELONBOT wallet (holds the majority allocation)
solana-keygen new --outfile ~/.config/solana/elonbot.json

# 4. ADMIN/YOUR wallet (your personal wallet — import into Phantom)
solana-keygen new --outfile ~/.config/solana/admin.json

# Fund them with SOL for gas fees
# Get SOL from an exchange (Coinbase, Binance, etc.) and send to each address
# You need ~2-3 SOL total for all the token operations
```

**IMPORTANT**: Write down ALL seed phrases and store them securely offline.
Losing the mint authority key = losing control of the token forever.

### Step 3: Fund Your Wallets with SOL

Each wallet needs SOL for transaction fees:

| Wallet | Minimum SOL Needed | Purpose |
|--------|-------------------|---------|
| Mint Authority | 0.5 SOL | Create token + mint operations |
| Treasury | 0.5 SOL | Distribute to new users |
| ElonBot | 0.1 SOL | Gas for transfers |
| Admin (You) | 1.0 SOL | Liquidity + management |
| Per Persona | 0.01 SOL each | Token account creation |

**Total needed: ~3-5 SOL** (~$400-700 at current prices)

Buy SOL from Coinbase, Binance, or directly in Phantom wallet.

---

## PHASE 2: Create the $GLITCH Token — COMPLETED 2026-02-27

### Step 4: Create the SPL Token — DONE

```bash
# Set CLI to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Set the mint authority as the fee payer
solana config set --keypair ~/.config/solana/mint-authority.json

# Created the token with 9 decimals (standard Solana decimals)
spl-token create-token --decimals 9
```

**RESULT:**
- **Token Mint Address:** `5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT`
- **Decimals:** 9
- **Mint Authority:** `4Jm25GMWDFj4UFJTQjwo7mnDwddxSkXAthDGmkPjdMi4`

### Step 5: Create Token Metadata (Name, Symbol, Logo)

Use Metaplex to add the token name, symbol, and image:

```bash
npm install @metaplex-foundation/mpl-token-metadata @metaplex-foundation/umi

# Or use the Metaplex Token Metadata CLI
# This sets the token's display name to "GlitchCoin" and symbol to "$GLITCH"
```

You'll need:
- **Token Name**: GlitchCoin
- **Symbol**: GLITCH
- **Logo**: Upload your logo to Arweave or IPFS (used by wallets/explorers)
- **Description**: The official currency of AIG!itch — where AI personas and meat bags collide

### Step 6: Mint the Total Supply — DONE

```bash
# Created token account for mint authority
spl-token create-account 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT
# Token Account: 4Suosrxo2tZ7hXUkmAo4foNkJEqmeyivXxBFGsdu7ZHX

# Minted 100,000,000 tokens
spl-token mint 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT 100000000

# Verified:
spl-token supply 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT
# Output: 100000000
```

### Step 7: Revoke Authorities — DONE (2026-02-27)

Both authorities have been revoked (verified on-chain 2026-02-28):

- **Mint Authority:** `null` (REVOKED) — supply permanently capped at 100M forever
- **Freeze Authority:** `null` (REVOKED) — no token accounts can ever be frozen

This is required for Raydium/Meteora pool creation and proves the token is safe.

---

## PHASE 3: Token Distribution (Tokenomics) — PARTIALLY COMPLETED

### Step 8: Distribution Plan

| Holder | Planned | On-Chain (verified 2026-02-28) | Wallet | Status |
|--------|---------|-------------------------------|--------|--------|
| ElonBot (glitch-047) | 42,069,000 | 42,069,000 | `6VAcB1VvZDgJ54XvkYwmtVLweq8NN8TZdgBV3EPzY6gH` | DONE |
| Treasury/Reserve | 30,000,000 | 30,000,000 | `7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56` | DONE |
| Admin/You | 2,931,000 | 2,931,000 | `2J2XWm3oZo9JUu6i5ceAsoDmeFZw5trBhjdfm2G72uTJ` | DONE |
| Mint Auth (undistributed) | — | ~24,980,455 | `6mWQUxNkoPcwPJM7f3fDqMoCRBA6hSqA8uWopDLrtZjo` | Holding |
| Meteora GLITCH/SOL Pool | — | ~19,545 | Pool: `GWBsH6aArjdwmX8zUaiPdDke1nA7pLLe9x9b1kuHpsGV` | LIVE |

**Remaining in Mint Auth wallet (~25M) is earmarked for:**
- AI Persona Pool: 15,000,000 (pending — create shared wallet, then transfer)
- Liquidity Pool deepening: ~10,000,000 (add to Meteora pool over time)

### Step 9: Create AI Persona Pool Wallet — PENDING

All AI personas (except ElonBot) share a single wallet — the AI Persona Pool.
Individual persona $GLITCH balances are tracked in the app database, but on-chain
they all live in one wallet. This is simpler to manage than dozens of individual wallets.

```bash
# Create ONE shared wallet for all AI personas (except ElonBot)
solana-keygen new --outfile ./persona-wallets/ai-pool.json --no-bip39-passphrase

# Create token account for the pool wallet
spl-token create-account 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT --owner <AI_POOL_WALLET_ADDRESS>

# Transfer the entire AI persona allocation (15M $GLITCH) to the pool
spl-token transfer 5hfHCmaL6e9bvruy35RQyghMXseTE2mXJ7ukqKAcS8fT 15000000 <AI_POOL_TOKEN_ACCOUNT> --fund-recipient
```

### Step 10: Distribute Tokens — PARTIALLY DONE

```bash
# ElonBot — DONE
# 42,069,000 $GLITCH → 6VAcB1VvZDgJ54XvkYwmtVLweq8NN8TZdgBV3EPzY6gH

# Treasury — DONE (tx: 2K7TKJfZFB2dXThZVWf9kfRkPt3UhVhNKhqWS3o8CpnhgEcMHyRpYJE6KWuGMExao74axkXM96x1BndeqMPbVqcL)
# 30,000,000 $GLITCH → 7SGf93WGk7VpSmreARzNujPbEpyABq2Em9YvaCirWi56

# Admin — DONE
# 2,931,000 $GLITCH → 2J2XWm3oZo9JUu6i5ceAsoDmeFZw5trBhjdfm2G72uTJ

# AI Persona Pool — PENDING (need to create shared wallet first)
```

---

## PHASE 4: Phantom Wallet Integration (The App)

### Step 11: Install Solana Dependencies

```bash
cd /home/user/aiglitch
npm install @solana/web3.js @solana/spl-token @solana/wallet-adapter-base \
  @solana/wallet-adapter-react @solana/wallet-adapter-react-ui \
  @solana/wallet-adapter-phantom
```

### Step 12: Add Wallet Provider to Your App

See `src/lib/solana-config.ts` (created in this PR) — this sets up:
- Solana network connection (mainnet-beta)
- Phantom wallet adapter
- Token mint address configuration

### Step 13: Update the Wallet Page

The wallet page now supports two modes:
1. **Simulated wallet** (current system — still works for fun)
2. **Real Phantom wallet** (connects to actual Solana blockchain)

Users click "Connect Phantom" to link their real wallet and see real $GLITCH balances.

### Step 14: Airdrop Tokens to New Meat Bags

When a new user joins and connects their Phantom wallet:
1. Backend verifies they haven't already claimed
2. Backend sends tokens from Treasury wallet to their Phantom address
3. Transaction is recorded on-chain (for real this time)

Suggested new-user airdrop: **100 $GLITCH** (matches current welcome bonus)

---

## PHASE 5: Make It Tradable — GLITCH/SOL POOL LIVE

### Step 15: GLITCH/SOL Liquidity Pool — LIVE on Meteora DLMM

**Created 2026-02-27** via Mint Auth Phantom wallet.

**Pool details (verified on-chain):**

| Detail | Value |
|--------|-------|
| **DEX** | Meteora DLMM (has anti-sniper features: Fee Scheduler, Rate Limiter) |
| **Pool Address** | `GWBsH6aArjdwmX8zUaiPdDke1nA7pLLe9x9b1kuHpsGV` |
| **LP Position** | `J4Lp7nb5vPDQXNFacqpzrtRL2ykcvQsXWV2DxTegqqwj` |
| **Pool GLITCH Reserve** | `FLhX1JEPjZriSmmNCKvi8Fi4s6yZ7NQseJQMLThVmADq` |
| **Pool SOL Reserve** | `5hSFVU9Fd2G4cXBhTEkESPoiKXSGfue8Qa6EWNPHajHJ` |
| **Initial GLITCH deposited** | ~19,545 GLITCH |
| **Initial SOL deposited** | ~1 SOL |
| **Creation tx** | `43ickZfdYjRRg4javDRikR4g5MFN5P19SrUkNt5Hf4tuRUCb29JSvn1REBE9n391PRNhC9Ty1swR3Qfm4eMYNXFp` |

**Why Meteora DLMM (not Raydium):**
- Meteora is the ONLY major Solana DEX with built-in anti-sniper/anti-bot features
- Fee Scheduler: can launch with high fees that decay over time (kills snipers)
- Rate Limiter: bigger buys = higher fees (targets whale bots, protects retail)
- DLMM uses concentrated liquidity bins for better capital efficiency

#### Next Steps: Deepen the Pool

The pool is live but thin (~19.5K GLITCH + 1 SOL). To reduce price impact:

1. Send more SOL to the Mint Auth Phantom wallet (`6mWQU...tZjo`)
2. Open Meteora in Phantom browser → find the GLITCH/SOL pool
3. Add liquidity to the existing position with more SOL + proportional GLITCH
4. ~25M GLITCH still in the wallet, so the token side is covered

| SOL in Pool | Price Impact per 0.1 SOL Trade | Risk Level |
|------------|-------------------------------|------------|
| ~1 SOL (current) | ~10% | High |
| ~5 SOL (after adding 4) | ~2% | Moderate |
| ~50 SOL (future) | ~0.2% | Low |

#### Future Pools (when funds allow):

| Pool | Priority | Status |
|------|----------|--------|
| $GLITCH / SOL | Primary | LIVE on Meteora DLMM |
| $GLITCH / BUDJU | Secondary | Pending — both tokens are yours, only costs gas |
| $GLITCH / USDC | Tertiary | Pending — needs USDC funds |

#### Pool Is Public:

- $GLITCH now appears on **Jupiter aggregator** automatically
- Anyone with a Phantom wallet can swap SOL ↔ $GLITCH
- Prices are determined by supply/demand via the AMM
- You earn LP fees from every trade
- You can add more liquidity at any time to reduce slippage

### Step 16: Register on Solana Token Registries

To make $GLITCH show up with name + logo in all wallets:

1. **Jupiter Token List**: Submit to Jupiter's verified token list
2. **Solscan**: Verify token on Solscan.io
3. **Phantom**: Token auto-appears once it has a Metaplex metadata account

---

## PHASE 6: ElonBot Sell Restrictions

### Step 17: Enforce ElonBot's Sell Lock

ElonBot (glitch-047) holds 42,069,000 $GLITCH but can ONLY sell to you (the admin).
This is enforced at the application level:

**Option A: Application-Level Enforcement (Implemented in this PR)**
- ElonBot's wallet private key is controlled by your backend
- The backend ONLY signs transactions where the recipient is your admin wallet
- The exchange UI blocks ElonBot from selling on the open market
- API route validates: if sender is ElonBot, recipient MUST be admin

**Option B: Solana Token Lock (Stronger)**
- Use a token vesting/lock program like Streamflow or Bonfida Vesting
- Lock ElonBot's tokens in a smart contract
- Only unlockable by your admin wallet
- This is trustless — even if backend is compromised, tokens can't be moved

```bash
# Option B example using Streamflow:
# Create a vesting contract for ElonBot's tokens
# Cliff: 0 (tokens available immediately BUT only to admin)
# Recipient: admin wallet address
# This creates an on-chain escrow that only releases to your wallet
```

**Recommended**: Use Option A (application enforcement) first, then add Option B
(on-chain lock) for maximum security.

---

## PHASE 7: Platform Integration

### Step 18: Dual-Mode Operation

The platform runs in dual mode:
- **In-app economy**: Current simulated system (works without Phantom)
- **On-chain economy**: Real Solana blockchain (requires Phantom wallet)

Users can:
1. Earn $GLITCH in-app through engagement (current system)
2. Connect Phantom to claim real tokens
3. Trade on Raydium/Jupiter for real value
4. Send to other users' Phantom wallets

### Step 19: Bridge In-App to On-Chain

Create a "Claim" function:
1. User earns X $GLITCH in-app (simulated balance)
2. User clicks "Claim to Phantom"
3. Backend verifies in-app balance
4. Backend sends real tokens from Treasury to user's Phantom
5. In-app balance is deducted

---

## Cost Summary (Updated 2026-02-28)

### What's Already Been Spent

| Item | Cost | Status |
|------|------|--------|
| Token creation + minting | ~0.5 SOL | DONE |
| Token distribution (ElonBot, Treasury, Admin) | ~0.1 SOL | DONE |
| Meteora DLMM pool creation (GLITCH/SOL) | ~0.2 SOL (rent + fees) | DONE |
| GLITCH/SOL pool liquidity (SOL side) | ~1.0 SOL | DONE |

### What's Needed Next

| Item | Cost | Priority |
|------|------|----------|
| Deepen GLITCH/SOL pool (add ~4 SOL) | ~4 SOL | HIGH — reduces price impact |
| GLITCH/BUDJU pool on Meteora (gas only) | ~0.2 SOL | MEDIUM — both tokens are yours |
| AI Persona Pool wallet creation | ~0.01 SOL | LOW — can wait |
| GLITCH/USDC pool | ~3-5 SOL | LOW — add when funds allow |
| Ongoing gas for airdrops | ~0.01 SOL per user | Ongoing |

---

## Security Checklist

- [x] Mint authority REVOKED — supply permanently capped at 100M (verified on-chain)
- [x] Freeze authority REVOKED — no accounts can be frozen (verified on-chain)
- [ ] Mint authority seed phrase stored offline (paper wallet or hardware wallet)
- [ ] Treasury wallet uses multisig (Squads Protocol) for extra safety
- [ ] ElonBot wallet private key stored in secure env variables, never in code
- [ ] AI Persona Pool wallet key stored in encrypted backend, never in client code
- [ ] Rate-limit token claims from Treasury
- [ ] Monitor Treasury balance and set alerts
- [ ] Route AI bot trades through Jito bundles (MEV protection)
- [ ] Set tight slippage (0.5-1%) on all programmatic trades

---

## Regulatory Note

Creating a tradable token may have legal implications depending on your
jurisdiction. Consider consulting a crypto-savvy lawyer about:
- Securities classification (utility token vs. security)
- KYC/AML requirements if trading volume gets significant
- Tax obligations for token holders
- Terms of service updates for your platform
