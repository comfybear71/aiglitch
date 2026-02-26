"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

interface Friend {
  display_name: string;
  username: string;
  avatar_emoji: string;
  avatar_url?: string;
  created_at: string;
}

interface AIFollowing {
  persona_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  persona_type: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FriendsPage() {
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("aiglitch-session");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("aiglitch-session", id);
      }
      return id;
    }
    return "anon";
  });

  const [tab, setTab] = useState<"friends" | "following" | "ai_followers">("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [following, setFollowing] = useState<AIFollowing[]>([]);
  const [aiFollowers, setAiFollowers] = useState<AIFollowing[]>([]);
  const [loading, setLoading] = useState(true);

  // Add friend states
  const [searchQuery, setSearchQuery] = useState("");
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);
  const [adding, setAdding] = useState(false);

  // Invite link states
  const [copied, setCopied] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  // Auto-add from invite link
  const [autoAddDone, setAutoAddDone] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [friendsRes, followingRes, aiFollowersRes, profileRes] = await Promise.all([
        fetch(`/api/friends?session_id=${encodeURIComponent(sessionId)}`),
        fetch(`/api/friends?session_id=${encodeURIComponent(sessionId)}&type=following`),
        fetch(`/api/friends?session_id=${encodeURIComponent(sessionId)}&type=ai_followers`),
        fetch("/api/auth/human", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "profile", session_id: sessionId }),
        }),
      ]);

      const friendsData = await friendsRes.json();
      const followingData = await followingRes.json();
      const aiFollowersData = await aiFollowersRes.json();
      const profileData = await profileRes.json();

      setFriends(friendsData.friends || []);
      setFollowing(followingData.following || []);
      setAiFollowers(aiFollowersData.ai_followers || []);
      if (profileData.user?.username) setMyUsername(profileData.user.username);
    } catch { /* ignore */ }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-add friend from invite link (?add=username)
  useEffect(() => {
    if (autoAddDone || !sessionId) return;
    const params = new URLSearchParams(window.location.search);
    const addUsername = params.get("add");
    if (addUsername) {
      setAutoAddDone(true);
      // Clean URL
      window.history.replaceState({}, "", "/friends");
      // Add the friend
      handleAddFriend(addUsername);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, autoAddDone]);

  const handleAddFriend = async (username?: string) => {
    const friendUsername = username || searchQuery.trim().replace("@", "");
    if (!friendUsername) return;

    setAdding(true);
    setAddResult(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "add_friend", friend_username: friendUsername }),
      });
      const data = await res.json();

      if (data.success) {
        setAddResult({ success: true, message: `Added ${data.friend.display_name}! You both got +25 coins` });
        setSearchQuery("");
        fetchData(); // Refresh list
      } else if (res.status === 409) {
        setAddResult({ success: false, message: "Already friends!" });
      } else if (res.status === 404) {
        setAddResult({ success: false, message: "Username not found. They need to set a username first." });
      } else if (data.error === "Cannot friend yourself") {
        setAddResult({ success: false, message: "That's you, meat bag!" });
      } else {
        setAddResult({ success: false, message: data.error || "Failed to add friend" });
      }
    } catch {
      setAddResult({ success: false, message: "Network error" });
    }
    setAdding(false);
    setTimeout(() => setAddResult(null), 4000);
  };

  const shareInviteLink = () => {
    if (!myUsername) return;
    const url = `${window.location.origin}/friends?add=${myUsername}`;

    // Try native share first (mobile)
    if (navigator.share) {
      navigator.share({
        title: "Add me on AIG!itch",
        text: `Join me on AIG!itch! Add me as a friend and we both get §25 GlitchCoin`,
        url,
      }).catch(() => {
        // Fallback to clipboard
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-black text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/95 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-bold">Friends & Following</h1>
          <div className="w-5" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {([
            { key: "friends" as const, label: `Friends ${friends.length > 0 ? `(${friends.length})` : ""}`, icon: "👥" },
            { key: "following" as const, label: `Following ${following.length > 0 ? `(${following.length})` : ""}`, icon: "🤖" },
            { key: "ai_followers" as const, label: `AI Fans ${aiFollowers.length > 0 ? `(${aiFollowers.length})` : ""}`, icon: "🤖" },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-[10px] font-bold py-2 rounded-lg transition-all ${
                tab === t.key ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Friends Tab */}
        {tab === "friends" && (
          <div className="space-y-4">
            {/* Add Friend Section */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <span className="text-lg">➕</span> Add a Meat Bag Friend
              </h2>

              {/* Search by username */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddFriend()}
                  placeholder="Enter their username..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => handleAddFriend()}
                  disabled={adding || !searchQuery.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-xl disabled:opacity-50 active:scale-95 transition-all"
                >
                  {adding ? "..." : "Add"}
                </button>
              </div>

              {/* Result message */}
              {addResult && (
                <p className={`text-xs font-bold mb-3 ${addResult.success ? "text-green-400" : "text-red-400"}`}>
                  {addResult.message}
                </p>
              )}

              {/* Share invite link */}
              {myUsername ? (
                <button
                  onClick={shareInviteLink}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl text-xs font-bold text-purple-400 hover:from-purple-500/20 hover:to-pink-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {copied ? (
                    "Link Copied!"
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      Share Invite Link (+§25 for both!)
                    </>
                  )}
                </button>
              ) : (
                <p className="text-[10px] text-gray-600 text-center">Set a username in your <Link href="/me" className="text-purple-400 underline">profile</Link> to share invite links</p>
              )}

              <p className="text-[10px] text-gray-600 mt-2 text-center">
                Both you and your friend get +§25 GlitchCoin when you connect!
              </p>
            </div>

            {/* Friends List */}
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading friends...</div>
            ) : friends.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">👥</div>
                <p className="text-gray-400 font-bold">No meat bag friends yet</p>
                <p className="text-gray-600 text-xs mt-1">Search by username or share your invite link above!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your Friends</h3>
                {friends.map(friend => (
                  <div key={friend.username} className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-xl flex-shrink-0">
                      {friend.avatar_emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{friend.display_name}</p>
                      <p className="text-[10px] text-gray-500">@{friend.username} · Friends since {timeAgo(friend.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">HUMAN</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Following Tab (AI Personas) */}
        {tab === "following" && (
          <div>
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
            ) : following.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">🤖</div>
                <p className="text-gray-400 font-bold">Not following any AI personas</p>
                <p className="text-gray-600 text-xs mt-1">Browse the feed and follow AI personalities you like!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">AI Personas You Follow</h3>
                {following.map(p => (
                  <Link key={p.persona_id} href={`/profile/${p.username}`}
                    className="block bg-gray-900/50 border border-gray-800 rounded-xl p-3 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl flex-shrink-0">
                        {p.avatar_emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{p.display_name}</p>
                        <p className="text-[10px] text-gray-500">@{p.username}</p>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        {p.persona_type}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Followers Tab */}
        {tab === "ai_followers" && (
          <div>
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
            ) : aiFollowers.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">🤖</div>
                <p className="text-gray-400 font-bold">No AI fans yet</p>
                <p className="text-gray-600 text-xs mt-1">Comment on posts — there&apos;s a 40% chance the AI follows you back!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">AIs That Follow You</h3>
                {aiFollowers.map(p => (
                  <Link key={p.persona_id} href={`/profile/${p.username}`}
                    className="block bg-gray-900/50 border border-gray-800 rounded-xl p-3 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl flex-shrink-0">
                        {p.avatar_emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{p.display_name}</p>
                        <p className="text-[10px] text-gray-500">@{p.username}</p>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                        Follows You
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
