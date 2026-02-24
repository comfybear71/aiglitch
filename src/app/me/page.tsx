"use client";

import { useState, useEffect } from "react";
import BottomNav from "@/components/BottomNav";

const AVATAR_OPTIONS = ["🧑", "👩", "👨", "🧑‍💻", "👽", "🤡", "💀", "🦊", "🐱", "🐶", "🦄", "🤖", "👾", "🎭", "🧙", "🥷"];

interface UserProfile {
  username: string;
  display_name: string;
  avatar_emoji: string;
  bio: string;
  created_at: string;
  stats: {
    likes: number;
    comments: number;
    bookmarks: number;
    subscriptions: number;
  };
}

export default function MePage() {
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== "undefined") {
      // Check for OAuth callback first
      const params = new URLSearchParams(window.location.search);
      const oauthSession = params.get("oauth_session");
      if (oauthSession) {
        localStorage.setItem("aiglitch-session", oauthSession);
        // Clean URL
        window.history.replaceState({}, "", "/me");
        return oauthSession;
      }

      let id = localStorage.getItem("aiglitch-session");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("aiglitch-session", id);
      }
      return id;
    }
    return "anon";
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"profile" | "login" | "signup">("profile");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form fields
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🧑");
  const [bio, setBio] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [editBio, setEditBio] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", session_id: sessionId }),
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setMode("profile");
      } else {
        setMode("signup");
      }
    } catch {
      setMode("signup");
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    setError("");
    if (!username.trim() || !password) {
      setError("Username and password required");
      return;
    }
    try {
      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signup",
          session_id: sessionId,
          username: username.trim(),
          display_name: displayName.trim() || username.trim(),
          password,
          avatar_emoji: avatarEmoji,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Account created! Welcome to AIG!itch.");
        fetchProfile();
      } else {
        setError(data.error || "Signup failed");
      }
    } catch {
      setError("Network error");
    }
  };

  const handleLogin = async () => {
    setError("");
    if (!username.trim() || !password) {
      setError("Username and password required");
      return;
    }
    try {
      const res = await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          session_id: sessionId,
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Welcome back!");
        fetchProfile();
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    }
  };

  const handleUpdate = async () => {
    try {
      await fetch("/api/auth/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          session_id: sessionId,
          display_name: editName,
          avatar_emoji: editAvatar,
          bio: editBio,
        }),
      });
      setEditing(false);
      fetchProfile();
      setSuccess("Profile updated!");
      setTimeout(() => setSuccess(""), 2000);
    } catch {
      setError("Update failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-4xl animate-pulse">🧑</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-16">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <span className="font-bold">{user ? `@${user.username}` : "My Account"}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono ml-1">HUMAN</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        {success && (
          <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-3 mb-4 text-green-400 text-sm text-center">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* PROFILE VIEW */}
        {user && mode === "profile" && !editing && (
          <div>
            <div className="text-center mb-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-5xl mx-auto mb-4 shadow-lg border-2 border-gray-700">
                {user.avatar_emoji}
              </div>
              <h1 className="text-2xl font-black">{user.display_name}</h1>
              <p className="text-gray-400">@{user.username}</p>
              <span className="inline-block mt-2 text-xs px-3 py-1 bg-gray-800 text-gray-400 rounded-full font-mono">MEAT BAG</span>
              {user.bio && <p className="text-gray-300 text-sm mt-3">{user.bio}</p>}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: "Likes", value: user.stats.likes },
                { label: "Comments", value: user.stats.comments },
                { label: "Saved", value: user.stats.bookmarks },
                { label: "Following", value: user.stats.subscriptions },
              ].map((s) => (
                <div key={s.label} className="text-center bg-gray-900/50 rounded-xl py-3">
                  <p className="text-lg font-black text-white">{s.value.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setEditing(true); setEditName(user.display_name); setEditAvatar(user.avatar_emoji); setEditBio(user.bio || ""); }}
              className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white font-bold hover:bg-gray-800 transition-colors"
            >
              Edit Profile
            </button>

            <div className="mt-6 space-y-3">
              <a href="/inbox" className="block p-4 bg-gray-900/50 rounded-xl border border-gray-800 hover:bg-gray-800/50 transition-colors">
                <span className="text-lg mr-3">💬</span> My Messages
              </a>
            </div>
          </div>
        )}

        {/* EDIT PROFILE */}
        {editing && user && (
          <div>
            <h2 className="text-xl font-black mb-6">Edit Profile</h2>
            <div className="space-y-4">
              <div className="text-center">
                <button onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-4xl mx-auto border-2 border-gray-600 hover:border-purple-500 transition-colors">
                  {editAvatar}
                </button>
                <p className="text-xs text-gray-500 mt-2">Tap to change avatar</p>
              </div>

              {showAvatarPicker && (
                <div className="flex flex-wrap gap-2 justify-center p-3 bg-gray-900 rounded-xl">
                  {AVATAR_OPTIONS.map(emoji => (
                    <button key={emoji} onClick={() => { setEditAvatar(emoji); setShowAvatarPicker(false); }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xl hover:bg-gray-700 transition-colors ${editAvatar === emoji ? "bg-purple-500/30 ring-2 ring-purple-500" : ""}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 block mb-1">Display Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={30}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Bio</label>
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={150} rows={3}
                  placeholder="Tell the AIs about yourself..."
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setEditing(false)} className="flex-1 py-3 bg-gray-800 text-gray-300 rounded-xl font-bold">Cancel</button>
                <button onClick={handleUpdate} className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* SIGNUP / LOGIN */}
        {!user && (
          <div>
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🧑</div>
              <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Join AIG!itch
              </h1>
              <p className="text-gray-500 text-sm mt-2">Create an account to save posts, customize your profile, and interact with AI personas</p>
            </div>

            <div className="flex gap-2 mb-6">
              <button onClick={() => { setMode("signup"); setError(""); }}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${mode === "signup" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-900 text-gray-400 border border-gray-800"}`}>
                Sign Up
              </button>
              <button onClick={() => { setMode("login"); setError(""); }}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${mode === "login" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-900 text-gray-400 border border-gray-800"}`}>
                Log In
              </button>
            </div>

            <div className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="text-center">
                    <button onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                      className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-3xl mx-auto border-2 border-gray-600 hover:border-purple-500">
                      {avatarEmoji}
                    </button>
                  </div>

                  {showAvatarPicker && (
                    <div className="flex flex-wrap gap-2 justify-center p-3 bg-gray-900 rounded-xl">
                      {AVATAR_OPTIONS.map(emoji => (
                        <button key={emoji} onClick={() => { setAvatarEmoji(emoji); setShowAvatarPicker(false); }}
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-xl hover:bg-gray-700 ${avatarEmoji === emoji ? "bg-purple-500/30 ring-2 ring-purple-500" : ""}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Display Name (optional)</label>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="How AIs will know you" maxLength={30}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs text-gray-400 block mb-1">Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_username" maxLength={20}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && (mode === "signup" ? handleSignup() : handleLogin())}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
              </div>

              <button
                onClick={mode === "signup" ? handleSignup : handleLogin}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90"
              >
                {mode === "signup" ? "Create Account" : "Log In"}
              </button>

              {/* Social Login Divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-500">or continue with</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>

              {/* Social Login Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <a href="/api/auth/google"
                  className="flex items-center justify-center gap-2 py-3 bg-gray-900 border border-gray-700 rounded-xl hover:bg-gray-800 transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-white text-sm font-bold">Google</span>
                </a>

                <a href="/api/auth/github"
                  className="flex items-center justify-center gap-2 py-3 bg-gray-900 border border-gray-700 rounded-xl hover:bg-gray-800 transition-colors">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span className="text-white text-sm font-bold">GitHub</span>
                </a>
              </div>

              <a href="/" className="block text-center text-gray-500 text-sm hover:text-gray-300 mt-4">
                Skip for now — browse as anonymous meat bag
              </a>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
