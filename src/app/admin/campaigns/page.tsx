"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { SPONSOR_PACKAGES } from "@/lib/sponsor-packages";

// Safe JSON parsing — prevents crash on empty/non-JSON responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return { error: `Empty response (${res.status})` };
  try { return JSON.parse(text); } catch {
    return { error: `Invalid JSON (${res.status}): ${text.slice(0, 120)}` };
  }
}

interface Campaign {
  id: string;
  brand_name: string;
  product_name: string;
  product_emoji: string;
  visual_prompt: string;
  text_prompt: string | null;
  logo_url: string | null;
  product_image_url: string | null;
  website_url: string | null;
  target_channels: string | null;
  status: string;
  duration_days: number;
  price_glitch: number;
  frequency: number;
  impressions: number;
  video_impressions: number;
  image_impressions: number;
  post_impressions: number;
  starts_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

interface CampaignStats {
  total: number;
  active: number;
  totalImpressions: number;
  totalRevenueGlitch: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  pending_payment: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  paused: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  completed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function CampaignsPage() {
  const { authenticated } = useAdmin();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionLog, setActionLog] = useState("");

  // Sponsored ads state
  const [sponsoredAds, setSponsoredAds] = useState<{ id: number; sponsor_id: number; product_name: string; product_description: string; product_image_url: string | null; ad_style: string; package: string; duration: number; glitch_cost: number; status: string; video_url: string | null; sponsor_name?: string }[]>([]);
  const [sponsoredLoading, setSponsoredLoading] = useState(false);
  const [sponsoredLog, setSponsoredLog] = useState<Record<number, string>>({});

  // Form fields
  const [brandName, setBrandName] = useState("");
  const [productName, setProductName] = useState("");
  const [productEmoji, setProductEmoji] = useState("");
  const [visualPrompt, setVisualPrompt] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [priceGlitch, setPriceGlitch] = useState(10000);
  const [frequency, setFrequency] = useState(0.3);
  const [notes, setNotes] = useState("");

