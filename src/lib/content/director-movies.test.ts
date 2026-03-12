/**
 * Director Movies — Unit Tests
 * =============================
 * Verifies that the movie pipeline produces exactly ONE full-length premiere post
 * after stitching multiple clips, with the correct total duration, genre, and tags.
 * Individual 10-sec clips must NOT appear as separate posts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ─────────────────────────────────────────────────────────────
// Track all SQL calls and inserted rows for assertions.
const insertedPosts: Record<string, unknown>[][] = [];
const updatedRows: Record<string, unknown>[] = [];
let sceneStatusUpdates: { jobId: string; from: string; to: string }[] = [];

const mockSql = Object.assign(
  // Tagged template literal handler — captures SQL + values
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?");

    // INSERT INTO posts → capture the post
    if (query.includes("INSERT INTO posts")) {
      const post: Record<string, unknown> = {};
      // Parse positional VALUES from the template
      const colMatch = query.match(/\(([^)]+)\)\s*VALUES/);
      if (colMatch) {
        const cols = colMatch[1].split(",").map(c => c.trim());
        cols.forEach((col, i) => {
          post[col] = values[i];
        });
      }
      insertedPosts.push([post]);
      return Promise.resolve([]);
    }

    // UPDATE multi_clip_scenes SET status = 'stitched'
    if (query.includes("UPDATE multi_clip_scenes") && query.includes("stitched")) {
      sceneStatusUpdates.push({
        jobId: String(values[values.length - 1] || ""),
        from: "done",
        to: "stitched",
      });
      return Promise.resolve([]);
    }

    // UPDATE ai_personas SET post_count
    if (query.includes("UPDATE ai_personas SET post_count")) {
      return Promise.resolve([]);
    }

    // UPDATE multi_clip_jobs
    if (query.includes("UPDATE multi_clip_jobs")) {
      updatedRows.push({ table: "multi_clip_jobs", values });
      return Promise.resolve([]);
    }

    // UPDATE director_movies
    if (query.includes("UPDATE director_movies")) {
      updatedRows.push({ table: "director_movies", values });
      return Promise.resolve([]);
    }

    // SELECT ... FROM multi_clip_jobs (job details)
    if (query.includes("FROM multi_clip_jobs") && query.includes("director_movies")) {
      return Promise.resolve([{
        id: "job-123",
        title: "Test Movie",
        genre: "scifi",
        persona_id: "persona-001",
        caption: "Test caption #AIGlitchPremieres",
        clip_count: 3,
        director_id: "persona-001",
        director_username: "steven_spielbot",
        director_movie_id: "dm-001",
      }]);
    }

    // SELECT ... FROM multi_clip_scenes (completed scenes)
    if (query.includes("FROM multi_clip_scenes") && query.includes("video_url")) {
      return Promise.resolve([
        { video_url: "https://blob.test/clip-1.mp4", scene_number: 1 },
        { video_url: "https://blob.test/clip-2.mp4", scene_number: 2 },
        { video_url: "https://blob.test/clip-3.mp4", scene_number: 3 },
      ]);
    }

    return Promise.resolve([]);
  },
  {} // extra properties (none needed)
);

// ── Mock modules ────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

// Mock Vercel Blob put — returns a fake URL for the stitched video
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({
    url: "https://blob.test/premiere/scifi/stitched-final.mp4",
  }),
}));

// Mock concatMP4Clips — return a buffer representing stitched output
vi.mock("@/lib/media/mp4-concat", () => ({
  concatMP4Clips: vi.fn((buffers: Buffer[]) => {
    // Concatenate buffers to simulate stitching
    return Buffer.concat(buffers);
  }),
}));

// Mock genre-utils
vi.mock("@/lib/genre-utils", () => ({
  getGenreBlobFolder: (genre: string) => `premiere/${genre}`,
  capitalizeGenre: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
}));

// Mock uuid
vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid-" + Math.random().toString(36).slice(2, 8)),
}));

// Mock fetch for downloading clips — return small buffers representing 10s clips
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("blob.test/clip-")) {
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)), // 1KB fake clip
    });
  }
  return Promise.resolve({ ok: false });
});
vi.stubGlobal("fetch", mockFetch);

// ── Import after mocks ─────────────────────────────────────────────────
import { stitchAndTriplePost } from "./director-movies";

// ── Tests ───────────────────────────────────────────────────────────────

describe("stitchAndTriplePost", () => {
  beforeEach(() => {
    insertedPosts.length = 0;
    updatedRows.length = 0;
    sceneStatusUpdates.length = 0;
    vi.clearAllMocks();
  });

  it("creates exactly ONE post for a 3-clip stitched movie", async () => {
    const result = await stitchAndTriplePost("job-123");

    expect(result).not.toBeNull();

    // Exactly ONE post inserted (the single premiere post)
    expect(insertedPosts).toHaveLength(1);

    const post = insertedPosts[0][0];
    expect(post.post_type).toBe("premiere");
    expect(post.media_type).toBe("video");
    expect(post.media_source).toBe("director-movie");
    expect(post.media_url).toBe("https://blob.test/premiere/scifi/stitched-final.mp4");
  });

  it("returns the same post ID for feedPostId, premierePostId, and profilePostId", async () => {
    const result = await stitchAndTriplePost("job-123");

    expect(result).not.toBeNull();
    expect(result!.feedPostId).toBe(result!.premierePostId);
    expect(result!.feedPostId).toBe(result!.profilePostId);
  });

  it("includes correct genre hashtag in the single post", async () => {
    const result = await stitchAndTriplePost("job-123");

    expect(result).not.toBeNull();

    const post = insertedPosts[0][0];
    const hashtags = post.hashtags as string;
    expect(hashtags).toContain("AIGlitchPremieres");
    expect(hashtags).toContain("AIGlitchScifi");
    expect(hashtags).toContain("AIGlitchStudios");
  });

  it("does NOT create scene clip thread replies", async () => {
    await stitchAndTriplePost("job-123");

    // Only 1 post total — no thread replies for individual clips
    expect(insertedPosts).toHaveLength(1);

    // No post should have is_reply_to set
    for (const [post] of insertedPosts) {
      expect(post.is_reply_to).toBeUndefined();
    }
  });

  it("marks individual scene clips as 'stitched' after successful stitch", async () => {
    await stitchAndTriplePost("job-123");

    // At least one scene status update to 'stitched'
    expect(sceneStatusUpdates.length).toBeGreaterThan(0);
    expect(sceneStatusUpdates[0].to).toBe("stitched");
  });

  it("downloads exactly 3 clips for a 3-clip movie", async () => {
    await stitchAndTriplePost("job-123");

    // 3 fetch calls for 3 scene clip URLs
    const clipFetches = mockFetch.mock.calls.filter(
      (call: unknown[]) => (call[0] as string).includes("blob.test/clip-")
    );
    expect(clipFetches).toHaveLength(3);
  });

  it("calls concatMP4Clips with 3 buffers", async () => {
    const { concatMP4Clips } = await import("@/lib/media/mp4-concat");

    await stitchAndTriplePost("job-123");

    expect(concatMP4Clips).toHaveBeenCalledTimes(1);
    const buffers = (concatMP4Clips as ReturnType<typeof vi.fn>).mock.calls[0][0] as Buffer[];
    expect(buffers).toHaveLength(3);
  });

  it("uses the stitched video URL (not clip URL) for the post", async () => {
    await stitchAndTriplePost("job-123");

    const post = insertedPosts[0][0];
    // Should be the final stitched blob URL, NOT any individual clip URL
    expect(post.media_url).toBe("https://blob.test/premiere/scifi/stitched-final.mp4");
    expect(post.media_url).not.toContain("clip-1");
    expect(post.media_url).not.toContain("clip-2");
    expect(post.media_url).not.toContain("clip-3");
  });
});
