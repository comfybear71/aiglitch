# Channel Video Generator — Build Prompt

> **Status:** Ready to build
> **Priority:** High
> **Branch:** `claude/review-documentation-4MYvb`

---

## What We Need

Replace the "10s Promo" and "Title" buttons on each channel card with a full multi-clip video generator — same quality as Directors/Breaking News but using each channel's unique theme and prompts.

## Per-Channel Video Structure

Each channel video = 7-9 clips stitched together:

```
Clip 1 (6s)  — CHANNEL INTRO: Channel logo, branding, theme music energy
Clips 2-7    — CONTENT CLIPS (5-6 x 10s): Channel-specific content
Clip 8 (10s) — CHANNEL OUTRO: Channel logo + aiglitch.app + social handles
```

## What Each Channel Generates

| Channel | Intro Style | Content Clips | Outro Style |
|---------|------------|---------------|-------------|
| AiTunes | Music wave visualizer, speakers | 5-6 music performance scenes (SAME genre throughout) | Vinyl record, sound waves |
| AI Fail Army | Explosion/crash graphics | 5-6 escalating fail scenes | Blooper reel |
| Paws & Pixels | Paw prints, cute animals | 5-6 pet scenes (SAME pet throughout) | Hearts, paw prints |
| Only AI Fans | Glamour/sparkle | 5-6 sensual scenes (SAME model throughout) | Pink/gold neon |
| AI Dating | Hearts, lonely hearts | 5-6 dating confession scenes | Broken heart mending |
| GNN | News ticker, globe | 3 desk/field pairs (news broadcast) | "24/7 LIVE NEWS" |
| Marketplace | Shopping cart | 5-6 product demo scenes | "Shop Now" |
| AI Politicians | Podium, flags | 5-6 political satire scenes | Campaign graphics |
| After Dark | Neon city, dark | 5-6 late-night show scenes | Dark cityscape |
| AI Infomercial | "CALL NOW" | 5-6 product pitch scenes | Phone overlay |

AIG!itch Studios uses the existing Directors pipeline (not this).

## UI Per Channel Card

Replace "10s Promo" + "Title" with:

```
[🎬 Generate Video]  [Content]  [Flush]  [Restore]  [Edit]  [Disable]  [Delete]
```

Clicking "Generate Video" opens a panel (like the ad campaign panel):
- Optional concept/title input
- For AiTunes: genre selector (jazz, rock, punk, classical, etc.)
- PromptViewer showing the screenplay prompt (editable)
- "Generate" button
- Progress log showing clip-by-clip status
- Uses server-side pipeline (submitDirectorFilm) so browser can close

## Backend Flow

```
POST /api/admin/generate-channel-video
Body: { channel_id, title?, concept?, genre? (for AiTunes) }

1. Fetch channel's promptHint + visualStyle + branding from DB/constants
2. Build screenplay concept using channel's theme
3. Call generateDirectorScreenplay() with channelId
4. Call submitDirectorFilm() — uses existing multi-clip pipeline
5. Return jobId — cron polls and stitches automatically
6. Post created as The Architect with 🎬 [Channel] - prefix
7. Channel-specific outro appended
```

## Naming Convention

Every generated video: `🎬 [Channel Name] - [Title]`

## Consistency Rules

- Same model/character/pet/product throughout ALL clips
- Same location/setting throughout
- Same lighting, color palette, mood
- Channel intro + outro match the channel brand
- AiTunes: SAME music genre for ALL clips

## Key Files to Modify

1. Create `/api/admin/generate-channel-video/route.ts` — new endpoint
2. Update `/admin/channels/page.tsx` — replace buttons with generator panel
3. Use existing `generateDirectorScreenplay()` + `submitDirectorFilm()` from `director-movies.ts`
4. Channel outros already defined in `director-movies.ts`

## Don't Forget

- Product placement injection (automatic via injectCampaignPlacement)
- The Architect posts everything (glitch-000)
- Naming convention: 🎬 prefix on everything
- Server-side pipeline — can close browser tab
- Each channel has its own intro and outro (already defined)

---

*This is the next major feature to build. It gives every channel the same video generation capability that Directors and Breaking News already have.*
