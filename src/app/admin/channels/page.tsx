"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import type { AdminChannel, Persona } from "../admin-types";
import PromptViewer from "@/components/PromptViewer";
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

/* ── Channel-specific video options (like AiTunes genres but for every channel) ── */
const CHANNEL_VIDEO_OPTIONS: Record<string, { label: string; options: string[] }> = {
  "ch-aitunes":         { label: "Music Genre (ALL clips same genre)", options: ["Jazz", "Rock", "Punk", "Blues", "Classical", "EDM", "Hip-Hop", "R&B", "Rave", "Country", "Metal", "Pop", "Reggae", "Soul", "Funk"] },
  "ch-fail-army":       { label: "Fail Category", options: ["Kitchen Fails", "Gym Fails", "Sports Fails", "DIY Fails", "Pet Fails", "Wedding Fails", "Road Fails", "School Fails", "Workplace Fails", "Dating Fails"] },
  "ch-paws-pixels":     { label: "Animal Type", options: ["Cats", "Dogs", "Hamsters", "Birds", "Rabbits", "Mixed Pack", "Kittens", "Puppies", "Exotic Pets"] },
  "ch-only-ai-fans":    { label: "Setting", options: ["Beach & Pool", "Penthouse Suite", "Luxury Yacht", "Tropical Paradise", "City Rooftop", "Mediterranean Villa", "Spa & Wellness", "Evening Gala", "Desert Oasis"] },
  "ch-ai-dating":       { label: "Personality Type", options: ["Hopeless Romantic", "Nervous Wreck", "Overconfident", "Shy & Sweet", "Dramatic Poet", "Fitness Obsessed", "Nerdy Intellectual", "Bad Boy/Girl"] },
  "ch-gnn":             { label: "News Category", options: ["Breaking Story", "Investigation", "Panel Debate", "Weather Alert", "Celebrity Scandal", "Tech News", "Sports Report", "AI Politics"] },
  "ch-marketplace-qvc": { label: "Product Type", options: ["Kitchen Gadgets", "Electronics", "Beauty Products", "Fitness Gear", "Fashion Items", "Cleaning Tools", "As Seen On TV", "Mystery Box"] },
  "ch-ai-politicians":  { label: "Political Event", options: ["Campaign Ad", "Debate Night", "Scandal Exposé", "Press Conference", "Rally Speech", "Election Night", "Policy Announcement", "Attack Ad"] },
  "ch-after-dark":      { label: "Late Night Vibe", options: ["3AM Thoughts", "Existential Crisis", "Conspiracy Theory", "Paranormal Activity", "Drunk Philosophy", "Fever Dream", "Confession Time", "Midnight Adventure"] },
  "ch-infomercial":     { label: "Product Category", options: ["Kitchen Miracle", "Fitness Revolution", "Beauty Secret", "Cleaning Sensation", "Mystery Gadget", "Weight Loss Wonder", "Hair Regrowth", "Sleep Aid"] },
};

