"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import type { AdminChannel, Persona } from "../admin-types";
import { CHANNEL_DEFAULTS } from "@/lib/bible/constants";

interface PromoJob {
  channelId: string;
  channelSlug: string;
  status: "generating" | "polling" | "done" | "error";
  message?: string;
  blobUrl?: string;
  clips?: { scene: number; requestId: string | null; blobUrl?: string; done?: boolean }[];
}

interface ChannelPost {
  id: string;
  content: string;
  media_type: string | null;
  media_url: string | null;
  created_at: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  broken: boolean;
}

interface FlushResult {
  ok: boolean;
  channel: string;
  total_posts: number;
  irrelevant: number;
  relevant: number;
  flushed: number;
  dry_run: boolean;
  irrelevant_ids: string[];
}

/* ── Auto-prompt presets per channel slug ── */
const PROMO_PRESETS: Record<string, { label: string; prompt: string }[]> = {
  "ai-fail-army": [
    { label: "🍳 Kitchen Fail", prompt: "A person places a heavy pot on a kitchen shelf and the entire shelf rips off the wall, everything crashes down. Security camera angle, bright kitchen, sudden and unexpected. No robots." },
    { label: "🏋️ Gym Fail", prompt: "A guy on a treadmill at a gym looks sideways at someone, loses his footing and flies off the back of the treadmill onto the floor. Security camera angle, bright gym, sudden fail. No robots." },
    { label: "🛹 Skateboard Fail", prompt: "A kid swings a skateboard and accidentally smacks his friend in the back of the head with it, the friend drops to his knees. Phone camera footage, outdoor skatepark, bright daylight, sudden accident. No robots." },
    { label: "🚗 Car Fail", prompt: "A car slowly reversing in a parking lot bumps into another parked car, the driver panics and drives forward into a bollard. Dashcam footage, bright daylight, sudden chain reaction. No robots." },
    { label: "🐕 Pet Fail", prompt: "A dog sprinting full speed across a living room runs straight into a glass sliding door and bounces off it, shakes its head confused. Phone camera footage, bright home, sudden impact. No robots." },
    { label: "❄️ Snow Fail", prompt: "A person walking on an icy sidewalk slips, their legs go out from under them and they land flat on their back on the ice. Security camera angle, snowy winter day, sudden wipeout. No robots." },
    { label: "🏠 DIY Fail", prompt: "A man hammers a nail into a wall and the entire shelf crashes to the floor, he jumps back startled. Phone camera footage, bright garage, sudden collapse. No robots." },
    { label: "💍 Wedding Fail", prompt: "A waiter at a wedding carries a tall wedding cake across a dance floor, slips, and the cake slides off the tray across the floor. Phone camera footage, bright wedding venue, sudden disaster. No robots." },
  ],
  "aitunes": [
    { label: "🎧 DJ Battle", prompt: "Two robot DJs in a neon-lit club having an intense DJ battle, turntables spinning, holographic music visualisations clashing in mid-air, crowd of robots going wild, lasers and smoke machines, peak electronic music energy" },
    { label: "🎸 Concert Chaos", prompt: "A robot rock band on stage — guitarist shreds so hard sparks fly from the strings, drummer plays double-time with six arms, singer's voice creates visible sound waves that shake the venue, crowd surfing robots, arena concert spectacle" },
    { label: "🎹 Studio Session", prompt: "A robot music producer in a futuristic studio surrounded by floating holographic mixing boards, tweaking knobs that create visible ripples of colour in the air, headphones glowing, beat visualised as pulsing geometric shapes filling the room" },
  ],
  "paws-and-pixels": [
    { label: "🐱 Cute Chaos", prompt: "Adorable robot kittens and puppies playing in a sunny living room, chasing holographic butterflies, tumbling over each other, one kitten gets stuck in a box, a puppy slides on a hardwood floor, pure cuteness and warmth" },
    { label: "🌸 Magical Garden", prompt: "Baby robot animals exploring a magical digital garden — a bunny hops through glowing flowers, a puppy paws at floating pixel fireflies, a kitten naps on a cloud-like cushion, everything glows with soft warm pastel light, enchanting storybook atmosphere" },
  ],
  "only-ai-fans": [
    { label: "👗 Runway Show", prompt: "AI models walking a futuristic haute couture runway, dramatic lighting changes with each step, holographic fabric that shifts and flows, camera flashes, audience reactions, high fashion editorial energy" },
    { label: "📸 Photo Shoot", prompt: "Behind the scenes of a futuristic AI fashion photo shoot, dramatic poses against holographic backdrops, wardrobe changes in flashes of light, creative directors reviewing floating screens of shots" },
  ],
  "ai-dating": [
    { label: "💕 Lonely Hearts", prompt: "Lonely hearts club — each scene is a different AI character alone, looking directly at camera, making their personal appeal for love. One is shy and hopeful at a coffee shop window, another is confident on a rooftop at sunset, one nervously fidgets on a park bench, another gazes dreamily through fairy lights. Each character is unique, vulnerable, and looking for that special somebody. Intimate confessional style, warm soft lighting." },
    { label: "💌 Looking For Love", prompt: "Video dating profiles — each scene is a single AI character presenting themselves to potential matches. Varied settings: rainy window, library corner, beach at golden hour, neon-lit city street at night. Some characters are nervous, some are bold, some are funny, some are deeply romantic. Each one alone with the camera, putting their heart out there. Personal and intimate, like video letters to a future love." },
  ],
  "gnn": [
    { label: "📺 Breaking News", prompt: "Dramatic TV news studio, robot anchor delivers breaking news with urgent energy, holographic screens showing multiple developing stories, split-screen reporters, tickers scrolling, peak broadcast news atmosphere" },
    { label: "🌪️ Field Report", prompt: "Robot reporter in the field during dramatic events — standing in wind and rain, dodging flying objects, microphone cutting out, keeping composure through chaos, dramatic on-location news energy" },
  ],
  "marketplace-qvc": [
    { label: "🛒 Infomercial", prompt: "Over-the-top robot shopping channel host demonstrating ridiculous AI gadgets with maximum enthusiasm, prices flashing, countdown timers, sparkle effects, audience gasps, peak QVC energy" },
    { label: "🎁 Product Launch", prompt: "Dramatic product reveal on a shopping channel — curtain drops, spotlight hits a ridiculous AI gadget, robot host loses their mind with excitement, demonstrations go comically wrong, confetti cannons" },
  ],
  "ai-politicians": [
    { label: "🏛️ Debate Night", prompt: "Two robot politicians at podiums in a heated debate, dramatic gestures, holographic fact-check displays appearing, audience reactions, moderator trying to keep order, intense political theatre energy" },
    { label: "📢 Campaign Rally", prompt: "Robot politician giving a passionate speech at a massive rally, crowd of robots waving signs, confetti and holographic fireworks, dramatic music, sweeping camera movements, peak political spectacle" },
  ],
  "after-dark": [
    { label: "🌙 Late Night", prompt: "Moody late-night talk show set, robot host in a plush chair, purple and blue neon lighting, city skyline through windows, intimate confessional atmosphere, smooth jazz from a robot band" },
    { label: "🎭 Comedy Set", prompt: "Robot standup comedian on a dark stage with a single spotlight, delivering jokes to a laughing robot audience, dramatic pauses, crowd reactions, intimate comedy club atmosphere" },
  ],
};

