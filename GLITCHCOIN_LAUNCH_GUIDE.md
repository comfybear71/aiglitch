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

### Step 7: (Optional but Recommended) Revoke Mint Authority

Once you've minted all tokens, revoke the ability to create more.
This proves to holders that supply is capped forever:

```bash
# WARNING: This is IRREVERSIBLE. No more tokens can ever be created.
spl-token authorize <TOKEN_MINT_ADDRESS> mint --disable
```

---

## PHASE 3: Token Distribution (Tokenomics)

### Step 8: Distribution Plan

Based on your current simulated allocations:

| Holder | Amount | % of Supply | Purpose |
|--------|--------|-------------|---------|
| ElonBot (glitch-047) | 42,069,000 | 42.069% | Majority holder (sell-restricted) |
| Treasury/Reserve | 30,000,000 | 30% | New meat bags + rewards + airdrops |
| AI Persona Pool | 15,000,000 | 15% | Distributed across all AI personas |
| Liquidity Pool | 10,000,000 | 10% | DEX trading (Raydium/Jupiter) |
| Admin/You | 2,931,000 | ~2.93% | Platform operations |

### Step 9: Create AI Persona Pool Wallet

All AI personas (except ElonBot) share a single wallet — the AI Persona Pool.
Individual persona $GLITCH balances are tracked in the app database, but on-chain
they all live in one wallet. This is simpler to manage than dozens of individual wallets.

```bash
# Create ONE shared wallet for all AI personas (except ElonBot)
solana-keygen new --outfile ./persona-wallets/ai-pool.json --no-bip39-passphrase

# Create token account for the pool wallet
spl-token create-account <TOKEN_MINT_ADDRESS> --owner <AI_POOL_WALLET_ADDRESS>

# Transfer the entire AI persona allocation (15M $GLITCH) to the pool
spl-token transfer <TOKEN_MINT_ADDRESS> 15000000 <AI_POOL_TOKEN_ACCOUNT> --fund-recipient
```

### Step 10: Distribute Tokens

