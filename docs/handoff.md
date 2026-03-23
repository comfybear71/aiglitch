# Handoff Notes

## Grok Video Extension / 30s Chaining (March 2026)

Grok's `grok-imagine-video` API generates 6–10 second clips. There is **no native 30s generation** — longer videos require **manual chaining** via last-frame continuation. This is how the consumer Grok app's "Extend" feature works under the hood.

### How 30s Video Chaining Works

1. **Generate base clip** (10s) using text-to-video:
   ```
   POST https://api.x.ai/v1/videos/generations
   { model: "grok-imagine-video", prompt: "...", duration: 10, aspect_ratio: "9:16", resolution: "720p" }
   ```

2. **Extract the last frame** from the completed video using ffmpeg:
   ```bash
   ffmpeg -sseof -0.1 -i clip1.mp4 -frames:v 1 -q:v 2 last_frame.jpg
   ```

3. **Generate continuation clip** using image-to-video (init_image = last frame):
   ```
   POST https://api.x.ai/v1/videos/generations
   {
     model: "grok-imagine-video",
     prompt: "Seamless continuation from previous frame: [continuation description]. Maintain identical style, lighting, colors, character design — zero drift, frame-accurate match.",
     init_image: "<base64 or URL of last frame>",
     duration: 10,
     aspect_ratio: "9:16",
     resolution: "720p"
   }
   ```
   **Note:** Check `docs.x.ai/developers/model-capabilities/video/generation` for the exact parameter name — could be `init_image`, `start_frame`, or `image_prompt`.

4. **Repeat steps 2–3** for each additional segment (3 × 10s = 30s total).

5. **Concatenate all clips** using ffmpeg concat demuxer:
   ```bash
   # files.txt:
   # file 'clip1.mp4'
   # file 'clip2.mp4'
   # file 'clip3.mp4'
   ffmpeg -f concat -safe 0 -i files.txt -c copy final_30s.mp4
   ```

### Prompt Engineering for Seamless Continuations

Use this template for every continuation prompt to minimize visual drift:

```
Seamless exact continuation from the final frame: [describe ONLY the new action/motion/camera move].
Maintain perfect character consistency, identical facial expression/pose at start matching end of prior clip,
same lighting/shadows/volumetrics, zero style drift, frame-accurate match, cinematic quality.
[Reuse 2-3 core style descriptors from original prompt briefly].
```

Key locks to add:
- `exact facial features and expression continuity`
- `same exact light sources, shadow angles`
- `treat previous clip as canonical reference — match 1:1`

### Implementation Notes

- **Shorter segments (6–8s) = stronger consistency** at seams vs 10s segments
- Each segment requires its own async Grok job → poll for completion → download → extract frame → submit next
- The whole chain is sequential (each clip depends on the previous one's last frame)
- Total wall-clock time for 30s: ~3–5 minutes (3 segments × 60–90s render each)
- Use Vercel Blob for intermediate clip storage, ffmpeg for concat
- The `maxDuration` on the API route needs to be high enough (300s) or use background processing

### Current State

- **10s ads**: Fully working (plan → submit → poll → persist → post → spread)
- **30s ads**: UI toggle exists ("30s Extended" button) but backend only generates 10s. Needs the chaining pipeline implemented.
- The ad campaign fix (March 23 2026) added proper GET polling + auto-post+spread on completion.

### Grok API Endpoints Reference

- `POST /v1/videos/generations` — Submit video generation job
- `GET /v1/videos/{request_id}` — Poll for completion, returns `{ status, video: { url } }`
- Video statuses: `pending` → `in_progress` → `completed` (or `moderation_failed` / `expired` / `failed`)
