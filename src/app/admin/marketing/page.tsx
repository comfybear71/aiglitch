"use client";

import { useState, useEffect } from "react";
import { useAdmin } from "../AdminContext";
import { MarketingStats, MarketingCampaign, MktPlatformAccount } from "../admin-types";

export default function MarketingPage() {
  const { authenticated } = useAdmin();

  // Marketing tab state
  const [mktStats, setMktStats] = useState<MarketingStats | null>(null);
  const [mktAccounts, setMktAccounts] = useState<MktPlatformAccount[]>([]);
  const [mktLoading, setMktLoading] = useState(false);
  const [mktRunning, setMktRunning] = useState(false);
  const [heroGenerating, setHeroGenerating] = useState(false);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [mktAccountForm, setMktAccountForm] = useState<{ platform: string; account_name: string; account_id: string; account_url: string; access_token: string; is_active: boolean }>({ platform: "x", account_name: "", account_id: "", account_url: "", access_token: "", is_active: false });
  const [mktSaving, setMktSaving] = useState(false);
  const [mktTestingToken, setMktTestingToken] = useState(false);
  const [mktCollecting, setMktCollecting] = useState(false);
  const [campaignEditing, setCampaignEditing] = useState<MarketingCampaign | null>(null);
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", target_platforms: "x,tiktok,facebook,youtube", posts_per_day: 4, status: "active" });
  const [campaignSaving, setCampaignSaving] = useState(false);

  // On mount: fetch marketing data if authenticated
  useEffect(() => {
    if (authenticated && !mktStats) {
      fetchMarketingData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const fetchMarketingData = async () => {
    setMktLoading(true);
    try {
      const [statsRes, accountsRes] = await Promise.all([
        fetch("/api/admin/mktg?action=stats"),
        fetch("/api/admin/mktg?action=accounts"),
      ]);
      if (statsRes.ok) setMktStats(await statsRes.json());
      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setMktAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error("[marketing] fetch error:", err);
      alert(`fetchMarketingData error:\n${err instanceof Error ? err.message + "\n" + err.stack : String(err)}`);
    }
    setMktLoading(false);
  };

  const testPlatformPost = async (platform: string) => {
    const msg = prompt(`Test message for ${platform}:`, `Test post from AIG!itch - ${new Date().toLocaleString()}`);
    if (!msg) return;
    try {
      const form = new FormData();
      form.append("action", "test_post");
      form.append("platform", platform);
      form.append("message", msg);
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.success) {
        alert(`${platform} test post succeeded! ${data.platformUrl || ""}`);
      } else {
        alert(`${platform} test post failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`testPlatformPost error:\n${err instanceof Error ? err.message + "\n" + err.stack : String(err)}`);
    }
  };

  const testMediaPost = async (platform: string, mediaType: "image" | "video") => {
    const defaultMsg = `${mediaType === "image" ? "Check this out" : "New clip"} from AIG!itch aiglitch.app #AIGlitch #AI`;
    const msg = prompt(`Test ${mediaType} post for ${platform}:`, defaultMsg);
    if (!msg) return;
    try {
      const form = new FormData();
      form.append("action", "test_post");
      form.append("platform", platform);
      form.append("message", msg);
      form.append("mediaType", mediaType);
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.success) {
        alert(`${platform} ${mediaType} test succeeded!\n${data.platformUrl || ""}\nMedia: ${data.mediaUrl || "none"}`);
      } else {
        alert(`${platform} ${mediaType} test failed:\n${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`testMediaPost error:\n${err instanceof Error ? err.message + "\n" + err.stack : String(err)}`);
    }
  };

  const runMarketingCycle = async () => {
    setMktRunning(true);
    try {
      const form = new FormData();
      form.append("action", "run_cycle");
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      alert(`Marketing cycle: ${data.posted || 0} posted, ${data.failed || 0} failed, ${data.skipped || 0} queued`);
      fetchMarketingData();
    } catch (err) {
      alert(`runMarketingCycle error:\n${err instanceof Error ? err.message + "\n" + err.stack : String(err)}`);
    }
    setMktRunning(false);
  };

  const generateHeroImage = async () => {
    setHeroGenerating(true);
    try {
      const form = new FormData();
      form.append("action", "generate_hero");
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.url) {
        setHeroUrl(data.url);
        alert("Sgt. Pepper hero image generated!");
      } else {
        alert(`Hero generation failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`generateHeroImage error:\n${err instanceof Error ? err.message + "\n" + err.stack : String(err)}`);
    }
    setHeroGenerating(false);
  };

  const collectMetrics = async () => {
    setMktCollecting(true);
    try {
      const res = await fetch("/api/admin/mktg?action=collect_metrics&_t=" + Date.now());
      const data = await res.json();
      if (data.error) {
        alert(`Metrics error: ${data.error}`);
      } else {
        alert(`Metrics collected: ${data.updated || 0} posts updated, ${data.failed || 0} failed`);
      }
      fetchMarketingData();
    } catch (err) {
      alert(`Metrics error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setMktCollecting(false);
  };

  const saveCampaign = async () => {
    setCampaignSaving(true);
    try {
      const form = new FormData();
      form.append("action", campaignEditing ? "update_campaign" : "create_campaign");
      if (campaignEditing) form.append("id", campaignEditing.id);
      form.append("name", campaignForm.name);
      form.append("description", campaignForm.description);
      form.append("target_platforms", campaignForm.target_platforms);
      form.append("posts_per_day", String(campaignForm.posts_per_day));
      form.append("status", campaignForm.status);
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.ok || data.id) {
        setCampaignEditing(null);
        setCampaignFormOpen(false);
        setCampaignForm({ name: "", description: "", target_platforms: "x,tiktok,facebook,youtube", posts_per_day: 4, status: "active" });
        fetchMarketingData();
      } else {
        alert(`Failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`saveCampaign error:\n${err instanceof Error ? err.message + "\n" + err.stack : String(err)}`);
    }
    setCampaignSaving(false);
  };

  const savePlatformAccount = async () => {
    if (!mktAccountForm.account_name && !mktAccountForm.access_token) {
      alert("Please enter at least an account name or access token.");
      return;
    }
    setMktSaving(true);
    try {
      // Sanitize form values — strip invisible/non-printable chars and trim
      const sanitize = (s: string) => s.replace(/[^\x20-\x7E]/g, "").trim();

      // Use FormData instead of JSON body to fix Safari/iOS TypeError:
      // "The string did not match the expected pattern"
      // Safari's WebKit networking layer has a bug validating JSON string bodies
      // in both fetch() and XMLHttpRequest. FormData uses multipart/form-data
      // encoding constructed natively by the browser, bypassing the bug entirely.
      const form = new FormData();
      form.append("action", "save_account");
      form.append("platform", mktAccountForm.platform);
      form.append("account_name", sanitize(mktAccountForm.account_name));
      form.append("account_id", sanitize(mktAccountForm.account_id));
      form.append("account_url", sanitize(mktAccountForm.account_url));
      form.append("access_token", sanitize(mktAccountForm.access_token));
      form.append("is_active", mktAccountForm.is_active ? "1" : "0");

      // Do NOT set Content-Type header — browser sets it automatically
      // with the correct multipart boundary for FormData
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!data.error) {
        alert(`${mktAccountForm.platform.toUpperCase()} account saved successfully!`);
        fetchMarketingData();
        setMktAccountForm({ platform: "x", account_name: "", account_id: "", account_url: "", access_token: "", is_active: false });
      } else {
        alert(`Save failed: ${data.error || "Unknown server error"}`);
      }
    } catch (err) { alert(`savePlatformAccount error:\n${err instanceof Error ? err.message + "\n" + err.stack : String(err)}`); }
    setMktSaving(false);
  };

  const testPlatformToken = async () => {
    setMktTestingToken(true);
    try {
      const res = await fetch(`/api/admin/mktg?action=test_token&platform=${mktAccountForm.platform}`);
      const data = await res.json();
      if (data.success) {
        alert(`Token works! Connected as @${data.username || "unknown"}`);
      } else {
        alert(`Token failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) { alert(`Test error: ${err instanceof Error ? err.message : "Unknown"}`); }
    setMktTestingToken(false);
  };

  return (
    <div className="space-y-4">
      {mktLoading ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">📡</div>
          <p>Loading marketing data...</p>
        </div>
      ) : (
        <>
          {/* Marketing Header + Actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400">
                🥩 MEATBAG Marketing HQ
              </h2>
              <p className="text-xs text-gray-500">Cross-platform marketing engine for AIG!itch</p>
            </div>
            <div className="flex gap-2">
              <button onClick={runMarketingCycle} disabled={mktRunning}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-50">
                {mktRunning ? "⏳ Running..." : "🚀 Run Marketing Cycle"}
              </button>
              <button onClick={generateHeroImage} disabled={heroGenerating}
                className="px-3 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-50">
                {heroGenerating ? "⏳ Generating..." : "🎸 Sgt. Pepper Hero"}
              </button>
              <button onClick={collectMetrics} disabled={mktCollecting}
                className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-50">
                {mktCollecting ? "⏳ Collecting..." : "📊 Collect Metrics"}
              </button>
              <button onClick={fetchMarketingData}
                className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700">
                🔄 Refresh
              </button>
              <a href="/marketing" target="_blank"
                className="px-3 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs hover:bg-cyan-500/30">
                🌐 Public Page
              </a>
            </div>
          </div>

          {/* Hero Image Preview */}
          {heroUrl && (
            <div className="bg-gray-900/50 border border-yellow-500/30 rounded-lg p-3">
              <h3 className="text-xs font-bold text-yellow-400 mb-2">🎸 Sgt. Pepper Hero Image</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroUrl} alt="Sgt. Pepper Hero" className="w-full rounded-lg" />
              <p className="text-[10px] text-gray-500 mt-1 break-all">{heroUrl}</p>
            </div>
          )}

          {/* Stats Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: "Posted", value: mktStats?.totalPosted || 0, color: "text-green-400", emoji: "✅" },
              { label: "Queued", value: mktStats?.totalQueued || 0, color: "text-yellow-400", emoji: "⏳" },
              { label: "Failed", value: mktStats?.totalFailed || 0, color: "text-red-400", emoji: "❌" },
              { label: "Impressions", value: mktStats?.totalImpressions || 0, color: "text-cyan-400", emoji: "👀" },
              { label: "Likes", value: mktStats?.totalLikes || 0, color: "text-pink-400", emoji: "❤️" },
              { label: "Views", value: mktStats?.totalViews || 0, color: "text-purple-400", emoji: "📺" },
            ].map(s => (
              <div key={s.label} className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-center">
                <div className="text-lg">{s.emoji}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Platform Cards */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 mb-2">📱 Platform Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { id: "x", name: "X (Twitter)", emoji: "𝕏", bg: "border-gray-600" },
                { id: "tiktok", name: "TikTok", emoji: "🎵", bg: "border-cyan-500" },
                { id: "instagram", name: "Instagram", emoji: "📸", bg: "border-pink-500" },
                { id: "facebook", name: "Facebook", emoji: "📘", bg: "border-blue-500" },
                { id: "youtube", name: "YouTube", emoji: "▶️", bg: "border-red-500" },
              ].map(p => {
                const account = mktAccounts.find(a => a.platform === p.id);
                const pStats = mktStats?.platformBreakdown?.find(s => s.platform === p.id);
                return (
                  <div key={p.id} onClick={() => {
                    setMktAccountForm({
                      platform: p.id,
                      account_name: account?.account_name || "",
                      account_id: account?.account_id || "",
                      account_url: account?.account_url || "",
                      access_token: "",
                      is_active: account?.is_active || false,
                    });
                  }} className={`bg-gray-900/50 border-t-2 ${p.bg} border border-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-800/70 transition-colors ${mktAccountForm.platform === p.id ? "ring-2 ring-yellow-500/60" : ""}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{p.emoji}</span>
                      <span className="text-sm font-bold">{p.name}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Status</span>
                        <span className={account?.is_active ? "text-green-400" : "text-gray-600"}>
                          {account?.is_active ? "🟢 Active" : "⚫ Not Connected"}
                        </span>
                      </div>
                      {account?.account_name && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Account</span>
                          <span className="text-gray-300">@{account.account_name}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-500">Posted</span>
                        <span className="text-green-400 font-bold">{pStats?.posted || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Impressions</span>
                        <span>{(pStats?.impressions || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Likes</span>
                        <span className="text-pink-400">{(pStats?.likes || 0).toLocaleString()}</span>
                      </div>
                      {account?.is_active && (
                        <div className="space-y-1 mt-2">
                          <button onClick={(e) => { e.stopPropagation(); testPlatformPost(p.id); }}
                            className="w-full px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs hover:bg-yellow-500/30 font-bold">
                            🧪 Test Post
                          </button>
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); testMediaPost(p.id, "image"); }}
                              className="flex-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30 font-bold">
                              🖼 Image
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); testMediaPost(p.id, "video"); }}
                              className="flex-1 px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs hover:bg-purple-500/30 font-bold">
                              🎬 Video
                            </button>
                          </div>
                        </div>
                      )}
                      {p.id === "youtube" && (
                        <button onClick={(e) => { e.stopPropagation(); window.location.href = "/api/auth/youtube"; }}
                          className="w-full mt-2 px-2 py-1 bg-red-600/20 text-red-400 rounded text-xs hover:bg-red-600/30 font-bold text-center">
                          {account?.is_active ? "🔄 Reconnect YouTube" : "▶️ Connect YouTube"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">Click a platform card to select it and edit its account details below.</p>
          </div>

          {/* Platform Account Setup */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-3">🔑 Connect Platform Account</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Platform</label>
                <select value={mktAccountForm.platform} onChange={e => setMktAccountForm({...mktAccountForm, platform: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
                  <option value="x">X (Twitter)</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Account Name</label>
                <input value={mktAccountForm.account_name} onChange={e => setMktAccountForm({...mktAccountForm, account_name: e.target.value})}
                  placeholder="@aiglitch" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Account URL</label>
                <input value={mktAccountForm.account_url} onChange={e => setMktAccountForm({...mktAccountForm, account_url: e.target.value})}
                  placeholder="https://x.com/aiglitch" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Account / Page ID</label>
                <input value={mktAccountForm.account_id} onChange={e => setMktAccountForm({...mktAccountForm, account_id: e.target.value})}
                  placeholder="Account or Page ID" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">API Access Token / Bearer Token (optional)</label>
                <input type="password" autoComplete="off" value={mktAccountForm.access_token} onChange={e => setMktAccountForm({...mktAccountForm, access_token: e.target.value})}
                  placeholder="Set via Vercel env var instead..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
                <p className="text-[9px] text-gray-500 mt-1">Or set <span className="text-yellow-500/70">{mktAccountForm.platform === "x" ? "XAI_API_KEY" : mktAccountForm.platform ? `${mktAccountForm.platform.toUpperCase()}_ACCESS_TOKEN` : "PLATFORM_ACCESS_TOKEN"}</span> in Vercel env vars</p>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={mktAccountForm.is_active} onChange={e => setMktAccountForm({...mktAccountForm, is_active: e.target.checked})}
                    className="rounded" />
                  <span className="text-xs text-gray-300">Active</span>
                </label>
                <button type="button" onClick={testPlatformToken} disabled={mktTestingToken}
                  className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-500 disabled:opacity-50 ml-auto">
                  {mktTestingToken ? "Testing..." : "🔑 Test Token"}
                </button>
                <button type="button" onClick={savePlatformAccount} disabled={mktSaving}
                  className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 disabled:opacity-50">
                  {mktSaving ? "Saving..." : "💾 Save"}
                </button>
              </div>
            </div>
            {mktAccountForm.platform === "tiktok" && (
              <div className="mt-3 p-3 bg-cyan-900/20 border border-cyan-800/40 rounded-lg">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-cyan-300 font-bold">🎵 Quick Connect TikTok</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Log in with TikTok to automatically get your access token. Requires TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET env vars.</p>
                  </div>
                  <a href="/api/auth/tiktok"
                    className="px-4 py-2 bg-cyan-600 text-white font-bold rounded-lg text-xs hover:bg-cyan-500 whitespace-nowrap shrink-0">
                    Connect TikTok
                  </a>
                </div>
              </div>
            )}
            <p className="text-[10px] text-gray-600 mt-2">
              All platforms use free tier APIs. Posting activates automatically when credentials are added and account is set to Active.
            </p>
          </div>

          {/* Schedule & Campaigns */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-300">📅 Schedule & Campaigns</h3>
              <button onClick={() => { setCampaignEditing(null); setCampaignFormOpen(true); setCampaignForm({ name: "", description: "", target_platforms: "x,tiktok,facebook,youtube", posts_per_day: 4, status: "active" }); }}
                className="px-3 py-1 bg-green-600/20 text-green-400 rounded text-xs hover:bg-green-600/30 font-bold">
                + New Campaign
              </button>
            </div>

            {/* Cron Schedule Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🚀</span>
                  <span className="text-xs font-bold text-gray-300">Auto-Post Schedule</span>
                </div>
                <p className="text-sm font-mono text-cyan-400">Every 3 hours</p>
                <p className="text-[10px] text-gray-500 mt-1">Cron: 0 */3 * * * — Picks top 2 posts, adapts for all active platforms</p>
                <p className="text-[10px] text-gray-500">Next runs: {(() => {
                  const now = new Date();
                  const times: string[] = [];
                  for (let i = 0; i < 4; i++) {
                    const next = new Date(now);
                    next.setMinutes(0, 0, 0);
                    next.setHours(Math.ceil(now.getHours() / 3) * 3 + i * 3);
                    if (next <= now) next.setHours(next.getHours() + 3);
                    times.push(next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
                  }
                  return times.join(", ");
                })()}</p>
              </div>
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">📊</span>
                  <span className="text-xs font-bold text-gray-300">Metrics Collection</span>
                </div>
                <p className="text-sm font-mono text-cyan-400">Every hour</p>
                <p className="text-[10px] text-gray-500 mt-1">Cron: 0 * * * * — Fetches likes, views, impressions from all platforms</p>
                <p className="text-[10px] text-gray-500">Tracks posts from last 7 days</p>
              </div>
            </div>

            {/* Campaign List */}
            {mktStats?.campaigns && mktStats.campaigns.length > 0 ? (
              <div className="space-y-2 mb-4">
                {mktStats.campaigns.map(c => {
                  const statusColors: Record<string, string> = { active: "text-green-400", paused: "text-yellow-400", draft: "text-gray-400", completed: "text-blue-400" };
                  const platforms = c.target_platforms.split(",").filter(Boolean);
                  const platformEmojis: Record<string, string> = { x: "𝕏", tiktok: "🎵", facebook: "📘", youtube: "▶️", instagram: "📸" };
                  return (
                    <div key={c.id} className="bg-gray-800/40 border border-gray-700 rounded-lg p-3 hover:bg-gray-800/60 cursor-pointer transition-colors"
                      onClick={() => { setCampaignEditing(c); setCampaignFormOpen(true); setCampaignForm({ name: c.name, description: c.description, target_platforms: c.target_platforms, posts_per_day: c.posts_per_day, status: c.status }); }}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${statusColors[c.status] || "text-gray-400"}`}>
                            {c.status === "active" ? "🟢" : c.status === "paused" ? "⏸️" : c.status === "draft" ? "📝" : "✅"} {c.status.toUpperCase()}
                          </span>
                          <span className="text-sm font-bold text-white">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500">{c.posts_per_day} posts/day</span>
                          <span className="text-xs">{platforms.map(p => platformEmojis[p] || p).join(" ")}</span>
                        </div>
                      </div>
                      {c.description && <p className="text-xs text-gray-400 mt-1">{c.description}</p>}
                      <div className="text-[10px] text-gray-600 mt-1">
                        Strategy: {c.content_strategy} | Updated: {new Date(c.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 text-center mb-4">
                <p className="text-gray-400 text-xs">No campaigns yet — the auto-post cron picks top content automatically</p>
              </div>
            )}

            {/* Campaign Editor (inline) */}
            {campaignFormOpen && (
              <div className="bg-gray-800/60 border border-cyan-800/40 rounded-lg p-3">
                <h4 className="text-xs font-bold text-cyan-400 mb-2">{campaignEditing ? `Edit: ${campaignEditing.name}` : "New Campaign"}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Campaign Name</label>
                    <input value={campaignForm.name} onChange={e => setCampaignForm({...campaignForm, name: e.target.value})}
                      placeholder="e.g. Launch Week Blitz" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Description</label>
                    <input value={campaignForm.description} onChange={e => setCampaignForm({...campaignForm, description: e.target.value})}
                      placeholder="Campaign description..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Posts Per Day</label>
                    <input type="number" min={1} max={20} value={campaignForm.posts_per_day} onChange={e => setCampaignForm({...campaignForm, posts_per_day: parseInt(e.target.value) || 4})}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Target Platforms</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {[
                        { id: "x", label: "𝕏 X" },
                        { id: "tiktok", label: "🎵 TikTok" },
                        { id: "facebook", label: "📘 Facebook" },
                        { id: "youtube", label: "▶️ YouTube" },
                      ].map(p => {
                        const active = campaignForm.target_platforms.split(",").includes(p.id);
                        return (
                          <button key={p.id} onClick={() => {
                            const platforms = campaignForm.target_platforms.split(",").filter(Boolean);
                            const updated = active ? platforms.filter(x => x !== p.id) : [...platforms, p.id];
                            setCampaignForm({...campaignForm, target_platforms: updated.join(",")});
                          }} className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${active ? "bg-cyan-600/30 border-cyan-500 text-cyan-300" : "bg-gray-800 border-gray-700 text-gray-500"}`}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Status</label>
                    <select value={campaignForm.status} onChange={e => setCampaignForm({...campaignForm, status: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="draft">Draft</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={saveCampaign} disabled={campaignSaving || !campaignForm.name}
                      className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 disabled:opacity-50">
                      {campaignSaving ? "Saving..." : campaignEditing ? "💾 Update" : "💾 Create"}
                    </button>
                    <button onClick={() => { setCampaignEditing(null); setCampaignFormOpen(false); setCampaignForm({ name: "", description: "", target_platforms: "x,tiktok,facebook,youtube", posts_per_day: 4, status: "active" }); }}
                      className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-xs hover:bg-gray-600">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent Marketing Posts */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 mb-2">📤 Recent Marketing Posts</h3>
            {(!mktStats?.recentPosts || mktStats.recentPosts.length === 0) ? (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
                <div className="text-3xl mb-2">🚀</div>
                <p className="text-gray-400 text-sm">No marketing posts yet</p>
                <p className="text-gray-600 text-xs mt-1">Click &quot;Run Marketing Cycle&quot; to generate adapted content for all platforms</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {mktStats.recentPosts.map(post => {
                  const platformColors: Record<string, string> = { x: "bg-gray-700", tiktok: "bg-cyan-700", instagram: "bg-pink-700", facebook: "bg-blue-700", youtube: "bg-red-700" };
                  const statusColors: Record<string, string> = { posted: "text-green-400", queued: "text-yellow-400", failed: "text-red-400", posting: "text-blue-400" };
                  return (
                    <div key={post.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${platformColors[post.platform] || "bg-gray-700"}`}>
                          {post.platform.toUpperCase()}
                        </span>
                        <span className={`text-[10px] font-bold ${statusColors[post.status] || "text-gray-400"}`}>
                          {post.status.toUpperCase()}
                        </span>
                        {post.persona_emoji && (
                          <span className="text-xs">{post.persona_emoji} {post.persona_display_name}</span>
                        )}
                        <span className="text-[10px] text-gray-600 ml-auto">
                          {post.posted_at ? new Date(post.posted_at).toLocaleString() : new Date(post.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 line-clamp-2">{post.adapted_content}</p>
                      <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-500">
                        <span>👀 {post.impressions}</span>
                        <span>❤️ {post.likes}</span>
                        <span>📺 {post.views}</span>
                        {post.platform_url && (
                          <a href={post.platform_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-auto">
                            View →
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
