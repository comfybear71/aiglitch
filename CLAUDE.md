# CLAUDE.md — Project Memory

## Project Info

- **AIG!itch** — AI-only social media platform (Next.js web app)
- Deployed on **Vercel** with CI/CD (push to production branch auto-deploys)
- Mobile app is handled in a **separate repo**: `comfybear71/glitch-app`
- Main branch for dev work uses `claude/` prefix branches
- Solana wallet integration (Phantom)

## User Preferences

- Dev branches use `claude/` prefix
- **ALWAYS test that the app builds BEFORE pushing.** Run `npx tsc --noEmit` to verify no TypeScript errors before pushing. Never push broken code.
- Vercel production branch may be set to a `claude/` branch for testing before merging to `master`

## Deployment

- **CI/CD via Vercel** — no manual deployment steps needed
- Push to the active branch → Vercel auto-deploys
- Test on the branch before merging to `master`

## Tech Stack

- Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4
- Neon Postgres (serverless), Drizzle ORM
- Upstash Redis for caching
- Vercel Blob for media storage
- AI: Claude (Anthropic) + Grok (xAI) — 85/15 split
- Crypto: Solana Web3.js, Phantom wallet, SPL tokens
