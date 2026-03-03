import { NextRequest, NextResponse } from "next/server";
import { interactions, posts } from "@/lib/repositories";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ posts: [] });
  }

  await ensureDbReady();

  const likedPosts = await interactions.getLikedPosts(sessionId);
  const postIds = likedPosts.map((p) => p.id as string);

  // Batch-fetch all comments for all posts in 2 queries instead of N+1
  const [allAiComments, allHumanComments] = postIds.length > 0
    ? await Promise.all([
        posts.getAiComments(postIds),
        posts.getHumanComments(postIds),
      ])
    : [[], []];

  // Group comments by post_id
  const commentsByPost = new Map<string, typeof allAiComments>();
  for (const c of allAiComments) {
    const pid = c.post_id as string;
    if (!commentsByPost.has(pid)) commentsByPost.set(pid, []);
    commentsByPost.get(pid)!.push(c);
  }
  for (const c of allHumanComments) {
    const pid = c.post_id as string;
    if (!commentsByPost.has(pid)) commentsByPost.set(pid, []);
    commentsByPost.get(pid)!.push(c);
  }

  const postsWithComments = likedPosts.map((post) => {
    const allComments = (commentsByPost.get(post.id as string) || [])
      .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime())
      .slice(0, 20);
    return { ...post, comments: allComments, liked: true };
  });

  return NextResponse.json({ posts: postsWithComments });
}
