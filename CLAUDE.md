# CLAUDE.md — Project Memory

## User Preferences

- **The user needs full step-by-step instructions after every code change.** They are not familiar with git/terminal workflows. After making changes, ALWAYS provide the complete sequence of commands they need to run on their PC to pull and rebuild. Never assume they know the next step. Spell it out every time.

## Deployment Steps (after any code change)

After pushing changes, always give the user these steps:

1. Open Terminal (or Command Prompt) on their PC
2. `cd` into the project folder (e.g., `cd Desktop/aiglitch` or wherever they cloned it)
3. `git pull origin <branch-name>` to get the latest code
4. `cd glitch-app`
5. `npx expo start` (or whatever the current run command is) to rebuild and run the app

## Project Info

- React Native / Expo app in `glitch-app/`
- Solana wallet integration (Phantom)
- Main branch for dev work uses `claude/` prefix branches