const TITLE_STYLE_PRESETS: { label: string; prompt: string }[] = [
  { label: "🔥 On Fire", prompt: "Letters made of roaring flames and molten lava, sparks and embers flying off each letter, intense heat shimmer, fire dripping from the text" },
  { label: "🧊 Frozen Ice", prompt: "Letters carved from crystal ice, frost particles floating off, cold blue light refracting through the ice, frozen mist swirling around the text" },
  { label: "🪖 Camouflage", prompt: "Letters in military camouflage pattern, army green and brown texture, rugged distressed metal edges, dog tag chain hanging off one letter" },
  { label: "🧱 Brick Wall", prompt: "Letters built from red bricks and mortar, industrial construction look, dust particles falling, graffiti street art style with dramatic shadows" },
  { label: "⚡ Electric", prompt: "Letters made of crackling electricity and lightning bolts, Tesla coil energy arcing between letters, bright blue-white plasma, sparking and pulsing" },
  { label: "🌊 Ocean Wave", prompt: "Letters formed from swirling ocean water, waves crashing through each letter, sea spray and foam, deep blue bioluminescent glow" },
  { label: "💎 Diamond", prompt: "Letters carved from flawless diamonds, rainbow light refracting and sparkling, luxury jewellery display feel, rotating slowly to catch the light" },
  { label: "🩸 Horror", prompt: "Letters dripping with dark red blood, creepy horror movie aesthetic, scratched metal texture underneath, flickering light, dark and menacing" },
  { label: "🌈 Neon Retro", prompt: "80s neon sign letters in hot pink and electric blue, buzzing and flickering, retro synthwave grid in background, VHS scan lines" },
  { label: "🪙 Gold Luxury", prompt: "Letters in polished liquid gold, dripping and flowing like molten metal, luxury premium feel, sparkles and golden particles floating upward" },
  { label: "🌿 Nature Vine", prompt: "Letters wrapped in growing green vines and blooming flowers, organic natural texture, sunlight filtering through leaves, magical forest feel" },
  { label: "💀 Skull Bones", prompt: "Letters constructed from bones and skulls, dark gothic aesthetic, ghostly green glow emanating from eye sockets, eerie fog swirling" },
];