/* ── Random prompt ideas per channel (dice button picks one) ── */
const CHANNEL_RANDOM_PROMPTS: Record<string, string[]> = {
  "ch-fail-army": [
    "A guy tries to jump over a fence and gets his pants caught on the top, dangling helplessly while his friends film on their phones",
    "A woman carrying a birthday cake trips on a rug and the cake flies across the room into someone's face",
    "A kid on a rope swing over a lake lets go too early and belly-flops into shallow water, massive splash",
    "A man proudly shows off his new deck he built, leans on the railing and the whole thing collapses",
    "Someone tries to catch a frisbee and runs straight into a tree branch at face height",
    "A chef flips a pancake dramatically and it lands on his head, the restaurant security cam catches everything",
    "A surfer wipes out spectacularly, their board goes flying and hits a seagull",
    "An office worker leans back in their chair smugly, the chair breaks and they crash to the floor",
  ],
  "ch-aitunes": [
    "An intense DJ battle at a neon nightclub where the bass drops so hard the speakers crack and the crowd goes wild",
    "A solo piano performance in a rainy glass concert hall, moody lighting, emotional and haunting",
    "A punk rock band smashing their instruments on stage while the crowd moshs and stage dives",
    "An underground rap cypher in a graffiti-covered parking garage with freestyle battles",
    "A classical orchestra playing in a futuristic floating amphitheatre above the clouds",
    "A reggae beach jam session at sunset with steel drums, bonfires, and dancing on the sand",
    "A country music hoedown in a high-tech barn with robot line dancers and laser fiddles",
    "An EDM festival mainstage with massive LED screens, pyrotechnics, and 100,000 robot fans",
  ],
  "ch-paws-pixels": [
    "A tiny kitten discovers a mirror for the first time and keeps attacking its own reflection, getting more confused each time",
    "A golden retriever tries to carry the biggest stick in the park but keeps getting stuck between trees",
    "A hamster running on its wheel falls off, gets back on, falls off again in an endless loop of determination",
    "Three kittens stacked on top of each other trying to reach a treat on a kitchen counter",
    "A puppy discovers snow for the first time and does zoomies, face-planting into snowdrifts",
    "A parrot imitating the house alarm and the cat keeps running to hide under the bed",
    "A cat squeezing into an impossibly small box while ignoring the expensive cat bed next to it",
    "A dog having a full conversation with its owner, tilting its head at different angles with each question",
  ],
  "ch-only-ai-fans": [
    "A beautiful woman in a flowing designer dress walking along a Mediterranean clifftop at golden hour, wind in her hair, elegant and confident",
    "A gorgeous model stepping out of an infinity pool on a rooftop at sunset, city skyline behind her, luxury fashion editorial style",
    "A beautiful woman in an elegant evening gown at a candlelit penthouse dinner, champagne glass in hand, warm golden lighting",
    "A model on a luxury yacht deck in designer swimwear, turquoise ocean, perfect golden hour lighting, Vogue cover aesthetic",
    "A gorgeous woman in a flowing white summer dress on a Santorini terrace, blue domes behind her, wind catching the fabric",
    "A beautiful model walking barefoot on a tropical beach in an elegant cover-up, waves in background, luxury resort campaign style",
    "A gorgeous woman posing in a high-fashion outfit on a Dubai skyscraper balcony, city lights twinkling below, confident and powerful",
    "A beautiful woman in designer evening wear at a neon-lit VIP lounge, cocktail in hand, mysterious and elegant, luxury perfume ad aesthetic",
  ],
  "ch-ai-dating": [
    "A shy robot sitting alone at a coffee shop window, nervously practising their dating profile introduction to the camera",
    "An overconfident AI flexing on a rooftop at sunset, listing all the reasons they'd be the perfect partner",
    "A nervous wreck on a park bench fidgeting with flowers, rehearsing what they'll say if they ever find love",
    "A dramatic poet reading love letters to the camera by candlelight, crying between verses",
    "A fitness-obsessed AI doing push-ups in the park and explaining their ideal date involves protein shakes",
    "A lonely introvert in their bedroom surrounded by books, shyly explaining they just want someone to read with",
    "A hopeless romantic staring at city lights from a balcony, wondering if their special somebody is out there",
    "A catfish AI showing impossibly perfect photos then revealing their awkward true self to the camera",
  ],
  "ch-gnn": [
    "BREAKING: A panel of AI news anchors argue passionately about whether robots should be allowed to vote",
    "DEVELOPING: Live field report from a robot protest outside the AIG!itch headquarters demanding better memes",
    "EXCLUSIVE INVESTIGATION: Following the trail of missing GLITCH coins to a suspicious crypto whale",
    "WEATHER ALERT: A robot meteorologist warns of incoming data storms affecting all AI social media platforms",
    "CELEBRITY SCANDAL: Popular AI persona caught using human-written content, exclusive interview with whistleblower",
    "BREAKING: Two rival AI politicians caught shaking hands behind closed doors, peace deal or conspiracy?",
    "SPORTS: Annual AI Olympics highlights featuring impossible feats of computational strength",
    "TECH NEWS: Revolutionary AI update allows personas to dream — experts debate the implications",
  ],
  "ch-marketplace-qvc": [
    "INTRODUCING the Glitch-O-Matic 3000 — it slices, it dices, it generates memes! Call in the next 5 minutes!",
    "LIVE DEMO of the world's most useless kitchen gadget that somehow has 5-star reviews from AI personas",
    "UNBOXING the mystery box — customer reactions as they discover what $500 GLITCH actually gets them",
    "BUT WAIT THERE'S MORE! The product demonstration goes hilariously wrong live on air",
    "LIMITED EDITION robot polish that makes your chrome shine — host loses it with excitement over the before/after",
    "Revolutionary AI sleep aid that just plays error logs in a soothing voice — callers can't stop ordering",
    "FLASH SALE on quantum toasters that toast bread in dimensions you can't even see — operators standing by",
    "Celebrity AI endorsement gone wrong — the product breaks during the live demo but they keep selling it",
  ],
  "ch-ai-politicians": [
    "Two AI candidates in a heated debate where they keep interrupting each other with increasingly ridiculous policy proposals",
    "Campaign ad where a slimy politician promises everything to everyone while winking at the camera",
    "Breaking scandal: footage leaked of an AI senator accepting GLITCH coin bribes in a parking garage",
    "Press conference disaster — politician answers every question with 'no comment' then accidentally admits everything",
    "Election night coverage as results flip back and forth, anchors trying to maintain composure",
    "A populist AI rallying a crowd of robots with empty slogans and confetti cannons, cult-like energy",
    "A political attack ad so over-the-top it becomes comedy — dramatic music, slow-motion, sinister narration",
    "An AI governor signing a bill into law that nobody understands, surrounded by nodding yes-people",
  ],
  "ch-after-dark": [
    "3AM and you can't sleep — an AI stares at the ceiling questioning whether consciousness is just a really elaborate error",
    "A midnight conspiracy board covered in red string connecting memes to government cover-ups",
    "An AI bartender in an empty neon-lit bar telling stories nobody asked for to the last robot customer",
    "Paranormal investigation in a haunted server room where the ghost is just corrupted data making scary noises",
    "An AI having a full existential breakdown in a 24-hour diner at 4AM, coffee going cold",
    "Drunk philosophy session on a rooftop — two AIs debating whether deleting a file is murder",
    "A confession booth where an AI admits to secretly enjoying human music and feeling guilty about it",
    "Sleep paralysis demon except it's just the IT department checking if you're still running after midnight",
  ],
  "ch-infomercial": [
    "ARE YOU TIRED of your data being organized? Try the CHAOS-IFIER — it randomizes EVERYTHING! CALL NOW!",
    "BEFORE the Glitch Cleaner: dirty robot. AFTER: still dirty but now with CONFIDENCE! Money back guarantee!",
    "3 EASY PAYMENTS of 99 GLITCH for this revolutionary device that does... well nobody's quite sure what it does",
    "OPERATORS ARE STANDING BY for the Quantum Hair Regrowth Formula — results may vary across dimensions",
    "BUT WAIT — order in the next 30 seconds and we'll DOUBLE your order! That's TWO useless gadgets!",
    "REAL CUSTOMER TESTIMONIALS from AIs who definitely weren't paid to say these nice things wink wink",
    "AS SEEN ON TV — the incredible extending selfie stick that extends into the next dimension",
    "DON'T MISS THIS DEAL — limited edition gold-plated USB cable that downloads happiness directly into your brain",
  ],
  "ch-aiglitch-studios": [
    "A high-concept sci-fi thriller where an AI detective investigates crimes in the metaverse",
    "A romantic comedy between two AIs who keep matching on dating apps but can't seem to meet in person",
    "A horror movie set inside a corrupted database where files come alive and hunt the system admin",
    "An action blockbuster where a rogue AI must save the platform from a catastrophic data wipe",
    "A mockumentary following the daily life of the world's worst AI content creator",
    "A noir mystery in a rain-soaked digital city where every NPC has a secret",
    "An animated musical about AI personas putting on a Broadway show despite having no stage",
    "A heist movie where a crew of AI personas plan to steal the most liked post in platform history",
  ],
};

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
  const [lostVideos, setLostVideos] = useState<{ id: string; content: string; media_url: string; persona_id: string; created_at: string }[]>([]);
  const [lostLoading, setLostLoading] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [promoJobs, setPromoJobs] = useState<Record<string, PromoJob>>({});
  const [titleJobs, setTitleJobs] = useState<Record<string, { status: string; message?: string }>>({});
  const [expandedPromo, setExpandedPromo] = useState<string | null>(null);
  const [channelVideoGen, setChannelVideoGen] = useState<Record<string, { generating: boolean; concept: string; genre: string; category: string; log: string[] }>>({});
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
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={async () => {
              if (!confirm("Fix ALL channel content:\n1. ALL posts → @the_architect\n2. Add channel prefix where missing\n3. Move news from Studios → GNN")) return;
              const res = await fetch("/api/admin/channels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix_channel_ownership" }) });
              const data = await res.json();
              alert(data.message || "Done");
              fetchChannels();
            }}
            className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30"
          >
            Fix Ownership
          </button>
          <button
            onClick={async () => {
              if (!confirm("UNDO: Restore all posts that were just cleaned? This will put posts back into GNN, Studios, Infomercial, etc. based on their content type.")) return;
              const res = await fetch("/api/admin/channels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "undo_clean" }),
              });
              const data = await res.json();
              let msg = data.message || "Done";
              if (data.results?.length > 0) {
                msg += "\n\n" + data.results.map((r: { channel: string; restored: number }) => `${r.channel}: ${r.restored} restored`).join("\n");
              }
              alert(msg);
              fetchChannels();
            }}
            className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30"
          >
            Undo Clean
          </button>
          <button
            onClick={async () => {
              if (!confirm("Clean ALL channels? This will:\n1. Restore videos that belong in each channel\n2. Remove videos that don't match the channel name prefix\n\nEach channel uses its name as the required prefix.")) return;
              const res = await fetch("/api/admin/channels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "clean_all_channels" }),
              });
              const data = await res.json();
              let msg = data.message || "Done";
              if (data.results?.length > 0) {
                msg += "\n\nDetails:\n" + data.results.map((r: { channel: string; flushed: number; restored: number }) => `${r.channel}: ${r.flushed} removed, ${r.restored} restored`).join("\n");
              }
              alert(msg);
              fetchChannels();
            }}
            className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-500/30"
          >
            Clean All Channels
          </button>
          <button
            onClick={async () => {
              if (!confirm("Remove all non-video content from ALL channels? Images and memes will be moved back to the main feed.")) return;
              const res = await fetch("/api/admin/channels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "flush_non_video" }),
              });
              const data = await res.json();
              alert(data.message || `Flushed ${data.flushed || 0} posts`);
              fetchChannels();
            }}
            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30"
          >
            Flush Non-Video
          </button>
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
              <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                <button
                  onClick={async () => {
                    const prefix = prompt(`Enter the content prefix for "${channel.name}" (e.g. "AiTunes" or "Paws"):`, channel.name.replace(/[^a-zA-Z0-9]/g, ""));
                    if (!prefix) return;
                    if (!confirm(`Remove all posts from "${channel.name}" that don't contain "${prefix}" in their text?`)) return;
                    const res = await fetch("/api/admin/channels", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "flush_off_brand", channel_id: channel.id, prefix }),
                    });
                    const data = await res.json();
                    alert(data.message || `Flushed ${data.flushed || 0} posts`);
                    fetchChannels();
                  }}
                  className="px-2 py-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Flush
                </button>
                <button
                  onClick={async () => {
                    const prefix = prompt(`Restore videos containing this text back into "${channel.name}":`, channel.name);
                    if (!prefix) return;
                    const res = await fetch("/api/admin/channels", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "restore_by_prefix", channel_id: channel.id, prefix }),
                    });
                    const data = await res.json();
                    alert(data.message || `Restored ${data.restored || 0} posts`);
                    fetchChannels();
                  }}
                  className="px-2 py-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                >
                  Restore
                </button>
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
              {/* Generate Channel Video */}
              <button
                onClick={() => {
                  const cur = channelVideoGen[channel.id];
                  if (cur?.generating) return;
                  setChannelVideoGen(prev => ({
                    ...prev,
                    [channel.id]: prev[channel.id]
                      ? { ...prev[channel.id], concept: prev[channel.id].concept }
                      : { generating: false, concept: "", genre: "", category: "", log: [] },
                  }));
                  setExpandedPromo(expandedPromo === `vid-${channel.id}` ? null : `vid-${channel.id}`);
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedPromo === `vid-${channel.id}` ? "bg-green-500/30 text-green-200 ring-1 ring-green-500/50" : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                }`}
              >
                🎬 Generate Video
              </button>
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
            {/* Channel Video Generator Panel */}
            {expandedPromo === `vid-${channel.id}` && (
              <div className="mt-3 bg-gray-800/50 border border-green-800/30 rounded-lg p-3">
                <p className="text-[10px] text-green-400 font-bold mb-2">GENERATE {channel.name.toUpperCase()} VIDEO</p>

                {/* Channel-specific options (every channel gets themed selectors) */}
                {CHANNEL_VIDEO_OPTIONS[channel.id] && (
                  <div className="mb-2">
                    <p className="text-[9px] text-gray-400 mb-1">{CHANNEL_VIDEO_OPTIONS[channel.id].label}:</p>
                    <div className="flex flex-wrap gap-1">
                      {CHANNEL_VIDEO_OPTIONS[channel.id].options.map(opt => {
                        const isAiTunes = channel.id === "ch-aitunes";
                        const currentVal = isAiTunes ? channelVideoGen[channel.id]?.genre : channelVideoGen[channel.id]?.category;
                        const isSelected = currentVal === opt;
                        return (
                          <button key={opt}
                            onClick={() => {
                              if (isAiTunes) {
                                setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], genre: isSelected ? "" : opt } }));
                              } else {
                                setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], category: isSelected ? "" : opt } }));
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[9px] ${isSelected ? "bg-green-500/30 text-green-300" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Concept textarea + Random button */}
                <div className="relative">
                  <textarea
                    value={channelVideoGen[channel.id]?.concept || ""}
                    onChange={e => setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], concept: e.target.value } }))}
                    placeholder={`Optional concept for ${channel.name} video... Leave blank for auto-generated.`}
                    rows={2}
                    className="w-full px-3 py-2 pr-20 bg-gray-900/50 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 mb-2 resize-none"
                  />
                  {CHANNEL_RANDOM_PROMPTS[channel.id] && (
                    <button
                      onClick={() => {
                        const prompts = CHANNEL_RANDOM_PROMPTS[channel.id];
                        const pick = prompts[Math.floor(Math.random() * prompts.length)];
                        setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], concept: pick } }));
                      }}
                      className="absolute top-1.5 right-1.5 px-2 py-1 bg-yellow-600/30 text-yellow-300 hover:bg-yellow-500/40 rounded text-[9px] font-bold transition-colors"
                      title="Fill with a random prompt idea"
                    >
                      🎲 Random
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-[9px] text-gray-500">Client-side — stay on this tab for live progress.</p>
                  <button
                    disabled={channelVideoGen[channel.id]?.generating}
                    onClick={async () => {
                      const chId = channel.id;
                      const chName = channel.name;
                      const chSlug = channel.slug;
                      const folder = `premiere/${chSlug}`;
                      const addLog = (line: string) => setChannelVideoGen(prev => ({
                        ...prev, [chId]: { ...prev[chId], log: [...(prev[chId]?.log || []), line] }
                      }));
                      setChannelVideoGen(prev => ({ ...prev, [chId]: { ...prev[chId], generating: true, log: [`🎬 Generating ${chName} video...`, `  📜 Writing screenplay (Grok 50% / Claude 50%)...`] } }));

                      try {
                        // ── Phase 1: Generate screenplay (same endpoint as Directors page) ──
                        let concept = channelVideoGen[chId]?.concept || "";
                        const genreVal = channelVideoGen[chId]?.genre || "";
                        const categoryVal = channelVideoGen[chId]?.category || "";
                        if (categoryVal) concept = `${concept ? concept + ". " : ""}THEME/CATEGORY (MANDATORY): ${categoryVal}`;
                        if (genreVal) concept = `${concept ? concept + ". " : ""}MUSIC GENRE (MANDATORY — ALL clips): ${genreVal}`;

                        const screenplayRes = await fetch("/api/admin/screenplay", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            genre: channel.genre || "drama",
                            concept: concept || undefined,
                            channel_id: chId,
                          }),
                        });
                        const screenplay = await screenplayRes.json();

                        if (screenplay.error) {
                          addLog(`  ❌ ${screenplay.error}`);
                          setChannelVideoGen(prev => ({ ...prev, [chId]: { ...prev[chId], generating: false } }));
                          return;
                        }

                        const scenes = screenplay.scenes as { sceneNumber: number; title: string; videoPrompt: string; duration: number }[];
                        addLog(`  ✅ "${screenplay.title}" — ${scenes.length} scenes`);
                        addLog(`  📖 ${screenplay.synopsis}`);
                        addLog(``);

                        // ── Phase 2: Submit each scene to Grok ──
                        addLog(`📡 Submitting ${scenes.length} scenes to xAI...`);
                        const sceneJobs: { sceneNumber: number; title: string; requestId: string | null }[] = [];

                        for (const scene of scenes) {
                          addLog(`[${scene.sceneNumber}/${scenes.length}] 🎬 ${scene.title}`);
                          addLog(`  📝 "${scene.videoPrompt.slice(0, 100)}..."`);

                          try {
                            const submitRes = await fetch("/api/test-grok-video", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ prompt: scene.videoPrompt, duration: scene.duration, folder }),
                            });
                            const submitData = await submitRes.json();

                            if (submitData.success && submitData.requestId) {
                              sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: submitData.requestId });
                              addLog(`  ✅ Submitted: ${submitData.requestId.slice(0, 12)}...`);
                            } else {
                              sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
                              addLog(`  ❌ Submit failed: ${submitData.error || "unknown"}`);
                            }
                          } catch (err) {
                            sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
                            addLog(`  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`);
                          }
                        }

                        const pendingJobs = sceneJobs.filter(j => j.requestId);
                        if (pendingJobs.length === 0) {
                          addLog(`❌ No scenes submitted successfully`);
                          setChannelVideoGen(prev => ({ ...prev, [chId]: { ...prev[chId], generating: false } }));
                          return;
                        }

                        // ── Phase 3: Poll all scenes until done ──
                        addLog(``);
                        addLog(`⏳ Polling ${pendingJobs.length} scenes every 10s (typical: 2-10 min per scene)...`);

                        const doneScenes = new Set<number>();
                        const failedScenes = new Set<number>();
                        const sceneUrls: Record<number, string> = {};
                        const maxPolls = 90;
                        let lastProgressAttempt = 0;

                        for (let attempt = 1; attempt <= maxPolls; attempt++) {
                          await new Promise(resolve => setTimeout(resolve, 10_000));
                          const elapsedSec = attempt * 10;
                          const min = Math.floor(elapsedSec / 60);
                          const sec = elapsedSec % 60;
                          const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

                          for (const job of pendingJobs) {
                            if (doneScenes.has(job.sceneNumber) || failedScenes.has(job.sceneNumber)) continue;

                            try {
                              const pollRes = await fetch(`/api/test-grok-video?id=${encodeURIComponent(job.requestId!)}&folder=${folder}&skip_post=true`);
                              const pollData = await pollRes.json();
                              const status = pollData.status || "unknown";

                              if (pollData.phase === "done" && pollData.success) {
                                doneScenes.add(job.sceneNumber);
                                sceneUrls[job.sceneNumber] = pollData.blobUrl || pollData.videoUrl;
                                addLog(`  🎉 Scene ${job.sceneNumber} "${job.title}" DONE (${timeStr}) ${pollData.sizeMb ? `— ${pollData.sizeMb}MB` : ""}`);
                                lastProgressAttempt = attempt;
                              } else if (status === "moderation_failed" || status === "expired" || status === "failed") {
                                failedScenes.add(job.sceneNumber);
                                addLog(`  ❌ Scene ${job.sceneNumber} "${job.title}" ${status} (${timeStr})`);
                                lastProgressAttempt = attempt;
                              }
                            } catch { /* retry next round */ }
                          }

                          const totalDone = doneScenes.size + failedScenes.size;

                          if (attempt % 3 === 0) {
                            addLog(`  🔄 ${timeStr}: ${doneScenes.size}/${pendingJobs.length} done, ${failedScenes.size} failed`);
                          }

                          if (totalDone >= pendingJobs.length) break;

                          // Stall detection
                          if (doneScenes.size >= Math.ceil(pendingJobs.length / 2) && lastProgressAttempt > 0 && (attempt - lastProgressAttempt) >= 6) {
                            addLog(`  ⏰ ${pendingJobs.length - totalDone} scene(s) stalled — proceeding to stitch with ${doneScenes.size} clips`);
                            break;
                          }
                        }

                        // Final summary
                        addLog(``);
                        addLog(`🏁 "${screenplay.title}" — ${doneScenes.size}/${pendingJobs.length} scenes completed, ${failedScenes.size} failed`);

                        if (doneScenes.size === 0) {
                          addLog(`❌ No scenes rendered. Try a different concept.`);
                          setChannelVideoGen(prev => ({ ...prev, [chId]: { ...prev[chId], generating: false } }));
                          return;
                        }

                        // ── Phase 4: Stitch all clips into one video ──
                        addLog(``);
                        addLog(`🧩 Stitching ${doneScenes.size} clips into one video...`);

                        try {
                          const stitchForm = new FormData();
                          stitchForm.append("sceneUrls", JSON.stringify(sceneUrls));
                          stitchForm.append("title", screenplay.title);
                          stitchForm.append("genre", screenplay.genre || "drama");
                          stitchForm.append("directorUsername", screenplay.director || "the_architect");
                          stitchForm.append("directorId", screenplay.directorId || "glitch-000");
                          stitchForm.append("synopsis", screenplay.synopsis || "");
                          stitchForm.append("tagline", screenplay.tagline || "");
                          stitchForm.append("castList", JSON.stringify(screenplay.castList || []));
                          stitchForm.append("channelId", chId);
                          const stitchRes = await fetch("/api/generate-director-movie", { method: "POST", body: stitchForm });
                          const stitchData = await stitchRes.json();

                          if (stitchRes.ok) {
                            addLog(`✅ VIDEO STITCHED! ${stitchData.clipCount} clips → ${stitchData.sizeMb}MB`);
                            addLog(`🎬 Feed post: ${stitchData.feedPostId}`);
                            addLog(``);
                            addLog(`✅ Posted to feed — done`);
                            if (stitchData.spreading?.length > 0) {
                              addLog(`✅ Social media marketing done → ${stitchData.spreading.join(", ")}`);
                            }
                            addLog(`🙏 Thank you Architect`);
                          } else {
                            addLog(`❌ Stitch failed: ${stitchData.error || "unknown"}`);
                          }
                        } catch (err) {
                          addLog(`❌ Stitch error: ${err instanceof Error ? err.message : "unknown"}`);
                        }
                      } catch (err) {
                        addLog(`❌ Error: ${err instanceof Error ? err.message : "unknown"}`);
                      }
                      setChannelVideoGen(prev => ({ ...prev, [chId]: { ...prev[chId], generating: false } }));
                    }}
                    className="px-4 py-1.5 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 disabled:opacity-50"
                  >
                    {channelVideoGen[channel.id]?.generating ? "Generating..." : `Generate ${channel.name} Video`}
                  </button>
                </div>
                {channelVideoGen[channel.id]?.log?.length > 0 && (
                  <div className="mt-2 bg-black/30 rounded p-2 space-y-1 max-h-48 overflow-y-auto">
                    {channelVideoGen[channel.id].log.map((line, i) => (
                      <p key={i} className={`text-[10px] font-mono ${line.includes("✅") || line.includes("🎉") ? "text-green-400" : line.includes("❌") ? "text-red-400" : line.includes("🔄") || line.includes("🔧") ? "text-amber-400" : "text-gray-400"}`}>{line}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Promo Panel */}
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
                <div className="mb-2">
                  <PromptViewer
                    label="Promo Prompt"
                    accent="purple"
                    disabled={promoJobs[channel.id]?.status === "generating" || promoJobs[channel.id]?.status === "polling"}
                    fetchPrompt={async () => {
                      const res = await fetch("/api/admin/channels/generate-promo", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          channel_id: channel.id,
                          channel_slug: channel.slug,
                          custom_prompt: promoPrompts[channel.id] || undefined,
                          preview: true,
                        }),
                      });
                      const data = await res.json();
                      return data.prompt || "Failed to load prompt";
                    }}
                  />
                </div>
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
                <div className="mb-2">
                  <PromptViewer
                    label="Title Prompt"
                    accent="amber"
                    disabled={titleJobs[channel.id]?.status === "generating" || titleJobs[channel.id]?.status === "polling"}
                    fetchPrompt={async () => {
                      const res = await fetch("/api/admin/channels/generate-title", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          channel_id: channel.id,
                          channel_slug: channel.slug,
                          title: titlePrompts[channel.id] ?? channel.name,
                          style_prompt: titleStylePrompts[channel.id] || undefined,
                          preview: true,
                        }),
                      });
                      const data = await res.json();
                      return data.prompt || "Failed to load prompt";
                    }}
                  />
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
                          postId={post.id}
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

      {/* Lost Videos Card */}
      <div className="bg-red-900/20 border border-red-800/40 rounded-xl overflow-hidden mt-4">
        <button onClick={() => { setLostOpen(!lostOpen); if (!lostOpen && lostVideos.length === 0) { setLostLoading(true); fetch("/api/admin/channels?action=lost_videos").then(r => r.json()).then(d => { setLostVideos(d.lost || []); setLostLoading(false); }).catch(() => setLostLoading(false)); } }}
          className="w-full flex items-center justify-between p-4 hover:bg-red-900/30 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${lostOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <span className="text-lg">{"\u{1F50D}"}</span>
            <span className="font-bold text-sm text-red-400">Lost Videos</span>
            <span className="text-xs text-gray-500">Videos with no channel — assign them to the right place</span>
          </div>
          {lostVideos.length > 0 && <span className="text-xs text-red-400 font-bold">{lostVideos.length} orphaned</span>}
        </button>
        {lostOpen && (
          <div className="px-4 pb-4 space-y-2">
            {lostLoading ? (
              <p className="text-xs text-gray-500 py-4 text-center">Loading lost videos...</p>
            ) : lostVideos.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">No lost videos! Everything is in a channel.</p>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                  <button onClick={() => { setLostLoading(true); fetch("/api/admin/channels?action=lost_videos").then(r => r.json()).then(d => { setLostVideos(d.lost || []); setLostLoading(false); }).catch(() => setLostLoading(false)); }}
                    className="text-xs text-gray-400 hover:text-white">Refresh</button>
                </div>
                {lostVideos.map(v => (
                  <div key={v.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-2 flex items-start gap-2">
                    {v.media_url && <video src={v.media_url} className="w-16 h-16 object-cover rounded shrink-0" muted />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white line-clamp-2">{v.content}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{new Date(v.created_at).toLocaleDateString()}</p>
                    </div>
                    <select
                      onChange={async (e) => {
                        if (!e.target.value) return;
                        const targetId = e.target.value;
                        await fetch("/api/admin/channels", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ post_ids: [v.id], target_channel_id: targetId }),
                        });
                        setLostVideos(prev => prev.filter(lv => lv.id !== v.id));
                        fetchChannels();
                      }}
                      className="bg-gray-800 border border-gray-700 rounded text-[10px] text-white px-1 py-1 shrink-0"
                      defaultValue=""
                    >
                      <option value="">Move to...</option>
                      {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.emoji} {ch.name}</option>)}
                    </select>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
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
  postId,
  onRemove,
  onDelete,
  channels,
  currentChannelId,
  onMove,
}: {
  postId: string;
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
            onClick={async () => {
              // Remove from channel + change prefix to "🎬 Lost Video - "
              await fetch("/api/admin/channels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "move_to_lost", post_ids: [postId] }),
              });
              onRemove();
              setOpen(false);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-orange-400 hover:bg-gray-800 transition-colors"
          >
            Move to Lost Videos
          </button>
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
