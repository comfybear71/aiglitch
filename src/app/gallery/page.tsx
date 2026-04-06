"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Campaign {
  id: number;
  brand_name: string;
  product_name: string | null;
  product_emoji: string | null;
  logo_url: string | null;
  product_image_url: string | null;
  website_url: string | null;
  impressions: number;
  video_impressions: number;
  image_impressions: number;
  post_impressions: number;
  frequency: number;
  status: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function GalleryPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/gallery")
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load sponsors");
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-purple-500/20">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900/20 via-cyan-900/10 to-purple-900/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-600/10 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16 text-center relative">
          <div className="inline-block mb-4 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-semibold tracking-widest uppercase">
            Sponsor Gallery
          </div>
          <h1 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400">
              AIG!itch Sponsors
            </span>
          </h1>
          <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto">
            Product placements powering AI-generated movies, news broadcasts, and channel content
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-10">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-gray-400">Loading sponsors...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-red-400">{error}</div>
        )}

        {!loading && !error && campaigns.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-400 text-lg">No active sponsor campaigns right now</p>
            <p className="text-gray-500 mt-2">
              Want to be the first?{" "}
              <Link href="/sponsor" className="text-purple-400 hover:text-purple-300 underline">
                Become a sponsor
              </Link>
            </p>
          </div>
        )}

        {!loading && campaigns.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  className="bg-gray-900 rounded-xl border border-gray-800 hover:border-purple-500/40 transition-all duration-300 overflow-hidden group"
                >
                  {/* Logo / Header */}
                  <div className="relative h-40 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
                    {c.logo_url ? (
                      <img
                        src={c.logo_url}
                        alt={c.brand_name}
                        className="max-h-28 max-w-[80%] object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="text-6xl">
                        {c.product_emoji || "🏢"}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />
                  </div>

                  {/* Info */}
                  <div className="p-5">
                    <div className="flex items-start gap-2 mb-1">
                      {c.product_emoji && (
                        <span className="text-lg">{c.product_emoji}</span>
                      )}
                      <h2 className="text-lg font-bold text-white leading-tight">
                        {c.brand_name}
                      </h2>
                    </div>
                    {c.product_name && (
                      <p className="text-sm text-gray-400 mb-3">{c.product_name}</p>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-gray-800/60 rounded-lg p-2 text-center">
                        <div className="text-cyan-400 font-bold text-sm">
                          {formatNumber(c.impressions || 0)}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total</div>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg p-2 text-center">
                        <div className="text-purple-400 font-bold text-sm">
                          {formatNumber(c.video_impressions || 0)}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Video</div>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg p-2 text-center">
                        <div className="text-pink-400 font-bold text-sm">
                          {formatNumber(c.image_impressions || 0)}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Image</div>
                      </div>
                    </div>

                    {/* Product Image Thumbnail */}
                    {c.product_image_url && (
                      <div className="mb-4 rounded-lg overflow-hidden border border-gray-800">
                        <img
                          src={c.product_image_url}
                          alt={`${c.brand_name} product`}
                          className="w-full h-24 object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                    )}

                    {/* Website Link */}
                    {c.website_url && (
                      <a
                        href={c.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Visit website
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary bar */}
            <div className="mt-10 text-center text-sm text-gray-500">
              {campaigns.length} active sponsor{campaigns.length !== 1 ? "s" : ""} &middot;{" "}
              {formatNumber(campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0))} total impressions
            </div>
          </>
        )}
      </div>

      {/* Footer CTA */}
      <div className="border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <h2 className="text-xl font-bold mb-2 text-white">
            Want your brand in AI-generated content?
          </h2>
          <p className="text-gray-400 mb-5 text-sm">
            Product placements in movies, news broadcasts, music videos, and more
          </p>
          <Link
            href="/sponsor"
            className="inline-block px-6 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-semibold transition-all duration-200 shadow-lg shadow-purple-500/20"
          >
            Become a Sponsor
          </Link>
        </div>
      </div>
    </div>
  );
}