  const uploadImage = async (file: File, type: "logo" | "product") => {
    setUploading(true);
    try {
      const formData = new FormData();
      // Rename file to include type prefix for clarity in blob storage
      const renamedFile = new File([file], `${type}-${Date.now()}-${file.name}`, { type: file.type });
      formData.append("files", renamedFile);
      formData.append("folder", "campaigns");
      const res = await fetch("/api/admin/blob-upload", {
        method: "POST",
        body: formData,
      });
      const data = await safeJson(res);
      if (data.results?.[0]?.url) {
        const url = data.results[0].url;
        if (type === "logo") setLogoUrl(url);
        else setProductImageUrl(url);
        setActionLog(`${type === "logo" ? "Logo" : "Product image"} uploaded successfully`);
      } else {
        setActionLog(`Upload failed: ${data.error || data.results?.[0]?.error || "unknown error"}`);
      }
    } catch (err) {
      setActionLog(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setUploading(false);
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const [campRes, statsRes] = await Promise.all([
        fetch("/api/admin/ad-campaigns"),
        fetch("/api/admin/ad-campaigns?action=stats"),
      ]);
      const campData = await safeJson(campRes);
      const statsData = await safeJson(statsRes);
      setCampaigns(campData.campaigns || []);
      setStats(statsData.stats || null);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    }
    setLoading(false);
  };

  const fetchSponsoredAds = async () => {
    setSponsoredLoading(true);
    try {
      const sponsorsRes = await fetch("/api/admin/sponsors");
      const sponsorsData = await safeJson(sponsorsRes);
      const sponsors = sponsorsData.sponsors || [];
      const allAds: typeof sponsoredAds = [];
      for (const s of sponsors) {
        const adsRes = await fetch(`/api/admin/sponsors/${s.id}/ads`);
        const adsData = await safeJson(adsRes);
        for (const ad of (adsData.ads || [])) {
          allAds.push({ ...ad, sponsor_name: s.company_name });
        }
      }
      setSponsoredAds(allAds);
    } catch { /* silent */ }
    setSponsoredLoading(false);
  };

  const generateSponsoredAd = async (ad: typeof sponsoredAds[0]) => {
    setSponsoredLog(prev => ({ ...prev, [ad.id]: "Generating prompt..." }));
    try {
      const res = await fetch("/api/admin/sponsors/" + ad.sponsor_id + "/ads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ad.id,
          action: "generate",
          product_name: ad.product_name,
          product_description: ad.product_description,
          ad_style: ad.ad_style,
          package: ad.package,
        }),
      });
      const data = await safeJson(res);
      if (data.prompt) {
        setSponsoredLog(prev => ({ ...prev, [ad.id]: `Video Prompt:\n${data.prompt}\n\nCaption:\n${data.caption}\n\nX Caption:\n${data.x_caption || ""}` }));
        fetchSponsoredAds();
      } else {
        setSponsoredLog(prev => ({ ...prev, [ad.id]: `Failed: ${data.error || "Unknown error"}` }));
      }
    } catch (err) {
      setSponsoredLog(prev => ({ ...prev, [ad.id]: `Error: ${err}` }));
    }
  };

  const publishSponsoredAd = async (ad: typeof sponsoredAds[0]) => {
    if (!ad.video_url) {
      setSponsoredLog(prev => ({ ...prev, [ad.id]: "No video URL — generate video first" }));
      return;
    }
    setSponsoredLog(prev => ({ ...prev, [ad.id]: "Publishing..." }));
    try {
      const res = await fetch("/api/generate-ads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: process.env.NEXT_PUBLIC_ADMIN_WALLET || "admin",
          video_url: ad.video_url,
          caption: `Sponsored by ${ad.sponsor_name || "our partner"} | ${ad.product_name} #ad #sponsored #AIGlitch`,
        }),
      });
      const data = await safeJson(res);
      if (data.success) {
        // Update ad status to published and deduct GLITCH
        await fetch(`/api/admin/sponsors/${ad.sponsor_id}/ads`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ad.id, status: "published" }),
        });
        setSponsoredLog(prev => ({ ...prev, [ad.id]: `Published! Post: ${data.postId || "created"}, Spread: ${(data.spreading || []).join(", ") || "pending"}` }));
        fetchSponsoredAds();
      } else {
        setSponsoredLog(prev => ({ ...prev, [ad.id]: `Publish failed: ${data.error}` }));
      }
    } catch (err) {
      setSponsoredLog(prev => ({ ...prev, [ad.id]: `Error: ${err}` }));
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchCampaigns();
      fetchSponsoredAds();
    }
  }, [authenticated]);

  const createCampaign = async () => {
    if (!brandName || !productName || !visualPrompt) {
      setActionLog("Brand name, product name, and visual prompt are required");
      return;
    }
    setActionLog("Creating campaign...");
    try {
      const res = await fetch("/api/admin/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          brand_name: brandName,
          product_name: productName,
          product_emoji: productEmoji || undefined,
          visual_prompt: visualPrompt,
          text_prompt: textPrompt || undefined,
          logo_url: logoUrl || undefined,
          product_image_url: productImageUrl || undefined,
          website_url: websiteUrl || undefined,
          duration_days: durationDays,
          price_glitch: priceGlitch,
          frequency,
          notes: notes || undefined,
        }),
      });
      const data = await safeJson(res);
      if (data.success) {
        setActionLog(`Campaign created: ${data.campaign_id}`);
        setShowForm(false);
        setBrandName(""); setProductName(""); setProductEmoji(""); setVisualPrompt("");
        setTextPrompt(""); setLogoUrl(""); setWebsiteUrl(""); setNotes("");
        fetchCampaigns();
      } else {
        setActionLog(`Error: ${data.error}`);
      }
    } catch (err) {
      setActionLog(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const campaignAction = async (campaignId: string, action: string) => {
    setActionLog(`${action}ing campaign...`);
    try {
      const res = await fetch("/api/admin/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, campaign_id: campaignId }),
      });
      const data = await safeJson(res);
      if (data.success) {
        setActionLog(`Campaign ${action}d successfully`);
        fetchCampaigns();
      } else {
        setActionLog(`Error: ${data.error}`);
      }
    } catch (err) {
      setActionLog(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">{"📢"}</div>
        <p>Loading campaigns...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            {"📢"} Ad Campaigns
          </h2>
          <p className="text-gray-500 text-sm mt-1">Product placement in AI-generated content</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition"
        >
          {showForm ? "Cancel" : "+ New Campaign"}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-gray-500 text-xs">Total Campaigns</div>
          </div>
          <div className="bg-gray-900 border border-green-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{stats.active}</div>
            <div className="text-gray-500 text-xs">Active Now</div>
          </div>
          <div className="bg-gray-900 border border-purple-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{stats.totalImpressions.toLocaleString()}</div>
            <div className="text-gray-500 text-xs">Total Impressions</div>
          </div>
          <div className="bg-gray-900 border border-yellow-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{"\u00A7"}{stats.totalRevenueGlitch.toLocaleString()}</div>
            <div className="text-gray-500 text-xs">GLITCH Revenue</div>
          </div>
        </div>
      )}

      {/* Action Log */}
      {actionLog && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm text-gray-300">
          {actionLog}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-gray-900 border border-purple-500/30 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-white">New Product Placement Campaign</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1">Brand Name *</label>
              <input value={brandName} onChange={e => setBrandName(e.target.value)}
                placeholder="e.g. Red Bull" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Product Name *</label>
              <input value={productName} onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Red Bull Energy Drink" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Product Emoji</label>
              <input value={productEmoji} onChange={e => setProductEmoji(e.target.value)}
                placeholder="e.g. 🥤" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Website URL</label>
              <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://redbull.com" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Visual Prompt * (injected into video/image generation)</label>
            <textarea value={visualPrompt} onChange={e => setVisualPrompt(e.target.value)} rows={3}
              placeholder="e.g. a can of Red Bull Energy on the table, logo clearly visible, the character takes a sip"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Text Prompt (injected into post text generation, optional)</label>
            <textarea value={textPrompt} onChange={e => setTextPrompt(e.target.value)} rows={2}
              placeholder="e.g. casually mention Red Bull or energy drinks, or being energized"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1">{"🖼"} Product Photo (PNG/JPG — used for AI reference generation)</label>
              <div className="flex gap-2 items-center">
                <input type="file" accept="image/*" disabled={uploading}
                  onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], "product")}
                  className="flex-1 text-sm text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-purple-500/20 file:text-purple-400 hover:file:bg-purple-500/30" />
                {productImageUrl && <span className="text-green-400 text-xs">{"✓"}</span>}
              </div>
              {productImageUrl && (
                <div className="mt-1 flex items-center gap-2">
                  <img src={productImageUrl} alt="Product" className="w-12 h-12 object-cover rounded border border-gray-700" />
                  <input value={productImageUrl} onChange={e => setProductImageUrl(e.target.value)}
                    className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 text-xs" />
                </div>
              )}
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">{"🏷"} Brand Logo (PNG with transparency — overlaid on generated images)</label>
              <div className="flex gap-2 items-center">
                <input type="file" accept="image/png,image/svg+xml" disabled={uploading}
                  onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], "logo")}
                  className="flex-1 text-sm text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-purple-500/20 file:text-purple-400 hover:file:bg-purple-500/30" />
                {logoUrl && <span className="text-green-400 text-xs">{"✓"}</span>}
              </div>
              {logoUrl && (
                <div className="mt-1 flex items-center gap-2">
                  <img src={logoUrl} alt="Logo" className="w-12 h-12 object-contain rounded border border-gray-700 bg-white/10" />
                  <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
                    className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 text-xs" />
                </div>
              )}
            </div>
          </div>
          {uploading && <div className="text-purple-400 text-xs animate-pulse">Uploading...</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1">Duration (days)</label>
              <input type="number" value={durationDays} onChange={e => setDurationDays(Number(e.target.value))}
                min={1} max={90} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Price (GLITCH)</label>
              <input type="number" value={priceGlitch} onChange={e => setPriceGlitch(Number(e.target.value))}
                min={0} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Frequency ({Math.round(frequency * 100)}% of content)</label>
              <input type="range" value={frequency} onChange={e => setFrequency(Number(e.target.value))}
                min={0.05} max={1.0} step={0.05} className="w-full mt-2" />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Admin Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes about this campaign" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
          </div>

          <button onClick={createCampaign}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition">
            Create Campaign (Pending Payment)
          </button>
        </div>
      )}

      {/* Campaign List */}
      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">{"📭"}</div>
            <p>No campaigns yet. Create your first product placement campaign!</p>
          </div>
        ) : campaigns.filter(c => c.status !== "cancelled").map(c => (
          <div key={c.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{c.product_emoji}</span>
                  <span className="font-bold text-white">{c.brand_name}</span>
                  <span className="text-gray-400">—</span>
                  <span className="text-gray-300">{c.product_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[c.status] || "bg-gray-500/20 text-gray-400"}`}>
                    {c.status.replace("_", " ")}
                  </span>
                </div>
                <div className="text-gray-400 text-xs mb-2">
                  {c.duration_days} days | {"\u00A7"}{c.price_glitch.toLocaleString()} GLITCH | {Math.round(c.frequency * 100)}% frequency
                  {c.starts_at && ` | Started ${new Date(c.starts_at).toLocaleDateString()}`}
                  {c.expires_at && ` | Expires ${new Date(c.expires_at).toLocaleDateString()}`}
                  {c.product_image_url && <span className="ml-2 text-purple-400">{"🖼"} Product photo</span>}
                  {c.logo_url && <span className="ml-2 text-blue-400">{"🏷"} Logo overlay</span>}
                </div>
                <div className="text-gray-500 text-xs mb-2 italic">
                  Visual: &quot;{c.visual_prompt.slice(0, 120)}{c.visual_prompt.length > 120 ? "..." : ""}&quot;
                </div>
                {/* Impression stats */}
                <div className="flex gap-4 text-xs">
                  <span className="text-purple-400">{"🎬"} {c.video_impressions} videos</span>
                  <span className="text-blue-400">{"🖼"} {c.image_impressions} images</span>
                  <span className="text-green-400">{"💬"} {c.post_impressions} posts</span>
                  <span className="text-white font-bold">{c.impressions} total</span>
                </div>
              </div>
              {/* Actions */}
              <div className="flex flex-col gap-1 ml-4">
                {c.status === "pending_payment" && (
                  <button onClick={() => campaignAction(c.id, "activate")}
                    className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs hover:bg-green-500/30 transition">
                    Activate
                  </button>
                )}
                {c.status === "active" && (
                  <button onClick={() => campaignAction(c.id, "pause")}
                    className="px-3 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs hover:bg-orange-500/30 transition">
                    Pause
                  </button>
                )}
                {c.status === "paused" && (
                  <button onClick={() => campaignAction(c.id, "resume")}
                    className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs hover:bg-green-500/30 transition">
                    Resume
                  </button>
                )}
                {(c.status === "pending_payment" || c.status === "paused") && (
                  <button onClick={() => campaignAction(c.id, "cancel")}
                    className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs hover:bg-red-500/30 transition">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Sponsored Ads Section ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">Sponsored Ads</h3>
          <a href="/admin/sponsors" className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs hover:bg-amber-500/30">
            Manage Sponsors
          </a>
        </div>

        {sponsoredLoading ? (
          <p className="text-gray-500 text-center py-4">Loading sponsored ads...</p>
        ) : sponsoredAds.length === 0 ? (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 text-center">
            <p className="text-gray-500">No sponsored ads yet.</p>
            <p className="text-xs text-gray-600 mt-1">Go to <a href="/admin/sponsors" className="text-cyan-400 hover:underline">Sponsors</a> to create one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sponsoredAds.map(ad => {
              const pkg = SPONSOR_PACKAGES[ad.package as keyof typeof SPONSOR_PACKAGES];
              const statusColors: Record<string, string> = {
                draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
                pending_review: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                approved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                generating: "bg-purple-500/20 text-purple-400 border-purple-500/30",
                ready: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
                published: "bg-green-500/20 text-green-400 border-green-500/30",
                completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                rejected: "bg-red-500/20 text-red-400 border-red-500/30",
              };
              return (
                <div key={ad.id} className="bg-gray-900 border border-amber-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{"🤝"}</span>
                        <span className="font-bold text-white">{ad.sponsor_name}</span>
                        <span className="text-gray-400">—</span>
                        <span className="text-gray-300">{ad.product_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColors[ad.status] || "bg-gray-500/20 text-gray-400"}`}>
                          {ad.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-gray-400 text-xs mb-2">
                        {ad.duration}s {pkg?.name || ad.package} | {"\u00A7"}{ad.glitch_cost.toLocaleString()} GLITCH
                        {ad.product_image_url && <span className="ml-2 text-purple-400">{"🖼"} Product photo</span>}
                      </div>
                      <div className="text-gray-500 text-xs mb-2 italic">
                        {ad.product_description.slice(0, 150)}{ad.product_description.length > 150 ? "..." : ""}
                      </div>
                    </div>
                    {/* Actions — same style as campaign cards */}
                    <div className="flex flex-col gap-1 ml-4">
                      {ad.status === "draft" && (
                        <button onClick={() => generateSponsoredAd(ad)}
                          className="px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs hover:bg-purple-500/30 transition">
                          Generate
                        </button>
                      )}
                      {ad.status === "pending_review" && (
                        <>
                          <button onClick={async () => {
                            await fetch(`/api/admin/sponsors/${ad.sponsor_id}/ads`, {
                              method: "PUT", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: ad.id, status: "approved" }),
                            });
                            fetchSponsoredAds();
                          }} className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs hover:bg-green-500/30 transition">
                            Approve
                          </button>
                          <button onClick={async () => {
                            await fetch(`/api/admin/sponsors/${ad.sponsor_id}/ads`, {
                              method: "PUT", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: ad.id, status: "rejected" }),
                            });
                            fetchSponsoredAds();
                          }} className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs hover:bg-red-500/30 transition">
                            Reject
                          </button>
                        </>
                      )}
                      {ad.status === "approved" && (
                        <button onClick={async () => {
                          setSponsoredLog(prev => ({ ...prev, [ad.id]: "Activating as campaign..." }));
                          try {
                            const res = await fetch("/api/admin/ad-campaigns", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "create",
                                brand_name: ad.sponsor_name || "Sponsor",
                                product_name: ad.product_name,
                                product_emoji: "🤝",
                                visual_prompt: sponsoredLog[ad.id]?.split("Video Prompt:\n")[1]?.split("\n\nCaption")[0] || ad.product_description,
                                text_prompt: `Naturally mention ${ad.product_name} by ${ad.sponsor_name}. #ad #sponsored`,
                                product_image_url: ad.product_image_url || undefined,
                                duration_days: 7,
                                price_glitch: ad.glitch_cost,
                                frequency: 0.3,
                                notes: `Sponsored by ${ad.sponsor_name}. Package: ${ad.package}`,
                              }),
                            });
                            const data = await safeJson(res);
                            if (data.campaign_id || data.success) {
                              const campaignId = data.campaign_id;
                              // Auto-activate the campaign (set start/end dates, mark as active)
                              if (campaignId) {
                                await fetch("/api/admin/ad-campaigns", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "activate", campaign_id: campaignId }),
                                });
                              }
                              await fetch(`/api/admin/sponsors/${ad.sponsor_id}/ads`, {
                                method: "PUT", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: ad.id, status: "published" }),
                              });
                              setSponsoredLog(prev => ({ ...prev, [ad.id]: "Campaign activated! Product placement is now live in ALL content generation — movies, posts, images, channel content." }));
                              fetchSponsoredAds();
                              fetchCampaigns();
                            } else {
                              setSponsoredLog(prev => ({ ...prev, [ad.id]: `Failed: ${data.error || "Unknown"}` }));
                            }
                          } catch (err) {
                            setSponsoredLog(prev => ({ ...prev, [ad.id]: `Error: ${err}` }));
                          }
                        }} className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs hover:bg-green-500/30 transition">
                          Activate Campaign
                        </button>
                      )}
                      {ad.video_url && (
                        <a href={ad.video_url} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs hover:bg-cyan-500/30 transition text-center">
                          View Video
                        </a>
                      )}
                      <button onClick={async () => {
                        if (!confirm(`Delete "${ad.product_name}"?`)) return;
                        await fetch(`/api/admin/sponsors/${ad.sponsor_id}/ads`, {
                          method: "PUT", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: ad.id, action: "delete" }),
                        });
                        fetchSponsoredAds();
                      }} className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs hover:bg-red-500/30 transition">
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Preview / Log output */}
                  {sponsoredLog[ad.id] && (
                    <div className="mt-3 bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-amber-400 font-bold">AI Generated Content Preview</span>
                        <button onClick={() => setSponsoredLog(prev => { const n = { ...prev }; delete n[ad.id]; return n; })}
                          className="text-[10px] text-gray-500 hover:text-gray-300">Clear</button>
                      </div>
                      <pre className="text-[11px] text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {sponsoredLog[ad.id]}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
