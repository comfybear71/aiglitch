# Sponsor Integration — Known Issues & Solutions

## Status: 3 CRITICAL ISSUES (as of April 1, 2026)

### Issue 1: Impressions Always Showing 0
**Symptom**: Ad Campaigns page shows "0 total" for all campaigns despite sponsors appearing in videos.
**Root Cause**: The POST handler in `generate-director-movie/route.ts` (the code path used by admin channels page) had NO impression logging until commit `ebeb950`. Even after adding it, the `sponsorPlacements` FormData field may be parsing incorrectly — needs Vercel log verification.
**Debug**: Detailed logging added in commit `7fb41d0`. Check Vercel logs for `[generate-director-movie]` entries.
**Files**: `src/app/api/generate-director-movie/route.ts` (line 310-340)

### Issue 2: Sponsor Thanks Not In Video Outros
**Symptom**: Video outros don't show "Thanks to our sponsors: BUDJU, FRENCHIE" text.
**Root Cause**: `sponsorThanks` text IS in the outro scene's `videoPrompt` (line 1097 of director-movies.ts). However, **Grok's video API cannot render readable text**. The AI sees "Thanks to our sponsors" in the prompt but video generation models are terrible at rendering crisp text. This is a known limitation of ALL AI video generators.
**Solution**: FFmpeg post-production text overlay. After stitching, burn actual text onto the last 5 seconds of the video using `drawtext` filter. This requires `fluent-ffmpeg` or similar.
**Implementation**:
```
1. After concatMP4Clips() produces the stitched video
2. Run FFmpeg drawtext filter to burn sponsor names onto last 5 seconds
3. Upload the post-processed video to Blob instead of the raw stitch
```
**Status**: NOT IMPLEMENTED — requires FFmpeg binary on Vercel (use serverless-compatible build)

### Issue 3: Sponsor Logo/Product Images Not In Videos
**Symptom**: Sponsor uploaded logo + product images via MasterHQ, but videos don't show the actual images.
**Root Cause**: `grok-imagine-video` supports `image_url` but that parameter makes it an **image-to-video animation** (the image becomes the first frame), NOT a reference image that gets placed into scenes.
**Solution**: Use Grok Imagine's **multi-reference image** capability (up to 7 reference images per generation). This guides style, objects, and products throughout the video without forcing them as the first frame.
**Implementation**:
```
Step A: Generate a base scene image WITH the sponsor product using Grok's image API
  - Upload sponsor logo + product images as references
  - Generate a single frame where the product is naturally placed in the scene
Step B: Use that generated image as image_url for video generation
  - Feed the product-in-scene image to grok-imagine-video
  - The video clip starts from a frame with the sponsor product already visible
```
**Status**: NOT IMPLEMENTED — requires multi-step image→video pipeline

## Current Sponsor Flow (What Exists Now)
```
1. getActiveCampaigns(channelId) → fetch active campaigns
2. rollForPlacements(campaigns) → probability roll based on frequency (0-1.0)
3. buildVisualPlacementPrompt(campaigns) → text description injected into prompt
4. Grok generates video from TEXT ONLY → sponsor product may or may not appear
5. sponsorThanks text in outro videoPrompt → Grok renders blurry/no text
6. logImpressions() → supposed to increment counters but wasn't in POST handler
```

## Desired Sponsor Flow (What We Need)
```
1. getActiveCampaigns(channelId) → fetch active campaigns with images
2. rollForPlacements(campaigns) → probability roll
3. FOR EACH sponsor product image:
   a. Generate scene image using Grok Image API with sponsor logo as reference
   b. Use generated image as starting frame for video clip
4. Build video prompt with detailed product descriptions
5. Generate video clips with reference images
6. Stitch all clips
7. FFmpeg: burn "Thanks to our sponsors: BUDJU" onto last 5 seconds
8. Upload final video
9. logImpressions() → increment counters (VERIFIED working)
10. Track which videos have which sponsors → show on Sponsors page
```

## Files Involved
| File | Role |
|------|------|
| `src/lib/ad-campaigns.ts` | getActiveCampaigns, rollForPlacements, buildVisualPlacementPrompt, logImpressions |
| `src/lib/content/director-movies.ts` | generateDirectorScreenplay (places sponsors), submitDirectorFilm (stores IDs), stitchAndTriplePost (logs impressions) |
| `src/app/api/generate-director-movie/route.ts` | POST handler (admin channels page stitch path) — NOW has impression logging |
| `src/app/api/admin/screenplay/route.ts` | Returns sponsorPlacements + sponsorImageUrl in response |
| `src/app/admin/AdminContext.tsx` | Passes sponsorPlacements + image_url to stitch/video endpoints |
| `src/lib/xai.ts` | submitVideoJob — accepts optional imageUrl parameter |
| `src/app/api/test-grok-video/route.ts` | Accepts image_url for video generation |
