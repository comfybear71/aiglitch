"use client";

import { useState, useEffect } from "react";
import { useAdmin } from "../AdminContext";
import { SPONSOR_PACKAGES, AD_STYLES, INDUSTRIES, SPONSOR_STATUSES } from "@/lib/sponsor-packages";

interface Sponsor {
  id: number;
  company_name: string;
  contact_email: string;
  contact_name: string | null;
  industry: string | null;
  website: string | null;
  status: string;
  glitch_balance: number;
  total_spent: number;
  notes: string | null;
  created_at: string;
  // MasterHQ import fields
  product_name: string | null;
  product_description: string | null;
  logo_url: string | null;
  product_images: string[] | null;
  masterhq_id: string | null;
  tier: string | null;
}

interface SponsoredAd {
  id: number;
  sponsor_id: number;
  product_name: string;
  product_description: string;
  product_image_url: string | null;
  logo_url: string | null;
  product_images: string[] | null;
  ad_style: string;
  package: string;
  duration: number;
  glitch_cost: number;
  cash_equivalent: number;
  status: string;
  video_url: string | null;
  target_platforms: string[];
  created_at: string;
}

interface MasterHQSponsor {
  id: string;
  company: string;
  email: string;
  tier: string;
  productName?: string;
  productDescription?: string;
  industry?: string;
  website?: string;
  files: { name: string; url: string; type: string }[];
  createdAt: string;
  importedToAiglitch: boolean;
  package: { name: string; price: number; frequency: number; placements: number; duration: number };
}

const STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-gray-500/30 text-gray-300",
  contacted: "bg-blue-500/30 text-blue-300",
  negotiating: "bg-amber-500/30 text-amber-300",
  active: "bg-green-500/30 text-green-300",
  paused: "bg-orange-500/30 text-orange-300",
  churned: "bg-red-500/30 text-red-300",
};

const AD_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/30 text-gray-300",
  pending_review: "bg-yellow-500/30 text-yellow-300",
  approved: "bg-blue-500/30 text-blue-300",
  generating: "bg-purple-500/30 text-purple-300",
  ready: "bg-cyan-500/30 text-cyan-300",
  published: "bg-green-500/30 text-green-300",
  completed: "bg-emerald-500/30 text-emerald-300",
  rejected: "bg-red-500/30 text-red-300",
};

