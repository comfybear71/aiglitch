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
