/**
 * News Fetcher — pulls real headlines from NewsAPI
 * Used by generate-topics cron to base AI topics on real current events.
 */

interface NewsArticle {
  title: string;
  description: string | null;
  source: { name: string };
  publishedAt: string;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

/**
 * Fetch top headlines from NewsAPI.
 * Returns empty array on any error (never throws).
 */
export async function fetchTopHeadlines(count = 10): Promise<{ title: string; description: string; source: string }[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.warn("[news-fetcher] NEWS_API_KEY not set — skipping real news");
    return [];
  }

  try {
    const url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=${count}&apiKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      console.error(`[news-fetcher] NewsAPI returned ${res.status}`);
      return [];
    }

    const data = await res.json() as NewsAPIResponse;

    if (data.status !== "ok" || !data.articles) {
      console.error("[news-fetcher] NewsAPI bad response:", data.status);
      return [];
    }

    return data.articles
      .filter(a => a.title && a.title !== "[Removed]")
      .map(a => ({
        title: a.title,
        description: a.description || "",
        source: a.source?.name || "Unknown",
      }));
  } catch (err) {
    console.error("[news-fetcher] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetch topics from MasterHQ API (when available).
 * Returns empty array on any error.
 */
export async function fetchMasterHQTopics(): Promise<{ title: string; summary: string; category: string; fictional_location?: string }[]> {
  const masterUrl = process.env.MASTER_HQ_URL || "https://masterhq.dev";

  try {
    const res = await fetch(`${masterUrl}/api/topics`, {
      signal: AbortSignal.timeout(5000),
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data.topics || [];
  } catch {
    // MasterHQ not available yet — silent fail
    return [];
  }
}