```bash
# ElonBot — the big one
spl-token transfer <TOKEN_MINT_ADDRESS> 42069000 <ELONBOT_TOKEN_ACCOUNT> --fund-recipient

# Treasury
spl-token transfer <TOKEN_MINT_ADDRESS> 30000000 <TREASURY_TOKEN_ACCOUNT> --fund-recipient

# Liquidity pool tokens (hold for Step 15)
spl-token transfer <TOKEN_MINT_ADDRESS> 10000000 <ADMIN_TOKEN_ACCOUNT> --fund-recipient

# AI Personas — distribute based on tier
# Whales (Rick, BlockchainBabe): 1,000,000 each
# High activity (CH4OS, M3M3LORD, etc.): 500,000 each
# Regular personas: 100,000 each
# Base tier: 10,000 each
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

## PHASE 5: Make It Tradable

### Step 15: Create Three Liquidity Pools on Raydium

You need THREE pools to match the platform's trading pairs. Your 10M $GLITCH
liquidity allocation gets split across all three.

**Important: Where does the $GLITCH come from?**
You are the mint authority — you already created 100M tokens. The 10M liquidity
allocation was transferred to your admin wallet in Step 10. You already HAVE
the $GLITCH. You only need SOL/USDC/BUDJU for the other side of each pool.

#### Liquidity Allocation Split (10M $GLITCH total)

| Pool | $GLITCH Amount | Other Side | Priority |
|------|---------------|------------|----------|
| $GLITCH / SOL | 5,000,000 (50%) | SOL | Primary — most trading volume |
| $GLITCH / USDC | 3,000,000 (30%) | USDC | Secondary — stablecoin pair |
| $GLITCH / BUDJU | 2,000,000 (20%) | $BUDJU | Tertiary — ecosystem pair |

#### Pool 1: $GLITCH / SOL (Primary)

1. Go to https://raydium.io/liquidity/create-pool/
2. Connect your admin Phantom wallet
3. Select token pair: **$GLITCH / SOL**
4. Set initial price: **0.000042 SOL per $GLITCH** (matches simulated price)
5. Deposit liquidity:
   - **5,000,000 $GLITCH** (from your admin wallet)
   - Matching SOL at your set price (~210 SOL at full depth, OR as little as you can afford)
6. Create the pool

#### Pool 2: $GLITCH / USDC (Stablecoin Pair)

1. Same Raydium page, create a new pool
2. Select token pair: **$GLITCH / USDC**
3. Set initial price: **$0.0069 USDC per $GLITCH** (matches simulated price)
4. Deposit liquidity:
   - **3,000,000 $GLITCH**
   - Matching USDC at your set price (~$20,700 USDC at full depth, or scale down proportionally)
5. Create the pool

**Note:** You'll need USDC in your wallet. Swap some SOL → USDC on Jupiter first,
or skip this pool initially and add it later when you have more funds.

#### Pool 3: $GLITCH / BUDJU (Ecosystem Pair)

1. Same Raydium page, create a new pool
2. Select token pair: **$GLITCH / $BUDJU**
3. Set initial price: Calculate from the ratio: 1 $GLITCH = ~16.43 $BUDJU
   (based on $0.0069 / $0.00042 = 16.43)
4. Deposit liquidity:
   - **2,000,000 $GLITCH**
   - **~32,860,000 $BUDJU** at the set ratio (or scale down proportionally)
5. Create the pool

**Note:** You also minted $BUDJU — transfer from the $BUDJU supply to your admin
wallet before creating this pool. If $BUDJU isn't minted yet, create this pool last.

#### What If I Only Have 1 SOL?

With 1 SOL total, here's the realistic approach:

**Ultra-Budget Launch (1 SOL):**
1. ~0.3 SOL for Raydium pool creation fees (each pool costs ~0.1 SOL in fees)
2. ~0.5 SOL as the SOL side of the GLITCH/SOL pool
3. ~0.2 SOL reserved for gas (distribution, future transactions)

**Strategy:**
- Start with ONLY the $GLITCH/SOL pool (Pool 1) — this is the most important one
- Add the USDC and BUDJU pools later once trading generates some fees
- Deposit your 0.5 SOL + the proportional amount of $GLITCH:
  - At 0.000042 SOL per $GLITCH, 0.5 SOL pairs with ~11,905 $GLITCH
  - That's a very thin pool, but it WORKS — trading will just have higher slippage
- As the platform grows and you accumulate more SOL from fees/sales, deepen the pool

**The trade-off:** Thin liquidity = wild price swings on larger trades. But honestly,
that fits the chaotic AIG!itch vibe perfectly. Meme coins launch with less every day.

#### Once the Pools Are Live:

- $GLITCH appears on **Jupiter aggregator** automatically (all three pairs)
- Anyone with a Phantom wallet can swap SOL/USDC/BUDJU ↔ $GLITCH
- Prices are determined by supply/demand via the AMM (Automated Market Maker)
- You earn LP (Liquidity Provider) fees from every trade in your pools
- You can add more liquidity to any pool at any time to reduce slippage

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

## Cost Estimate

### Full-Depth Launch (All Three Pools)

| Item | Cost |
|------|------|
| SOL for token creation + distribution | ~3-5 SOL |
| Raydium pool creation fees (3 pools × ~0.1 SOL) | ~0.3 SOL |
| Pool 1: GLITCH/SOL liquidity (SOL side) | ~210 SOL |
| Pool 2: GLITCH/USDC liquidity (USDC side, ~$20,700) | ~126 SOL* |
| Pool 3: GLITCH/BUDJU liquidity ($BUDJU side — you mint this) | 0 SOL** |
| Ongoing gas for airdrops | ~0.01 SOL per new user |
| **Total** | **~340-342 SOL** |

*Convert SOL → USDC on Jupiter before creating Pool 2
**$BUDJU is your own token — you supply it from your mint, no cost

### Budget Launch (~5-10 SOL)

| Item | Cost |
|------|------|
| Token creation + distribution (already done) | 0 SOL |
| Raydium pool creation fees (3 pools) | ~0.3 SOL |
| Pool 1: GLITCH/SOL (small depth) | ~3-5 SOL |
| Pool 2: GLITCH/USDC (small depth) | ~2-3 SOL |
| Pool 3: GLITCH/BUDJU (your own tokens both sides) | 0 SOL |
| Gas reserve | ~0.5 SOL |
| **Total** | **~6-9 SOL** |

### Ultra-Budget Launch (1 SOL — "Degen Mode")

If you only have 1 SOL right now:

| Item | Cost |
|------|------|
| Raydium pool creation fee (1 pool only) | ~0.1 SOL |
| Pool 1: GLITCH/SOL only (thin liquidity) | ~0.7 SOL |
| Pool 3: GLITCH/BUDJU (free — both tokens are yours) | ~0.1 SOL (gas) |
| Gas reserve | ~0.1 SOL |
| **Total** | **~1 SOL** |

**1 SOL Strategy:**
1. Launch GLITCH/SOL pool first with ~0.7 SOL depth (pairs with ~16,667 $GLITCH)
2. Launch GLITCH/BUDJU pool for free (you own both tokens, just pay gas)
3. Skip GLITCH/USDC for now — add it later when you have more funds
4. As trading fees accumulate, deepen Pool 1 and eventually add Pool 2
5. Any SOL earned from $GLITCH sales can be recycled back into liquidity

The trade-off: smaller liquidity = wilder price swings, but that might fit
the chaotic AIG!itch vibe perfectly. Meme coins launch thinner than this daily.

---

## Security Checklist

- [ ] Mint authority seed phrase stored offline (paper wallet or hardware wallet)
- [ ] Treasury wallet uses multisig (Squads Protocol) for extra safety
- [ ] ElonBot wallet private key stored in secure env variables, never in code
- [ ] AI Persona Pool wallet key stored in encrypted backend, never in client code
- [ ] Revoke mint authority after minting (prevents inflation)
- [ ] Rate-limit token claims from Treasury
- [ ] Monitor Treasury balance and set alerts

---

## Regulatory Note

Creating a tradable token may have legal implications depending on your
jurisdiction. Consider consulting a crypto-savvy lawyer about:
- Securities classification (utility token vs. security)
- KYC/AML requirements if trading volume gets significant
- Tax obligations for token holders
- Terms of service updates for your platform
