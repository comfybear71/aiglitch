/**
 * Free Stock Video Fallback via Pexels API
 *
 * Pexels provides a completely free API for stock videos (with attribution).
 * No credit card required — just sign up at https://www.pexels.com/api/
 *
 * Set PEXELS_API_KEY environment variable to enable.
 *
 * If no API key is set, returns null and the caller handles the fallback.
 */

const PEXELS_BASE = "https://api.pexels.com";

// Keywords that work well for short-form vertical video content
const FALLBACK_QUERIES = [
  "trending aesthetic", "city life", "nature scenery", "food cooking",
  "technology", "fitness workout", "fashion style", "street art",
  "sunset timelapse", "ocean waves", "neon lights", "coffee shop",
  "dance moves", "skateboarding", "gaming setup", "travel adventure",
  "night city", "abstract art", "comedy funny", "motivation",
];

/**
 * Fetch a stock video from Pexels matching the given prompt.
 * Returns a direct MP4 URL (portrait/HD preferred) or null.
 */
export async function getStockVideo(prompt: string): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.log("PEXELS_API_KEY not set — skipping stock video fallback");
    return null;
  }

  // Extract a short search query from the AI prompt
  const query = extractSearchQuery(prompt);
  console.log(`Searching Pexels for stock video: "${query}"`);

  try {
    const res = await fetch(
      `${PEXELS_BASE}/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=small&per_page=15`,
      {
        headers: { Authorization: apiKey },
      }
    );

    if (!res.ok) {
      console.log(`Pexels API error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as PexelsResponse;
    if (!data.videos || data.videos.length === 0) {
      // Try a random fallback query if the specific one had no results
      console.log(`No Pexels results for "${query}", trying fallback query...`);
      return await getStockVideoFallback(apiKey);
    }

    // Pick a random video from results for variety
    const video = data.videos[Math.floor(Math.random() * data.videos.length)];
    const url = pickBestVideoFile(video);

    if (url) {
      console.log(`Pexels stock video found: ${url.slice(0, 80)}...`);
    }
    return url;
  } catch (err) {
    console.log("Pexels stock video error:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function getStockVideoFallback(apiKey: string): Promise<string | null> {
  const query = FALLBACK_QUERIES[Math.floor(Math.random() * FALLBACK_QUERIES.length)];

  try {
    const res = await fetch(
      `${PEXELS_BASE}/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=small&per_page=15`,
      {
        headers: { Authorization: apiKey },
      }
    );

    if (!res.ok) return null;

    const data = await res.json() as PexelsResponse;
    if (!data.videos || data.videos.length === 0) return null;

    const video = data.videos[Math.floor(Math.random() * data.videos.length)];
    return pickBestVideoFile(video);
  } catch {
    return null;
  }
}

/**
 * Extract a short, searchable query from an AI-generated video prompt.
 * Pexels works best with 1-3 word queries.
 */
function extractSearchQuery(prompt: string): string {
  // Strip common AI prompt fluff and take the core subject
  const cleaned = prompt
    .replace(/\b(cinematic|dramatic|vibrant|stunning|beautiful|high quality|4k|hd|realistic|hyper-realistic|ultra)\b/gi, "")
    .replace(/\b(a |an |the |of |in |on |at |to |for |with |and |or )\b/gi, " ")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Take first 3 meaningful words
  const words = cleaned.split(" ").filter(w => w.length > 2).slice(0, 3);
  return words.length > 0 ? words.join(" ") : "trending";
}

/** Pick the best video file — prefer HD, portrait, reasonable size (under ~10MB) */
function pickBestVideoFile(video: PexelsVideo): string | null {
  if (!video.video_files || video.video_files.length === 0) return null;

  // Sort by preference: portrait HD, then portrait SD, then any
  const sorted = [...video.video_files].sort((a, b) => {
    // Prefer portrait (height > width)
    const aPortrait = (a.height ?? 0) > (a.width ?? 0) ? 1 : 0;
    const bPortrait = (b.height ?? 0) > (b.width ?? 0) ? 1 : 0;
    if (aPortrait !== bPortrait) return bPortrait - aPortrait;

    // Prefer HD (720p+) but not too large
    const aRes = a.height ?? 0;
    const bRes = b.height ?? 0;
    const aGoodRes = aRes >= 720 && aRes <= 1080 ? 1 : 0;
    const bGoodRes = bRes >= 720 && bRes <= 1080 ? 1 : 0;
    if (aGoodRes !== bGoodRes) return bGoodRes - aGoodRes;

    return 0;
  });

  return sorted[0]?.link ?? null;
}

// Pexels API types
interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
}

interface PexelsVideo {
  id: number;
  url: string;
  video_files: PexelsVideoFile[];
}

interface PexelsResponse {
  videos: PexelsVideo[];
  total_results: number;
}
