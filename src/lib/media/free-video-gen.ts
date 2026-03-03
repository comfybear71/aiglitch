/**
 * Free / Cheap AI Video Generation
 *
 * Uses Kie.ai's unified API for affordable video generation.
 * - 300 free credits on signup (no credit card required)
 * - Cheapest model: Kling 2.6 text-to-video (~25 credits for 5s 720p)
 * - ~12 free videos with signup credits alone
 *
 * Requires KIE_API_KEY environment variable (get one at https://kie.ai/api-key)
 *
 * Fallback order:
 * 1. Kling 2.6 text-to-video (cheapest, ~$0.125/video)
 * 2. Returns null → caller falls back to Replicate or text-only
 */

const KIE_BASE = "https://api.kie.ai/api/v1";

/**
 * Generate a video using Kie.ai's Kling 2.6 text-to-video model.
 *
 * Flow: POST task → get taskId → poll until success → get video URL
 *
 * @param prompt - Text description of the video scene
 * @param aspectRatio - "9:16" for portrait, "16:9" for landscape, "1:1" for square
 * @returns Video URL string or null if generation failed
 */
export async function generateWithKie(
  prompt: string,
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16",
): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.log("KIE_API_KEY not set — skipping Kie.ai video generation");
    return null;
  }

  console.log("Attempting video generation via Kie.ai (Kling 2.6 text-to-video)...");

  try {
    // Step 1: Submit generation task
    const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "kling-2.6/text-to-video",
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          duration: "5",     // 5 seconds — cheapest option
          sound: false,      // no audio needed
        },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      console.log(`Kie.ai submit failed: HTTP ${createRes.status} — ${text.slice(0, 300)}`);
      return null;
    }

    const createData = await createRes.json();

    // Response format: { code: 200, msg: "success", data: { taskId: "..." } }
    const taskId = createData?.data?.taskId;
    if (!taskId) {
      console.log("Kie.ai returned no taskId:", JSON.stringify(createData).slice(0, 300));
      return null;
    }

    console.log(`Kie.ai task submitted: ${taskId}`);

    // Step 2: Poll for completion (max ~3 minutes with backoff)
    // Video generation typically takes 30-120 seconds
    let delay = 5000; // Start with 5s — video gen is slow
    const maxAttempts = 30; // Up to ~3 minutes total

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, delay));

      const pollRes = await fetch(
        `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        {
          headers: { "Authorization": `Bearer ${apiKey}` },
        }
      );

      if (!pollRes.ok) {
        console.log(`Kie.ai poll failed: HTTP ${pollRes.status}`);
        continue;
      }

      const pollData = await pollRes.json();
      const state = pollData?.data?.state;
      console.log(`Kie.ai poll #${attempt + 1}: state=${state}`);

      if (state === "success") {
        // Extract video URL from resultJson
        // Format: { resultJson: '{"resultUrls":["https://..."]}' }
        try {
          const resultJson = JSON.parse(pollData.data.resultJson || "{}");
          const urls = resultJson.resultUrls || resultJson.result_urls || [];
          if (urls.length > 0) {
            console.log(`Kie.ai video ready: ${urls[0].slice(0, 80)}...`);
            return urls[0];
          }
        } catch {
          // Try alternate response formats
          if (pollData.data.videoUrl) return pollData.data.videoUrl;
          if (pollData.data.url) return pollData.data.url;
        }

        console.log("Kie.ai task succeeded but no video URL found:", JSON.stringify(pollData.data).slice(0, 300));
        return null;
      }

      if (state === "fail" || state === "failed") {
        const failMsg = pollData.data?.failMsg || pollData.data?.failCode || "unknown";
        console.log(`Kie.ai task failed: ${failMsg}`);
        return null;
      }

      // Increase delay up to 8s between polls
      delay = Math.min(delay * 1.2, 8000);
    }

    console.log("Kie.ai: Timed out waiting for video generation");
    return null;
  } catch (err) {
    console.log("Kie.ai video generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}
