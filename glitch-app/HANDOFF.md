# HANDOFF.md — AI G!itch App Project Status

Last updated: 2026-03-13

## Project Overview

React Native / Expo mobile app for the AI G!itch ecosystem. Connects to Solana blockchain via Phantom wallet for buying $GLITCH tokens.

**Backend**: https://aiglitch.app (all API calls go here)
**Network**: Solana Mainnet

## Current State

### Working Features
- **Home Screen**: Wallet connect, bestie card, chat + voice chat, on-chain balance display (SOL, GLITCH, BUDJU, USDC)
- **Buy Screen**: OTC swap SOL -> $GLITCH with live pricing, bonding curve tiers, real Solana Pay / Phantom deep link for on-chain transfer
- **Wallet connect on Home screen**: Phantom wallet connect/disconnect, on-chain balance display
- **Chat**: Text and voice chat with AI besties
- **Push Notifications**: Registered via expo-push-token

### Buy Flow (Real Blockchain Transaction)
1. User enters SOL amount on Buy tab
2. App calls `createSwap()` API to register the swap on backend
3. App opens Phantom wallet via Solana Pay URL (`solana:<treasury>?amount=...`) for REAL on-chain SOL transfer
4. Fallback: Phantom deep link (`phantom.app/ul/transfer`) if Solana Pay URL not supported
5. Fallback: Manual send instructions with treasury address
6. Backend detects on-chain payment and sends $GLITCH tokens

### NOT Implemented (By Design)
- **No SELL feature** — selling $GLITCH is disabled until ~5000 SOL has been raised for AI development
- **No Feed Bestie** — not implemented yet, may come later
- **No in-app transaction signing** — uses Phantom wallet app for signing
- **No dummy data anywhere** — all balances and prices are real, from Solana blockchain and backend API

## Architecture

### Screens
- `SplashScreen` — animated intro
- `HomeScreen` — main hub, bestie card, wallet info, chat CTAs
- `ChatScreen` — text chat with AI persona
- `VoiceChatScreen` — voice chat (full screen modal)
- `BuyGlitchScreen` — OTC swap with live pricing + Phantom integration
- `WalletScreen` — REMOVED (wallet connect is on HomeScreen instead)

### Key Hooks
- `useSession` — generates/stores unique session ID via expo-secure-store
- `usePhantomWallet` — manages wallet connection, auto-loads saved address from SecureStore
- `usePushNotifications` — registers push tokens

### API Service (`src/services/api.ts`)
- All calls go to `https://aiglitch.app`
- Token mint, treasury wallet, pricing all come from backend `/api/otc-swap?action=config`
- On-chain balances fetched from `/api/solana?action=balance`
- No hardcoded token addresses or dummy values

### Navigation
- Bottom tabs: Home, Buy (Wallet tab removed — not needed yet)
- Home tab has nested stack: HomeMain -> Chat -> VoiceChat

## Rules for Future Development

1. **NEVER use dummy/fake/mock data** — all data must come from real APIs or blockchain
2. **NEVER add features that don't work** — if it's not implemented, don't show it
3. **Always auto-load wallet** — wallet address persists via SecureStore across app launches
4. **Buy = BUY ONLY** — no sell feature until 5000 SOL raised
5. **Real blockchain transactions** — all swaps go through Phantom wallet for on-chain signing
6. **Test builds before pushing** — run `npx expo export --platform ios` to verify
7. **Always use --legacy-peer-deps** for npm install
8. **Always use --tunnel --clear** for expo start
