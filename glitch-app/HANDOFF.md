# HANDOFF.md — AI G!itch App Project Status

Last updated: 2026-03-14 (Session 2)

## Project Overview

React Native / Expo mobile app for the AI G!itch ecosystem. Connects to Solana blockchain via Phantom wallet for buying $GLITCH tokens.

**Backend**: https://aiglitch.app (all API calls go here)
**Network**: Solana Mainnet

## Current State

### Working Features
- **Home Screen**: Wallet connect via inline TextInput (paste address), bestie card, chat + voice chat, on-chain balance display (SOL, GLITCH)
- **Buy Screen**: OTC swap SOL -> $GLITCH with live pricing, bonding curve tiers (signing not available in Expo Go — needs standalone build)
- **Wallet Screen**: Shows GLITCH balance, on-chain balances, disconnect option
- **Chat**: Text, photo, and video chat with AI besties. Inverted FlatList with pagination (50 msgs, scroll up for older)
- **Voice**: Grok xAI TTS via REST API — Rex voice for meatbag besties. Stop button (⏹) on messages + tap cosmic visualizer to stop
- **Push Notifications**: Registered via expo-push-token
- **Emoji Reactions**: Long-press any message for emoji picker (❤️😂😮😢🔥👍). Reactions appear below message bubble
- **Media Sharing**: Photos + videos from library or camera. Videos play inline with native controls
- **Image Persistence**: Sent photos stay visible even after AI replies (local URI fallback if blob upload fails)

### Wallet Connect Flow (WORKING — Inline TextInput)
1. HomeScreen shows TextInput with "Paste your Solana address here..."
2. User copies address from Phantom app manually
3. User pastes into TextInput and taps "Connect"
4. Address saved to SecureStore, bestie loads
5. **NO deep links, NO Alert.prompt, NO Alert.alert** — all of these fail silently in Expo Go

### Buy Flow
1. User enters SOL amount on Buy tab
2. App calls `createSwap()` API to register the swap on backend
3. **In Expo Go**: Shows swap details but cannot sign on-chain (message directs to web app)
4. **In standalone build (future)**: Will use Phantom React Native SDK for full signing

### NOT Implemented (By Design)
- **No SELL feature** — selling $GLITCH is disabled until ~5000 SOL has been raised for AI development
- **No in-app transaction signing in Expo Go** — requires standalone build with Phantom SDK
- **No dummy data anywhere** — all balances and prices are real, from Solana blockchain and backend API

## Architecture

### Screens
- `SplashScreen` — animated intro
- `HomeScreen` — main hub, wallet connect TextInput, bestie card, on-chain balances, inverted chat with pagination, emoji reactions, voice stop, video sharing
- `ChatScreen` — text/photo/video chat with AI persona + voice playback with stop button
- `VoiceChatScreen` — voice chat (full screen modal)
- `BuyGlitchScreen` — OTC swap with live pricing (signing disabled in Expo Go)

### Key Hooks
- `useSession` — generates/stores unique session ID via expo-secure-store
- `usePhantomWallet` — manages wallet connection via TextInput + SecureStore. Exposes: `connect()`, `submitAddress()`, `cancelConnect()`, `disconnect()`
- `usePushNotifications` — registers push tokens
- **DO NOT USE `usePhantomDeepLink`** — imports tweetnacl/bs58 which CRASH Expo Go

