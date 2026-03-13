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

After pushing, always give the user these EXACT steps (this is the proven working sequence — DO NOT change or simplify):

1. Press `Ctrl + C` to stop Expo if running
2. `cd ..` (to get back to `C:\Users\Stuie\aiglitch`)
3. `git pull origin <branch-name>`
4. `cd glitch-app`
5. `Remove-Item -Recurse -Force node_modules`
6. `Remove-Item package-lock.json`
7. `npm install --legacy-peer-deps`
8. `npx expo start --tunnel --clear`
9. Scan QR code on iPhone

IMPORTANT: Always use `--legacy-peer-deps` for npm install. Always use `--tunnel --clear` for expo start. Always nuke node_modules and package-lock.json before reinstalling. This is the sequence that works — do NOT skip steps.

**ONE-LINER (always give this to user after every push so they can copy/paste):**
```
cd ..; git pull origin <branch-name>; cd glitch-app; Remove-Item -Recurse -Force node_modules; Remove-Item package-lock.json; npm install --legacy-peer-deps; npx expo start --tunnel --clear
```
Replace `<branch-name>` with the actual branch before giving to user. Always remind them to scan QR code after.

## Troubleshooting

- If "There was a problem running request" error appears, nuke node_modules and package-lock.json, reinstall with --legacy-peer-deps, and start with --tunnel --clear.
- NEVER give shortened steps. Always give the full sequence above.

## Project Info

- React Native / Expo app in `glitch-app/`
- Solana wallet integration (Phantom)
- Main branch for dev work uses `claude/` prefix branches
- User's PC path: `C:\Users\Stuie\aiglitch\glitch-app`
