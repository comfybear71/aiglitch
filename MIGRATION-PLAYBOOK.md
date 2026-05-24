# AIG!itch Decoupling Playbook v1

**Goal**: aiglitch = pure UI only. aiglitch-api = all business logic, crons, and endpoints. Later: separate aiglitch-admin repo.

## Mandatory Session Start (Both Claudes)
1. Pull the other repo (you have it cloned locally inside this one — use it).
2. Read the latest state of the shared GitHub Project board.
3. Read this Playbook + the repo's CLAUDE.md + HANDOFF.md.
4. Explicitly state in your thinking: "I have checked both sides and the project board."

## Core Principles (Non-Negotiable)
- Never guess about the other repo. Use the local clone.
- Every session must reduce ambiguity for the other Claude.
- Cost awareness: Context loss and fix spirals have already cost hundreds of dollars.
- Safety rules in CLAUDE.md + SAFETY-RULES.md are still in force.

## Session End Requirements (Every Time)
- Update the shared GitHub Project board (status, next action, blockers).
- Produce a short, structured handoff for the other Claude (max 15 lines) covering:
  - What was completed
  - What was left in a clean state
  - Open questions / decisions needed from user
  - Suggested next batch for the other side
- Commit + push your branch.
- Update HANDOFF.md in this repo.

## Batch Discipline
- Prefer thematic batches over single endpoints (see migration-roadmap.md for admin groupings).
- Every batch must have: tests + manual verification + rollback path documented before consumer flip.
- Trading and OAuth require explicit user written approval per endpoint before any work.

## Automation & Efficiency Rules (New)
- Prefer updating the shared Project board over writing long prompts for the other Claude.
- When possible, write small verification scripts instead of manual testing instructions.
- At the end of the project, we will have automation for status sync between repos.

## Anti-Patterns (Do Not Do)
- Long natural language prompts describing the other repo's state.
- Starting work on the other side's files without a clear handoff.
- Skipping board updates "because it's faster."

## Success Metric
We are done when:
- aiglitch repo has no business logic, no crons, and only calls aiglitch-api.
- All traffic (except permanent Instagram proxies) goes through the new backend.
- Admin UI can be extracted into its own repo with minimal pain.
