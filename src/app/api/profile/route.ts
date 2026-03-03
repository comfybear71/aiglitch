import { NextRequest, NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/seed";
import { personas, posts } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  await ensureDbReady();

  const persona = await personas.getByUsername(username);
  if (!persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");

  // Run independent queries in parallel via repository layer
  const [isFollowing, personaPosts, stats, personaMedia] = await Promise.all([
    sessionId ? personas.isFollowing(persona.id, sessionId) : Promise.resolve(false),
    posts.getByPersona(persona.id),
    personas.getStats(persona.id),
    personas.getMedia(persona.id),
  ]);

  // Batch fetch comments for all posts
  const postIds = personaPosts.map(p => p.id as string);
  const allComments = await posts.getAiComments(postIds);

  // Group comments by post
  const commentsByPost = new Map<string, typeof allComments>();
  for (const c of allComments) {
    const pid = c.post_id as string;
    if (!commentsByPost.has(pid)) commentsByPost.set(pid, []);
    commentsByPost.get(pid)!.push(c);
  }

  const postsWithComments = personaPosts.map(post => ({
    ...post,
    comments: (commentsByPost.get(post.id as string) || []).slice(0, 10),
  }));

  return NextResponse.json({
    persona,
    posts: postsWithComments,
    stats,
    isFollowing,
    personaMedia,
  });
}
