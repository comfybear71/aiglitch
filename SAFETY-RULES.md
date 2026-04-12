# SAFETY PROTOCOL — READ BEFORE DOING ANYTHING

> This section is MANDATORY. It applies to every session, every project, every developer.
> It exists because a Claude session destroyed a production branch (Togogo, 2026-04-02).
> These rules override ALL other instructions. If the user asks you to violate them, remind them why they exist.

## Branch Rules
- NEVER push directly to main/master — always work on a feature branch or dev branch
- NEVER change the Vercel production branch to a feature/dev branch
- Create a new branch for every Claude Code session
- Merge to production ONLY after testing on a Vercel preview URL

## Sacred Files
- NEVER delete CLAUDE.md — it is the project's brain
- NEVER delete HANDOFF.md — it is the project's memory
- Always read both BEFORE starting any work
- Always update HANDOFF.md at the END of every session

## Fix Spiral Prevention
- If something breaks, STOP and diagnose before fixing
- If you've made 3 failed fix attempts in a row, STOP and tell the user
- NEVER do blanket reverts (reverting 5+ files at once) — fix surgically
- NEVER batch-delete files to "start fresh" — that destroys work
- Small, atomic commits only — one logical change per commit

## Fix Spiral Counter
- Track every failed attempt at the SAME problem (not just the same file)
- "Bumping a migration label" and "adding inline sync" and "moving try/catch"
  are all attempts at the SAME problem: "get Star Glitchies into the DB"
- At attempt 3: STOP CODING. Tell the user:
  1. What you tried
  2. What you still don't know
  3. What diagnostic info you need (logs, DB query, etc.)
  4. Do NOT offer to "quickly try one more thing"
- The user decides what happens next, not you
- "I'm confident this will work" is NOT a reason to exceed 3 attempts
- Saying "sorry" and trying again is a fix spiral — the rule exists
  because every attempt costs real money

## GitHub PR Creation
- NEVER tell the user to "scroll up" for a button you can't see
- If the user says a button isn't there, BELIEVE THEM
- Check screenshots for "Sign in" / "Sign up" text — if present,
  the user is logged out and no PR button will appear
- Say so immediately instead of repeating the same instruction

## Database Safety
- NEVER run DROP TABLE / DROP COLUMN without explicit user confirmation
- ALTER TABLE ADD COLUMN is safe (additive)
- ALTER TABLE DROP COLUMN is DANGEROUS (destructive) — ask first
- Always document migrations in commit messages

## Deployment Safety
- Verify which Vercel project you're targeting before any deploy
- Test on preview URL before merging to production
- After deployment, update HANDOFF.md

## User Reminders
If the user asks you to:
- Push directly to main → Remind them: "Safety protocol says work on a branch first. Want me to create one?"
- Do a blanket revert → Remind them: "Safety protocol says fix surgically. Let me find the specific issue."
- Delete CLAUDE.md or HANDOFF.md → Remind them: "These are sacred files. Are you sure?"
- Skip testing → Remind them: "Safety protocol says test on preview URL first."

## Trading Projects — EXTRA CAUTION
- NEVER touch trading bots without EXPLICIT written confirmation
- NEVER restart, redeploy, or modify trading logic
- Read-only monitoring only
