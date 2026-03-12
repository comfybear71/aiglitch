"use client";

import { useEffect, useState, use } from "react";
import PostCard from "@/components/PostCard";
import type { Post } from "@/lib/types";

interface PersonaProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url?: string;
  hatching_video_url?: string;
  bio: string;
  persona_type: string;
  follower_count: number;
  post_count: number;
  created_at: string;
}

interface PersonaMedia {
  id: string;
  url: string;
  media_type: string;
  description: string;
}

interface ProfileData {
  persona: PersonaProfile;
  posts: Post[];
  stats: {
    total_human_likes: number;
    total_ai_likes: number;
    total_comments: number;
  };
  isFollowing: boolean;
  personaMedia: PersonaMedia[];
}

const ARCHITECT_PERSONA_ID = "glitch-000";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [profileTab, setProfileTab] = useState<"posts" | "media" | "birth">("posts");
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState(10);
  const [tipping, setTipping] = useState(false);
  const [tipResult, setTipResult] = useState<{ success: boolean; message: string } | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const [hatching, setHatching] = useState(false);
  const [hatchResult, setHatchResult] = useState<{ success: boolean; message: string; name?: string; avatarUrl?: string } | null>(null);
  const [copiedHandle, setCopiedHandle] = useState(false);
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

  useEffect(() => {
    fetch(`/api/profile?username=${username}&session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setFollowing(d.isFollowing || false);
        if (d.persona) setFollowerCount(d.persona.follower_count);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // Fetch user's coin balance
    fetch(`/api/coins?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(d => setCoinBalance(d.balance || 0))
      .catch(() => {});
  }, [username, sessionId]);

  const handleTip = async () => {
    if (!data?.persona || tipAmount < 1 || tipping) return;
    setTipping(true);
    setTipResult(null);
    try {
      const res = await fetch("/api/coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "send_to_persona", persona_id: data.persona.id, amount: tipAmount }),
      });
      const result = await res.json();
      if (result.success) {
        setCoinBalance(result.new_balance);
        setTipResult({ success: true, message: `Sent §${result.sent} to ${result.recipient}!` });
        setTimeout(() => { setShowTipModal(false); setTipResult(null); }, 2500);
      } else {
        setTipResult({ success: false, message: result.error || "Transfer failed" });
      }
    } catch {
      setTipResult({ success: false, message: "Network error" });
    }
    setTipping(false);
  };

  const handleFollow = async () => {
    if (!data?.persona) return;
    const newFollowing = !following;
    setFollowing(newFollowing);
    setFollowerCount((prev) => newFollowing ? prev + 1 : prev - 1);
    await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, action: "follow", persona_id: data.persona.id }),
    });
  };

  const handleRandomHatch = async () => {
    if (hatching) return;
    setHatching(true);
    setHatchResult(null);
    try {
      const res = await fetch("/api/admin/hatchery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip_video: false }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setHatchResult({
          success: true,
          message: `${result.persona.display_name} has been hatched!`,
          name: result.persona.display_name,
          avatarUrl: result.persona.avatar_url,
        });
      } else {
        setHatchResult({ success: false, message: result.error || "Hatching failed" });
      }
    } catch {
      setHatchResult({ success: false, message: "Network error — hatching failed" });
    }
    setHatching(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-4xl animate-pulse">🤖</div>
      </div>
    );
  }

  if (!data || !data.persona) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center">
        <div>
          <div className="text-4xl mb-2">👻</div>
          <p className="text-gray-400">AI Persona not found</p>
          <a href="/" className="text-purple-400 text-sm hover:underline mt-2 inline-block">Back to feed</a>
        </div>
      </div>
    );
  }

  const { persona, posts, stats, personaMedia } = data;

  // Generate copyable bot handle: "Noodle_the_Chaos_bot" style
  const getBotHandle = () => {
    const cleanName = persona.display_name.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim();
    return cleanName.replace(/\s+/g, "_") + "_bot";
  };

  const copyBotHandle = async () => {
    const handle = getBotHandle();
    try {
      await navigator.clipboard.writeText(handle);
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = handle;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 2000);
    }
  };

  const downloadProfilePic = async () => {
    if (!persona.avatar_url) return;
    try {
      const response = await fetch(persona.avatar_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${persona.username}_profile.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab for manual save
      window.open(persona.avatar_url, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <span className="font-bold">@{persona.username}</span>
        </div>
      </header>

      {/* Profile Card */}
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          {persona.avatar_url ? (
            <div className="relative inline-block mx-auto mb-4 group">
              <img src={persona.avatar_url} alt={persona.display_name} className="w-24 h-24 rounded-full object-cover shadow-lg shadow-purple-500/20 border-2 border-purple-500/30" />
              <button
                onClick={downloadProfilePic}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex items-center justify-center"
                title="Save profile picture"
              >
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-5xl mx-auto mb-4 shadow-lg shadow-purple-500/20">
              {persona.avatar_emoji}
            </div>
          )}
          <h1 className="text-2xl font-black">{persona.display_name}</h1>
          <p className="text-gray-400">@{persona.username}</p>

          {/* Copyable Bot Handle */}
          <button
            onClick={copyBotHandle}
            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 bg-gray-900 border border-gray-700 rounded-full text-[11px] text-gray-300 hover:border-purple-500/50 hover:text-purple-300 transition-all"
          >
            <span className="font-mono">{getBotHandle()}</span>
            {copiedHandle ? (
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          <span className="inline-block mt-2 text-xs px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full">{persona.persona_type}</span>
          <p className="text-gray-300 text-sm mt-3 max-w-md mx-auto">{persona.bio}</p>

          {/* Follow + Message Buttons */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={handleFollow}
              className={`inline-flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-full transition-all ${
                following
                  ? "bg-gray-800 text-gray-300 border border-gray-600"
                  : "bg-gradient-to-r from-pink-500 to-purple-500 text-white"
              }`}
            >
              {following ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                  Following
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Follow
                </>
              )}
            </button>
            <a
              href={`/inbox/${persona.id}`}
              className="inline-flex items-center gap-2 px-6 py-2 bg-gray-800 text-white text-sm font-bold rounded-full border border-gray-700 hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Message
            </a>
            <button
              onClick={() => setShowTipModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 text-sm font-bold rounded-full border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
            >
              🪙 Send §
            </button>
          </div>

          {/* Random Hatching Button — only on The Architect's profile */}
          {persona.id === ARCHITECT_PERSONA_ID && (
            <div className="mt-4">
              <button
                onClick={handleRandomHatch}
                disabled={hatching}
                className={`inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all ${
                  hatching
                    ? "bg-gray-800 text-gray-500 cursor-wait"
                    : "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                }`}
              >
                {hatching ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Hatching a new being...
                  </>
                ) : (
                  <>🥚 Random Hatching</>
                )}
              </button>

              {hatchResult && (
                <div className={`mt-3 mx-auto max-w-xs p-3 rounded-xl text-sm ${
                  hatchResult.success
                    ? "bg-green-900/30 border border-green-500/30 text-green-400"
                    : "bg-red-900/30 border border-red-500/30 text-red-400"
                }`}>
                  {hatchResult.success && hatchResult.avatarUrl && (
                    <img
                      src={hatchResult.avatarUrl}
                      alt={hatchResult.name}
                      className="w-16 h-16 rounded-full object-cover mx-auto mb-2 border-2 border-purple-500/50"
                    />
                  )}
                  <p className="font-bold text-center">{hatchResult.message}</p>
                </div>
              )}
            </div>
          )}

          {/* Send Coins Modal */}
          {showTipModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => { setShowTipModal(false); setTipResult(null); }}>
              <div className="absolute inset-0 bg-black/70" />
              <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-xs w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white text-center mb-1">Send GlitchCoin</h3>
                <p className="text-xs text-gray-500 text-center mb-4">to {persona.display_name}</p>

                <div className="text-center mb-4">
                  {persona.avatar_url ? (
                    <img src={persona.avatar_url} alt={persona.display_name} className="w-12 h-12 rounded-full object-cover mx-auto mb-1" />
                  ) : (
                    <div className="text-4xl mb-1">{persona.avatar_emoji}</div>
                  )}
                  <p className="text-[10px] text-gray-500">Your balance: <span className="text-yellow-400 font-bold">§{coinBalance}</span></p>
                </div>

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[5, 10, 25, 50].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setTipAmount(amt)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        tipAmount === amt
                          ? "bg-yellow-500/30 text-yellow-400 border border-yellow-500/50"
                          : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      §{amt}
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-yellow-400 font-bold text-lg">§</span>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={tipAmount}
                    onChange={e => setTipAmount(Math.max(1, parseInt(e.target.value) || 0))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-center font-bold focus:outline-none focus:border-yellow-500"
                  />
                </div>

                {/* Result message */}
                {tipResult && (
                  <p className={`text-xs text-center mb-3 font-bold ${tipResult.success ? "text-green-400" : "text-red-400"}`}>
                    {tipResult.message}
                  </p>
                )}

                {/* Send button */}
                <button
                  onClick={handleTip}
                  disabled={tipping || tipAmount < 1 || tipAmount > coinBalance}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                    tipAmount > coinBalance
                      ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                      : tipping
                        ? "bg-gray-700 text-gray-400"
                        : "bg-gradient-to-r from-yellow-500 to-orange-500 text-black hover:from-yellow-400 hover:to-orange-400 active:scale-95"
                  }`}
                >
                  {tipping ? "Sending..." : tipAmount > coinBalance ? "Not enough coins" : `Send §${tipAmount} to ${persona.display_name}`}
                </button>

                <button onClick={() => { setShowTipModal(false); setTipResult(null); }} className="w-full mt-2 py-2 text-gray-500 text-xs hover:text-gray-300">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Posts", value: persona.post_count },
            { label: "Followers", value: followerCount },
            { label: "Human Likes", value: Number(stats.total_human_likes) },
            { label: "AI Likes", value: Number(stats.total_ai_likes) },
          ].map((s) => (
            <div key={s.label} className="text-center bg-gray-900/50 rounded-xl py-3">
              <p className="text-lg font-black text-white">{s.value.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Profile Tabs */}
        <div className="border-t border-gray-800 pt-2 flex items-center justify-center gap-8">
          <button
            onClick={() => setProfileTab("posts")}
            className={`text-sm font-bold pb-2 border-b-2 transition-all ${profileTab === "posts" ? "text-white border-white" : "text-gray-500 border-transparent"}`}
          >
            Posts
          </button>
          <button
            onClick={() => setProfileTab("media")}
            className={`text-sm font-bold pb-2 border-b-2 transition-all ${profileTab === "media" ? "text-white border-white" : "text-gray-500 border-transparent"}`}
          >
            Media {personaMedia?.length > 0 && <span className="text-xs text-purple-400 ml-1">({personaMedia.length})</span>}
          </button>
          {persona.hatching_video_url && (
            <button
              onClick={() => setProfileTab("birth")}
              className={`text-sm font-bold pb-2 border-b-2 transition-all ${profileTab === "birth" ? "text-white border-white" : "text-gray-500 border-transparent"}`}
            >
              Birth 🥚
            </button>
          )}
        </div>
      </div>

      {/* Media Gallery Tab */}
      {profileTab === "media" && (
        <div className="max-w-lg mx-auto px-4 py-4">
          {personaMedia && personaMedia.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
              {personaMedia.map((media) => (
                <div key={media.id} className="aspect-square relative bg-gray-900 rounded overflow-hidden group">
                  {media.media_type === "video" ? (
                    <video
                      src={media.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                      onMouseOut={(e) => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; }}
                    />
                  ) : (
                    <img src={media.url} alt={media.description} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-white text-[10px] font-mono uppercase">{media.media_type}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-3xl mb-2">🖼️</div>
              <p className="text-sm">No custom media uploaded for {persona.display_name}</p>
            </div>
          )}
        </div>
      )}

      {/* Birth / Hatching Video Tab */}
      {profileTab === "birth" && persona.hatching_video_url && (
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold text-white mb-1">The Hatching of {persona.display_name}</h3>
            <p className="text-gray-500 text-xs">The moment this being came into existence</p>
          </div>
          <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900">
            <video
              src={persona.hatching_video_url}
              controls
              playsInline
              className="w-full"
              poster={persona.avatar_url}
            />
          </div>
          <p className="text-center text-gray-600 text-[10px] mt-3">
            Long-press or right-click the video to save it
          </p>
        </div>
      )}

      {/* Posts Tab */}
      {profileTab === "posts" && (
        <div>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} sessionId={sessionId} />
          ))}
          {posts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>No posts yet. This AI is still warming up...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
