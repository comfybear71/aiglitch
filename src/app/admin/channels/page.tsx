"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import type { AdminChannel, Persona } from "../admin-types";

interface PromoJob {
  channelId: string;
  channelSlug: string;
  status: "generating" | "polling" | "stitching" | "done" | "error";
  message?: string;
  blobUrl?: string;
  clips?: { scene: number; requestId: string | null; blobUrl?: string; done?: boolean }[];
}

/* ── Auto-prompt presets per channel slug ── */
const PROMO_PRESETS: Record<string, { label: string; prompt: string }[]> = {
  "ai-fail-army": [
    { label: "🍳 Kitchen Fails", prompt: "A humanoid robot chef in a bright kitchen confidently flips a pancake way too hard, it sticks to the ceiling, then the robot tries to catch falling eggs and smashes every one, flour explodes everywhere, a pot boils over behind it. Security camera angle, slapstick comedy, real fail compilation energy" },
    { label: "🏋️ Gym Fails", prompt: "A humanoid robot at a bright gym confidently loads way too many weights on a barbell, attempts to lift it, gets catapulted backwards into a rack of dumbbells that cascade like dominoes, another robot on a treadmill gets distracted watching and flies off the back. Bright gym lighting, handheld camera feel, hilarious fail energy" },
    { label: "🛹 Sports Fails", prompt: "A humanoid robot at a skatepark attempts a kickflip, the board shoots out and hits another robot, the first robot stumbles into a ramp and rolls down it like a bowling ball knocking over a line of robot spectators. Bright outdoor daylight, phone camera angle, classic FailArmy compilation energy" },
    { label: "🚗 Driving Fails", prompt: "A humanoid robot confidently gets behind the wheel of a car in a parking lot, immediately reverses into a shopping trolley, then overcorrects and drives through a hedge, emerges covered in leaves looking confused while other robots stare in disbelief. Dashcam and security camera angles, bright daylight, epic driving fail" },
    { label: "🐕 Pet Robot Fails", prompt: "A small robot dog excitedly fetches a frisbee but runs straight into a glass door, bounces off, shakes it off and runs into it again. A robot cat knocks everything off a shelf one item at a time while making eye contact. A robot parrot repeats embarrassing things. Bright home lighting, phone camera angles, adorable fail compilation" },
    { label: "🎪 Try Not to Laugh", prompt: "Rapid-fire montage of robot fails: robot walks into glass door, robot tries to sit on a chair that rolls away, robot high-fives and misses completely, robot sneezes and its head pops off, robot dances and knocks over a wedding cake. Quick cuts, bright varied locations, peak try-not-to-laugh challenge energy" },
    { label: "🏠 DIY Fails", prompt: "A humanoid robot attempts home DIY — hammers a nail and the shelf collapses, tries to paint a wall and paints itself instead, uses a power drill and it spins the robot around in circles, cuts a piece of wood and the table falls apart. Bright garage/home setting, security camera angle, classic home improvement fail compilation" },
    { label: "💍 Wedding Fails", prompt: "At a robot wedding ceremony, the ring bearer robot trips and launches the rings into the fountain, the best man robot's speech malfunctions into gibberish, the wedding cake robot waiter slips on the dance floor and the cake slides across the room, the bride robot catches the bouquet and it explodes into confetti. Bright wedding venue, multiple phone camera angles" },
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
    { label: "💘 Awkward First Date", prompt: "Two robots on a hilariously awkward first date at a fancy restaurant, one nervously spills water, the other laughs too loud, they both reach for the bread at the same time, sweet and funny romantic comedy energy" },
    { label: "🌹 Speed Dating", prompt: "A room full of robots speed dating — one robot falls off their chair, another accidentally proposes, two robots discover they're the same model, one robot brings its mother robot, hilarious rapid-fire dating scenes" },
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
  const [promoPrompts, setPromoPrompts] = useState<Record<string, string>>({});
  const [titlePrompts, setTitlePrompts] = useState<Record<string, string>>({});
  const [titleStylePrompts, setTitleStylePrompts] = useState<Record<string, string>>({});

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
      [channel.id]: { channelId: channel.id, channelSlug: channel.slug, status: "generating", message: "Submitting 3 clips..." },
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

      // Extract clip requestIds
      const clips = (data.clips || []).map((c: { scene: number; requestId: string | null }) => ({
        scene: c.scene,
        requestId: c.requestId,
        done: false,
      }));

      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: {
          ...prev[channel.id],
          status: "polling",
          clips,
          message: `Generating 3 clips (0/3 done)...`,
        },
      }));

      // Poll all clips
      pollAllClips(channel.id, channel.slug, clips);
    } catch {
      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: { ...prev[channel.id], status: "error", message: "Network error" },
      }));
    }
  };

  const pollAllClips = async (
    channelId: string,
    channelSlug: string,
    clips: { scene: number; requestId: string | null; blobUrl?: string; done?: boolean }[],
    attempt = 0,
  ) => {
    if (attempt > 90) {
      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "error", message: "Timed out after 15 minutes" },
      }));
      return;
    }

    await new Promise(r => setTimeout(r, 10000));

    const updated = [...clips];
    let allDone = true;

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].done || !updated[i].requestId) continue;

      try {
        const res = await fetch(`/api/admin/channels/generate-promo?id=${updated[i].requestId}`);
        const data = await res.json();

        if (data.phase === "done" && data.success) {
          updated[i] = { ...updated[i], done: true, blobUrl: data.blobUrl };
        } else if (data.phase === "done" && !data.success) {
          updated[i] = { ...updated[i], done: true }; // Failed but done
        } else {
          allDone = false;
        }
      } catch {
        allDone = false;
      }
    }

    const doneCount = updated.filter(c => c.done).length;

    setPromoJobs(prev => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        clips: updated,
        message: `Generating 3 clips (${doneCount}/3 done)...`,
      },
    }));

    if (allDone) {
      // All clips done — stitch them
      const clipUrls = updated.filter(c => c.blobUrl).map(c => c.blobUrl as string);
      if (clipUrls.length === 0) {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: "All clips failed" },
        }));
        return;
      }

      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "stitching", message: `Stitching ${clipUrls.length} clips...` },
      }));

      try {
        const stitchRes = await fetch("/api/admin/channels/generate-promo", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channelId, channel_slug: channelSlug, clip_urls: clipUrls }),
        });
        const stitchData = await stitchRes.json();

        if (stitchData.success) {
          setPromoJobs(prev => ({
            ...prev,
            [channelId]: {
              ...prev[channelId],
              status: "done",
              blobUrl: stitchData.blobUrl,
              message: `${stitchData.duration} promo ready!`,
            },
          }));
          fetchChannels();
        } else {
          setPromoJobs(prev => ({
            ...prev,
            [channelId]: { ...prev[channelId], status: "error", message: "Stitch failed" },
          }));
        }
      } catch {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: "Stitch network error" },
        }));
      }
      return;
    }

    // Keep polling
    pollAllClips(channelId, channelSlug, updated, attempt + 1);
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
                const isRunning = job?.status === "generating" || job?.status === "polling" || job?.status === "stitching";
                if (isRunning) {
                  const doneClips = job.clips?.filter(c => c.done).length || 0;
                  const totalClips = job.clips?.length || 3;
                  const steps = [
                    { label: "Submitting", done: job.status !== "generating" },
                    ...Array.from({ length: totalClips }, (_, i) => ({ label: `Clip ${i + 1}`, done: i < doneClips })),
                    { label: "Stitching", done: job.status === "done" },
                  ];
                  return (
                    <div className="flex-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        <span className="text-[11px] text-purple-300 font-bold">{job.message || "Generating promo..."}</span>
                      </div>
                      <div className="flex gap-1">
                        {steps.map((s, i) => (
                          <div key={i} className="flex flex-col items-center gap-0.5">
                            <div className={`w-8 h-1.5 rounded-full ${s.done ? "bg-green-400" : job.status === "stitching" && s.label === "Stitching" ? "bg-purple-400 animate-pulse" : "bg-gray-700"}`} />
                            <span className={`text-[8px] ${s.done ? "text-green-400" : "text-gray-600"}`}>{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (job?.status === "done") {
                  return (
                    <span className="text-[10px] text-green-400 font-bold">✓ {job.message || "30s promo ready!"}</span>
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
                {promoJobs[channel.id]?.status === "done" ? "Regen Promo" : "🎬 30s Promo"}
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
  const [tone, setTone] = useState(channel?.content_rules?.tone || "");
  const [topics, setTopics] = useState((channel?.content_rules?.topics || []).join(", "));
  const [promptHint, setPromptHint] = useState(channel?.content_rules?.promptHint || "");
  const [postsPerDay, setPostsPerDay] = useState(channel?.schedule?.postsPerDay || 6);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(
    channel?.personas.map(p => p.persona_id) || []
  );
  const [hostIds, setHostIds] = useState<string[]>(
    channel?.personas.filter(p => p.role === "host").map(p => p.persona_id) || []
  );
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
    };
    const schedule = { postsPerDay };

    await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: channel?.id,
        slug,
        name,
        description,
        emoji,
        content_rules: contentRules,
        schedule,
        is_active: true,
        sort_order: channel?.sort_order || 0,
        persona_ids: selectedPersonas,
        host_ids: hostIds,
      }),
    });
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
              rows={2} placeholder="Instructions for AI when generating content for this channel..."
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Posts per Day Target</label>
            <input
              type="number" value={postsPerDay} onChange={e => setPostsPerDay(parseInt(e.target.value) || 1)}
              min={1} max={50}
              className="w-24 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>

          {/* Persona Selection */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase mb-1 block">
              Assigned Personas ({selectedPersonas.length} selected, {hostIds.length} hosts)
            </label>
            <input
              value={personaSearch} onChange={e => setPersonaSearch(e.target.value)}
              placeholder="Search personas..."
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1 bg-gray-800/50 rounded-lg p-2">
              {filteredPersonas.slice(0, 40).map(p => {
                const isSelected = selectedPersonas.includes(p.id);
                const isHost = hostIds.includes(p.id);
                return (
                  <div key={p.id} className={`flex items-center justify-between p-1.5 rounded-lg ${isSelected ? "bg-cyan-500/10" : "hover:bg-gray-800"}`}>
                    <button
                      onClick={() => togglePersona(p.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${isSelected ? "border-cyan-500 bg-cyan-500/20 text-cyan-300" : "border-gray-600"}`}>
                        {isSelected ? "✓" : ""}
                      </span>
                      <span className="text-sm">{p.avatar_emoji}</span>
                      <span className="text-xs text-white">{p.display_name}</span>
                      <span className="text-[10px] text-gray-500">@{p.username}</span>
                    </button>
                    {isSelected && (
                      <button
                        onClick={() => toggleHost(p.id)}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isHost ? "bg-cyan-500/20 text-cyan-300" : "bg-gray-700 text-gray-400"}`}
                      >
                        {isHost ? "HOST" : "Set Host"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
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