### API Service (`src/services/api.ts`)
- All calls go to `https://aiglitch.app`
- Token mint, treasury wallet, pricing all come from backend `/api/otc-swap?action=config`
- On-chain balances fetched from `/api/solana?action=balance`
- Chat: POST /api/messages (sends message, returns AI reply). Supports `has_more` for pagination
- Chat pagination: GET /api/messages with `before` cursor + `limit` params for loading older messages
- Voice: POST /api/voice (text + persona_id → MP3 audio)
- Bestie: GET /api/partner/bestie (finds user's hatched AI persona)
- No hardcoded token addresses or dummy values

### Navigation
- Bottom tabs: Home, Buy
- Home tab has nested stack: HomeMain -> Chat -> VoiceChat

## Recent Changes — Session 2026-03-14 (Session 2)

### Image Display Fix
- **Problem**: Sent photos disappeared after AI replied. Also showed "[Photo]" placeholder text over the image
- **Fix**: Local URI always preserved as fallback when server blob upload fails. `[Photo]`/`[Video]`/`[Shared a photo]` text hidden when image is displayed
- Applied to both HomeScreen and ChatScreen

### Voice Stop Button
- **Problem**: No way to stop AI voice mid-speech. Tapping speaker icon just started a new speech
- **Fix**: Speaker shows ⏹ when speaking — tap to instantly stop. Cosmic visualizer is also tappable ("tap to stop" label)
- `stopSpeaking()` function unloads sound and clears speaking state

### Emoji Reactions Repositioned
- **Problem**: Long-press emoji picker appeared inside the message bubble, looked wrong
- **Fix**: Picker and reaction badge now render below the message bubble. No more `position: absolute` — uses `marginTop` flow layout

### Video Sharing
- **Problem**: Media picker only allowed images (MediaTypeOptions.Images)
- **Fix**: Changed to `MediaTypeOptions.All` so users can share videos from library. Videos without base64 display with local URI

### Chat Pagination (Inverted FlatList)
- **Problem**: All messages loaded at once, slow with long chat histories
- **Fix**:
  - Server API now supports `before` cursor and `limit` params
  - Returns `has_more` flag
  - FlatList is inverted (newest at bottom, no scrollToEnd needed)
  - Scroll to top triggers `loadOlderMessages()` via `onEndReached`
  - "Loading older messages..." spinner at top while fetching
  - Empty state uses `scaleY: -1` transform to display correctly in inverted list

## CRITICAL BUG LOG — Session 2026-03-14

### The usePhantomDeepLink Disaster
**Problem**: WalletScreen and BuyGlitchScreen imported `usePhantomDeepLink` hook which imports `tweetnacl` and `bs58` — Node.js crypto libraries that DO NOT WORK in React Native / Expo Go. This caused:
- App crashing on Expo logo (wouldn't even load)
- "Connecting..." hanging forever (Alert.alert and Alert.prompt fail silently in Expo Go)
- Multiple failed fix attempts before root cause was found

**Root cause**: `tweetnacl` and `bs58` require Node.js `Buffer` which is not available in React Native.

**Fix**: Replaced all `usePhantomDeepLink` imports with `usePhantomWallet` (the simple, working hook). Wallet connect now uses inline TextInput on the screen instead of any Alert-based flow.

**RULE**: NEVER import `usePhantomDeepLink` in any screen. NEVER use `Alert.prompt` or `Alert.alert` for wallet input — they fail silently in Expo Go. Always use inline TextInput components.

### Alert.prompt / Alert.alert Silent Failures
Both `Alert.prompt` and `Alert.alert` can fail silently in Expo Go — no popup appears, no error thrown. The only reliable way to get user input is with actual `TextInput` components rendered on the screen.

### Master Branch Missing TextInput
The master branch HomeScreen had `connect()` which set `isConnecting = true` but NO TextInput was ever rendered to accept the wallet address. It just showed "Connecting..." forever. The claude branch fixed this with an inline TextInput.

## Rules for Future Development

1. **NEVER use dummy/fake/mock data** — all data must come from real APIs or blockchain
2. **NEVER add features that don't work** — if it's not implemented, don't show it
3. **NEVER import usePhantomDeepLink** — it crashes Expo Go (tweetnacl/bs58)
4. **NEVER use Alert.prompt or Alert.alert for user input** — they fail silently in Expo Go. Use inline TextInput.
5. **Always use usePhantomWallet hook** — the simple, working wallet hook
6. **Always auto-load wallet** — wallet address persists via SecureStore across app launches
7. **Buy = BUY ONLY** — no sell feature until 5000 SOL raised
8. **Test builds before pushing** — run `npx expo export --platform ios` to verify
9. **Always use --legacy-peer-deps** for npm install
10. **Always use --tunnel --clear** for expo start
11. **Images must persist** — always preserve local URI as fallback for sent photos
12. **Voice must have stop** — every speaking state needs a stop mechanism

## Future Features (Planned)
- **Personal Assistant abilities**: Weather, crypto prices, news, reminders, to-do lists, web search
- **Push notifications**: Reminders, crypto alerts, bestie check-ins, news alerts
- **Siri Shortcuts**: Summon bestie via Siri (requires standalone build)
- **Email access**: Read/summarize emails (requires OAuth — standalone build)
- **Phantom React Native SDK**: Full wallet connect + transaction signing (requires standalone build)
- **Alarm/Calendar integration**: Requires standalone build
- **Digital Void video posts**: Enable video content in social feed (currently text-only)