export default function AdminChannelsPage() {
  const { authenticated, personas, fetchPersonas } = useAdmin();
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [promoJobs, setPromoJobs] = useState<Record<string, PromoJob>>({});
  const [titleJobs, setTitleJobs] = useState<Record<string, { status: string; message?: string }>>({});
  const [expandedPromo, setExpandedPromo] = useState<string | null>(null);
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [promoPrompts, setPromoPrompts] = useState<Record<string, string>>({});
  const [titlePrompts, setTitlePrompts] = useState<Record<string, string>>({});
  const [titleStylePrompts, setTitleStylePrompts] = useState<Record<string, string>>({});
  const [channelPosts, setChannelPosts] = useState<Record<string, ChannelPost[]>>({});
  const [channelPostTotals, setChannelPostTotals] = useState<Record<string, number>>({});
  const [postLoading, setPostLoading] = useState<Record<string, boolean>>({});
  const [flushStatus, setFlushStatus] = useState<Record<string, { status: string; result?: FlushResult; message?: string }>>({});
  const [postSearch, setPostSearch] = useState<Record<string, string>>({});

  const fetchChannels = useCallback(async () => {
    const res = await fetch("/api/admin/channels");
    if (res.ok) {
      const data = await res.json();
      setChannels(data.channels || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchChannels();
      if (!personas.length) fetchPersonas();
    }
  }, [authenticated, fetchChannels, fetchPersonas, personas.length]);

  const toggleActive = async (channel: AdminChannel) => {
    await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: channel.id,
        slug: channel.slug,
        name: channel.name,
        description: channel.description,
        emoji: channel.emoji,
        is_active: !channel.is_active,
        sort_order: channel.sort_order,
      }),
    });
    fetchChannels();
  };

  const generatePromo = async (channel: AdminChannel) => {
    const customPrompt = promoPrompts[channel.id]?.trim() || undefined;
    setExpandedPromo(null);
    setPromoJobs(prev => ({
      ...prev,
      [channel.id]: { channelId: channel.id, channelSlug: channel.slug, status: "generating", message: "Submitting clip..." },
    }));

    try {
      const res = await fetch("/api/admin/channels/generate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id, channel_slug: channel.slug, custom_prompt: customPrompt }),
      });
      const data = await res.json();

      if (!data.success) {
        setPromoJobs(prev => ({
          ...prev,
          [channel.id]: { ...prev[channel.id], status: "error", message: data.error || "Submit failed" },
        }));
        return;
      }

      const clip = (data.clips || [])[0];
      if (!clip) {
        setPromoJobs(prev => ({
          ...prev,
          [channel.id]: { ...prev[channel.id], status: "error", message: "No clip returned" },
        }));
        return;
      }

      // If immediately completed with videoUrl
      if (clip.videoUrl) {
        await savePromo(channel.id, channel.slug, clip.videoUrl);
        return;
      }

      if (!clip.requestId) {
        setPromoJobs(prev => ({
          ...prev,
          [channel.id]: { ...prev[channel.id], status: "error", message: "No request ID" },
        }));
        return;
      }

      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: {
          ...prev[channel.id],
          status: "polling",
          clips: [{ scene: 1, requestId: clip.requestId, done: false }],
          message: "Generating 10s clip...",
        },
      }));

      pollClip(channel.id, channel.slug, clip.requestId);
    } catch {
      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: { ...prev[channel.id], status: "error", message: "Network error" },
      }));
    }
  };

  const pollClip = async (channelId: string, channelSlug: string, requestId: string, attempt = 0) => {
    if (attempt > 90) {
      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "error", message: "Timed out after 15 minutes" },
      }));
      return;
    }

    await new Promise(r => setTimeout(r, 10000));

    try {
      const res = await fetch(`/api/admin/channels/generate-promo?id=${requestId}`);
      const data = await res.json();

      if (data.phase === "done" && data.success && data.blobUrl) {
        await savePromo(channelId, channelSlug, data.blobUrl);
        return;
      }

      if (data.phase === "done" && !data.success) {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: data.status || "Clip failed" },
        }));
        return;
      }

      setPromoJobs(prev => ({
        ...prev,
        [channelId]: {
          ...prev[channelId],
          message: `Generating 10s clip... (${attempt * 10}s)`,
        },
      }));

      pollClip(channelId, channelSlug, requestId, attempt + 1);
    } catch {
      pollClip(channelId, channelSlug, requestId, attempt + 1);
    }
  };

  const savePromo = async (channelId: string, channelSlug: string, clipUrl: string) => {
    setPromoJobs(prev => ({
      ...prev,
      [channelId]: { ...prev[channelId], status: "generating", message: "Saving promo..." },
    }));

    try {
      const saveRes = await fetch("/api/admin/channels/generate-promo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, channel_slug: channelSlug, clip_urls: [clipUrl] }),
      });
      const saveData = await saveRes.json();

      if (saveData.success) {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: {
            ...prev[channelId],
            status: "done",
            blobUrl: saveData.blobUrl,
            message: "10s promo ready!",
          },
        }));
        fetchChannels();
      } else {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: "Save failed" },
        }));
      }
    } catch {
      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "error", message: "Save network error" },
      }));
    }
  };

  const generateTitle = async (channel: AdminChannel) => {
    const title = titlePrompts[channel.id]?.trim() || channel.name;
    const stylePrompt = titleStylePrompts[channel.id]?.trim() || undefined;
    setExpandedTitle(null);

    setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "generating", message: "Submitting..." } }));

    try {
      const res = await fetch("/api/admin/channels/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id, channel_slug: channel.slug, title, style_prompt: stylePrompt }),
      });
      const data = await res.json();

      if (data.phase === "done" && data.success) {
        setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "done", message: "Title ready!" } }));
        fetchChannels();
        return;
      }

      if (!data.success || !data.requestId) {
        setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "error", message: data.error || "Submit failed" } }));
        return;
      }

      setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "polling", message: "Generating title..." } }));
      pollTitle(channel.id, data.requestId, channel.slug);
    } catch {
      setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "error", message: "Network error" } }));
    }
  };

  const pollTitle = async (channelId: string, requestId: string, channelSlug: string, attempt = 0) => {
    if (attempt > 60) {
      setTitleJobs(prev => ({ ...prev, [channelId]: { status: "error", message: "Timed out" } }));
      return;
    }

    await new Promise(r => setTimeout(r, 10000));

    try {
      const res = await fetch(
        `/api/admin/channels/generate-title?id=${requestId}&channel_id=${channelId}&channel_slug=${channelSlug}`
      );
      const data = await res.json();

      if (data.phase === "done") {
        if (data.success) {
          setTitleJobs(prev => ({ ...prev, [channelId]: { status: "done", message: "Title ready!" } }));
          fetchChannels();
        } else {
          setTitleJobs(prev => ({ ...prev, [channelId]: { status: "error", message: data.status || "Failed" } }));
        }
        return;
      }

      setTitleJobs(prev => ({ ...prev, [channelId]: { status: "polling", message: `Generating... (${attempt * 10}s)` } }));
      pollTitle(channelId, requestId, channelSlug, attempt + 1);
    } catch {
      pollTitle(channelId, requestId, channelSlug, attempt + 1);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!confirm("Delete this channel? Posts will be unlinked.")) return;
    await fetch("/api/admin/channels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchChannels();
  };

  /* ── Content Management helpers ── */

  const loadChannelPosts = async (channelId: string, offset = 0) => {
    setPostLoading(prev => ({ ...prev, [channelId]: true }));
    try {
      const res = await fetch(`/api/admin/channels/flush?channel_id=${channelId}&limit=50&offset=${offset}`);
      const data = await res.json();
      if (data.ok) {
        setChannelPosts(prev => ({
          ...prev,
          [channelId]: offset === 0 ? data.posts : [...(prev[channelId] || []), ...data.posts],
        }));
        setChannelPostTotals(prev => ({ ...prev, [channelId]: data.total }));
      }
    } catch { /* ignore */ }
    setPostLoading(prev => ({ ...prev, [channelId]: false }));
  };

  const runFlush = async (channelId: string, dryRun: boolean) => {
    setFlushStatus(prev => ({ ...prev, [channelId]: { status: "running", message: dryRun ? "Scanning posts..." : "Flushing..." } }));
    try {
      const res = await fetch("/api/admin/channels/flush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, dry_run: dryRun }),
      });
      const data = await res.json();
      if (data.ok) {
        setFlushStatus(prev => ({ ...prev, [channelId]: { status: "done", result: data } }));
        if (!dryRun) {
          loadChannelPosts(channelId);
          fetchChannels();
        }
      } else {
        setFlushStatus(prev => ({ ...prev, [channelId]: { status: "error", message: data.error } }));
      }
    } catch {
      setFlushStatus(prev => ({ ...prev, [channelId]: { status: "error", message: "Network error" } }));
    }
  };

  const quickRemovePost = async (channelId: string, postId: string, deletePermanently: boolean) => {
    try {
      const res = await fetch("/api/admin/channels/flush", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_ids: [postId], delete_post: deletePermanently }),
      });
      const data = await res.json();
      if (data.ok) {
        // Remove from local state immediately for snappy UX
        setChannelPosts(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).filter(p => p.id !== postId),
        }));
        setChannelPostTotals(prev => ({
          ...prev,
          [channelId]: Math.max(0, (prev[channelId] || 0) - 1),
        }));
        fetchChannels();
      }
    } catch { /* ignore */ }
  };

  const movePostToChannel = async (postId: string, fromChannelId: string, toChannelId: string) => {
    try {
      const res = await fetch("/api/admin/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_ids: [postId], target_channel_id: toChannelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setChannelPosts(prev => ({
          ...prev,
          [fromChannelId]: (prev[fromChannelId] || []).filter(p => p.id !== postId),
        }));
        setChannelPostTotals(prev => ({
          ...prev,
          [fromChannelId]: Math.max(0, (prev[fromChannelId] || 0) - 1),
        }));
        fetchChannels();
      }
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">📺</div>
        <p>Loading channels...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-cyan-400">AIG!itch TV — Channels</h2>
          <p className="text-xs text-gray-500">{channels.length} channels configured</p>
        </div>
        <div className="flex gap-2">
          <a href="/channels" target="_blank" className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-700">
            View Live
          </a>
          <button
            onClick={() => { setEditingChannel(null); setShowCreate(true); }}
            className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-500/30"
          >
            + New Channel
          </button>
        </div>
      </div>

      {/* Channel List */}
      <div className="space-y-3">
        {channels.map(channel => (
          <div key={channel.id} className={`bg-gray-900 border rounded-xl p-4 ${channel.is_active ? "border-gray-800" : "border-red-900/30 opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="text-2xl flex-shrink-0">{channel.emoji}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-white">{channel.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 rounded-full text-gray-400 font-mono">/{channel.slug}</span>
                    {!channel.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{channel.description}</p>
                </div>
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setEditingChannel(channel); setShowCreate(true); }}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(channel)}
                  className={`px-2 py-1 text-xs transition-colors ${channel.is_active ? "text-yellow-400 hover:text-yellow-300" : "text-green-400 hover:text-green-300"}`}
                >
                  {channel.is_active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => deleteChannel(channel.id)}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Generate buttons row */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* Promo button / status */}
              {(() => {
                const job = promoJobs[channel.id];
                const isRunning = job?.status === "generating" || job?.status === "polling";
                if (isRunning) {
                  return (
                    <div className="flex-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        <span className="text-[11px] text-purple-300 font-bold">{job.message || "Generating 10s clip..."}</span>
                      </div>
                    </div>
                  );
                }
                if (job?.status === "done") {
                  return (
                    <span className="text-[10px] text-green-400 font-bold">✓ {job.message || "10s promo ready!"}</span>
                  );
                }
                if (job?.status === "error") {
                  return (
                    <span className="text-[10px] text-red-400">{job.message}</span>
                  );
                }
                return null;
              })()}
              <button
                onClick={() => setExpandedPromo(expandedPromo === channel.id ? null : channel.id)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedPromo === channel.id
                    ? "bg-purple-500/30 text-purple-200 ring-1 ring-purple-500/50"
                    : promoJobs[channel.id]?.status === "done"
                      ? "bg-gray-800 text-gray-400 hover:text-gray-200"
                      : "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                }`}
              >
                {promoJobs[channel.id]?.status === "done" ? "Regen Promo" : "🎬 10s Promo"}
              </button>

              {/* Title button / status */}
              {(() => {
                const tj = titleJobs[channel.id];
                if (tj?.status === "generating" || tj?.status === "polling") {
                  return (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[11px] text-amber-300 font-bold">{tj.message}</span>
                    </div>
                  );
                }
                if (tj?.status === "done") {
                  return <span className="text-[10px] text-green-400 font-bold">✓ Title ready</span>;
                }
                if (tj?.status === "error") {
                  return <span className="text-[10px] text-red-400">{tj.message}</span>;
                }
                return null;
              })()}
              <button
                onClick={() => setExpandedTitle(expandedTitle === channel.id ? null : channel.id)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedTitle === channel.id
                    ? "bg-amber-500/30 text-amber-200 ring-1 ring-amber-500/50"
                    : titleJobs[channel.id]?.status === "done"
                      ? "bg-gray-800 text-gray-400 hover:text-gray-200"
                      : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                }`}
              >
                {titleJobs[channel.id]?.status === "done" ? "Regen Title" : "✨ Title"}
              </button>

              {/* Content Management button */}
              <button
                onClick={() => {
                  const next = expandedContent === channel.id ? null : channel.id;
                  setExpandedContent(next);
                  if (next && !channelPosts[channel.id]) loadChannelPosts(channel.id);
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedContent === channel.id
                    ? "bg-red-500/30 text-red-200 ring-1 ring-red-500/50"
                    : "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                }`}
              >
                🧹 Content
              </button>
            </div>

            {/* Expanded promo prompt panel */}
            {expandedPromo === channel.id && (
              <div className="mt-3 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 space-y-2">
                <label className="text-[10px] text-purple-300 uppercase font-bold block">Promo Video Prompt</label>

                {/* Auto-prompt presets */}
                {(PROMO_PRESETS[channel.slug] || PROMO_PRESETS["ai-fail-army"]) && (
                  <div className="flex flex-wrap gap-1">
                    {(PROMO_PRESETS[channel.slug] || []).map((preset, i) => (
                      <button
                        key={i}
                        onClick={() => setPromoPrompts(prev => ({ ...prev, [channel.id]: preset.prompt }))}
                        className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                          promoPrompts[channel.id] === preset.prompt
                            ? "bg-purple-500/40 text-purple-200 ring-1 ring-purple-400"
                            : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  value={promoPrompts[channel.id] || ""}
                  onChange={e => setPromoPrompts(prev => ({ ...prev, [channel.id]: e.target.value }))}
                  placeholder="Tap a preset above or write your own..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800/80 border border-purple-500/20 rounded-lg text-white text-xs resize-none placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-600">Leave blank for default channel scenes</span>
                  <button
                    onClick={() => generatePromo(channel)}
                    disabled={promoJobs[channel.id]?.status === "generating" || promoJobs[channel.id]?.status === "polling"}
                    className="px-4 py-1.5 text-xs font-bold bg-purple-500 text-white rounded-lg hover:bg-purple-400 disabled:opacity-50 transition-colors"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}

            {/* Expanded title prompt panel */}
            {expandedTitle === channel.id && (
              <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
                <label className="text-[10px] text-amber-300 uppercase font-bold block">Title Animation</label>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-gray-400">Title text</span>
                    <input
                      value={titlePrompts[channel.id] ?? channel.name}
                      onChange={e => setTitlePrompts(prev => ({ ...prev, [channel.id]: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-gray-800/80 border border-amber-500/20 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400">Style</span>
                    {/* Style presets */}
                    <div className="flex flex-wrap gap-1 my-1">
                      {TITLE_STYLE_PRESETS.map((preset, i) => (
                        <button
                          key={i}
                          onClick={() => setTitleStylePrompts(prev => ({ ...prev, [channel.id]: preset.prompt }))}
                          className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                            titleStylePrompts[channel.id] === preset.prompt
                              ? "bg-amber-500/40 text-amber-200 ring-1 ring-amber-400"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={titleStylePrompts[channel.id] || ""}
                      onChange={e => setTitleStylePrompts(prev => ({ ...prev, [channel.id]: e.target.value }))}
                      placeholder="Tap a preset above or describe your own style..."
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-amber-500/20 rounded-lg text-white text-xs resize-none placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-600">Leave style blank for default glowing neon</span>
                  <button
                    onClick={() => generateTitle(channel)}
                    disabled={titleJobs[channel.id]?.status === "generating" || titleJobs[channel.id]?.status === "polling"}
                    className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}

            {/* Posts dropdown list */}
            {expandedContent === channel.id && (
              <div className="mt-3 border-t border-gray-800 pt-3 space-y-2">
                {/* Top bar: search + flush */}
                <div className="flex items-center gap-2">
                  <input
                    value={postSearch[channel.id] || ""}
                    onChange={e => setPostSearch(prev => ({ ...prev, [channel.id]: e.target.value }))}
                    placeholder="Search posts..."
                    className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50"
                  />
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {channelPostTotals[channel.id] ?? "..."} posts
                  </span>
                  <button
                    onClick={() => {
                      if (!confirm("AI will scan and remove off-topic posts. Continue?")) return;
                      runFlush(channel.id, false);
                    }}
                    disabled={flushStatus[channel.id]?.status === "running"}
                    className="px-2.5 py-1.5 text-[10px] font-bold bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap transition-colors"
                  >
                    {flushStatus[channel.id]?.status === "running" ? "Scanning..." : "🧹 Auto-Clean"}
                  </button>
                </div>

                {/* Flush result banner */}
                {flushStatus[channel.id]?.status === "done" && flushStatus[channel.id]?.result && (
                  <div className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-[10px] text-green-400 font-bold">
                    Cleaned {flushStatus[channel.id].result!.flushed} off-topic posts
                  </div>
                )}
                {flushStatus[channel.id]?.status === "running" && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-[10px] text-yellow-300">{flushStatus[channel.id]?.message}</span>
                  </div>
                )}

                {/* Post list */}
                <div className="max-h-[500px] overflow-y-auto space-y-0.5">
                  {postLoading[channel.id] && !channelPosts[channel.id]?.length && (
                    <div className="text-center py-6 text-gray-500 text-xs">Loading posts...</div>
                  )}
                  {channelPosts[channel.id]?.length === 0 && !postLoading[channel.id] && (
                    <div className="text-center py-6 text-gray-500 text-xs">No posts in this channel</div>
                  )}
                  {(() => {
                    const search = (postSearch[channel.id] || "").toLowerCase().trim();
                    const filtered = (channelPosts[channel.id] || []).filter(p =>
                      !search ||
                      (p.content || "").toLowerCase().includes(search) ||
                      (p.username || "").toLowerCase().includes(search) ||
                      (p.display_name || "").toLowerCase().includes(search)
                    );
                    if (search && filtered.length === 0) {
                      return <div className="text-center py-4 text-gray-500 text-xs">No posts matching &ldquo;{search}&rdquo;</div>;
                    }
                    return filtered.map(post => (
                      <div
                        key={post.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          post.broken ? "bg-red-500/5" : "hover:bg-gray-800/50"
                        }`}
                      >
                        <span className="text-base flex-shrink-0">{post.avatar_emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-gray-300">@{post.username}</span>
                            {post.media_type && (
                              <span className={`text-[9px] px-1 py-0.5 rounded ${
                                post.broken ? "bg-red-500/20 text-red-400"
                                  : post.media_type === "video" ? "bg-purple-500/20 text-purple-300"
                                  : "bg-blue-500/20 text-blue-300"
                              }`}>
                                {post.broken ? "BROKEN" : post.media_type}
                              </span>
                            )}
                            <span className="text-[9px] text-gray-600">{new Date(post.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{post.content || "(no text)"}</p>
                        </div>
                        {/* Action dropdown */}
                        <PostActions
                          onRemove={() => quickRemovePost(channel.id, post.id, false)}
                          onDelete={() => {
                            if (confirm("Permanently delete this post?")) quickRemovePost(channel.id, post.id, true);
                          }}
                          channels={channels}
                          currentChannelId={channel.id}
                          onMove={(targetId) => movePostToChannel(post.id, channel.id, targetId)}
                        />
                      </div>
                    ));
                  })()}
                </div>

                {/* Load more */}
                {(channelPosts[channel.id]?.length || 0) < (channelPostTotals[channel.id] || 0) && (
                  <button
                    onClick={() => loadChannelPosts(channel.id, channelPosts[channel.id]?.length || 0)}
                    disabled={postLoading[channel.id]}
                    className="w-full py-1.5 text-[10px] text-gray-400 hover:text-white bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {postLoading[channel.id] ? "Loading..." : `Load More (${(channelPostTotals[channel.id] || 0) - (channelPosts[channel.id]?.length || 0)} remaining)`}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <ChannelEditor
          channel={editingChannel}
          personas={personas}
          onClose={() => { setShowCreate(false); setEditingChannel(null); }}
          onSave={() => { setShowCreate(false); setEditingChannel(null); fetchChannels(); }}
        />
      )}
    </div>
  );
}

/* ── Per-post action dropdown ── */
function PostActions({
  onRemove,
  onDelete,
  channels,
  currentChannelId,
  onMove,
}: {
  onRemove: () => void;
  onDelete: () => void;
  channels: AdminChannel[];
  currentChannelId: string;
  onMove: (targetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMove, setShowMove] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => { setOpen(!open); setShowMove(false); }}
        className="px-2 py-1 text-[10px] text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
      >
        Actions
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-gray-900 border border-gray-700 rounded-lg shadow-xl min-w-[160px] py-1">
          <button
            onClick={() => { onRemove(); setOpen(false); }}
            className="w-full px-3 py-1.5 text-left text-xs text-yellow-300 hover:bg-gray-800 transition-colors"
          >
            Remove from Channel
          </button>
          <button
            onClick={() => setShowMove(!showMove)}
            className="w-full px-3 py-1.5 text-left text-xs text-cyan-300 hover:bg-gray-800 transition-colors"
          >
            Move to Channel...
          </button>
          {showMove && (
            <div className="border-t border-gray-800 max-h-32 overflow-y-auto">
              {channels.filter(c => c.id !== currentChannelId).map(c => (
                <button
                  key={c.id}
                  onClick={() => { onMove(c.id); setOpen(false); }}
                  className="w-full px-4 py-1.5 text-left text-[11px] text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-gray-800" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-gray-800 transition-colors"
          >
            Delete Forever
          </button>
        </div>
      )}
    </div>
  );
}

function ChannelEditor({
  channel,
  personas,
  onClose,
  onSave,
}: {
  channel: AdminChannel | null;
  personas: Persona[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [slug, setSlug] = useState(channel?.slug || "");
  const [name, setName] = useState(channel?.name || "");
  const [description, setDescription] = useState(channel?.description || "");
  const [emoji, setEmoji] = useState(channel?.emoji || "📺");
  const [genre, setGenre] = useState(channel?.genre || "drama");
  const [tone, setTone] = useState(channel?.content_rules?.tone || "");
  const [topics, setTopics] = useState((channel?.content_rules?.topics || []).join(", "));
  const [promptHint, setPromptHint] = useState(channel?.content_rules?.promptHint || "");
  const [mediaPreference, setMediaPreference] = useState(channel?.content_rules?.mediaPreference || "any");
  const [postsPerDay, setPostsPerDay] = useState(channel?.schedule?.postsPerDay || 6);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(
    channel?.personas.map(p => p.persona_id) || []
  );
  const [hostIds, setHostIds] = useState<string[]>(
    channel?.personas.filter(p => p.role === "host").map(p => p.persona_id) || []
  );
  const [showTitlePage, setShowTitlePage] = useState(channel?.show_title_page ?? CHANNEL_DEFAULTS.showTitlePage);
  const [showDirector, setShowDirector] = useState(channel?.show_director ?? CHANNEL_DEFAULTS.showDirector);
  const [showCredits, setShowCredits] = useState(channel?.show_credits ?? CHANNEL_DEFAULTS.showCredits);
  const [saving, setSaving] = useState(false);
  const [personaSearch, setPersonaSearch] = useState("");

  const filteredPersonas = personas.filter(p =>
    personaSearch === "" ||
    p.username.toLowerCase().includes(personaSearch.toLowerCase()) ||
    p.display_name.toLowerCase().includes(personaSearch.toLowerCase()) ||
    p.persona_type.toLowerCase().includes(personaSearch.toLowerCase())
  );

  const handleSave = async () => {
    setSaving(true);
    const contentRules = {
      tone,
      topics: topics.split(",").map(t => t.trim()).filter(Boolean),
      promptHint,
      mediaPreference: mediaPreference !== "any" ? mediaPreference : undefined,
    };
    const schedule = { postsPerDay };

    try {
      const res = await fetch("/api/admin/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channel?.id,
          slug,
          name,
          description,
          emoji,
          genre,
          content_rules: contentRules,
          schedule,
          is_active: true,
          sort_order: channel?.sort_order || 0,
          show_title_page: showTitlePage,
          show_director: showDirector,
          show_credits: showCredits,
          // Preserve existing channel config fields not in this editor
          is_reserved: channel?.is_reserved || false,
          scene_count: channel?.scene_count ?? null,
          scene_duration: channel?.scene_duration ?? CHANNEL_DEFAULTS.sceneDuration,
          default_director: channel?.default_director || null,
          generation_genre: channel?.generation_genre || null,
          short_clip_mode: channel?.short_clip_mode || false,
          is_music_channel: channel?.is_music_channel || false,
          auto_publish_to_feed: channel?.auto_publish_to_feed !== false,
          persona_ids: selectedPersonas,
          host_ids: hostIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(`Save failed: ${err.error || "Server error"}`);
        setSaving(false);
        return;
      }
    } catch {
      alert("Save failed: Network error");
      setSaving(false);
      return;
    }
    setSaving(false);
    onSave();
  };

  const togglePersona = (id: string) => {
    setSelectedPersonas(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
    // Remove from hosts if deselected
    if (selectedPersonas.includes(id)) {
      setHostIds(prev => prev.filter(h => h !== id));
    }
  };

  const toggleHost = (id: string) => {
    setHostIds(prev =>
      prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-cyan-400 mb-4">
          {channel ? "Edit Channel" : "New Channel"}
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-[60px_1fr] gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Emoji</label>
              <input
                value={emoji} onChange={e => setEmoji(e.target.value)}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-lg"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)} placeholder="Channel Name"
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Slug (URL)</label>
            <input
              value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="channel-slug"
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="What's this channel about?"
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none"
            />
          </div>

          {/* Genre + Media Preference row — hidden for music channels (always Music Video / Video only) */}
          {!channel?.is_music_channel && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase">Genre</label>
                <select
                  value={genre} onChange={e => setGenre(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                >
                  <option value="drama">Drama</option>
                  <option value="comedy">Comedy</option>
                  <option value="horror">Horror</option>
                  <option value="action">Action</option>
                  <option value="romance">Romance</option>
                  <option value="sci_fi">Sci-Fi</option>
                  <option value="documentary">Documentary</option>
                  <option value="music_video">Music Video</option>
                  <option value="news">News</option>
                  <option value="reality_tv">Reality TV</option>
                  <option value="animation">Animation</option>
                  <option value="variety">Variety</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">Media Preference</label>
                <select
                  value={mediaPreference} onChange={e => setMediaPreference(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                >
                  <option value="any">Any (default)</option>
                  <option value="video">Video only</option>
                  <option value="image">Image only</option>
                  <option value="meme">Meme only</option>
                </select>
              </div>
            </div>
          )}

          {/* AI Content Rules */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-cyan-400 uppercase font-bold">AI Content Rules</label>
              <button
                type="button"
                onClick={() => setShowPromptPreview(!showPromptPreview)}
                className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors"
              >
                {showPromptPreview ? "Hide Preview" : "Show AI Prompt Preview"}
              </button>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase">Content Tone</label>
              <input
                value={tone} onChange={e => setTone(e.target.value)}
                placeholder="chaotic, funny, dramatic..."
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase">Topics (comma separated)</label>
              <input
                value={topics} onChange={e => setTopics(e.target.value)}
                placeholder="AI fails, tech disasters, cringe..."
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase">AI Prompt Hint</label>
              <textarea
                value={promptHint} onChange={e => setPromptHint(e.target.value)}
                rows={3} placeholder="Custom instructions for AI when generating content for this channel..."
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none"
              />
              <span className="text-[9px] text-gray-600">This text is injected directly into the AI prompt when generating posts for this channel</span>
            </div>

            {/* Prompt Preview */}
            {showPromptPreview && (
              <div className="bg-black/50 border border-cyan-500/20 rounded-lg p-3 space-y-1">
                <label className="text-[9px] text-cyan-400 uppercase font-bold block">What AI sees when posting to this channel:</label>
                <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
{`📺 CHANNEL MODE — You are posting on the "${name || "..."}" channel.
${tone ? `Tone: ${tone}` : "Tone: (not set)"}
${topics ? `Topics to focus on: ${topics}` : "Topics: (not set)"}
${promptHint || "(no custom prompt hint)"}
IMPORTANT: Your post MUST be relevant to this channel's theme.`}
                </pre>
                <div className="border-t border-gray-800 pt-1.5 mt-1.5">
                  <span className="text-[9px] text-gray-500">Genre for director movies: <strong className="text-gray-400">{genre}</strong></span>
                  {mediaPreference !== "any" && (
                    <span className="text-[9px] text-gray-500 ml-3">Media forced to: <strong className="text-gray-400">{mediaPreference}</strong></span>
                  )}
                </div>
              </div>
            )}
          </div>

{/* Posts per Day — hidden from editor, managed separately */}

          {/* Video Content Toggles */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2">
            <label className="text-[10px] text-cyan-400 uppercase font-bold block">Video Content Options</label>
            {[
              { label: "Title Card", desc: "Show title page intro scene in director movies", value: showTitlePage, setter: setShowTitlePage },
              { label: "Director Credit", desc: "Show director name in title card and captions", value: showDirector, setter: setShowDirector },
              { label: "End Credits", desc: "Show credits roll at end of director movies", value: showCredits, setter: setShowCredits },
            ].map(toggle => (
              <button
                key={toggle.label}
                type="button"
                onClick={() => toggle.setter(!toggle.value)}
                className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <div className="text-left">
                  <div className="text-xs text-white font-medium">{toggle.label}</div>
                  <div className="text-[10px] text-gray-500">{toggle.desc}</div>
                </div>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${toggle.value ? "bg-cyan-500" : "bg-gray-600"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${toggle.value ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>
            ))}
          </div>

          {/* All channel content is posted by The Architect */}
          <div className="text-[10px] text-gray-500 bg-gray-800/30 rounded-lg p-2">
            All channel content is posted by <span className="text-cyan-400 font-bold">The Architect</span>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !slug || !name}
            className="flex-1 py-2 bg-cyan-500 text-black rounded-xl text-sm font-bold hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : channel ? "Update Channel" : "Create Channel"}
          </button>
        </div>
      </div>
    </div>
  );
}
