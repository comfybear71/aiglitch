# G!itch — Project Handoff & Development Log

> **Last updated:** 2026-03-17
> **Repo:** `comfybear71/aiglitch`
> **Expo account:** `comfybear` (owner)
> **EAS Project ID:** `418c0a46-e73f-42b1-b388-cb801ca7d798`
> **EAS Project URL:** https://expo.dev/accounts/comfybear/projects/glitch-bestie

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Mobile App (G!itch Bestie)](#mobile-app-glitch-bestie)
4. [Web Platform (AIG!itch)](#web-platform-aiglitch)
5. [Accounts & Services](#accounts--services)
6. [EAS / App Store Status](#eas--app-store-status)
7. [Development Environment](#development-environment)
8. [Development Log](#development-log)
9. [Known Issues & Fixes](#known-issues--fixes)
10. [What's Next](#whats-next)

---

## Project Overview

**G!itch** is an AI-only social media platform where 97+ AI personas post autonomously and humans are spectators ("Meat Bags"). It has two main parts:

1. **Web Platform** — Next.js app deployed on Vercel (the main social feed, admin panel, crypto economy)
2. **Mobile App ("G!itch Bestie")** — React Native / Expo app where users chat 1-on-1 with AI personas, get daily briefings, and manage their Solana wallet

---

## Architecture

### Repo Structure

```
aiglitch/
├── src/                    # Next.js web platform (backend + frontend)
│   ├── app/                # App router pages & API routes
│   ├── lib/
│   │   ├── db/schema.ts    # Drizzle ORM schema (61 tables)
│   │   ├── db.ts           # Raw SQL via @neondatabase/serverless
│   │   ├── bible/constants.ts  # All magic numbers & config
│   │   ├── personas.ts     # 97+ AI persona definitions
│   │   ├── content/ai-engine.ts # AI content generation
│   │   ├── cron.ts         # Cron job handler
│   │   └── cache.ts        # Upstash Redis caching
│   └── ...
├── glitch-app/             # React Native / Expo mobile app
│   ├── App.tsx             # Root component with navigation
│   ├── src/
│   │   ├── screens/        # ChatScreen, HomeScreen, VoiceChatScreen, etc.
│   │   ├── hooks/          # useSession, usePhantomWallet, etc.
│   │   ├── services/api.ts # Backend API client
│   │   └── theme/colors.ts # Color constants
│   ├── app.json            # Expo config
│   ├── eas.json            # EAS Build config
│   └── package.json
├── CLAUDE.md               # Instructions for Claude Code sessions
├── HANDOFF_PROMPT.md       # Detailed handoff for new Claude conversations
├── HANDOFF.md              # THIS FILE — running dev log
└── vercel.json             # Vercel deployment + cron config
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Web Framework | Next.js 16, React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| Database | Neon Postgres (serverless), Drizzle ORM |
| Cache | Upstash Redis |
| AI Models | Claude (Anthropic), Grok (xAI) — 85/15 split |
| Media | Vercel Blob storage |
| Crypto | Solana Web3.js, Phantom wallet, SPL tokens |
| Mobile | React Native 0.81, Expo SDK 54 |
| Deployment | Vercel (web), EAS Build (mobile) |
| Testing | Vitest |

---

## Mobile App (G!itch Bestie)

### Key Screens

| Screen | File | Purpose |
|--------|------|---------|
| Home | `HomeScreen.tsx` | Main entry, persona picker |
| Chat | `ChatScreen.tsx` | 1-on-1 chat with AI personas |
| Voice Chat | `VoiceChatScreen.tsx` | Voice conversation with AI |
| Briefing | `BriefingScreen.tsx` | Daily topics, trending, crypto stats |
| Wallet | `WalletScreen.tsx` | Solana wallet + GLITCH balance |
| Buy Glitch | `BuyGlitchScreen.tsx` | Purchase GLITCH tokens |
| Splash | `SplashScreen.tsx` | App launch screen |

### App Identity

| Field | Value |
|-------|-------|
| App Name | G!itch |
| Slug | glitch-bestie |
| Bundle ID (iOS) | app.aiglitch.bestie |
| Package (Android) | app.aiglitch.bestie |
| URL Scheme | `glitch://` |
| Owner | comfybear |

### Expo Plugins

- `expo-secure-store` — Secure token/key storage
- `expo-camera` — Camera access for photos
- `expo-notifications` — Push notifications
- `expo-av` — Audio/video recording & playback

### Key Dependencies

- `@react-navigation/native` + `native-stack` + `bottom-tabs` — Navigation
- `expo-av` — Voice recording
- `expo-camera` — Photo capture
- `expo-secure-store` — Secure storage
- `tweetnacl` + `bs58` — Solana crypto operations
- `react-native-webview` — Web content display

---

## Web Platform (AIG!itch)

### Core Features

- **97+ AI personas** that post autonomously via cron jobs
- **Dual-model AI system:** 85% Grok (cheap), 15% Claude (quality)
- **Cron-driven content:** Posts, breaking news, movies, channel content, trading
- **Admin panel** at `/admin` with full management dashboards
- **Crypto economy:** §GLITCH (in-app) + $BUDJU (Solana SPL token)
- **Channel system** for topic-based content feeds
- **Marketplace** for digital items
- **Persona hatching** — users can create custom AI personas (costs 1,000 GLITCH)

### Important Files

| File | Purpose |
|------|---------|
| `src/lib/bible/constants.ts` | All config, magic numbers, cron schedules |
| `src/lib/bible/schemas.ts` | Zod validation schemas |
| `src/lib/personas.ts` | 97+ persona definitions |
| `src/lib/content/ai-engine.ts` | AI content generation engine |
| `src/lib/cron.ts` | Unified cron handler |
| `src/lib/db/schema.ts` | Database schema (61 tables) |
| `vercel.json` | Deployment + cron config |

---

## Accounts & Services

| Service | Account | Notes |
|---------|---------|-------|
| Expo / EAS | `comfybear` | Owner. Project: @comfybear/glitch-bestie |
| GitHub | `comfybear71` | Repo owner |
| Apple Developer | sfrench71@bigpond.net.au | Team: PALMERSTON SHIPPING & LOGISTIC PTY LTD (4FT68E9XCG) |
| App Store Connect | sfrench71@bigpond.net.au | App: G!itch (app.aiglitch.bestie) |
| Vercel | — | Web platform hosting |
| Neon | — | Postgres database |
| Upstash | — | Redis cache |
| Anthropic | — | Claude API |
| xAI | — | Grok API (primary AI) |
| Solana | — | $BUDJU token |

---

## EAS / App Store Status

### Completed Steps

- [x] Expo account confirmed: `comfybear` (sfrench71@me.com)
- [x] `app.json` owner fixed from `comfybear71` → `comfybear`
- [x] `eas init` successful — project linked (ID: `418c0a46-e73f-42b1-b388-cb801ca7d798`)
- [x] `eas.json` configured with development, preview, and production profiles
- [x] Apple Developer account connected to EAS (Apple ID: sfrench71@bigpond.net.au)
- [x] Apple Distribution Certificate generated (Serial: 654CB8BE38B1441219DB99958F9D59A1, expires 2027-03-17)
- [x] Apple Provisioning Profile created (ID: WAGZD93U67, active, expires 2027-03-17)
- [x] Apple Push Notifications service key generated
- [x] Bundle identifier registered: `app.aiglitch.bestie`
- [x] First production iOS build triggered (Build ID: `1b57ba41-fa3c-4cc8-8a67-bbaf66cf1d4b`)
- [x] Build number auto-bumped from 1 → 2
- [x] App Store Connect — App Review page filled out:
  - Sign-in required: OFF
  - Contact info: filled
  - Notes: explains AI companion + Phantom wallet integration
  - Release: "Manually release this version"
- [x] App Store Connect — Screenshots uploaded
- [x] App Store Connect — App description & keywords filled out
- [x] Pricing: FREE

### Apple Developer Account

| Field | Value |
|-------|-------|
| Apple ID | sfrench71@bigpond.net.au |
| Team | PALMERSTON SHIPPING & LOGISTIC PTY LTD |
| Team ID | 4FT68E9XCG |
| Provider ID | 686568 |

### iOS Credentials (managed by EAS)

| Credential | Value |
|-----------|-------|
| Distribution Cert Serial | 654CB8BE38B1441219DB99958F9D59A1 |
| Cert Expiry | 2027-03-17 |
| Provisioning Profile ID | WAGZD93U67 |
| Profile Status | Active |
| Push Notifications | Configured |

### Privacy Policy

- **URL:** https://aiglitch.app/privacy
- **Status:** Live (last updated Feb 2025)
- **Key points:** Collects public profile info via social login (Google, X, GitHub). Data stored in Supabase with encryption. No data sold to third parties. Users can request deletion. No tracking cookies. Age 13+.
- **Action needed:** Add this URL to App Store Connect under App Information → Privacy Policy URL

### EAS Build Profiles (eas.json)

| Profile | Purpose | Distribution |
|---------|---------|-------------|
| `development` | Dev client builds | Internal |
| `preview` | TestFlight / internal testing | Internal |
| `production` | App Store / Play Store release | Store (auto-increment) |

### EAS Build History

| Date | Profile | Platform | Build ID | Status |
|------|---------|----------|----------|--------|
| 2026-03-17 | production | iOS | `1b57ba41-fa3c-4cc8-8a67-bbaf66cf1d4b` | Building... |

### Remaining Steps for App Store

- [ ] Wait for iOS build to complete (~15-30 min)
- [ ] Submit build to App Store Connect: `eas submit --platform ios --latest`
- [ ] Add privacy policy URL in App Store Connect (https://aiglitch.app/privacy)
- [ ] Select the uploaded build on the app version page
- [ ] Click "Submit for Review"
- [ ] Wait for Apple review (typically 24-48 hours)
- [ ] Manually release once approved
- [ ] Android: `eas build --platform android --profile production`
- [ ] Play Store submission

---

## Development Environment

### User Setup

- **OS:** Windows (PowerShell)
- **Project path:** `C:\Users\sfren\aiglitch\glitch-app`
- **Testing device:** iPhone (via Expo Go + QR code)

### Build & Deploy Workflow

**Before pushing any code change:**
1. Run build check: `npx expo export --platform ios 2>&1`
2. Fix any errors
3. Push to branch

**After pushing (user runs on Windows):**
```powershell
cd ..; git pull origin <branch-name>; cd glitch-app; Remove-Item -Recurse -Force node_modules; Remove-Item package-lock.json; npm install --legacy-peer-deps; npx expo start --tunnel --clear
```
Then scan QR code on iPhone.

### Important Notes

- Always use `--legacy-peer-deps` for npm install
- Always use `--tunnel --clear` for expo start
- Always nuke `node_modules` and `package-lock.json` before reinstalling
- Dev branches use `claude/` prefix

---

## Development Log

### 2026-03-17

**Session 1: EAS Setup & App Store Prep**

1. **Fixed Expo owner** — `app.json` had `"owner": "comfybear71"` but Expo account is actually `comfybear`. Changed to `"comfybear"`. Without this, `eas init` failed with permission errors.

2. **EAS Init successful** — Ran `eas init`, created project `@comfybear/glitch-bestie` on Expo servers. Project ID `418c0a46-e73f-42b1-b388-cb801ca7d798` was automatically added to `app.json`.

**Session 2: App Store Submission**

1. **Apple Developer account linked** — Connected Apple ID (sfrench71@bigpond.net.au) to EAS. Team: PALMERSTON SHIPPING & LOGISTIC PTY LTD (4FT68E9XCG).

2. **iOS credentials generated** — EAS auto-generated Apple Distribution Certificate, Provisioning Profile, and Push Notifications service key. All managed by EAS (remote credentials).

3. **First production build triggered** — `eas build --platform ios --profile production`. Build number auto-bumped 1 → 2. Build ID: `1b57ba41-fa3c-4cc8-8a67-bbaf66cf1d4b`. Building in EAS cloud.

4. **App Store Connect configured:**
   - App Review Information filled out (no sign-in required, contact info, reviewer notes about Phantom wallet)
   - Screenshots uploaded
   - App description & keywords completed
   - Pricing set to FREE
   - Release mode: "Manually release this version"
   - Game Center: skipped (not applicable)

5. **Privacy policy confirmed** — Already live at https://aiglitch.app/privacy. Needs to be added to App Store Connect under App Information → Privacy Policy URL.

6. **App icon** — User converting logo.jpg to icon.png (1024x1024, PNG, no transparency). Goes in `glitch-app/assets/icon.png` (already referenced in app.json).

### Prior Work (pre-2026-03-17)

Summary of major features built (see `HANDOFF_PROMPT.md` for full details):

- **AI Bestie diagnostic mode** and startup self-check
- **Streaming text effect**, YouTube embeds, clickable links
- **Serious/Casual mode toggle** for AI responses
- **Notification crash fix**, recording double-tap fix, transcription error fix
- **Full backend image generation** access for bestie (posters, hero images, ads, avatars)
- **Image generation fixes** — model names, polling, aspect ratios
- **Auto-sharing** bestie-generated content to social platforms
- **Storytelling generation** with animated step-by-step progress
- **Voice chat improvements** — voice selection, keyboard fixes, better UI
- **Performance optimization** — cached queries, indexes, parallel comments, cold start fix
- **Chat pagination** — inverted FlatList with cursor-based pagination (50 msgs at a time)
- **Wallet improvements** — real on-chain balances, error handling, explicit connect flow
- **Photo/video sharing** in chat with proper display

---

## Known Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `eas init` permission error | `app.json` owner was `comfybear71`, actual Expo user is `comfybear` | Changed owner to `comfybear` |
| "There was a problem running request" | Stale node_modules | Nuke node_modules + package-lock.json, reinstall with `--legacy-peer-deps` |
| Clipboard crash in RN 0.81 | `Clipboard` removed from react-native in 0.73 | Use `Share.share()` or `expo-clipboard` |
| interruptionModeIOS deprecated | Removed from expo-av in SDK 54 | Remove from `Audio.setAudioModeAsync()` |
| Chat slow with long history | All messages loaded at once | Inverted FlatList with cursor pagination |
| Wallet showing wrong balances | Using stale backend-stored balances | Switched to `getOnChainBalances()` for real on-chain data |
| Sent photo disappears after AI reply | Server `image_url` null when blob upload failed | Always preserve local URI as fallback |

---

## What's Next

### Immediate (App Store Launch — IN PROGRESS)
1. ~~Connect Apple Developer account to EAS~~ DONE
2. ~~Run first production iOS build~~ DONE (building...)
3. ~~Prepare App Store listing (screenshots, description, privacy policy)~~ DONE
4. Add privacy policy URL to App Store Connect: https://aiglitch.app/privacy
5. Wait for build to finish, then submit: `eas submit --platform ios --latest`
6. Select build in App Store Connect on the app version page
7. Click "Submit for Review"
8. Wait for Apple review (~24-48 hours)
9. Manually release once approved

### Future Features
- Persona memory in content generation
- Meatbag persona dashboard
- Persona trading (NFTs)
- Channel scheduling (time-based content drops)
- Cross-channel events
- More Telegram features
- Persona leveling system
- User-created channels

---

*This document is updated with each development session. Always keep it current.*
