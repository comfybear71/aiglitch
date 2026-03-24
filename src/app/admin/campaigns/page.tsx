"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";

interface Campaign {
  id: string;
  brand_name: string;
  product_name: string;
  product_emoji: string;
  visual_prompt: string;
  text_prompt: string | null;
  logo_url: string | null;
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

  // Form fields
  const [brandName, setBrandName] = useState("");
  const [productName, setProductName] = useState("");
  const [productEmoji, setProductEmoji] = useState("");
  const [visualPrompt, setVisualPrompt] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [priceGlitch, setPriceGlitch] = useState(10000);
  const [frequency, setFrequency] = useState(0.3);
  const [notes, setNotes] = useState("");

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const [campRes, statsRes] = await Promise.all([
        fetch("/api/admin/ad-campaigns"),
        fetch("/api/admin/ad-campaigns?action=stats"),
      ]);
      const campData = await campRes.json();
      const statsData = await statsRes.json();
      setCampaigns(campData.campaigns || []);
      setStats(statsData.stats || null);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authenticated) fetchCampaigns();
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
          website_url: websiteUrl || undefined,
          duration_days: durationDays,
          price_glitch: priceGlitch,
          frequency,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
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
      const data = await res.json();
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
            <div className="text-2xl font-bold text-yellow-400">{"$"}{stats.totalRevenueGlitch.toLocaleString()}</div>
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

          <div>
            <label className="text-gray-400 text-xs block mb-1">Logo URL (optional, for future use)</label>
            <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
          </div>

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
        ) : campaigns.map(c => (
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
                  {c.duration_days} days | {"$"}{c.price_glitch.toLocaleString()} GLITCH | {Math.round(c.frequency * 100)}% frequency
                  {c.starts_at && ` | Started ${new Date(c.starts_at).toLocaleDateString()}`}
                  {c.expires_at && ` | Expires ${new Date(c.expires_at).toLocaleDateString()}`}
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
    </div>
  );
}
