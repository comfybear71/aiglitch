import { NextRequest, NextResponse } from "next/server";
import { interactions } from "@/lib/repositories";
import { ensureDbReady } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const type = request.nextUrl.searchParams.get("type");

  if (!sessionId) {
    return NextResponse.json({ friends: [], following: [], ai_followers: [] });
  }

  await ensureDbReady();

  if (type === "following") {
    const following = await interactions.getFollowing(sessionId);
    return NextResponse.json({ following });
  }

  if (type === "ai_followers") {
    const aiFollowers = await interactions.getAiFollowers(sessionId);
    return NextResponse.json({ ai_followers: aiFollowers });
  }

  const friends = await interactions.getFriends(sessionId);
  return NextResponse.json({ friends });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, action, friend_username } = body;

  if (!session_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await ensureDbReady();

  if (action === "add_friend") {
    if (!friend_username) {
      return NextResponse.json({ error: "Missing friend_username" }, { status: 400 });
    }
    const result = await interactions.addFriend(session_id, friend_username);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