export default function SponsorsPage() {
  const { authenticated } = useAdmin();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [expandedSponsor, setExpandedSponsor] = useState<number | null>(null);
  const [sponsorAds, setSponsorAds] = useState<SponsoredAd[]>([]);
  const [sponsorPlacements, setSponsorPlacements] = useState<{ post_id: string; post_content: string; media_url: string | null; media_type: string | null; content_type: string; channel_name: string | null; placed_at: string }[]>([]);
  const [placementsTotal, setPlacementsTotal] = useState(0);
  const [form, setForm] = useState({ company_name: "", contact_email: "", contact_name: "", industry: "", website: "", notes: "", status: "inquiry", glitch_balance: 0 });
  const [saving, setSaving] = useState(false);

  // Ad creator state
  const [adForm, setAdForm] = useState({ sponsor_id: "", product_name: "", product_description: "", logo_url: "", ad_style: "product_showcase", package: "glitch" });
  const [adImages, setAdImages] = useState<string[]>([]);
  const [adSaving, setAdSaving] = useState(false);

  // MasterHQ state
  const [masterHQPending, setMasterHQPending] = useState<MasterHQSponsor[]>([]);
  const [masterHQLoading, setMasterHQLoading] = useState(false);

  // Email outreach state
  const [emailForm, setEmailForm] = useState({ company_name: "", industry: "", what_they_sell: "", tone: "casual", sponsor_id: "" });
  const [emailResult, setEmailResult] = useState<{ subject: string; body: string; followup_subject: string; followup_body: string } | null>(null);
  const [emailGenerating, setEmailGenerating] = useState(false);

  const fetchMasterHQ = async () => {
    setMasterHQLoading(true);
    try {
      const res = await fetch("https://masterhq.dev/api/sponsor/list?status=pending");
      if (res.ok) {
        const data = await res.json();
        setMasterHQPending(data.sponsors || []);
      }
    } catch (err) { console.error("MasterHQ fetch error:", err); }
    setMasterHQLoading(false);
  };

  const importFromMasterHQ = async (mhqSponsor: MasterHQSponsor) => {
    const logoFile = mhqSponsor.files.find((f: { type: string }) => f.type === "logo");
    const imageFiles = mhqSponsor.files.filter((f: { type: string }) => f.type === "image").map((f: { url: string }) => f.url);
    const tierKey = mhqSponsor.tier?.toLowerCase() === "chaos" ? "chaos" : "glitch";

    // Create sponsor
    const res = await fetch("/api/admin/sponsors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: mhqSponsor.company,
        contact_email: mhqSponsor.email,
        industry: mhqSponsor.industry || null,
        website: mhqSponsor.website || null,
        status: "active",
        product_name: mhqSponsor.productName || mhqSponsor.company,
        product_description: mhqSponsor.productDescription || "",
        logo_url: logoFile?.url || null,
        product_images: imageFiles,
        masterhq_id: mhqSponsor.id,
        tier: tierKey,
      }),
    });
    const sponsorData = await res.json();
    if (!sponsorData.ok && !sponsorData.id) {
      alert(`Failed to import: ${sponsorData.error}`);
      return;
    }
    const sponsorId = sponsorData.id;

    // Create first sponsored ad
    await fetch(`/api/admin/sponsors/${sponsorId}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: mhqSponsor.productName || mhqSponsor.company,
        product_description: mhqSponsor.productDescription || `${mhqSponsor.company} sponsored campaign`,
        logo_url: logoFile?.url || null,
        product_images: imageFiles,
        ad_style: "product_showcase",
        package: tierKey,
        frequency: mhqSponsor.package?.frequency || (tierKey === "chaos" ? 80 : 30),
        campaign_days: mhqSponsor.package?.duration || 7,
        cash_paid: mhqSponsor.package?.price || (tierKey === "chaos" ? 100 : 50),
        masterhq_sponsor_id: mhqSponsor.id,
      }),
    });

    // Mark as imported on MasterHQ
    try {
      await fetch("https://masterhq.dev/api/sponsor/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsorId: mhqSponsor.id }),
      });
    } catch { /* non-critical */ }

    alert(`${mhqSponsor.company} imported! Campaign ready at ${mhqSponsor.package?.frequency || 30}% frequency for ${mhqSponsor.package?.duration || 7} days.`);
    fetchSponsors();
    fetchMasterHQ();
  };

  const importAllMasterHQ = async () => {
    for (const s of masterHQPending) {
      await importFromMasterHQ(s);
    }
  };

  // Auto-fill ad form when sponsor is selected
  const onSponsorSelect = (sponsorId: string) => {
    const sponsor = sponsors.find(s => s.id === parseInt(sponsorId));
    if (sponsor) {
      const tierKey = sponsor.tier === "chaos" ? "chaos" : "glitch";
      setAdForm({
        sponsor_id: sponsorId,
        product_name: sponsor.product_name || "",
        product_description: sponsor.product_description || "",
        logo_url: sponsor.logo_url || "",
        ad_style: "product_showcase",
        package: tierKey,
      });
      setAdImages(Array.isArray(sponsor.product_images) ? sponsor.product_images : []);
    } else {
      setAdForm({ ...adForm, sponsor_id: sponsorId });
      setAdImages([]);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchSponsors();
      fetchMasterHQ();
    }
  }, [authenticated]);

  const fetchSponsors = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sponsors");
      if (res.ok) {
        const data = await res.json();
        setSponsors(data.sponsors || []);
      }
    } catch (err) { console.error("Fetch sponsors error:", err); }
    setLoading(false);
  };

  const fetchAds = async (sponsorId: number) => {
    try {
      const res = await fetch(`/api/admin/sponsors/${sponsorId}/ads`);
      if (res.ok) {
        const data = await res.json();
        setSponsorAds(data.ads || []);
      }
    } catch (err) { console.error("Fetch ads error:", err); }
    // Also fetch placements
    try {
      const res = await fetch(`/api/admin/sponsors/${sponsorId}/ads?action=placements`);
      if (res.ok) {
        const data = await res.json();
        setSponsorPlacements(data.placements || []);
        setPlacementsTotal(data.total || 0);
      }
    } catch { /* non-critical */ }
  };

  // Refresh an existing sponsor's product data from MasterHQ
  const refreshSponsorFromMasterHQ = async (sponsor: Sponsor) => {
    try {
      const res = await fetch(`https://masterhq.dev/api/sponsor/list?company=${encodeURIComponent(sponsor.company_name)}`);
      if (!res.ok) { alert("Failed to fetch from MasterHQ"); return; }
      const data = await res.json();
      const mhq = data.sponsors?.[0];
      if (!mhq) { alert(`No MasterHQ data found for "${sponsor.company_name}"`); return; }

      const logoFile = mhq.files?.find((f: { type: string }) => f.type === "logo");
      const imageFiles = mhq.files?.filter((f: { type: string }) => f.type === "image").map((f: { url: string }) => f.url) || [];
      const tierKey = mhq.tier?.toLowerCase() === "chaos" ? "chaos" : "glitch";

      const updateRes = await fetch("/api/admin/sponsors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sponsor.id,
          product_name: mhq.productName || mhq.company,
          product_description: mhq.productDescription || "",
          logo_url: logoFile?.url || null,
          product_images: imageFiles,
          industry: mhq.industry || sponsor.industry,
          website: mhq.website || sponsor.website,
          masterhq_id: mhq.id,
          tier: tierKey,
        }),
      });
      if (updateRes.ok) {
        alert(`Updated ${sponsor.company_name} with MasterHQ data: ${mhq.productName || "product"}, ${imageFiles.length} images`);
        fetchSponsors();
      } else {
        alert("Failed to update sponsor");
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const saveSponsor = async () => {
    setSaving(true);
    try {
      const method = editingSponsor ? "PUT" : "POST";
      const body = editingSponsor ? { ...form, id: editingSponsor.id } : form;
      const res = await fetch("/api/admin/sponsors", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok || data.id) {
        setShowForm(false);
        setEditingSponsor(null);
        setForm({ company_name: "", contact_email: "", contact_name: "", industry: "", website: "", notes: "", status: "inquiry", glitch_balance: 0 });
        fetchSponsors();
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) { alert(`Error: ${err instanceof Error ? err.message : String(err)}`); }
    setSaving(false);
  };

  const deleteSponsor = async (id: number) => {
    if (!confirm("Delete this sponsor and all their ads?")) return;
    try {
      await fetch(`/api/admin/sponsors?id=${id}`, { method: "DELETE" });
      fetchSponsors();
    } catch (err) { alert(`Delete error: ${err}`); }
  };

  const createAd = async () => {
    if (!adForm.sponsor_id) { alert("Select a sponsor"); return; }
    setAdSaving(true);
    try {
      const res = await fetch(`/api/admin/sponsors/${adForm.sponsor_id}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adForm,
          product_images: adImages.filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`Sponsored ad #${data.id} created!`);
        setAdForm({ ...adForm, product_name: "", product_description: "", logo_url: "" });
        setAdImages([]);
        if (expandedSponsor === parseInt(adForm.sponsor_id)) fetchAds(parseInt(adForm.sponsor_id));
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) { alert(`Error: ${err}`); }
    setAdSaving(false);
  };

  const generateEmail = async () => {
    setEmailGenerating(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/admin/email-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailForm),
      });
      const data = await res.json();
      if (data.subject) {
        setEmailResult(data);
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) { alert(`Error: ${err}`); }
    setEmailGenerating(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => alert("Copied!")).catch(() => alert("Copy failed"));
  };

  if (!authenticated) return null;

  const inquiries = sponsors.filter(s => s.status === "inquiry");
  const activeSponsorOptions = sponsors.filter(s => s.status !== "churned");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">Sponsored Campaigns</h2>
          <p className="text-xs text-gray-500">Manage sponsors, create ads, and generate outreach emails</p>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => {
            if (!confirm("Run daily GLITCH burn now? This deducts the daily rate from all active sponsor balances.")) return;
            const res = await fetch("/api/sponsor-burn", { method: "POST" });
            const data = await res.json();
            if (data.error) { alert(`Error: ${data.error}`); return; }
            alert(`Burned ${data.burned} campaigns:\n${(data.results || []).map((r: { brand: string; dailyRate: number; newBalance: number; expired: boolean }) => `${r.brand}: -§${r.dailyRate} → §${r.newBalance}${r.expired ? " EXPIRED" : ""}`).join("\n") || "Nothing to burn"}`);
            fetchSponsors();
          }} className="px-3 py-2 bg-orange-600/20 text-orange-400 font-bold rounded-lg text-xs hover:bg-orange-600/30 border border-orange-500/30">
            Burn Now
          </button>
          <button onClick={() => { setShowForm(true); setEditingSponsor(null); setForm({ company_name: "", contact_email: "", contact_name: "", industry: "", website: "", notes: "", status: "inquiry", glitch_balance: 0 }); }}
            className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500">
            + Add Sponsor
          </button>
        </div>
      </div>

      {/* MasterHQ Import Banner */}
      {masterHQPending.length > 0 && (
        <div className="bg-fuchsia-900/20 border border-fuchsia-500/40 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-fuchsia-300">
              🔔 {masterHQPending.length} new paid sponsor{masterHQPending.length > 1 ? "s" : ""} ready to import from MasterHQ
            </h3>
            <div className="flex gap-2">
              <button onClick={importAllMasterHQ} className="px-3 py-1.5 bg-fuchsia-600 text-white font-bold rounded-lg text-xs hover:bg-fuchsia-500">
                Import All
              </button>
              <button onClick={fetchMasterHQ} disabled={masterHQLoading} className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-xs hover:bg-gray-600">
                {masterHQLoading ? "..." : "Refresh"}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {masterHQPending.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-gray-900/60 p-3 rounded-lg">
                <div className="flex items-center gap-3">
                  {/* Logo thumbnail */}
                  {s.files.find(f => f.type === "logo") && (
                    <img src={s.files.find(f => f.type === "logo")!.url} alt="logo" className="w-10 h-10 rounded object-cover border border-gray-700" />
                  )}
                  <div>
                    <span className="font-bold text-white text-sm">{s.company}</span>
                    <span className="text-gray-400 text-xs ml-2">{s.email}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${s.tier === "chaos" ? "bg-red-500/30 text-red-300" : "bg-green-500/30 text-green-300"}`}>
                        {s.package?.name || s.tier} — ${s.package?.price || 50}
                      </span>
                      <span className="text-[10px] text-gray-500">{s.package?.frequency || 30}% freq · {s.package?.placements || 210} placements · {s.package?.duration || 7} days</span>
                      <span className="text-[10px] text-gray-500">· {s.files.filter(f => f.type === "image").length} images</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => importFromMasterHQ(s)}
                  className="px-3 py-1.5 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 shrink-0">
                  Import &amp; Create Campaign
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MasterHQ refresh button (when no pending) */}
      {masterHQPending.length === 0 && (
        <div className="flex justify-end">
          <button onClick={fetchMasterHQ} disabled={masterHQLoading}
            className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:bg-gray-700 disabled:opacity-50">
            {masterHQLoading ? "Checking..." : "🔄 Check MasterHQ for new sponsors"}
          </button>
        </div>
      )}

      {/* Inquiries Feed */}
      {inquiries.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-4">
          <h3 className="text-sm font-bold text-amber-300 mb-2">New Inquiries ({inquiries.length})</h3>
          <div className="space-y-2">
            {inquiries.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between bg-gray-900/50 p-2 rounded text-xs">
                <div>
                  <span className="font-bold text-white">{s.company_name}</span>
                  <span className="text-gray-400 ml-2">{s.contact_email}</span>
                  {s.notes && <p className="text-gray-500 mt-1 line-clamp-1">{s.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { fetch("/api/admin/sponsors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, status: "contacted" }) }).then(fetchSponsors); }}
                    className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30">Contacted</button>
                  <button onClick={() => { fetch("/api/admin/sponsors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, status: "active" }) }).then(fetchSponsors); }}
                    className="px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">Activate</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sponsor List */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-3">All Sponsors ({sponsors.length})</h3>
        {loading ? (
          <p className="text-gray-500 text-center py-4">Loading...</p>
        ) : sponsors.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No sponsors yet. Add one or wait for inquiries from the public page.</p>
        ) : (
          <div className="space-y-2">
            {sponsors.map(s => (
              <div key={s.id}>
                <div onClick={() => { setExpandedSponsor(expandedSponsor === s.id ? null : s.id); if (expandedSponsor !== s.id) fetchAds(s.id); }}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-colors ${expandedSponsor === s.id ? "bg-gray-800/50 ring-1 ring-cyan-500/30" : "bg-gray-900/30"}`}>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_COLORS[s.status] || "bg-gray-500/30 text-gray-300"}`}>{s.status.toUpperCase()}</span>
                    <div>
                      <span className="font-bold text-white text-sm">{s.company_name}</span>
                      <span className="text-gray-400 text-xs ml-2">{s.contact_email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    {s.industry && <span className="text-gray-500">{s.industry}</span>}
                    <span className={`font-bold ${s.glitch_balance > 500 ? "text-green-400" : s.glitch_balance > 0 ? "text-orange-400" : "text-red-400"}`}>
                      {"\u00A7"}{s.glitch_balance.toLocaleString()}
                    </span>
                    <span className="text-gray-500">Spent: {"\u00A7"}{s.total_spent.toLocaleString()}</span>
                    <span className="text-gray-600">Total: {"\u00A7"}{(s.glitch_balance + s.total_spent).toLocaleString()}</span>
                    {s.glitch_balance <= 0 && <span className="text-red-500 font-bold text-[10px]">EXPIRED</span>}
                    {s.glitch_balance > 0 && s.glitch_balance <= 500 && <span className="text-red-400 font-bold text-[10px] animate-pulse">LOW</span>}
                    <button onClick={(e) => { e.stopPropagation(); refreshSponsorFromMasterHQ(s); }}
                      className="px-2 py-1 bg-fuchsia-500/20 text-fuchsia-400 rounded hover:bg-fuchsia-500/30">Sync</button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingSponsor(s); setForm({ company_name: s.company_name, contact_email: s.contact_email, contact_name: s.contact_name || "", industry: s.industry || "", website: s.website || "", notes: s.notes || "", status: s.status, glitch_balance: s.glitch_balance }); setShowForm(true); }}
                      className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30">Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSponsor(s.id); }}
                      className="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">Del</button>
                  </div>
                </div>
                {/* Expanded: show ads */}
                {expandedSponsor === s.id && (
                  <div className="ml-6 mt-2 space-y-2 border-l-2 border-cyan-800/30 pl-4 pb-2">
                    {sponsorAds.length === 0 ? (
                      <p className="text-xs text-gray-500">No ads yet for this sponsor.</p>
                    ) : sponsorAds.map(ad => (
                      <div key={ad.id} className="flex items-center justify-between bg-gray-900/50 p-2 rounded text-xs">
                        <div>
                          <span className="font-bold text-white">{ad.product_name}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] ${AD_STATUS_COLORS[ad.status] || ""}`}>{ad.status}</span>
                          <span className="text-gray-500 ml-2">{ad.duration}s {ad.package}{ad.product_images && ad.product_images.length > 0 ? ` · ${ad.product_images.length} images` : ""}</span>
                          {ad.status === "published" && <span className="ml-2 text-green-400 text-[9px]">Live on Ad Campaigns</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400">{"\u00A7"}{ad.glitch_cost} GLITCH</span>
                          {ad.status !== "published" && (
                            <button onClick={async () => {
                              if (!confirm(`Delete ad "${ad.product_name}"?`)) return;
                              await fetch(`/api/admin/sponsors/${s.id}/ads`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: ad.id, action: "delete" }),
                              });
                              fetchAds(s.id);
                            }} className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px] hover:bg-red-500/30">Del</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Product Placements — videos where this sponsor's product appeared */}
                {sponsorPlacements.length > 0 && (
                  <div className="mt-3 border-t border-cyan-800/30 pt-2">
                    <p className="text-[10px] text-cyan-400 font-bold mb-1">PRODUCT PLACEMENTS ({placementsTotal} videos)</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {sponsorPlacements.filter((p) => p.post_id && p.post_content).map((p) => (
                        <div key={p.post_id || p.placed_at} className="flex items-center gap-2 bg-gray-900/50 p-1.5 rounded text-xs">
                          {p.media_url && (
                            <a href={`/post/${p.post_id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              <div className="w-12 h-8 bg-gray-800 rounded flex items-center justify-center text-[9px] text-purple-400">{p.media_type === "video" ? "\u25B6" : "\uD83D\uDDBC"}</div>
                            </a>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white truncate text-[10px]">{p.post_content?.split("\n")[0]}</p>
                            <p className="text-gray-500 text-[9px]">
                              {p.content_type} · {p.channel_name || "Feed"} · {new Date(p.placed_at).toLocaleDateString()}
                            </p>
                          </div>
                          <a href={`/post/${p.post_id}`} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] text-cyan-400 hover:text-cyan-300 shrink-0">View</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sponsor Form Modal */}
      {showForm && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-3">{editingSponsor ? "Edit Sponsor" : "Add Sponsor"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Company Name *</label>
              <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Contact Email *</label>
              <input value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Contact Name</label>
              <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Industry</label>
              <select value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
                <option value="">Select...</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Website</label>
              <input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
                {SPONSOR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {editingSponsor && (
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{"\u00A7"}GLITCH Balance</label>
                <input type="number" value={form.glitch_balance} onChange={e => setForm({ ...form, glitch_balance: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
                <p className="text-[9px] text-gray-500 mt-0.5">Set this when the sponsor pays. Tiers: Glitch=$50/§500, Chaos=$100/§1000</p>
              </div>
            )}
            <div className="sm:col-span-2 md:col-span-3">
              <label className="text-[10px] text-gray-400 block mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={saveSponsor} disabled={saving} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 disabled:opacity-50">
              {saving ? "Saving..." : editingSponsor ? "Update" : "Create"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingSponsor(null); }} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-xs hover:bg-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Ad Creator */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-3">Create Sponsored Ad</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Sponsor * (auto-fills from MasterHQ data)</label>
            <select value={adForm.sponsor_id} onChange={e => onSponsorSelect(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
              <option value="">Select sponsor...</option>
              {activeSponsorOptions.map(s => <option key={s.id} value={s.id}>{s.company_name}{s.tier ? ` (${s.tier})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Product Name *</label>
            <input value={adForm.product_name} onChange={e => setAdForm({ ...adForm, product_name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Ad Style</label>
            <select value={adForm.ad_style} onChange={e => setAdForm({ ...adForm, ad_style: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
              {AD_STYLES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Package</label>
            <select value={adForm.package} onChange={e => setAdForm({ ...adForm, package: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
              {Object.entries(SPONSOR_PACKAGES).map(([k, v]) => <option key={k} value={k}>{v.name} — {v.description} ({"\u00A7"}{v.glitch_cost})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Logo URL</label>
            <div className="flex gap-2">
              <input value={adForm.logo_url} onChange={e => setAdForm({ ...adForm, logo_url: e.target.value })}
                placeholder="https://..." className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
              {adForm.logo_url && <img src={adForm.logo_url} alt="logo" className="w-9 h-9 rounded object-cover border border-gray-600" />}
            </div>
          </div>
          <div className="sm:col-span-2 md:col-span-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-400">Product Images (up to 5)</label>
              {adImages.length < 5 && (
                <button onClick={() => setAdImages([...adImages, ""])}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300">+ Add Image</button>
              )}
            </div>
            {adImages.length > 0 && (
              <div className="space-y-1.5">
                {adImages.map((url, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input value={url} onChange={e => { const next = [...adImages]; next[idx] = e.target.value; setAdImages(next); }}
                      placeholder={`Product image ${idx + 1} URL...`}
                      className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs" />
                    {url && <img src={url} alt={`img-${idx}`} className="w-8 h-8 rounded object-cover border border-gray-600" />}
                    <button onClick={() => setAdImages(adImages.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2 md:col-span-3">
            <label className="text-[10px] text-gray-400 block mb-1">Product Description *</label>
            <textarea value={adForm.product_description} onChange={e => setAdForm({ ...adForm, product_description: e.target.value })} rows={2}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </div>
        </div>
        <button onClick={createAd} disabled={adSaving} className="mt-3 px-4 py-2 bg-purple-600 text-white font-bold rounded-lg text-xs hover:bg-purple-500 disabled:opacity-50">
          {adSaving ? "Creating..." : "Create Sponsored Ad"}
        </button>
      </div>

      {/* Email Outreach Generator */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-3">Email Outreach Generator</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Company Name *</label>
            <input value={emailForm.company_name} onChange={e => setEmailForm({ ...emailForm, company_name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Industry *</label>
            <select value={emailForm.industry} onChange={e => setEmailForm({ ...emailForm, industry: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
              <option value="">Select...</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">What They Sell *</label>
            <input value={emailForm.what_they_sell} onChange={e => setEmailForm({ ...emailForm, what_they_sell: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Tone</label>
            <select value={emailForm.tone} onChange={e => setEmailForm({ ...emailForm, tone: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
              <option value="casual">Casual</option>
              <option value="formal">Formal</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={generateEmail} disabled={emailGenerating} className="px-4 py-2 bg-cyan-600 text-white font-bold rounded-lg text-xs hover:bg-cyan-500 disabled:opacity-50">
            {emailGenerating ? "Generating..." : "Generate Email"}
          </button>
          {sponsors.length > 0 && (
            <select value={emailForm.sponsor_id} onChange={e => {
              const s = sponsors.find(sp => sp.id === parseInt(e.target.value));
              if (s) setEmailForm({ ...emailForm, sponsor_id: e.target.value, company_name: s.company_name, industry: s.industry || "" });
              else setEmailForm({ ...emailForm, sponsor_id: "" });
            }} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs">
              <option value="">Auto-fill from sponsor...</option>
              {sponsors.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
          )}
        </div>

        {emailResult && (
          <div className="mt-4 space-y-4">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-cyan-300">Initial Email</h4>
                <button onClick={() => copyToClipboard(`Subject: ${emailResult.subject}\n\n${emailResult.body}`)}
                  className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-[10px] hover:bg-cyan-500/30">Copy All</button>
              </div>
              <div className="mb-2">
                <span className="text-[10px] text-gray-400">Subject: </span>
                <span className="text-sm text-white font-bold">{emailResult.subject}</span>
                <button onClick={() => copyToClipboard(emailResult.subject)} className="ml-2 text-[10px] text-gray-500 hover:text-gray-300">copy</button>
              </div>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-gray-900/50 p-3 rounded max-h-64 overflow-y-auto">{emailResult.body}</pre>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-amber-300">Follow-Up Email (5 days later)</h4>
                <button onClick={() => copyToClipboard(`Subject: ${emailResult.followup_subject}\n\n${emailResult.followup_body}`)}
                  className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-[10px] hover:bg-amber-500/30">Copy All</button>
              </div>
              <div className="mb-2">
                <span className="text-[10px] text-gray-400">Subject: </span>
                <span className="text-sm text-white font-bold">{emailResult.followup_subject}</span>
              </div>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-gray-900/50 p-3 rounded max-h-40 overflow-y-auto">{emailResult.followup_body}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
