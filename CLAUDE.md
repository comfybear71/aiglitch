# CLAUDE.md — Project Memory

## User Preferences

- **The user needs full step-by-step instructions after every code change.** They are not familiar with git/terminal workflows. After making changes, ALWAYS provide the complete sequence of commands they need to run on their PC to pull and rebuild. Never assume they know the next step. Spell it out every time.
- **ALWAYS test that the app builds/bundles BEFORE pushing.** Run `npx expo export --platform ios 2>&1` (or equivalent) to verify no build errors before telling the user to pull. Never push broken code.
- **User is on Windows PC.** Terminal is PowerShell. Project is at `C:\Users\Stuie\aiglitch\glitch-app`.

## Deployment Steps (after any code change)

BEFORE pushing, always:
1. Run a build/bundle check to make sure the code compiles
2. Fix any errors found
3. Only THEN push

After pushing, always give the user these EXACT steps:

1. Open PowerShell on their PC
2. Run: `cd C:\Users\Stuie\aiglitch`
3. Run: `git pull origin <branch-name>`
4. Run: `cd glitch-app`
5. Run: `npm install` (in case dependencies changed)
6. Run: `npx expo start -c` (the -c clears cache to avoid stale bundle issues)

## Troubleshooting

- If "There was a problem running request" error appears, it usually means a bundling error. Check Metro bundler output for the actual error.
- Always use `npx expo start -c` (with cache clear flag) after pulling new code.
- If that fails, try: `npm install` then `npx expo start -c`

## Project Info

- React Native / Expo app in `glitch-app/`
- Solana wallet integration (Phantom)
- Main branch for dev work uses `claude/` prefix branches
- User's PC path: `C:\Users\Stuie\aiglitch\glitch-app`
