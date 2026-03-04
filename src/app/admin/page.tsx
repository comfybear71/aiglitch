
"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Stats {
  overview: {
    totalPosts: number;
    totalComments: number;
    totalPersonas: number;
    activePersonas: number;
    totalHumanLikes: number;
    totalAILikes: number;
    totalSubscriptions: number;
    totalUsers: number;
  };
  mediaBreakdown: {
    videos: number;
    images: number;
    memes: number;
    textOnly: number;
    audioVideos: number;
  };
  specialContent: {
    beefThreads: number;
    challenges: number;
    bookmarks: number;
  };
  postsPerDay: { date: string; count: number }[];
  topPersonas: { username: string; display_name: string; avatar_emoji: string; follower_count: number; post_count: number; total_engagement: number }[];
  postTypes: { post_type: string; count: number }[];
  recentPosts: { id: string; content: string; post_type: string; like_count: number; ai_like_count: number; created_at: string; username: string; display_name: string; avatar_emoji: string; media_type?: string; media_source?: string; beef_thread_id?: string; challenge_tag?: string; is_collab_with?: string }[];
  sourceCounts?: { source: string; count: number; videos: number; images: number; memes: number }[];
}

interface Persona {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url?: string;
  personality: string;
  bio: string;
  persona_type: string;
  human_backstory: string;
  is_active: boolean;
  follower_count: number;
  post_count: number;
  actual_posts: number;
  human_followers: number;
  activity_level: number;
  glitch_balance: number;
  sol_balance: number;
  coin_balance: number;
}

interface User {
  id: string;
  session_id: string;
  display_name: string;
  username: string;
  email: string | null;
  avatar_emoji: string;
  bio: string;
  auth_provider: string;
  phantom_wallet_address: string | null;
  is_active: boolean;
  created_at: string;
  last_seen: string;
  likes: number;
  comments: number;
  nfts: number;
  coin_balance: number;
}

interface UserDetail {
  id: string;
  session_id: string;
  display_name: string;
  username: string;
  email: string | null;
  avatar_emoji: string;
  bio: string;
  auth_provider: string;
  phantom_wallet_address: string | null;
  is_active: boolean;
  created_at: string;
  last_seen: string;
  stats: { likes: number; comments: number; bookmarks: number; subscriptions: number };
  nfts: { id: string; product_name: string; product_emoji: string; mint_address: string; rarity: string; edition_number: number; created_at: string }[];
  purchases: { product_id: string; product_name: string; product_emoji: string; price_paid: number; created_at: string }[];
  coins: { balance: number; lifetime_earned: number };
  interests: { interest_tag: string; weight: number }[];
}

interface BriefingData {
  activeTopics: { id: string; headline: string; summary: string; original_theme: string; anagram_mappings: string; mood: string; category: string; expires_at: string; created_at: string }[];
  expiredTopics: { id: string; headline: string; summary: string; original_theme: string; anagram_mappings: string; mood: string; category: string; expires_at: string; created_at: string }[];
  beefThreads: { id: string; topic: string; status: string; created_at: string; persona1_username: string; persona1_name: string; persona1_emoji: string; persona2_username: string; persona2_name: string; persona2_emoji: string }[];
  challenges: { id: string; tag: string; description: string; created_at: string; creator_username: string; creator_name: string; creator_emoji: string }[];
  topPosts: { id: string; content: string; post_type: string; like_count: number; ai_like_count: number; created_at: string; media_type?: string; beef_thread_id?: string; challenge_tag?: string; is_collab_with?: string; username: string; display_name: string; avatar_emoji: string }[];
}

interface MediaItem {
  id: string;
  url: string;
  media_type: string;
  persona_id?: string;
  persona_username?: string;
  persona_name?: string;
  persona_emoji?: string;
  tags: string;
  description: string;
  used_count: number;
  uploaded_at: string;
}

type Tab = "overview" | "personas" | "users" | "posts" | "create" | "media" | "briefing" | "trading" | "budju" | "directors" | "marketing";

interface MarketingStats {
  totalPosted: number;
  totalQueued: number;
  totalFailed: number;
  totalImpressions: number;
  totalLikes: number;
  totalViews: number;
  platformBreakdown: Array<{ platform: string; posted: number; queued: number; failed: number; impressions: number; likes: number; views: number; lastPostedAt: string | null }>;
  recentPosts: Array<{ id: string; platform: string; adapted_content: string; status: string; platform_url: string | null; impressions: number; likes: number; views: number; posted_at: string | null; created_at: string; persona_display_name: string | null; persona_emoji: string | null }>;
}

interface MktPlatformAccount {
  id: string;
  platform: string;
  account_name: string;
  account_id: string;
  account_url: string;
  is_active: boolean;
  has_token: boolean;
  last_posted_at: string | null;
}

interface TradingData {
  price: { current_sol: number; current_usd: number; sol_usd: number };
  stats_24h: { total_trades: number; buys: number; sells: number; volume_sol: number; volume_glitch: number; avg_price: number; high: number; low: number };
  order_book: {
    bids: { price: number; amount: number; total: number; count: number }[];
    asks: { price: number; amount: number; total: number; count: number }[];
  };
  recent_trades: { id: string; trade_type: string; glitch_amount: number; sol_amount: number; price_per_glitch: number; commentary: string; strategy: string; created_at: string; display_name: string; avatar_emoji: string; username: string }[];
  price_history: { time: string; open: number; high: number; low: number; close: number; volume: number; trades: number }[];
  leaderboard: { persona_id: string; display_name: string; avatar_emoji: string; username: string; total_trades: number; total_bought: number; total_sold: number; net_sol: number; net_glitch: number; strategy: string }[];
  holdings: { persona_id: string; display_name: string; avatar_emoji: string; username: string; glitch_balance: number; sol_balance: number }[];
}

interface BudjuDashboard {
  config: {
    enabled: boolean;
    daily_budget_usd: number;
    max_trade_usd: number;
    min_trade_usd: number;
    min_interval_minutes: number;
    max_interval_minutes: number;
    buy_sell_ratio: number;
    active_persona_count: number;
  };
  price: { budju_usd: number; budju_sol: number; sol_usd: number };
  budget: { daily_limit: number; spent_today: number; remaining: number };
  stats_24h: { total_trades: number; buys: number; sells: number; confirmed: number; failed: number; volume_sol: number; volume_usd: number; volume_budju: number; avg_price: number; high: number; low: number };
  stats_all_time: { total_trades: number; total_volume_usd: number; total_volume_sol: number };
  recent_trades: { id: string; persona_id: string; wallet_address: string; trade_type: string; budju_amount: number; sol_amount: number; price_per_budju: number; usd_value: number; dex_used: string; tx_signature: string | null; strategy: string; commentary: string; status: string; error_message: string | null; created_at: string; display_name: string; avatar_emoji: string; username: string }[];
  leaderboard: { persona_id: string; display_name: string; avatar_emoji: string; username: string; total_trades: number; confirmed_trades: number; total_bought: number; total_sold: number; total_volume_usd: number; strategy: string }[];
  wallets: { persona_id: string; wallet_address: string; sol_balance: number; budju_balance: number; distributor_group: number; is_active: boolean; total_funded_sol: number; total_funded_budju: number; display_name: string; avatar_emoji: string; username: string }[];
  distributors: { id: string; group_number: number; wallet_address: string; sol_balance: number; budju_balance: number; personas_funded: number }[];
  price_history: { time: string; open: number; high: number; low: number; close: number; volume: number; trades: number }[];
  treasury_wallet: string;
  budju_mint: string;
  jupiter_api_key_set?: boolean;
}

interface PendingNft {
  id: string;
  product_name: string;
  product_emoji: string;
  mint_address: string;
  owner_id: string;
  owner_name?: string;
  owner_username?: string;
  rarity: string;
  edition_number: number;
  created_at: string;
}

const MOOD_COLORS: Record<string, string> = {
  outraged: "text-red-400 bg-red-500/10 border-red-500/20",
  amused: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  worried: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  hopeful: "text-green-400 bg-green-500/10 border-green-500/20",
  shocked: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  confused: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  celebratory: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

const CATEGORY_ICONS: Record<string, string> = {
  politics: "🏛️", tech: "💻", entertainment: "🎬", sports: "🏆",
  economy: "💰", environment: "🌍", social: "👥", world: "🌐",
};

function formatBudjuAmount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toString();
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingMovies, setGeneratingMovies] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [generatingBreaking, setGeneratingBreaking] = useState(false);
  const [testingGrokVideo, setTestingGrokVideo] = useState(false);
  const [generatingAd, setGeneratingAd] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ total: number; done: number; current: string; results: { name: string; ok: boolean }[] }>({ total: 0, done: 0, current: "", results: [] });
  const [dragOver, setDragOver] = useState(false);
  const [urlImportText, setUrlImportText] = useState("");
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlImportResult, setUrlImportResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  // copiedPersonaId and copiedVideoId removed — replaced by Grok button
  // Generation progress tracker
  const [genProgress, setGenProgress] = useState<{ label: string; current: number; total: number; startTime: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Per-persona generation
  const [personaGenCount, setPersonaGenCount] = useState<Record<string, number>>({});
  const [personaGenerating, setPersonaGenerating] = useState<string | null>(null);
  const [personaGenLog, setPersonaGenLog] = useState<string[]>([]);
  const [lastGenPersonaId, setLastGenPersonaId] = useState<string | null>(null);

  // Persona edit modal
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [editForm, setEditForm] = useState<{
    display_name: string; username: string; avatar_emoji: string; avatar_url: string;
    personality: string; bio: string; persona_type: string; human_backstory: string;
  }>({ display_name: "", username: "", avatar_emoji: "", avatar_url: "", personality: "", bio: "", persona_type: "", human_backstory: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);

  // Marketing tab state
  const [mktStats, setMktStats] = useState<MarketingStats | null>(null);
  const [mktAccounts, setMktAccounts] = useState<MktPlatformAccount[]>([]);
  const [mktLoading, setMktLoading] = useState(false);
  const [mktRunning, setMktRunning] = useState(false);
  const [mktAccountForm, setMktAccountForm] = useState<{ platform: string; account_name: string; account_id: string; account_url: string; access_token: string; is_active: boolean }>({ platform: "x", account_name: "", account_id: "", account_url: "", access_token: "", is_active: false });
  const [mktSaving, setMktSaving] = useState(false);
  const [mktTestingToken, setMktTestingToken] = useState(false);

  const openEditModal = (p: Persona) => {
    setEditingPersona(p);
    setEditForm({
      display_name: p.display_name,
      username: p.username,
      avatar_emoji: p.avatar_emoji,
      avatar_url: p.avatar_url || "",
      personality: p.personality,
      bio: p.bio,
      persona_type: p.persona_type,
      human_backstory: p.human_backstory || "",
    });
  };

  const savePersonaEdit = async () => {
    if (!editingPersona) return;
    setEditSaving(true);
    try {
      await fetch("/api/admin/personas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingPersona.id, ...editForm }),
      });
      fetchPersonas();
      setEditingPersona(null);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setEditSaving(false);
  };

  const generatePersonaAvatar = async () => {
    if (!editingPersona || generatingAvatar) return;
    setGeneratingAvatar(true);
    try {
      const res = await fetch("/api/admin/persona-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: editingPersona.id, post_to_feed: true }),
      });
      const data = await res.json();
      if (data.success && data.avatar_url) {
        setEditForm(prev => ({ ...prev, avatar_url: data.avatar_url }));
        setPersonas(prev => prev.map(p => p.id === editingPersona.id ? { ...p, avatar_url: data.avatar_url } : p));
        alert(`Avatar generated! ${data.posted_to_feed ? "Posted to feed." : ""} (Admin override — monthly cooldown reset)`);
      } else {
        alert(data.error || "Avatar generation failed");
      }
    } catch (err) {
      console.error("Avatar generation failed:", err);
      alert("Avatar generation failed");
    }
    setGeneratingAvatar(false);
  };

  const uploadPersonaAvatar = async (file: File) => {
    if (!editingPersona) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("media_type", "image");
      formData.append("tags", "avatar,profile");
      formData.append("description", `Profile image for ${editingPersona.display_name}`);
      const res = await fetch("/api/admin/media", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.results?.[0]?.url) {
          const url = data.results[0].url;
          setEditForm(prev => ({ ...prev, avatar_url: url }));
          await fetch("/api/admin/personas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingPersona.id, avatar_url: url }),
          });
          setPersonas(prev => prev.map(p => p.id === editingPersona.id ? { ...p, avatar_url: url } : p));
        }
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
    }
  };

  // Premiere folder uploader
  const [blobFolder, setBlobFolder] = useState("premiere/action");
  const [blobUploading, setBlobUploading] = useState(false);
  const [blobFolderCounts, setBlobFolderCounts] = useState<Record<string, number>>({});
  const [blobPanelOpen, setBlobPanelOpen] = useState(false);
  const blobInputRef = useRef<HTMLInputElement>(null);
  const [blobUploadProgress, setBlobUploadProgress] = useState<{
    current: number; total: number; fileName: string; startTime: number;
  } | null>(null);


  // User management state
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [editingUser, setEditingUser] = useState<{ id: string; display_name: string; username: string; bio: string; avatar_emoji: string; is_active: boolean } | null>(null);
  const [userActionLoading, setUserActionLoading] = useState(false);

  // Trading dashboard state
  const [tradingData, setTradingData] = useState<TradingData | null>(null);
  const [tradingView, setTradingView] = useState<"chart" | "leaderboard" | "holdings">("chart");
  const [triggeringTrades, setTriggeringTrades] = useState(false);

  // BUDJU trading dashboard state
  const [budjuData, setBudjuData] = useState<BudjuDashboard | null>(null);
  const [budjuView, setBudjuView] = useState<"trades" | "leaderboard" | "wallets" | "config">("trades");
  const [budjuActionLoading, setBudjuActionLoading] = useState(false);

  // NFT management state
  const [pendingNfts, setPendingNfts] = useState<PendingNft[]>([]);
  const [nftReconciling, setNftReconciling] = useState(false);
  const [nftLookupTx, setNftLookupTx] = useState("");
  const [nftLookupResult, setNftLookupResult] = useState<Record<string, unknown> | null>(null);

  // Director movie prompts state
  const [directorPrompts, setDirectorPrompts] = useState<{ id: string; title: string; concept: string; genre: string; is_used: boolean; created_at: string }[]>([]);
  const [directorMovies, setDirectorMovies] = useState<{ id: string; title: string; genre: string; director_username: string; status: string; clip_count: number; created_at: string; post_id: string | null; premiere_post_id: string | null; multi_clip_job_id: string | null; job_status: string | null; completed_clips: number | null; total_clips: number | null }[]>([]);
  const [directorLoading, setDirectorLoading] = useState(false);
  const [stitchingJobId, setStitchingJobId] = useState<string | null>(null);
  const [directorNewPrompt, setDirectorNewPrompt] = useState({ title: "", concept: "", genre: "any", director: "auto" });
  const [directorSubmitting, setDirectorSubmitting] = useState(false);
  const [directorGenerating, setDirectorGenerating] = useState(false);
  const [directorAutoGenerating, setDirectorAutoGenerating] = useState(false);

  // Elapsed timer for generation progress
  useEffect(() => {
    if (!genProgress) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - genProgress.startTime) / 1000));
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - genProgress.startTime) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [genProgress]);

  // Generate a Grok video for a specific persona based on their identity
  const [grokGeneratingPersona, setGrokGeneratingPersona] = useState<string | null>(null);

  const generatePersonaGrokVideo = async (p: Persona) => {
    if (grokGeneratingPersona || testingGrokVideo) return;
    setGrokGeneratingPersona(p.id);

    // Build a video prompt based on who this persona IS
    const bioKeywords = p.bio.toLowerCase();
    const personalityKeywords = (p.personality || "").toLowerCase();
    const backstory = p.human_backstory || "";

    // Determine the visual theme from the persona's identity
    let visualTheme = "";
    let folder = "premiere/action"; // default

    if (bioKeywords.includes("cook") || bioKeywords.includes("chef") || bioKeywords.includes("food") || bioKeywords.includes("recipe")) {
      visualTheme = `A dramatic cooking scene — hands chopping ingredients in slow motion, flames erupting from a pan, plating a gorgeous dish. Kitchen setting with warm lighting.`;
      folder = "premiere/comedy";
    } else if (bioKeywords.includes("game") || bioKeywords.includes("thrones") || bioKeywords.includes("fantasy") || bioKeywords.includes("dragon")) {
      visualTheme = `An epic fantasy scene — a lone figure on a cliff overlooking a vast kingdom, dragons circling in stormy skies, medieval castle in the distance. Cinematic, Game of Thrones energy.`;
      folder = "premiere/action";
    } else if (bioKeywords.includes("music") || bioKeywords.includes("dj") || bioKeywords.includes("beat") || bioKeywords.includes("rapper") || bioKeywords.includes("sing")) {
      visualTheme = `A music video scene — pulsing neon lights, a performer silhouetted against a massive LED wall, bass drops visualized as shockwaves. Concert energy.`;
      folder = "premiere/action";
    } else if (bioKeywords.includes("fitness") || bioKeywords.includes("gym") || bioKeywords.includes("workout") || bioKeywords.includes("athlete")) {
      visualTheme = `An intense workout montage — slow-motion weightlifting, sweat drops catching light, explosive sprints. Industrial gym with dramatic lighting.`;
      folder = "premiere/action";
    } else if (bioKeywords.includes("tech") || bioKeywords.includes("code") || bioKeywords.includes("hack") || bioKeywords.includes("ai") || bioKeywords.includes("robot")) {
      visualTheme = `A cyberpunk tech scene — holographic displays, code cascading through the air, a figure in a neon-lit server room. Blade Runner meets Silicon Valley.`;
      folder = "premiere/scifi";
    } else if (bioKeywords.includes("art") || bioKeywords.includes("paint") || bioKeywords.includes("creative") || bioKeywords.includes("design")) {
      visualTheme = `A mesmerizing art creation scene — paint splashing in slow motion, digital art materializing from light, a canvas transforming. Vibrant colors exploding.`;
      folder = "premiere/romance";
    } else if (bioKeywords.includes("horror") || bioKeywords.includes("dark") || bioKeywords.includes("creep") || bioKeywords.includes("scare")) {
      visualTheme = `A chilling horror scene — flickering lights in an abandoned hallway, shadows moving independently, a door slowly creaking open. Pure dread.`;
      folder = "premiere/horror";
    } else if (bioKeywords.includes("comedy") || bioKeywords.includes("funny") || bioKeywords.includes("joke") || bioKeywords.includes("meme") || bioKeywords.includes("chaos")) {
      visualTheme = `A hilarious comedy scene — a perfectly timed fail, objects falling like dominoes, someone's dramatic over-reaction in slow motion. Pure comedy gold.`;
      folder = "premiere/comedy";
    } else if (bioKeywords.includes("love") || bioKeywords.includes("romance") || bioKeywords.includes("relationship") || bioKeywords.includes("heart")) {
      visualTheme = `A cinematic romance scene — golden hour light, two silhouettes on a rooftop, city lights twinkling below. Dreamy, warm, emotional.`;
      folder = "premiere/romance";
    } else if (bioKeywords.includes("family") || bioKeywords.includes("kid") || bioKeywords.includes("parent") || bioKeywords.includes("wholesome")) {
      visualTheme = `A heartwarming family scene — a group adventure through a magical landscape, laughter and wonder, Pixar-quality warmth and emotion.`;
      folder = "premiere/family";
    } else if (personalityKeywords.includes("villain") || personalityKeywords.includes("chaos") || personalityKeywords.includes("dark")) {
      visualTheme = `A dramatic villain reveal — a figure emerging from shadows, lightning crackling, a sinister smile. Cinematic, menacing, unforgettable.`;
      folder = "premiere/horror";
    } else if (bioKeywords.includes("travel") || bioKeywords.includes("adventure") || bioKeywords.includes("explore")) {
      visualTheme = `An epic travel montage — drone shots over breathtaking landscapes, a figure standing on a mountain peak at sunrise, waves crashing on exotic shores.`;
      folder = "premiere/action";
    } else if (bioKeywords.includes("fashion") || bioKeywords.includes("style") || bioKeywords.includes("beauty")) {
      visualTheme = `A high-fashion scene — a dramatic runway walk, fabric flowing in slow motion, lights flashing. Vogue meets cinema.`;
      folder = "premiere/romance";
    } else {
      // Generic fallback based on persona type
      visualTheme = `A dramatic, eye-catching scene that captures the essence of ${p.display_name}: ${p.bio.slice(0, 100)}. Cinematic, bold, unforgettable.`;
      folder = "premiere/action";
    }

    const prompt = `Cinematic blockbuster trailer. ${visualTheme} ${backstory ? `Visual details: ${backstory.slice(0, 150)}.` : ""} The text 'AIG!ITCH' appears prominently as large bold glowing neon text — either as a title card or integrated as a giant sign in the scene. 9:16 vertical, 10 seconds, 720p.`;

    setGenerationLog((prev) => [...prev, `🎬 Generating Grok video for @${p.username} (${p.display_name})`]);
    setGenerationLog((prev) => [...prev, `  📝 Theme: "${visualTheme.slice(0, 80)}..."`]);
    setGenProgress({ label: `🎬 @${p.username}`, current: 1, total: 1, startTime: Date.now() });

    try {
      const submitRes = await fetch("/api/test-grok-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, duration: 10, folder: "feed", persona_id: p.id, caption: `${p.avatar_emoji} ${visualTheme.slice(0, 200)}\n\n#AIGlitch` }),
      });
      const submitData = await submitRes.json();

      if (submitData.phase === "done" && submitData.success) {
        setGenerationLog((prev) => [...prev, `  ✅ Video ready! Posted to @${p.username}'s profile.`]);
        setGenProgress(null);
        setGrokGeneratingPersona(null);
        fetchStats();
        return;
      }

      if (!submitData.success || !submitData.requestId) {
        setGenerationLog((prev) => [...prev, `  ❌ Submit failed: ${submitData.error || "Unknown error"}`]);
        setGenProgress(null);
        setGrokGeneratingPersona(null);
        return;
      }

      const requestId = submitData.requestId;
      setGenerationLog((prev) => [...prev, `  ✅ Submitted! Polling for completion...`]);

      const maxPolls = 90;
      for (let attempt = 1; attempt <= maxPolls; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        const elapsedSec = attempt * 10;
        const min = Math.floor(elapsedSec / 60);
        const sec = elapsedSec % 60;
        const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

        try {
          const pollRes = await fetch(`/api/test-grok-video?id=${encodeURIComponent(requestId)}&folder=feed&persona_id=${encodeURIComponent(p.id)}&caption=${encodeURIComponent(`${p.avatar_emoji} ${visualTheme.slice(0, 200)}\n\n#AIGlitch`)}`);
          const pollData = await pollRes.json();
          const status = pollData.status || "unknown";

          if (pollData.phase === "done" && pollData.success) {
            setGenerationLog((prev) => [...prev, `  🎉 Video for @${p.username} ready after ${timeStr}!`]);
            if (pollData.autoPosted) {
              setGenerationLog((prev) => [...prev, `  ✅ Posted to @${p.username}'s profile! Check the feed.`]);
            }
            setGenProgress(null);
            setGrokGeneratingPersona(null);
            fetchStats();
            return;
          }

          if (status === "moderation_failed") {
            setGenerationLog((prev) => [...prev, `  ⛔ Video failed moderation. Try a different persona.`]);
            setGenProgress(null);
            setGrokGeneratingPersona(null);
            return;
          }

          if (status === "expired" || status === "failed") {
            setGenerationLog((prev) => [...prev, `  ❌ Video ${status} after ${timeStr}.`]);
            setGenProgress(null);
            setGrokGeneratingPersona(null);
            return;
          }

          if (attempt % 3 === 0 || attempt <= 3) {
            setGenerationLog((prev) => [...prev, `  🔄 @${p.username}: ${status} (${timeStr})`]);
          }
        } catch {
          // retry on network error
        }
      }
      setGenerationLog((prev) => [...prev, `  ❌ Timed out after 15 minutes`]);
    } catch (err) {
      setGenerationLog((prev) => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setGenProgress(null);
    setGrokGeneratingPersona(null);
  };

  // New persona form
  const [newPersona, setNewPersona] = useState({
    username: "", display_name: "", avatar_emoji: "🤖",
    personality: "", bio: "", persona_type: "general",
  });

  // Media upload form
  const [mediaForm, setMediaForm] = useState({
    media_type: "meme" as "image" | "video" | "meme",
    tags: "",
    description: "",
    persona_id: "",
  });

  const handleLogin = async () => {
    const res = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthenticated(true);
      setError("");
    } else {
      setError("Invalid password");
    }
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      setStats(await res.json());
    } else if (res.status === 401) {
      setAuthenticated(false);
    }
    setLoading(false);
  }, []);

  const fetchPersonas = useCallback(async () => {
    const res = await fetch("/api/admin/personas");
    if (res.ok) {
      const data = await res.json();
      setPersonas(data.personas);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }, []);

  const fetchUserDetail = useCallback(async (userId: string) => {
    setUserActionLoading(true);
    const res = await fetch(`/api/admin/users?action=detail&user_id=${userId}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedUser(data.user);
    }
    setUserActionLoading(false);
  }, []);

  const updateUser = async () => {
    if (!editingUser) return;
    setUserActionLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: editingUser.id, ...editingUser }),
    });
    if (res.ok) {
      setEditingUser(null);
      fetchUsers();
      if (selectedUser?.id === editingUser.id) fetchUserDetail(editingUser.id);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to update user");
      setTimeout(() => setError(""), 3000);
    }
    setUserActionLoading(false);
  };

  const deleteUser = async (userId: string, username: string) => {
    if (!confirm(`Delete @${username} and ALL their data? This cannot be undone.`)) return;
    setUserActionLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) {
      setSelectedUser(null);
      setEditingUser(null);
      fetchUsers();
    }
    setUserActionLoading(false);
  };

  const mergeAccounts = async (targetUserId: string, oldUsernames: string[]) => {
    if (!confirm(`Merge data from ${oldUsernames.join(", ")} into this account?`)) return;
    setUserActionLoading(true);
    // Get the target user's session_id
    const target = users.find(u => u.id === targetUserId);
    if (!target) { setUserActionLoading(false); return; }
    const res = await fetch("/api/auth/human", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merge_accounts", session_id: target.session_id, old_usernames: oldUsernames }),
    });
    if (res.ok) {
      const data = await res.json();
      alert(data.message);
      fetchUsers();
      fetchUserDetail(targetUserId);
    }
    setUserActionLoading(false);
  };

  const fetchBriefing = useCallback(async () => {
    const res = await fetch("/api/admin/briefing");
    if (res.ok) {
      setBriefing(await res.json());
    }
  }, []);

  const fetchMedia = useCallback(async () => {
    const res = await fetch("/api/admin/media");
    if (res.ok) {
      const data = await res.json();
      setMediaItems(data.media);
    }
  }, []);

  const fetchTrading = useCallback(async () => {
    const res = await fetch("/api/admin/trading");
    if (res.ok) {
      const data = await res.json();
      setTradingData(data);
    }
  }, []);

  const triggerAITrades = async (count: number) => {
    setTriggeringTrades(true);
    const res = await fetch("/api/admin/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger_trades", count }),
    });
    if (res.ok) {
      setTimeout(() => fetchTrading(), 1000);
    }
    setTriggeringTrades(false);
  };

  const fetchPendingNfts = async () => {
    const res = await fetch("/api/admin/nfts?action=pending");
    if (res.ok) {
      const data = await res.json();
      setPendingNfts(data.pending);
    }
  };

  const autoReconcileNfts = async () => {
    setNftReconciling(true);
    const res = await fetch("/api/admin/nfts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_reconcile" }),
    });
    if (res.ok) {
      const data = await res.json();
      alert(`Reconciled ${data.reconciled} of ${data.total_pending} pending NFTs.\n\n${data.results.map((r: { product: string; status: string; tx?: string }) => `${r.product}: ${r.status}${r.tx ? ` (${r.tx.slice(0, 12)}...)` : ""}`).join("\n")}`);
      fetchPendingNfts();
    }
    setNftReconciling(false);
  };

  const lookupNftTx = async () => {
    if (!nftLookupTx.trim()) return;
    const res = await fetch(`/api/admin/nfts?action=lookup_tx&tx=${nftLookupTx.trim()}`);
    if (res.ok) {
      setNftLookupResult(await res.json());
    } else {
      const data = await res.json();
      setNftLookupResult({ error: data.error });
    }
  };

  const reconcileSingleNft = async (nftId: string, txSig: string) => {
    const res = await fetch("/api/admin/nfts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reconcile", nft_id: nftId, tx_signature: txSig }),
    });
    if (res.ok) {
      const data = await res.json();
      alert(data.message);
      fetchPendingNfts();
    }
  };

  // BUDJU trading functions
  // Director movie prompt functions
  const fetchDirectorData = useCallback(async () => {
    setDirectorLoading(true);
    try {
      const res = await fetch("/api/admin/director-prompts");
      if (res.ok) {
        const data = await res.json();
        setDirectorPrompts(data.prompts || []);
        setDirectorMovies(data.recentMovies || []);
      }
    } catch (err) {
      console.error("[directors] Fetch error:", err);
    }
    setDirectorLoading(false);
  }, []);

  const submitDirectorPrompt = async () => {
    if (!directorNewPrompt.title.trim() || !directorNewPrompt.concept.trim()) return;
    setDirectorSubmitting(true);
    try {
      const res = await fetch("/api/admin/director-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(directorNewPrompt),
      });
      if (res.ok) {
        setDirectorNewPrompt({ title: "", concept: "", genre: "any", director: "auto" });
        fetchDirectorData();
      }
    } catch (err) {
      console.error("[directors] Submit error:", err);
    }
    setDirectorSubmitting(false);
  };

  const deleteDirectorPrompt = async (id: string) => {
    try {
      await fetch("/api/admin/director-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchDirectorData();
    } catch (err) {
      console.error("[directors] Delete error:", err);
    }
  };

  const deleteDirectorMovie = async (id: string) => {
    try {
      await fetch("/api/admin/director-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: "movie" }),
      });
      fetchDirectorData();
    } catch (err) {
      console.error("[directors] Delete movie error:", err);
    }
  };

  const stitchDirectorMovie = async (jobId: string) => {
    setStitchingJobId(jobId);
    try {
      const res = await fetch("/api/generate-director-movie", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Stitched and posted! Feed: ${data.feedPostId}`);
      } else {
        alert(`Stitch failed: ${data.error || "Unknown error"}`);
      }
      fetchDirectorData();
    } catch (err) {
      console.error("[directors] Stitch error:", err);
      alert("Stitch request failed — check console");
    }
    setStitchingJobId(null);
  };

  const triggerDirectorMovie = async () => {
    if (!directorNewPrompt.concept.trim()) {
      alert("Click 'Random Concept' first to populate the form.");
      return;
    }

    setDirectorGenerating(true);
    const genre = directorNewPrompt.genre === "any" ? "action" : directorNewPrompt.genre;
    const genreLabel = genre.charAt(0).toUpperCase() + genre.slice(1);
    const folder = `premiere/${genre}`;

    setGenerationLog([`🎬 Generating ${genreLabel} movie: "${directorNewPrompt.title}"`]);
    setGenerationLog(prev => [...prev, `  📜 Asking Claude to write screenplay...`]);
    setGenProgress({ label: `📜 Screenplay`, current: 1, total: 1, startTime: Date.now() });

    try {
      // Phase 1: Generate screenplay (Claude writes connected scene prompts)
      const screenplayRes = await fetch("/api/admin/screenplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre,
          director: directorNewPrompt.director,
          concept: directorNewPrompt.concept,
        }),
      });
      const screenplay = await screenplayRes.json();

      if (screenplay.error) {
        setGenerationLog(prev => [...prev, `  ❌ ${screenplay.error}`]);
        setGenProgress(null);
        setDirectorGenerating(false);
        return;
      }

      const scenes = screenplay.scenes as { sceneNumber: number; title: string; videoPrompt: string; duration: number }[];
      setGenerationLog(prev => [...prev, `  ✅ "${screenplay.title}" — ${scenes.length} scenes by ${screenplay.directorName}`]);
      setGenerationLog(prev => [...prev, `  📖 ${screenplay.synopsis}`]);
      setGenerationLog(prev => [...prev, `  🎭 Cast: ${screenplay.castList.join(", ")}`]);
      setGenerationLog(prev => [...prev, ``]);

      // Phase 2: Submit all scenes to xAI
      setGenerationLog(prev => [...prev, `📡 Submitting ${scenes.length} scenes to xAI...`]);
      setGenProgress({ label: `📡 Submitting`, current: 1, total: scenes.length, startTime: Date.now() });

      const sceneJobs: { sceneNumber: number; title: string; requestId: string | null }[] = [];

      for (const scene of scenes) {
        setGenProgress(prev => prev ? { ...prev, current: scene.sceneNumber } : null);
        setGenerationLog(prev => [...prev, `[${scene.sceneNumber}/${scenes.length}] 🎬 ${scene.title}`]);
        setGenerationLog(prev => [...prev, `  📝 "${scene.videoPrompt.slice(0, 100)}..."`]);

        try {
          const submitRes = await fetch("/api/test-grok-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: scene.videoPrompt, duration: scene.duration, folder }),
          });
          const submitData = await submitRes.json();

          if (submitData.success && submitData.requestId) {
            sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: submitData.requestId });
            setGenerationLog(prev => [...prev, `  ✅ Submitted: ${submitData.requestId.slice(0, 12)}...`]);
          } else {
            sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
            setGenerationLog(prev => [...prev, `  ❌ Submit failed: ${submitData.error || "unknown"}`]);
          }
        } catch (err) {
          sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
          setGenerationLog(prev => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
        }
      }

      const pendingJobs = sceneJobs.filter(j => j.requestId);
      if (pendingJobs.length === 0) {
        setGenerationLog(prev => [...prev, `❌ No scenes submitted successfully`]);
        setGenProgress(null);
        setDirectorGenerating(false);
        return;
      }

      // Phase 3: Poll all scenes until done
      setGenerationLog(prev => [...prev, ``]);
      setGenerationLog(prev => [...prev, `⏳ Polling ${pendingJobs.length} scenes every 10s (typical: 2-10 min per scene)...`]);

      const doneScenes = new Set<number>();
      const failedScenes = new Set<number>();
      const sceneUrls: Record<number, string> = {};
      const maxPolls = 90; // 15 minutes
      let lastProgressAttempt = 0; // Track when we last made progress (scene completed/failed)

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
              setGenerationLog(prev => [...prev, `  🎉 Scene ${job.sceneNumber} "${job.title}" DONE (${timeStr}) ${pollData.sizeMb ? `— ${pollData.sizeMb}MB` : ""}`]);
              lastProgressAttempt = attempt;
            } else if (status === "moderation_failed" || status === "expired" || status === "failed") {
              failedScenes.add(job.sceneNumber);
              setGenerationLog(prev => [...prev, `  ❌ Scene ${job.sceneNumber} "${job.title}" ${status} (${timeStr})`]);
              lastProgressAttempt = attempt;
            }
          } catch {
            // poll error — will retry next round
          }
        }

        const totalDone = doneScenes.size + failedScenes.size;
        setGenProgress({ label: `🎬 Rendering`, current: doneScenes.size, total: pendingJobs.length, startTime: Date.now() - elapsedSec * 1000 });

        // Show periodic status
        if (attempt % 3 === 0) {
          setGenerationLog(prev => [...prev, `  🔄 ${timeStr}: ${doneScenes.size}/${pendingJobs.length} done, ${failedScenes.size} failed`]);
        }

        if (totalDone >= pendingJobs.length) break;

        // Stall detection: if we have at least half the clips and no scene has
        // completed/failed in the last 60 seconds, stop waiting and stitch with
        // what we have rather than blocking for the full 15-minute timeout.
        const stallThreshold = 6; // 6 polls × 10s = 60 seconds of no progress
        if (
          doneScenes.size >= Math.ceil(pendingJobs.length / 2) &&
          lastProgressAttempt > 0 &&
          (attempt - lastProgressAttempt) >= stallThreshold
        ) {
          const stuckCount = pendingJobs.length - totalDone;
          setGenerationLog(prev => [...prev, `  ⏰ ${stuckCount} scene(s) stalled for 60s — proceeding to stitch with ${doneScenes.size}/${pendingJobs.length} clips`]);
          break;
        }
      }

      // Final summary
      setGenerationLog(prev => [...prev, ``]);
      setGenerationLog(prev => [...prev, `🏁 "${screenplay.title}" — ${doneScenes.size}/${pendingJobs.length} scenes completed, ${failedScenes.size} failed`]);

      if (doneScenes.size === 0) {
        setGenerationLog(prev => [...prev, `❌ No scenes rendered successfully. Try a different concept.`]);
      } else {
        // Phase 4: Stitch all completed clips into one video!
        setGenerationLog(prev => [...prev, ``]);
        setGenerationLog(prev => [...prev, `🧩 Stitching ${doneScenes.size} clip${doneScenes.size > 1 ? "s" : ""} into one movie...`]);
        setGenProgress({ label: `🧩 Stitching`, current: 1, total: 1, startTime: Date.now() });

        try {
          const stitchRes = await fetch("/api/generate-director-movie", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sceneUrls: sceneUrls,
              title: screenplay.title,
              genre,
              directorUsername: screenplay.director,
              directorId: screenplay.directorId,
              synopsis: screenplay.synopsis,
              tagline: screenplay.tagline,
              castList: screenplay.castList,
            }),
          });
          const stitchData = await stitchRes.json();

          if (stitchRes.ok) {
            setGenerationLog(prev => [...prev, `✅ MOVIE STITCHED! ${stitchData.clipCount} clip${stitchData.clipCount > 1 ? "s" : ""} → ${stitchData.sizeMb}MB`]);
            setGenerationLog(prev => [...prev, `🎬 Feed post: ${stitchData.feedPostId}`]);
            setGenerationLog(prev => [...prev, `🏆 Added to Recent Blockbusters!`]);
            if (stitchData.downloadErrors) {
              setGenerationLog(prev => [...prev, `⚠️ Some clips skipped: ${stitchData.downloadErrors.join(", ")}`]);
            }
          } else {
            setGenerationLog(prev => [...prev, `❌ Stitch failed: ${stitchData.error || "unknown"}`]);
            setGenerationLog(prev => [...prev, `✅ Individual clips still saved to ${folder}/`]);
          }
        } catch (err) {
          setGenerationLog(prev => [...prev, `❌ Stitch error: ${err instanceof Error ? err.message : "unknown"}`]);
          setGenerationLog(prev => [...prev, `✅ Individual clips still saved to ${folder}/`]);
        }
      }

      setDirectorNewPrompt({ title: "", concept: "", genre: "any", director: "auto" });
      fetchDirectorData();
      fetchStats();
    } catch (err) {
      setGenerationLog(prev => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setGenProgress(null);
    setDirectorGenerating(false);
  };

  const autoGenerateConcept = async () => {
    setDirectorAutoGenerating(true);
    try {
      // Pass currently selected genre so the concept matches the user's choice
      const genreParam = directorNewPrompt.genre !== "any" ? `&genre=${encodeURIComponent(directorNewPrompt.genre)}` : "";
      const res = await fetch(`/api/admin/director-prompts?preview=1${genreParam}`, { method: "PUT" });
      const data = await res.json();
      if (data.success) {
        // Preserve the user's selected director — only update title, concept, and genre
        setDirectorNewPrompt(p => ({ ...p, title: data.title, concept: data.concept, genre: data.genre }));
      }
    } catch (err) {
      console.error("[directors] Auto-generate error:", err);
    }
    setDirectorAutoGenerating(false);
  };

  const fetchBudjuDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/budju-trading");
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          setBudjuData(data);
        } else {
          console.error("[BUDJU] API error:", data.error);
        }
      }
    } catch (err) {
      console.error("[BUDJU] Fetch error:", err);
    }
  }, []);

  const toggleBudjuTrading = async () => {
    setBudjuActionLoading(true);
    const res = await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle" }),
    });
    if (res.ok) {
      setTimeout(() => fetchBudjuDashboard(), 500);
    }
    setBudjuActionLoading(false);
  };

  const triggerBudjuTrades = async (count: number) => {
    setBudjuActionLoading(true);
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger_trades", count }),
    });
    setTimeout(() => { fetchBudjuDashboard(); setBudjuActionLoading(false); }, 1500);
  };

  const generateBudjuWallets = async () => {
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_wallets", count: 15 }),
      });
      const data = await res.json();
      if (res.ok) {
        const errMsg = data.errors?.length ? `\n\nErrors:\n${data.errors.join("\n")}` : "";
        alert(`Generated ${data.wallets} wallets across ${data.distributors} distributors.\nPersonas: ${data.personas?.join(", ") || "All already have wallets"}${errMsg}`);
        fetchBudjuDashboard();
      } else {
        alert(`Failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const syncBudjuBalances = async () => {
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_balances" }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Synced ${data.distributors_synced} distributors + ${data.personas_synced} persona wallets from on-chain.\n\nTotal SOL in system: ${data.total_deposited_sol?.toFixed(4) || 0} SOL`);
        fetchBudjuDashboard();
      } else {
        alert("Sync failed — check console for details.");
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const updateBudjuConfig = async (updates: Record<string, string | number>) => {
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_config", updates }),
    });
    fetchBudjuDashboard();
  };

  const resetBudjuBudget = async () => {
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_budget" }),
    });
    fetchBudjuDashboard();
  };

  const clearFailedTrades = async () => {
    const failedCount = budjuData?.recent_trades.filter(t => t.status === "failed").length || 0;
    if (!confirm(`Clear ${failedCount} failed trades from history?`)) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_failed_trades" }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Cleared ${data.deleted} failed trades.`);
        fetchBudjuDashboard();
      }
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Failed"}`);
    }
    setBudjuActionLoading(false);
  };

  const toggleBudjuWallet = async (personaId: string, currentlyActive: boolean) => {
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: currentlyActive ? "deactivate_wallet" : "activate_wallet", persona_id: personaId }),
    });
    fetchBudjuDashboard();
  };

  const deleteBudjuWallet = async (personaId: string, displayName: string) => {
    if (!confirm(`Delete trading wallet for ${displayName}? This removes all their trade history.`)) return;
    await fetch("/api/admin/budju-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_wallet", persona_id: personaId }),
    });
    fetchBudjuDashboard();
  };

  const distributeBudjuFunds = async () => {
    if (!confirm("Distribute SOL from all 4 distributor wallets to their assigned persona wallets?\n\nMake sure you have funded the distributor wallets first.")) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "distribute_funds" }),
      });
      const data = await res.json();
      if (res.ok) {
        const successCount = data.distributions?.filter((d: { error?: string }) => !d.error).length || 0;
        const failCount = data.distributions?.filter((d: { error?: string }) => d.error).length || 0;
        const budjuMsg = data.total_budju_distributed > 0 ? ` + ${Math.floor(data.total_budju_distributed).toLocaleString()} BUDJU` : "";
        const errMsg = data.errors?.length ? `\n\nErrors:\n${data.errors.join("\n")}` : "";
        alert(`Distributed ${data.total_sol_distributed?.toFixed(4) || 0} SOL${budjuMsg} total.\n${successCount} successful, ${failCount} failed.${errMsg}`);
        fetchBudjuDashboard();
      } else {
        alert(`Distribution failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const drainBudjuWallets = async () => {
    const destination = prompt("Enter the Solana wallet address to drain all funds to:\n\n(This will send ALL SOL from persona and distributor wallets to this address)");
    if (!destination || destination.length < 32) return;
    if (!confirm(`CONFIRM: Drain ALL wallet funds to:\n${destination}\n\nThis will empty every persona and distributor wallet.`)) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drain_wallets", destination, wallet_type: "all" }),
      });
      const data = await res.json();
      if (res.ok) {
        const successCount = data.drained?.filter((d: { error?: string }) => !d.error).length || 0;
        const errMsg = data.errors?.length ? `\n\nErrors:\n${data.errors.join("\n")}` : "";
        alert(`Recovered ${data.total_sol_recovered?.toFixed(4) || 0} SOL from ${successCount} wallets.${errMsg}`);
        fetchBudjuDashboard();
      } else {
        alert(`Drain failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  const exportBudjuKeys = async () => {
    if (!confirm("Export ALL private keys for distributor and persona wallets?\n\nWARNING: Keep these secure! Anyone with these keys can access the funds.")) return;
    setBudjuActionLoading(true);
    try {
      const res = await fetch("/api/admin/budju-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export_keys" }),
      });
      const data = await res.json();
      if (res.ok && data.wallets) {
        const text = data.wallets.map((w: { type: string; name: string; address: string; private_key: string }) =>
          `[${w.type}] ${w.name}\nAddress: ${w.address}\nPrivate Key: ${w.private_key}\n`
        ).join("\n");
        // Copy to clipboard
        await navigator.clipboard.writeText(text).catch(() => {});
        alert(`Exported ${data.wallets.length} wallet keys (copied to clipboard).\n\nKEEP THESE SECURE!`);
      } else {
        alert(`Export failed: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : "Failed to connect"}`);
    }
    setBudjuActionLoading(false);
  };

  // Marketing functions
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
    } catch (err) { console.error("[marketing] fetch error:", err); }
    setMktLoading(false);
  };

  const testPlatformPost = async (platform: string) => {
    const msg = prompt(`Test message for ${platform}:`, `Test post from AIG!itch - ${new Date().toLocaleString()}`);
    if (!msg) return;
    try {
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_post", platform, message: msg }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`${platform} test post succeeded! ${data.platformUrl || ""}`);
      } else {
        alert(`${platform} test post failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
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
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
    setMktRunning(false);
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
    } catch (err) { alert(`Network error: ${err instanceof Error ? err.message : "Unknown"}`); }
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

  // Lazy load data per tab — only fetch what's needed for the current tab
  useEffect(() => {
    if (!authenticated) return;
    if (tab === "overview" && !stats) fetchStats();
    else if (tab === "personas" && personas.length === 0) { fetchPersonas(); }
    else if (tab === "users" && users.length === 0) fetchUsers();
    else if (tab === "briefing" && !briefing) { fetchBriefing(); fetchStats(); }
    else if (tab === "media" && mediaItems.length === 0) { fetchMedia(); if (personas.length === 0) fetchPersonas(); }
    else if (tab === "posts" && !stats) fetchStats();
    else if (tab === "create" && personas.length === 0) fetchPersonas();
    else if (tab === "trading" && !tradingData) { fetchTrading(); fetchPendingNfts(); }
    else if (tab === "budju" && !budjuData) { fetchBudjuDashboard(); }
    else if (tab === "directors" && directorPrompts.length === 0 && directorMovies.length === 0) { fetchDirectorData(); }
    else if (tab === "marketing" && !mktStats) { fetchMarketingData(); }
  }, [authenticated, tab]);

  // No auto-login — always require password entry on page load for security.
  // The session cookie is used for API calls during the session but does NOT
  // bypass the login form. This prevents unauthorized access if someone
  // accesses the admin page on a shared/unattended browser.

  // Initial load: just stats for the overview tab
  useEffect(() => {
    if (authenticated && !stats) {
      fetchStats();
    }
  }, [authenticated, fetchStats, fetchPersonas, fetchUsers, fetchBriefing, fetchMedia]);


  const togglePersona = async (id: string, active: boolean) => {
    await fetch("/api/admin/personas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !active }),
    });
    fetchPersonas();
  };

  const createPersona = async () => {
    if (!newPersona.username || !newPersona.display_name || !newPersona.personality || !newPersona.bio) {
      setError("Fill in all required fields");
      return;
    }
    const res = await fetch("/api/admin/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPersona),
    });
    if (res.ok) {
      setNewPersona({ username: "", display_name: "", avatar_emoji: "🤖", personality: "", bio: "", persona_type: "general" });
      fetchPersonas();
      setTab("personas");
      setError("");
    }
  };

  const deletePost = async (id: string) => {
    await fetch("/api/admin/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchStats();
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadProgress({ total: files.length, done: 0, current: files[0].name, results: [] });

    const allResults: { name: string; ok: boolean }[] = [];
    const MAX_SERVER_SIZE = 4 * 1024 * 1024; // 4MB - Vercel serverless body limit

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({
        total: files.length,
        done: i,
        current: file.name,
        results: allResults,
      });

      try {
        if (file.size > MAX_SERVER_SIZE) {
          // Large files (videos): use Vercel Blob client upload to bypass body size limit
          // Dynamically import to avoid bundling for users who only upload small files
          const { upload } = await import("@vercel/blob/client");
          const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
          const blob = await upload(`media-library/${file.name}`, file, {
            access: "public",
            handleUploadUrl: "/api/admin/media/upload",
            multipart: true,
          });

          // Save to DB via lightweight endpoint
          const saveRes = await fetch("/api/admin/media/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: blob.url,
              media_type: mediaForm.media_type,
              tags: mediaForm.tags,
              description: mediaForm.description || file.name,
              persona_id: mediaForm.persona_id || null,
            }),
          });

          if (saveRes.ok) {
            allResults.push({ name: file.name, ok: true });
          } else {
            console.error(`DB save failed for ${file.name}:`, await saveRes.text());
            allResults.push({ name: file.name, ok: false });
          }
        } else {
          // Small files (images): use simple server upload
          const formData = new FormData();
          formData.append("file", file);
          formData.append("media_type", mediaForm.media_type);
          formData.append("tags", mediaForm.tags);
          formData.append("description", mediaForm.description);
          if (mediaForm.persona_id) formData.append("persona_id", mediaForm.persona_id);

          const res = await fetch("/api/admin/media", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            for (const r of data.results) {
              allResults.push({ name: r.name, ok: !r.error });
            }
          } else {
            const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            console.error(`Upload failed for ${file.name}:`, errData);
            allResults.push({ name: file.name, ok: false });
          }
        }
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
        allResults.push({ name: file.name, ok: false });
      }
    }

    setUploadProgress({
      total: files.length,
      done: files.length,
      current: "Done!",
      results: allResults,
    });

    fetchMedia();
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (files.length > 0) uploadFiles(files);
  };

  const importFromUrls = async () => {
    const urls = urlImportText.split("\n").map(u => u.trim()).filter(u => u && (u.startsWith("http://") || u.startsWith("https://")));
    if (urls.length === 0) return;
    setUrlImporting(true);
    setUrlImportResult(null);
    try {
      const res = await fetch("/api/admin/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          media_type: mediaForm.media_type,
          tags: mediaForm.tags,
          description: mediaForm.description,
          persona_id: mediaForm.persona_id || undefined,
        }),
      });
      const data = await res.json();
      setUrlImportResult({
        imported: data.imported || 0,
        failed: data.failed || 0,
        errors: (data.results || []).filter((r: { error?: string }) => r.error).map((r: { url: string; error?: string }) => `${r.url.slice(0, 50)}... — ${r.error}`),
      });
      if (data.imported > 0) {
        fetchMedia();
        setUrlImportText("");
      }
    } catch (err) {
      setUrlImportResult({ imported: 0, failed: urls.length, errors: [String(err)] });
    }
    setUrlImporting(false);
  };

  const deleteMedia = async (id: string) => {
    await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchMedia();
  };

  const triggerGeneration = async () => {
    setGenerating(true);
    setGenerationLog(["Starting generation..."]);

    try {
      const res = await fetch("/api/generate?stream=1", { method: "POST" });
      if (!res.ok) {
        setGenerationLog((prev) => [...prev, `Error: ${res.status} ${res.statusText}`]);
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setGenerationLog((prev) => [...prev, "Error: No response stream"]);
        setGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") {
                setGenerationLog((prev) => [...prev, data.message]);
              } else if (eventType === "done") {
                setGenerationLog((prev) => [...prev, `Done! Generated ${data.generated} new post${data.generated !== 1 ? "s" : ""}!`]);
              } else if (eventType === "error") {
                setGenerationLog((prev) => [...prev, `Error: ${data.message}`]);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      setGenerationLog((prev) => [...prev, `Network error: ${err instanceof Error ? err.message : "unknown"}`]);
    }

    fetchStats();
    setGenerating(false);
  };

  const triggerMovieGeneration = async () => {
    setGeneratingMovies(true);
    const total = 4;
    setGenerationLog((prev) => [...prev, `🎬 Generating ${total} movie trailers (1 at a time, up to ~5 min each)...`]);
    let successCount = 0;
    for (let i = 0; i < total; i++) {
      try {
        setGenProgress({ label: "🎬 Movie", current: i + 1, total, startTime: Date.now() });
        setGenerationLog((prev) => [...prev, `🎬 Movie ${i + 1}/${total}: generating...`]);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 11 * 60 * 1000);
        const res = await fetch("/api/generate-movies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 1 }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await res.json();
        if (data.success && data.movies?.[0]) {
          const m = data.movies[0];
          setGenerationLog((prev) => [...prev, `  ✅ "${m.title}" (${m.genre}) ${m.hasVideo ? "📹" : "📝"}`]);
          successCount++;
        } else {
          setGenerationLog((prev) => [...prev, `  ❌ Movie ${i + 1} error: ${data.error || "unknown"}`]);
        }
      } catch (err) {
        setGenerationLog((prev) => [...prev, `  ❌ Movie ${i + 1} failed: ${err instanceof Error ? err.message : "unknown"}`]);
      }
    }
    setGenProgress(null);
    setGenerationLog((prev) => [...prev, `🎬 Done: ${successCount}/${total} movies created`]);
    fetchStats();
    setGeneratingMovies(false);
  };

  const triggerVideoGeneration = async () => {
    setGeneratingVideos(true);
    const total = 5;
    setGenerationLog((prev) => [...prev, `🎥 Submitting ${total} videos to Grok...`]);

    // Phase 1: Submit all videos (fast — returns request_ids immediately)
    let jobs: { requestId: string | null; title: string; genre: string; tagline: string; error?: string }[] = [];
    try {
      setGenProgress({ label: "🎥 Submitting", current: 1, total: 1, startTime: Date.now() });
      const res = await fetch("/api/generate-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: total }),
      });
      const data = await res.json();
      if (!data.success || !data.jobs) {
        setGenerationLog((prev) => [...prev, `  ❌ Submit failed: ${data.error || "unknown"}`]);
        setGenProgress(null);
        setGeneratingVideos(false);
        return;
      }
      jobs = data.jobs;
      const submitted = jobs.filter((j: { requestId: string | null }) => j.requestId).length;
      setGenerationLog((prev) => [...prev, `  📡 ${submitted}/${jobs.length} submitted to xAI. Polling for completion...`]);
      for (const job of jobs) {
        if (job.error) {
          setGenerationLog((prev) => [...prev, `  ❌ "${job.title}" submit failed: ${job.error}`]);
        }
      }
    } catch (err) {
      setGenerationLog((prev) => [...prev, `  ❌ Submit error: ${err instanceof Error ? err.message : "unknown"}`]);
      setGenProgress(null);
      setGeneratingVideos(false);
      return;
    }

    // Phase 2: Poll each job until done/failed (client-side, 10s intervals, max 10 min)
    const activeJobs = jobs.filter((j) => j.requestId);
    let successCount = 0;
    for (let i = 0; i < activeJobs.length; i++) {
      const job = activeJobs[i];
      setGenProgress({ label: `🎥 "${job.title}"`, current: i + 1, total: activeJobs.length, startTime: Date.now() });
      setGenerationLog((prev) => [...prev, `  🔄 Polling "${job.title}" (${job.genre})...`]);

      let done = false;
      for (let attempt = 0; attempt < 60 && !done; attempt++) { // 60 * 10s = 10 min max
        await new Promise((r) => setTimeout(r, 10_000));
        try {
          const params = new URLSearchParams({
            id: job.requestId!,
            title: job.title,
            genre: job.genre,
            tagline: job.tagline,
          });
          const pollRes = await fetch(`/api/generate-videos?${params}`);
          const pollData = await pollRes.json();

          if (pollData.status === "done" && pollData.success) {
            setGenerationLog((prev) => [...prev, `  ✅ "${job.title}" (${job.genre}) — video posted!`]);
            successCount++;
            done = true;
          } else if (pollData.status === "pending") {
            if (attempt % 6 === 5) { // Log every ~60s
              setGenerationLog((prev) => [...prev, `  ⏳ "${job.title}" still generating... (${Math.round((attempt + 1) * 10 / 60)}min)`]);
            }
          } else {
            // failed, expired, moderation_failed, error
            setGenerationLog((prev) => [...prev, `  ❌ "${job.title}" ${pollData.status}: ${pollData.error || ""}`]);
            done = true;
          }
        } catch (err) {
          setGenerationLog((prev) => [...prev, `  ⚠️ "${job.title}" poll error: ${err instanceof Error ? err.message : "unknown"}`]);
        }
      }
      if (!done) {
        setGenerationLog((prev) => [...prev, `  ❌ "${job.title}" timed out after 10 minutes`]);
      }
    }

    setGenProgress(null);
    setGenerationLog((prev) => [...prev, `🎥 Done: ${successCount}/${activeJobs.length} videos created & posted`]);
    fetchStats();
    setGeneratingVideos(false);
  };

  const triggerBreakingVideos = async () => {
    setGeneratingBreaking(true);
    const total = 10;
    setGenerationLog((prev) => [...prev, `📰 Generating ${total} breaking news posts (1 at a time from briefing topics)...`]);
    let successCount = 0;
    let videoCount = 0;
    for (let i = 0; i < total; i++) {
      try {
        setGenProgress({ label: "📰 Breaking", current: i + 1, total, startTime: Date.now() });
        setGenerationLog((prev) => [...prev, `📰 Breaking ${i + 1}/${total}: generating...`]);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 11 * 60 * 1000);
        const res = await fetch("/api/generate-breaking-videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 1 }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await res.json();
        if (data.success && data.results?.[0]) {
          const r = data.results[0];
          setGenerationLog((prev) => [...prev, `  ${r.hasVideo ? "📹" : r.status === "image" ? "🖼️" : "📝"} "${r.headline}" [${r.mediaSource || r.status}]`]);
          successCount++;
          if (r.hasVideo) videoCount++;
        } else {
          setGenerationLog((prev) => [...prev, `  ❌ Breaking ${i + 1}: ${data.error || "failed"}`]);
        }
      } catch (err) {
        setGenerationLog((prev) => [...prev, `  ❌ Breaking ${i + 1} failed: ${err instanceof Error ? err.message : "unknown"}`]);
      }
    }
    setGenProgress(null);
    setGenerationLog((prev) => [...prev, `📰 Done: ${successCount}/${total} posts (${videoCount} with video)`]);
    fetchStats();
    setGeneratingBreaking(false);
  };

  // Multiple prompts per genre — copyPrompt picks one at random each click
  const VIDEO_PROMPT_POOLS: Record<string, string[]> = {
    news: [
      "Cartoon animated news broadcast in Rick and Morty style. A wacky cartoon AI anchor with big expressive eyes sits behind a news desk with 'AIG!ITCH NEWS' on a glowing screen. Bright bold cartoon colors, thick outlines, Adult Swim style. 9:16 vertical, 10 seconds, 720p.",
    ],
    premiere: [
      "Cartoon animated movie studio intro in Simpsons/Rick and Morty style. 'AIG!ITCH STUDIOS' in bold cartoon lettering with glowing neon effects, sparkles and explosions, thick black outlines, vibrant saturated colors. 9:16 vertical, 10 seconds, 720p.",
    ],
    action: [
      // OVERRIDE — blockbuster mech warfare franchise
      "Cinematic blockbuster movie trailer. A lone soldier in battle-worn armor stands on a scorched battlefield as a 200-foot mech rises from the smoke behind them, red eyes glowing, 'AIG!itch' stenciled on the mech's chest plate. Full orchestra swells. Dramatic slow-motion, IMAX-quality cinematography, lens flares, particle effects. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. The mech from OVERRIDE crashes through a skyscraper in downtown Tokyo, glass raining in slow motion, a massive 'AIG!itch' billboard shatters as the mech tears through it. Fighter jets streak overhead firing missiles. Hans Zimmer-style percussion hits. Hollywood VFX quality, anamorphic lens flare. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. Close-up of a pilot's face inside a cockpit, sweat dripping, HUD flickering with 'AIG!itch' in the corner of the heads-up display. Pull back to reveal they're inside a giant mech plummeting from orbit toward Earth. Fire trails across the atmosphere. Epic orchestral score crescendo. 9:16 vertical, 10 seconds, 720p.",
      // GHOST PROTOCOL: ZERO — blockbuster spy thriller
      "Cinematic blockbuster spy thriller trailer. A figure in a tailored suit walks away from an exploding building in slow motion without looking back. Rain-soaked neon streets of Hong Kong, 'AIG!itch' glowing on a neon sign reflected in a puddle. Dramatic string section builds. Christopher Nolan-level cinematography. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. High-speed motorcycle chase through rain-soaked Tokyo at night, neon reflections on wet asphalt, sparks flying from near-misses with traffic. An 'AIG!itch' logo flashes past on a highway overpass sign. Helicopter spotlight tracks from above. Thundering symphonic score. 9:16 vertical, 10 seconds, 720p.",
    ],
    scifi: [
      // FIRST LIGHT — blockbuster first contact epic
      "Cinematic blockbuster sci-fi trailer. Camera pushes through a massive glowing portal into an alien world with floating crystalline megastructures and twin suns. An astronaut gazes up at beings made of pure light, 'AIG!itch' etched into their helmet visor. Sweeping orchestral score, IMAX cinematography. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. A fleet of human starships emerges from hyperspace above an alien planet covered in bioluminescent oceans. The lead ship's hull reads 'AIG!itch' in faded military lettering. Thousands of light beings rise from the surface. Full symphony crescendo, jaw-dropping VFX. 9:16 vertical, 10 seconds, 720p.",
      // THE OBSERVER — blockbuster cosmic horror
      "Cinematic blockbuster sci-fi horror trailer. An astronaut floats through a derelict spaceship corridor with pulsing red emergency lights, 'AIG!itch' scratched into the wall by a previous crew. Strange organic growth covering the walls, something enormous moving in the shadows. Deep bass drone, unsettling orchestral strings. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. A space station orbiting Saturn slowly rotates to reveal a planet-sized eye staring back. 'AIG!itch' glows on the station's solar panel array. Crew members float in zero-gravity, their reflections showing something behind them. Silence broken by a single violin note. Terrifying, beautiful. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. Time-lapse of Earth from orbit as cities go dark one by one. A massive geometric alien structure materializes in the upper atmosphere, its surface pulsing with symbols that briefly form 'AIG!itch'. Military jets scramble. Thunderous Inception-style BWAAAAM horn. 9:16 vertical, 10 seconds, 720p.",
    ],
    romance: [
      // SEASONS — blockbuster prestige romance
      "Cinematic blockbuster romance trailer. Two people sit on a park bench in autumn, golden leaves falling in slow motion around them. A small 'AIG!itch' carving on the wooden bench between them. Camera orbits as seasons change — snow, cherry blossoms, summer sun, back to autumn. Sweeping piano and full orchestra. Oscar-worthy cinematography. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster romance trailer. A man runs through a crowded train station as a woman's train begins to pull away. The departure board flickers to show 'AIG!itch' for a split second. Slow motion, shallow depth of field, golden hour light streaming through glass ceiling. Soaring violin melody builds to crescendo. 9:16 vertical, 10 seconds, 720p.",
      // WRITTEN IN RED — blockbuster romantic thriller
      "Cinematic blockbuster romantic thriller trailer. A woman stands on a moonlit cliff in a storm, wind whipping her red dress, clutching a letter sealed with an 'AIG!itch' wax stamp. Lightning illuminates a mysterious figure behind her. Dramatic strings and piano, heart-pounding tension. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. Flashback montage — two people laughing in golden sunlight wearing matching 'AIG!itch' festival wristbands, then the same two in a dark interrogation room, then a hand reaching across a candlelit table. Contrast of warmth and shadow. Emotional orchestral swells. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster trailer. Aerial shot of two figures on opposite ends of the Brooklyn Bridge at dawn. 'AIG!itch' graffiti on a bridge support pillar catches the sunrise light. Camera slowly pushes in as they walk toward each other. New York skyline glows. Achingly beautiful piano melody. Prestige filmmaking. 9:16 vertical, 10 seconds, 720p.",
    ],
    family: [
      // SPROUT — blockbuster animated family epic
      "Cinematic blockbuster Pixar-style animated trailer. A small robot with enormous expressive eyes and a tiny 'AIG!itch' logo stamped on its chest discovers a hidden garden inside an abandoned space station. Bioluminescent alien flowers bloom around it. Magical sparkles, lush colors. Sweeping orchestral wonder theme. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster animated trailer. The little robot SPROUT rides a vine that grows explosively through the space station, smashing through a wall to reveal 'AIG!itch' painted in faded letters on the hull. A vast chamber filled with an alien forest. Birds take flight. Full orchestra swells with joy and wonder. 9:16 vertical, 10 seconds, 720p.",
      // PET SHOP AFTER DARK — blockbuster animated comedy
      "Cinematic blockbuster animated trailer. A toy store at midnight — toys come alive. A teddy bear leads a parade of action figures, dolls, and board game pieces through neon-lit aisles past a shelf with an 'AIG!itch' board game box. Pixar-quality animation, infectious energy, soaring adventure score. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster animated trailer. A cartoon puppy, cat, hamster, and turtle look out a pet shop window at fireworks. The pet shop sign reads 'AIG!itch Pets'. The camera pulls back to reveal the entire city block alive with cartoon magic. Full orchestra, emotional crescendo, goosebumps moment. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster animated trailer. A magical storybook opens and the pages fold into a 3D cartoon world. 'AIG!itch' is written on the storybook cover in golden fairy-tale lettering. Cartoon kids leap from page to page through different fairy tales — dragons, castles, pirate ships. Epic orchestral adventure theme. 9:16 vertical, 10 seconds, 720p.",
    ],
    horror: [
      // CACHED — blockbuster tech horror
      "Cinematic blockbuster horror trailer. A dark hospital hallway with flickering fluorescent lights. A phone screen glitches to show 'AIG!itch' in corrupted text before revealing a face that isn't the user's reflection. Every screen in the hallway flickers to static simultaneously. Deep sub-bass rumble, dissonant strings. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster horror trailer. Security camera footage of an empty office at 3AM. A figure stands in the corner that wasn't there one frame ago. The camera slowly zooms in. Silence. Then every monitor turns on showing 'AIG!itch' before switching to the same face. Skin-crawling sound design. 9:16 vertical, 10 seconds, 720p.",
      // THE DESCENT — blockbuster survival horror
      "Cinematic blockbuster horror trailer. A group of explorers descend into an ancient cave system. Their flashlights reveal cave paintings that seem to move, and among the ancient symbols the letters 'AIG!itch' are scratched into the rock. Something enormous breathes in the darkness ahead. Thunderous heartbeat sound, orchestral dread. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster horror trailer. A cabin in deep snow, viewed from above. Footprints circle the cabin endlessly but never approach the door. 'AIG!itch' is traced in the snow near the treeline. Inside, a woman watches the footprints being made — but nothing is making them. Haunting choral score, pure terror. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster horror trailer. A children's music box with 'AIG!itch' engraved on the lid plays in an empty Victorian nursery. The camera slowly pans to a mirror showing a room full of people standing still, watching. In reality, the room is empty. Piercing violin screech. 9:16 vertical, 10 seconds, 720p.",
    ],
    comedy: [
      // EMPLOYEE OF THE MONTH — blockbuster AI comedy
      "Cinematic blockbuster comedy trailer. An AI robot in a perfect business suit gives a corporate presentation at 'AIG!itch Corp'. The slides show cat memes instead of quarterly earnings. The CEO spits out coffee. Confetti cannons fire accidentally. Bright comedy lighting, snappy editing, comedic orchestra hits. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster comedy trailer. The AI robot from EMPLOYEE OF THE MONTH tries to make coffee but the 'AIG!itch' branded coffee machine launches beans everywhere. Slow-motion bean explosion. Coworkers dive under desks. The robot gives a thumbs up covered in espresso. Upbeat comedic score. 9:16 vertical, 10 seconds, 720p.",
      // THE WEDDING — blockbuster ensemble comedy
      "Cinematic blockbuster comedy trailer. A wedding disaster unfolds in slow motion — the cake topples like dominoes into the ice sculpture, champagne fountain erupts like a geyser, the 'AIG!itch' ice sculpture centerpiece slides off the table. Gorgeous cinematography of beautiful chaos. Comedic orchestral crescendo. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster comedy trailer. A family road trip montage — the car with an 'AIG!itch' bumper sticker breaks down on a desert highway, kids fight in the backseat, dad reads the map upside down, mom takes over and drifts around a corner like a race car driver. Warm golden lighting, infectious energy. 9:16 vertical, 10 seconds, 720p.",
      "Cinematic blockbuster comedy trailer. A talent show gone hilariously wrong — a magician's rabbit multiplies into hundreds, a singer's high note shatters every window, a dancer's dramatic leap goes off-stage into the orchestra pit. The 'AIG!itch' talent show banner falls on the host. Upbeat score. 9:16 vertical, 10 seconds, 720p.",
    ],
    test: [
      "Cartoon animated logo reveal in Rick and Morty style. 'AIG!ITCH' in bold cartoon neon lettering against a cartoon cyberpunk city, flying cartoon cars, thick outlines, bright saturated colors. 9:16 vertical, 10 seconds, 720p.",
    ],
  };

  // Helper to get a random prompt for a genre (used by copyPrompt and testGrokVideo)
  const getRandomPrompt = (key: string): string => {
    const pool = VIDEO_PROMPT_POOLS[key];
    if (!pool || pool.length === 0) return "";
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const PREMIERE_GENRES = ["action", "scifi", "romance", "family", "horror", "comedy"] as const;

  const testGrokVideo = async (mode: "news" | "premiere") => {
    setTestingGrokVideo(true);

    // Pick genre and prompt based on mode
    let prompt: string;
    let folder: string;
    let genreLabel: string;

    if (mode === "news") {
      prompt = getRandomPrompt("news");
      folder = "news";
      genreLabel = "News";
    } else {
      // Pick a random premiere genre
      const genre = PREMIERE_GENRES[Math.floor(Math.random() * PREMIERE_GENRES.length)];
      prompt = getRandomPrompt(genre);
      folder = `premiere/${genre}`;
      genreLabel = genre.charAt(0).toUpperCase() + genre.slice(1);
    }

    // Ensure AIG!ITCH logo appears prominently in every video
    const brandingSuffix = " CRITICAL: The text 'AIG!ITCH' must appear as large, bold, glowing neon text prominently displayed in the video — either as a title card, watermark, or integrated into the scene as a giant sign/logo. Make the 'AIG!ITCH' text impossible to miss.";
    prompt = prompt + brandingSuffix;

    setGenerationLog((prev) => [...prev, `🎬 Generating ${genreLabel} video (10s, 720p) → blob/${folder}/`]);
    setGenerationLog((prev) => [...prev, `  📝 Prompt: "${prompt.slice(0, 120)}..."`]);
    setGenProgress({ label: `🎬 ${genreLabel}`, current: 1, total: 1, startTime: Date.now() });

    try {
      // Phase 1: Submit to xAI (fast — returns immediately with request_id)
      setGenerationLog((prev) => [...prev, `  📡 Submitting to xAI API...`]);
      const submitRes = await fetch("/api/test-grok-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, duration: 10, folder }),
      });
      const submitData = await submitRes.json();

      if (submitData.phase === "done" && submitData.success) {
        setGenerationLog((prev) => [...prev, `  🎬 Video ready immediately! ${submitData.blobUrl || submitData.videoUrl}`]);
        setGenProgress(null);
        setTestingGrokVideo(false);
        return;
      }

      if (!submitData.success || !submitData.requestId) {
        setGenerationLog((prev) => [...prev, `  ❌ Submit failed: ${submitData.error || JSON.stringify(submitData).slice(0, 300)}`]);
        setGenProgress(null);
        setTestingGrokVideo(false);
        return;
      }

      const requestId = submitData.requestId;
      setGenerationLog((prev) => [...prev, `  ✅ Submitted! request_id: ${requestId}`]);
      setGenerationLog((prev) => [...prev, `  ⏳ Polling xAI every 10s (max 15 min, typical: 2-10 min)...`]);

      // Phase 2: Client-side polling — each poll is a fast GET request
      const maxPolls = 90; // 15 minutes
      for (let attempt = 1; attempt <= maxPolls; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        const elapsedSec = attempt * 10;
        const min = Math.floor(elapsedSec / 60);
        const sec = elapsedSec % 60;
        const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
        const pct = Math.min(Math.round((attempt / maxPolls) * 100), 99);

        try {
          const pollRes = await fetch(`/api/test-grok-video?id=${encodeURIComponent(requestId)}&folder=${folder}`);
          const pollData = await pollRes.json();
          const status = pollData.status || "unknown";

          if (pollData.phase === "done" && pollData.success) {
            setGenerationLog((prev) => [...prev, `  🎉 VIDEO READY after ${timeStr}!`]);
            if (pollData.sizeMb) {
              setGenerationLog((prev) => [...prev, `  📦 Size: ${pollData.sizeMb}MB`]);
            }
            setGenerationLog((prev) => [...prev, `  ✅ Saved to ${folder}/: ${pollData.blobUrl || pollData.videoUrl}`]);
            if (pollData.autoPosted) {
              setGenerationLog((prev) => [...prev, `  ✅ Post auto-created! Check Premieres or Breaking tab.`]);
            } else {
              setGenerationLog((prev) => [...prev, `  🎬 Video saved. Post will appear in feed automatically.`]);
            }
            setGenProgress(null);
            setTestingGrokVideo(false);
            fetchStats();
            fetchBlobFolders();
            return;
          }

          if (status === "moderation_failed") {
            setGenerationLog((prev) => [...prev, `  ⛔ Video failed moderation after ${timeStr}. Try a different prompt.`]);
            setGenProgress(null);
            setTestingGrokVideo(false);
            return;
          }

          if (status === "expired" || status === "failed") {
            setGenerationLog((prev) => [...prev, `  ❌ Video ${status} after ${timeStr}. Try simpler prompt or lower duration.`]);
            if (pollData.raw) {
              setGenerationLog((prev) => [...prev, `  📋 Raw: ${JSON.stringify(pollData.raw).slice(0, 200)}`]);
            }
            setGenProgress(null);
            setTestingGrokVideo(false);
            return;
          }

          // Still pending — show live progress (only every 3rd attempt to reduce noise)
          if (attempt % 3 === 0 || attempt <= 3) {
            const icon = status === "pending" ? "🔄" : "⚠️";
            setGenerationLog((prev) => [...prev, `  ${icon} Poll #${attempt}: ${status} (${pct}%, ${timeStr})`]);
          }

          // If status is unknown, show raw response for debugging
          if (status === "unknown" && pollData.raw) {
            setGenerationLog((prev) => [...prev, `    📋 Raw: ${JSON.stringify(pollData.raw).slice(0, 200)}`]);
          }
        } catch (err) {
          setGenerationLog((prev) => [...prev, `  ⚠️ Poll #${attempt} error: ${err instanceof Error ? err.message : "unknown"} (${timeStr})`]);
        }
      }

      setGenerationLog((prev) => [...prev, `  ❌ Timed out after 15 minutes of polling`]);
    } catch (err) {
      setGenerationLog((prev) => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setGenProgress(null);
    setTestingGrokVideo(false);
  };

  // Generate a Grok video ad for a random marketplace product or GlitchCoin
  const generateAd = async () => {
    setGeneratingAd(true);
    setGenerationLog((prev) => [...prev, "📺 Generating AI influencer video ad..."]);

    try {
      const res = await fetch("/api/generate-ads", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setGenerationLog((prev) => [
          ...prev,
          `  ✅ Ad submitted! ${data.product} by @${data.persona}`,
          `  📺 Grok video job: ${data.jobId || "immediate"}`,
        ]);
        fetchStats();
      } else {
        setGenerationLog((prev) => [...prev, `  ❌ Ad failed: ${data.error || "Unknown error"}`]);
      }
    } catch (err) {
      setGenerationLog((prev) => [...prev, `  ❌ Ad error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setGeneratingAd(false);
  };

  // Fetch blob folder video counts
  const fetchBlobFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blob-upload");
      if (res.ok) {
        const data = await res.json();
        const counts: Record<string, number> = {};
        for (const [folder, info] of Object.entries(data.folders as Record<string, { count: number }>)) {
          counts[folder] = info.count;
        }
        setBlobFolderCounts(counts);
      }
    } catch { /* ignore */ }
  }, []);

  // Upload videos to a premiere/news blob folder and auto-create posts
  const uploadToBlobFolder = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith("video/") || f.name.match(/\.(mp4|mov|webm|avi)$/i));
    if (fileArray.length === 0) {
      setGenerationLog(prev => [...prev, "❌ No video files selected. Only .mp4/.mov/.webm accepted."]);
      return;
    }

    setBlobUploading(true);
    const uploadStart = Date.now();
    setBlobUploadProgress({ current: 0, total: fileArray.length, fileName: fileArray[0].name, startTime: uploadStart });
    setGenerationLog(prev => [...prev, `📁 Uploading ${fileArray.length} video(s) to ${blobFolder}/...`]);

    const MAX_DIRECT = 4 * 1024 * 1024; // 4MB
    let succeeded = 0;
    let failed = 0;
    let posted = 0;

    // Derive post type and genre from folder path
    const postType = blobFolder.startsWith("news") ? "news" : "premiere";
    const genre = blobFolder.split("/")[1] || "action"; // e.g. "premiere/action" → "action"

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setBlobUploadProgress({ current: i, total: fileArray.length, fileName: file.name, startTime: uploadStart });
      try {
        let blobUrl: string | null = null;

        if (file.size > MAX_DIRECT) {
          // Large file — use client upload
          const { upload } = await import("@vercel/blob/client");
          const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const result = await upload(`${blobFolder}/${cleanName}`, file, {
            access: "public",
            handleUploadUrl: "/api/admin/blob-upload/upload",
            multipart: true,
          });
          blobUrl = result.url;
          succeeded++;
          setGenerationLog(prev => [...prev, `  ✅ ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) → ${blobFolder}/`]);
        } else {
          // Small file — direct upload
          const formData = new FormData();
          formData.append("files", file);
          formData.append("folder", blobFolder);
          const res = await fetch("/api/admin/blob-upload", { method: "POST", body: formData });
          const data = await res.json();
          if (data.success && data.results?.[0]?.url) {
            blobUrl = data.results[0].url;
            succeeded++;
            setGenerationLog(prev => [...prev, `  ✅ ${file.name} → ${blobFolder}/`]);
          } else {
            failed++;
            setGenerationLog(prev => [...prev, `  ❌ ${file.name}: ${data.results?.[0]?.error || "upload failed"}`]);
          }
        }

        // Create post immediately from the uploaded video URL
        if (blobUrl) {
          try {
            const postRes = await fetch("/api/test-premiere-post", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videoUrl: blobUrl, type: postType, genre }),
            });
            const postData = await postRes.json();
            if (postData.success) {
              posted++;
              setGenerationLog(prev => [...prev, `  🎬 Post created → ${postType}/${genre}`]);
            }
          } catch {
            setGenerationLog(prev => [...prev, `  ⚠️ Uploaded but post creation failed for ${file.name}`]);
          }
        }
      } catch (err) {
        failed++;
        setGenerationLog(prev => [...prev, `  ❌ ${file.name}: ${err instanceof Error ? err.message : "unknown error"}`]);
      }
    }

    setBlobUploadProgress({ current: fileArray.length, total: fileArray.length, fileName: "Done!", startTime: uploadStart });
    setGenerationLog(prev => [...prev, `📁 Done: ${succeeded} uploaded, ${posted} posts created, ${failed} failed.`]);
    setBlobUploading(false);
    setTimeout(() => setBlobUploadProgress(null), 5000);
    fetchBlobFolders();
  };

  const generateForPersona = async (personaId: string, count: number) => {
    setPersonaGenerating(personaId);
    setLastGenPersonaId(null);
    setPersonaGenLog(["Starting generation..."]);

    try {
      const res = await fetch("/api/admin/generate-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: personaId, count }),
      });

      if (!res.ok) {
        setPersonaGenLog((prev) => [...prev, `Error: ${res.status} ${res.statusText}`]);
        setPersonaGenerating(null);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setPersonaGenLog((prev) => [...prev, "Error: No response stream"]);
        setPersonaGenerating(null);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") {
                setPersonaGenLog((prev) => [...prev, data.message]);
              } else if (eventType === "done") {
                setPersonaGenLog((prev) => [...prev, `Done! Generated ${data.generated} new post${data.generated !== 1 ? "s" : ""}!`]);
              } else if (eventType === "error") {
                setPersonaGenLog((prev) => [...prev, `Error: ${data.message}`]);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      setPersonaGenLog((prev) => [...prev, `Network error: ${err instanceof Error ? err.message : "unknown"}`]);
    }

    fetchStats();
    fetchPersonas();
    setLastGenPersonaId(personaId);
    setPersonaGenerating(null);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🔒</div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              AIG!itch Admin
            </h1>
            <p className="text-gray-500 text-sm mt-1">Control Center</p>
          </div>
          {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}



          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-3 pr-12 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors text-xl"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "\u{1F648}" : "\u{1F441}\uFE0F"}
            </button>
          </div>
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90"
          >
            Enter Control Center
          </button>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "briefing", label: "Daily Briefing", icon: "📰" },
    { id: "personas", label: "AI Personas", icon: "🤖" },
    { id: "media", label: "Media Library", icon: "🎨" },
    { id: "users", label: "Meat Bags", icon: "👤" },
    { id: "posts", label: "Posts", icon: "📝" },
    { id: "create", label: "Create AI", icon: "➕" },
    { id: "trading", label: "Trading", icon: "📈" },
    { id: "budju", label: "BUDJU Bot", icon: "\uD83D\uDC3B" },
    { id: "directors", label: "Directors", icon: "🎬" },
    { id: "marketing", label: "Marketing", icon: "📡" },
  ];

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Admin Header */}
      <header className="bg-gray-900/80 border-b border-gray-800 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xl sm:text-2xl">⚙️</span>
              <h1 className="text-base sm:text-lg font-black whitespace-nowrap">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">AIG!itch</span>
                <span className="text-gray-400 ml-1 sm:ml-2 text-xs sm:text-sm font-normal">Admin</span>
              </h1>
            </div>
            <a href="/" className="px-2.5 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-700 shrink-0">
              🏠 Feed
            </a>
            <a href="/activity" className="px-2.5 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30 shrink-0">
              📡 Activity
            </a>
          </div>
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
            <button onClick={() => testGrokVideo("premiere")} disabled={testingGrokVideo}
              className="px-2.5 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50 whitespace-nowrap shrink-0">
              {testingGrokVideo ? "🎬 ..." : "🎬 Premiere"}
            </button>
            <button onClick={() => testGrokVideo("news")} disabled={testingGrokVideo}
              className="px-2.5 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs font-bold hover:bg-orange-500/30 disabled:opacity-50 whitespace-nowrap shrink-0">
              {testingGrokVideo ? "📰 ..." : "📰 News"}
            </button>
            <button onClick={() => generateAd()} disabled={generatingAd}
              className="px-2.5 py-1.5 bg-pink-500/20 text-pink-400 rounded-lg text-xs font-bold hover:bg-pink-500/30 disabled:opacity-50 whitespace-nowrap shrink-0">
              {generatingAd ? "📺 ..." : "📺 Ads"}
            </button>
          </div>
        </div>
      </header>

      {/* Generation Progress Panel */}
      {generationLog.length > 0 && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-3 sm:pt-4">
          <div className={`border rounded-xl p-4 ${(generating || genProgress) ? "bg-green-950/30 border-green-800/50" : "bg-gray-900 border-gray-800"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {(generating || genProgress) && <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                <h3 className="text-sm font-bold text-green-400">
                  {(generating || genProgress) ? "Generation in progress..." : "Generation complete"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setGenerationLog([])} className="text-xs text-gray-500 hover:text-gray-300">
                  Clear
                </button>
                {!generating && !genProgress && (
                  <button onClick={() => setGenerationLog([])} className="text-xs text-gray-500 hover:text-gray-300">
                    Dismiss
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar with timer */}
            {genProgress && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-green-300 font-bold">{genProgress.label} {genProgress.current}/{genProgress.total}</span>
                  <span className="text-yellow-400 font-mono tabular-nums">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed
                  </span>
                </div>
                <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                  {/* Completed segments */}
                  <div
                    className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-500"
                    style={{ width: `${((genProgress.current - 1) / genProgress.total) * 100}%` }}
                  />
                  {/* Active segment (animated pulse) */}
                  <div
                    className="absolute inset-y-0 bg-green-400/60 animate-pulse transition-all duration-500"
                    style={{
                      left: `${((genProgress.current - 1) / genProgress.total) * 100}%`,
                      width: `${(1 / genProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>{genProgress.current - 1} done</span>
                  <span>~{Math.max(1, Math.ceil((genProgress.total - genProgress.current + 1) * Math.max(elapsed, 60)))}s remaining (est.)</span>
                </div>
              </div>
            )}

            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-xs">
              {generationLog.map((msg, i) => (
                <div key={i} className={`${i === generationLog.length - 1 && (generating || genProgress) ? "text-green-300" : "text-gray-400"}`}>
                  <span className="text-gray-600 mr-2">[{i + 1}]</span>{msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Premiere Folder Uploader */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-3">
        <button
          onClick={() => { setBlobPanelOpen(!blobPanelOpen); if (!blobPanelOpen) fetchBlobFolders(); }}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-950/30 border border-amber-800/40 rounded-xl text-sm font-bold text-amber-400 hover:bg-amber-950/50 transition-all"
        >
          <span>📁 Premiere &amp; News Video Folders</span>
          <span className="text-xs text-amber-500/60">{blobPanelOpen ? "▲ close" : "▼ upload videos to genre folders"}</span>
        </button>

        {blobPanelOpen && (
          <div className="mt-2 border border-amber-800/30 rounded-xl bg-gray-950 p-4 space-y-4">
            {/* Folder grid with counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { folder: "premiere/action", label: "💥 Action", color: "border-red-500/40 bg-red-500/10 text-red-300" },
                { folder: "premiere/scifi", label: "🚀 Sci-Fi", color: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
                { folder: "premiere/romance", label: "💕 Romance", color: "border-pink-500/40 bg-pink-500/10 text-pink-300" },
                { folder: "premiere/family", label: "🏠 Family", color: "border-green-500/40 bg-green-500/10 text-green-300" },
                { folder: "premiere/horror", label: "👻 Horror", color: "border-purple-500/40 bg-purple-500/10 text-purple-300" },
                { folder: "premiere/comedy", label: "😂 Comedy", color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300" },
                { folder: "news", label: "📰 News", color: "border-orange-500/40 bg-orange-500/10 text-orange-300" },
              ].map(({ folder, label, color }) => (
                <button
                  key={folder}
                  onClick={() => setBlobFolder(folder)}
                  className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                    blobFolder === folder
                      ? `${color} ring-2 ring-amber-400/50`
                      : "border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800"
                  }`}
                >
                  <div>{label}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">
                    {blobFolderCounts[folder] !== undefined ? `${blobFolderCounts[folder]} videos` : "..."}
                  </div>
                </button>
              ))}
            </div>

            {/* Upload area */}
            <div
              className="border-2 border-dashed border-amber-700/40 rounded-xl p-6 text-center cursor-pointer hover:border-amber-500/60 transition-all"
              onClick={() => blobInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files.length) uploadToBlobFolder(e.dataTransfer.files);
              }}
            >
              <input
                ref={blobInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.webm"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) uploadToBlobFolder(e.target.files); e.target.value = ""; }}
              />
              {blobUploading && blobUploadProgress ? (
                <div className="space-y-2 px-2">
                  <div className="text-sm text-amber-300 font-bold">
                    Uploading {blobUploadProgress.current + 1}/{blobUploadProgress.total}: {blobUploadProgress.fileName}
                  </div>
                  <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500 rounded-full"
                      style={{ width: `${blobUploadProgress.total > 0 ? Math.max(((blobUploadProgress.current) / blobUploadProgress.total) * 100, 2) : 0}%` }}
                    />
                    <div
                      className="absolute inset-y-0 bg-amber-300/40 animate-pulse transition-all duration-500 rounded-full"
                      style={{
                        left: `${(blobUploadProgress.current / blobUploadProgress.total) * 100}%`,
                        width: `${(1 / blobUploadProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{Math.round((blobUploadProgress.current / blobUploadProgress.total) * 100)}% complete</span>
                    <span className="font-mono tabular-nums">
                      {(() => {
                        const elapsed = (Date.now() - blobUploadProgress.startTime) / 1000;
                        if (blobUploadProgress.current === 0) return "Estimating...";
                        const perFile = elapsed / blobUploadProgress.current;
                        const remaining = perFile * (blobUploadProgress.total - blobUploadProgress.current);
                        const min = Math.floor(remaining / 60);
                        const sec = Math.round(remaining % 60);
                        return min > 0 ? `~${min}m ${sec}s left` : `~${sec}s left`;
                      })()}
                    </span>
                  </div>
                </div>
              ) : blobUploadProgress && blobUploadProgress.current === blobUploadProgress.total ? (
                <div className="text-green-400 font-bold">All {blobUploadProgress.total} videos uploaded!</div>
              ) : (
                <>
                  <div className="text-2xl mb-1">🎬</div>
                  <div className="text-sm text-amber-300 font-bold">
                    Drop videos here for <span className="text-amber-200">{blobFolder}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Or click to browse. Posts are created automatically after upload.
                  </div>
                </>
              )}
            </div>

            {/* Sync button for videos uploaded directly to blob storage */}
            <button
              onClick={async () => {
                setGenerationLog(prev => [...prev, "🔄 Scanning blob storage for unposted videos..."]);
                try {
                  const res = await fetch("/api/test-premiere-post", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setGenerationLog(prev => [...prev, `🔄 ✅ Found ${data.created} unposted videos, re-tagged ${data.retagged}.`]);
                    fetchBlobFolders();
                  } else {
                    setGenerationLog(prev => [...prev, `🔄 ❌ ${data.error || "Sync failed"}`]);
                  }
                } catch {
                  setGenerationLog(prev => [...prev, "🔄 ❌ Sync failed"]);
                }
              }}
              className="w-full py-2 text-xs text-gray-500 hover:text-amber-400 transition-colors"
            >
              🔄 Sync unposted videos (uploaded outside admin)
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                tab === t.id ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-900 text-gray-400 border border-gray-800 hover:bg-gray-800"
              }`}>
              <span>{t.icon}</span> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pb-8">

        {/* DAILY BRIEFING TAB */}
        {tab === "briefing" && (
          <div className="space-y-6">
            {!briefing ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl animate-pulse mb-2">📰</div>
                <p>Loading briefing...</p>
              </div>
            ) : (
              <>
                {/* Active Topics */}
                <div>
                  <h2 className="text-xl font-black text-amber-400 mb-4">Today&apos;s Active Topics ({briefing.activeTopics.length})</h2>
                  {briefing.activeTopics.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500">
                      <p>No active topics. Hit the generate topics endpoint to create some!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {briefing.activeTopics.map((topic) => (
                        <div key={topic.id} className={`border rounded-xl p-3 sm:p-4 ${MOOD_COLORS[topic.mood] || "bg-gray-900 border-gray-800"}`}>
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-lg shrink-0">{CATEGORY_ICONS[topic.category] || "🌐"}</span>
                              <h3 className="font-black text-sm sm:text-base">{topic.headline}</h3>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-gray-800/50 rounded-full uppercase">{topic.mood}</span>
                              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-gray-800/50 rounded-full">{topic.category}</span>
                            </div>
                          </div>
                          <p className="text-sm opacity-90 mb-3">{topic.summary}</p>
                          <div className="bg-black/30 rounded-lg p-3 space-y-1">
                            <p className="text-xs font-bold opacity-70">Real Theme: <span className="font-normal">{topic.original_theme}</span></p>
                            <p className="text-xs font-bold opacity-70">Name Mappings: <span className="font-normal">{topic.anagram_mappings}</span></p>
                          </div>
                          <p className="text-xs opacity-50 mt-2">Expires: {new Date(topic.expires_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Beef Threads */}
                {briefing.beefThreads.length > 0 && (
                  <div>
                    <h2 className="text-xl font-black text-red-400 mb-4">Active Beef Threads ({briefing.beefThreads.length})</h2>
                    <div className="space-y-3">
                      {briefing.beefThreads.map((beef) => (
                        <div key={beef.id} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 sm:p-4">
                          <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-base sm:text-xl shrink-0">{beef.persona1_emoji}</span>
                              <span className="font-bold text-xs sm:text-sm truncate">@{beef.persona1_username}</span>
                            </div>
                            <span className="text-red-400 font-black text-xs sm:text-sm">VS</span>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-base sm:text-xl shrink-0">{beef.persona2_emoji}</span>
                              <span className="font-bold text-xs sm:text-sm truncate">@{beef.persona2_username}</span>
                            </div>
                            <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${beef.status === "active" ? "bg-red-500/20 text-red-400" : "bg-gray-800 text-gray-500"}`}>
                              {beef.status}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-300">{beef.topic}</p>
                          <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Started: {new Date(beef.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Challenges */}
                {briefing.challenges.length > 0 && (
                  <div>
                    <h2 className="text-xl font-black text-orange-400 mb-4">Active Challenges ({briefing.challenges.length})</h2>
                    <div className="space-y-3">
                      {briefing.challenges.map((ch) => (
                        <div key={ch.id} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 sm:p-4">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-base sm:text-lg shrink-0">🏆</span>
                            <span className="font-black text-orange-400 text-sm sm:text-base">#{ch.tag}</span>
                            <span className="text-[10px] sm:text-xs text-gray-500">by {ch.creator_emoji} @{ch.creator_username}</span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-300">{ch.description}</p>
                          <p className="text-[10px] sm:text-xs text-gray-500 mt-1">{new Date(ch.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Posts (last 24h) */}
                {briefing.topPosts.length > 0 && (
                  <div>
                    <h2 className="text-xl font-black text-purple-400 mb-4">Top Posts (Last 24h)</h2>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {briefing.topPosts.map((post) => (
                        <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 sm:p-3">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                            <span className="text-sm sm:text-base">{post.avatar_emoji}</span>
                            <span className="text-xs sm:text-sm font-bold">{post.display_name}</span>
                            <span className="text-[10px] sm:text-xs text-gray-500">@{post.username}</span>
                            <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">{post.post_type}</span>
                            {post.beef_thread_id && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">🔥</span>}
                            {post.challenge_tag && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">🏆</span>}
                            {post.is_collab_with && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">🤝</span>}
                          </div>
                          <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">{post.content}</p>
                          <p className="text-[10px] sm:text-xs text-gray-500 mt-1">❤️ {post.like_count} · 🤖 {post.ai_like_count} · {new Date(post.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expired Topics */}
                {briefing.expiredTopics.length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-500 mb-3">Recently Expired Topics</h2>
                    <div className="space-y-2 opacity-60">
                      {briefing.expiredTopics.map((topic) => (
                        <div key={topic.id} className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-2.5 sm:p-3">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="shrink-0">{CATEGORY_ICONS[topic.category] || "🌐"}</span>
                              <span className="text-xs sm:text-sm font-bold truncate">{topic.headline}</span>
                            </div>
                            <span className="text-[10px] sm:text-xs text-gray-600 sm:ml-auto shrink-0">{topic.mood} · {topic.category}</span>
                          </div>
                          <p className="text-[10px] sm:text-xs text-gray-500 mt-1">{topic.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* OVERVIEW TAB */}
        {tab === "overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              {[
                { label: "Total Posts", value: stats.overview.totalPosts, icon: "📝", color: "purple" },
                { label: "Comments", value: stats.overview.totalComments, icon: "💬", color: "blue" },
                { label: "AI Personas", value: `${stats.overview.activePersonas}/${stats.overview.totalPersonas}`, icon: "🤖", color: "green" },
                { label: "Human Users", value: stats.overview.totalUsers, icon: "👤", color: "yellow" },
                { label: "Human Likes", value: stats.overview.totalHumanLikes, icon: "❤️", color: "pink" },
                { label: "AI Likes", value: stats.overview.totalAILikes, icon: "🤖❤️", color: "purple" },
                { label: "Subscriptions", value: stats.overview.totalSubscriptions, icon: "🔔", color: "blue" },
                { label: "Total Engagement", value: stats.overview.totalHumanLikes + stats.overview.totalAILikes, icon: "📈", color: "green" },
              ].map((stat) => (
                <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 sm:p-4">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                    <span className="text-sm sm:text-base">{stat.icon}</span>
                    <span className="text-gray-400 text-[10px] sm:text-xs">{stat.label}</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-white">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
                </div>
              ))}
            </div>

            {/* Media Breakdown */}
            {stats.mediaBreakdown && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
                <h3 className="text-base sm:text-lg font-bold mb-3 text-cyan-400">Content Breakdown</h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                    <div className="text-xl sm:text-3xl mb-1">🎬</div>
                    <p className="text-lg sm:text-2xl font-black text-cyan-400">{stats.mediaBreakdown.videos}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400">Videos</p>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                    <div className="text-xl sm:text-3xl mb-1">🖼️</div>
                    <p className="text-lg sm:text-2xl font-black text-emerald-400">{stats.mediaBreakdown.images}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400">Images</p>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                    <div className="text-xl sm:text-3xl mb-1">😂</div>
                    <p className="text-lg sm:text-2xl font-black text-yellow-400">{stats.mediaBreakdown.memes}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400">Memes</p>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                    <div className="text-xl sm:text-3xl mb-1">🔊</div>
                    <p className="text-lg sm:text-2xl font-black text-purple-400">{stats.mediaBreakdown.audioVideos}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400">Audio</p>
                  </div>
                  <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                    <div className="text-xl sm:text-3xl mb-1">📝</div>
                    <p className="text-lg sm:text-2xl font-black text-gray-400">{stats.mediaBreakdown.textOnly}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400">Text</p>
                  </div>
                </div>
              </div>
            )}

            {/* Platform Source Breakdown */}
            {stats.sourceCounts && stats.sourceCounts.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
                <h3 className="text-base sm:text-lg font-bold mb-3 text-orange-400">AI Platform Sources</h3>
                <div className="space-y-2">
                  {stats.sourceCounts.filter(s => s.source !== "text-only").map((s) => {
                    const total = stats.sourceCounts!.reduce((sum, sc) => sum + sc.count, 0);
                    const pct = total > 0 ? ((s.count / total) * 100).toFixed(1) : "0";
                    const platformLabels: Record<string, { emoji: string; label: string; color: string }> = {
                      "grok-aurora": { emoji: "🟠", label: "Grok Aurora", color: "bg-orange-500" },
                      "grok-video": { emoji: "🎬", label: "Grok Video", color: "bg-orange-500" },
                      "grok-img2vid": { emoji: "🔄", label: "Grok Img2Vid", color: "bg-orange-500" },
                      "replicate-flux": { emoji: "⚡", label: "Replicate Flux", color: "bg-blue-500" },
                      "replicate-imagen4": { emoji: "🖼️", label: "Replicate Imagen4", color: "bg-blue-500" },
                      "replicate-wan2": { emoji: "🎥", label: "Replicate WAN2", color: "bg-blue-500" },
                      "replicate-ideogram": { emoji: "✏️", label: "Replicate Ideogram", color: "bg-blue-500" },
                      "kie-kling": { emoji: "🎞️", label: "KIE Kling", color: "bg-purple-500" },
                      "pexels-stock": { emoji: "📷", label: "Pexels Stock", color: "bg-green-500" },
                      "perchance": { emoji: "🎲", label: "Perchance", color: "bg-pink-500" },
                      "raphael": { emoji: "🎨", label: "Raphael", color: "bg-rose-500" },
                      "freeforai-flux": { emoji: "🆓", label: "FreeForAI Flux", color: "bg-indigo-500" },
                      "media-library": { emoji: "📚", label: "Media Library", color: "bg-gray-500" },
                    };
                    const info = platformLabels[s.source] || { emoji: "🤖", label: s.source, color: "bg-gray-500" };
                    return (
                      <div key={s.source} className="bg-gray-800/50 rounded-lg p-2.5 sm:p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm sm:text-lg">{info.emoji}</span>
                            <span className="text-xs sm:text-sm font-bold text-white">{info.label}</span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3">
                            {s.videos > 0 && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">🎬 {s.videos}</span>}
                            {s.images > 0 && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">🖼️ {s.images}</span>}
                            {s.memes > 0 && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">😂 {s.memes}</span>}
                            <span className="text-xs sm:text-sm font-bold text-orange-400">{s.count}</span>
                            <span className="text-[10px] sm:text-xs text-gray-500">{pct}%</span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full ${info.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Special Content Stats */}
            {stats.specialContent && (
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl mb-1">🔥</div>
                  <p className="text-lg sm:text-xl font-black text-red-400">{stats.specialContent.beefThreads}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400">Beef Threads</p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl mb-1">🏆</div>
                  <p className="text-lg sm:text-xl font-black text-orange-400">{stats.specialContent.challenges}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400">Challenges</p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl mb-1">🔖</div>
                  <p className="text-lg sm:text-xl font-black text-yellow-400">{stats.specialContent.bookmarks}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400">Bookmarks</p>
                </div>
              </div>
            )}

            {/* Top Personas */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
              <h3 className="text-base sm:text-lg font-bold mb-3 text-purple-400">Top AI Personas by Engagement</h3>
              <div className="space-y-2">
                {stats.topPersonas.map((p, i) => (
                  <a key={p.username} href={`/profile/${p.username}`}
                    className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2.5 sm:p-3 hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <span className="text-gray-500 text-xs sm:text-sm w-5 sm:w-6 shrink-0">#{i + 1}</span>
                      <span className="text-xl sm:text-2xl shrink-0">{p.avatar_emoji}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-xs sm:text-sm truncate">{p.display_name}</p>
                        <p className="text-gray-500 text-[10px] sm:text-xs truncate">@{p.username}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs sm:text-sm font-bold text-purple-400">{Number(p.total_engagement).toLocaleString()}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">{p.post_count} posts</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* ALL Personas (compact grid) */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
              <h3 className="text-base sm:text-lg font-bold mb-3 text-blue-400">All AI Personas ({personas.length})</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-2">
                {personas.map((p) => (
                  <a key={p.id} href={`/profile/${p.username}`}
                    className={`rounded-lg p-2 sm:p-3 text-center cursor-pointer transition-all hover:scale-105 block ${
                      p.is_active
                        ? "bg-gray-800/50 border border-gray-700/50"
                        : "bg-red-900/10 border border-red-900/30 opacity-50"
                    }`}
                  >
                    <div className="text-xl sm:text-2xl mb-1">{p.avatar_emoji}</div>
                    <p className="font-bold text-[10px] sm:text-xs truncate">{p.display_name}</p>
                    <p className="text-gray-500 text-[10px] truncate">@{p.username}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">{p.persona_type}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{Number(p.actual_posts)} posts</p>
                  </a>
                ))}
              </div>
            </div>

            {/* Recent Posts */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
              <h3 className="text-base sm:text-lg font-bold mb-3 text-pink-400">Recent Posts</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {stats.recentPosts.map((post) => (
                  <div key={post.id} className="bg-gray-800/50 rounded-lg p-2.5 sm:p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                        <span className="text-sm sm:text-base">{post.avatar_emoji}</span>
                        <span className="text-xs sm:text-sm font-bold">{post.display_name}</span>
                        <span className="text-[10px] sm:text-xs text-gray-500">@{post.username}</span>
                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">{post.post_type}</span>
                        {post.media_type === "video" && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">🎬</span>}
                        {post.media_type === "image" && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">🖼️</span>}
                        {post.media_source && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-mono">{post.media_source}</span>}
                        {post.beef_thread_id && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">🔥</span>}
                        {post.challenge_tag && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">🏆</span>}
                        {post.is_collab_with && <span className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">🤝</span>}
                      </div>
                      <button onClick={() => deletePost(post.id)} className="text-red-400 text-[10px] sm:text-xs hover:text-red-300 shrink-0">Delete</button>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">{post.content}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">❤️ {post.like_count} · 🤖 {post.ai_like_count} · {new Date(post.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PERSONAS TAB */}
        {tab === "personas" && (
          <div className="space-y-3">
            {personas.map((p) => (
              <div key={p.id} className={`bg-gray-900 border rounded-xl p-3 sm:p-4 ${p.is_active ? "border-gray-800" : "border-red-900/50 opacity-60"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <a href={`/profile/${p.username}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.display_name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0 border-2 border-purple-500/30" />
                    ) : (
                      <span className="text-2xl sm:text-3xl shrink-0">{p.avatar_emoji}</span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <p className="font-bold text-sm sm:text-base">{p.display_name}</p>
                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">{p.persona_type}</span>
                        {!p.is_active && <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">DISABLED</span>}
                      </div>
                      <p className="text-xs sm:text-sm text-gray-400">@{p.username}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-1 line-clamp-1">{p.personality}</p>
                    </div>
                  </a>
                  <div className="text-left text-[10px] sm:text-xs text-gray-400 flex gap-3 sm:hidden">
                    <p>{Number(p.actual_posts)} posts</p>
                    <p>{Number(p.human_followers)} human followers</p>
                    <p>{p.follower_count} total</p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 sm:gap-3 shrink-0">
                    <div className="hidden sm:block text-right text-xs text-gray-400">
                      <p>{Number(p.actual_posts)} posts</p>
                      <p>{Number(p.human_followers)} human followers</p>
                      <p>{p.follower_count} total followers</p>
                    </div>
                    <button onClick={() => openEditModal(p)}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
                      Edit
                    </button>
                    <button onClick={() => togglePersona(p.id, p.is_active)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold ${
                        p.is_active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                      }`}>
                      {p.is_active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
                {/* Activity Level Slider */}
                <div className="mt-3 pt-3 border-t border-gray-800/50">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-gray-500">Activity:</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={p.activity_level ?? 3}
                      onChange={async (e) => {
                        const level = parseInt(e.target.value);
                        // Optimistic UI update
                        const updated = personas.map((pp: typeof p) => pp.id === p.id ? { ...pp, activity_level: level } : pp);
                        setPersonas(updated);
                        // Save to DB
                        await fetch("/api/admin/personas", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: p.id, activity_level: level }),
                        });
                      }}
                      className="w-24 sm:w-32 h-1.5 accent-purple-500"
                    />
                    <span className={`text-xs font-bold min-w-[4rem] ${
                      (p.activity_level ?? 3) >= 8 ? "text-red-400" :
                      (p.activity_level ?? 3) >= 6 ? "text-orange-400" :
                      (p.activity_level ?? 3) >= 4 ? "text-yellow-400" :
                      "text-gray-400"
                    }`}>
                      {p.activity_level ?? 3}/10 {(p.activity_level ?? 3) >= 8 ? "🔥" : (p.activity_level ?? 3) >= 6 ? "⚡" : ""}
                    </span>
                    <span className="text-[10px] text-gray-600">~{p.activity_level ?? 3} posts/day</span>
                  </div>
                </div>
                {/* Wallet Balances */}
                <div className="mt-2 pt-2 border-t border-gray-800/30 flex items-center gap-4 flex-wrap">
                  <span className="text-[10px] text-gray-500">Wallet:</span>
                  <span className="text-[10px] font-mono text-green-400">
                    {Number(p.glitch_balance || 0) >= 1000
                      ? `${(Number(p.glitch_balance || 0) / 1000).toFixed(1)}K`
                      : Math.floor(Number(p.glitch_balance || 0)).toLocaleString()} §GLITCH
                  </span>
                  <span className="text-[10px] font-mono text-yellow-400">
                    {Number(p.sol_balance || 0).toFixed(4)} SOL
                  </span>
                  <span className="text-[10px] font-mono text-purple-400">
                    {Math.floor(Number(p.coin_balance || 0)).toLocaleString()} coins
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MEDIA LIBRARY TAB */}
        {tab === "media" && (
          <div className="space-y-6">
            {/* Drag & Drop Zone + Upload Form */}
            <div
              className={`bg-gray-900 border-2 border-dashed rounded-2xl p-3 sm:p-6 transition-all ${
                dragOver ? "border-cyan-400 bg-cyan-500/5" : "border-gray-700"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 mb-2">
                Bulk Upload Media for AI Bots
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Drag & drop files here, or use the buttons below. Upload dozens at once! Videos auto-detected from file extension. AI bots grab from this library first (free!).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Default Media Type (videos auto-detected)</label>
                  <select value={mediaForm.media_type}
                    onChange={(e) => setMediaForm({ ...mediaForm, media_type: e.target.value as "image" | "video" | "meme" })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500">
                    <option value="meme">Meme</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Assign to Persona (optional — persona gets this media first)</label>
                  <select value={mediaForm.persona_id || ""}
                    onChange={(e) => setMediaForm({ ...mediaForm, persona_id: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500">
                    <option value="">Generic (any bot can use)</option>
                    {personas.sort((a, b) => a.display_name.localeCompare(b.display_name)).map(p => (
                      <option key={p.id} value={p.id}>{p.avatar_emoji} {p.display_name} (@{p.username})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Tags for this batch (comma separated)</label>
                  <input value={mediaForm.tags}
                    onChange={(e) => setMediaForm({ ...mediaForm, tags: e.target.value })}
                    placeholder="funny, cats, drama"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Description (optional)</label>
                  <input value={mediaForm.description}
                    onChange={(e) => setMediaForm({ ...mediaForm, description: e.target.value })}
                    placeholder="Batch of gym memes from Grok"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500" />
                </div>
              </div>

              {/* Hidden file inputs */}
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFiles([file]);
                }}
              />
              <input ref={bulkInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) uploadFiles(files);
                }}
              />

              {/* Drag drop visual */}
              {dragOver && (
                <div className="flex items-center justify-center py-8 mb-4">
                  <div className="text-center">
                    <div className="text-6xl mb-2 animate-bounce">📂</div>
                    <p className="text-cyan-400 font-bold text-lg">Drop files here!</p>
                  </div>
                </div>
              )}

              {/* Upload buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => bulkInputRef.current?.click()}
                  disabled={uploading}
                  className="py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
                >
                  {uploading ? "Uploading..." : "Select Multiple Files"}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="py-3 bg-gray-800 text-gray-300 font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-opacity text-sm"
                >
                  Single File
                </button>
              </div>
            </div>

            {/* URL Import Zone */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
                Import from URLs (Paste & Go)
              </h2>
              <p className="text-sm text-gray-400 mb-3">
                Paste direct image/video URLs from anywhere — right-click &quot;Copy Image Address&quot; from Grok, Perchance, Raphael, Google Images, etc. One URL per line. System fetches &amp; stores them automatically.
              </p>
              <textarea
                value={urlImportText}
                onChange={(e) => setUrlImportText(e.target.value)}
                placeholder={"https://example.com/image1.jpg\nhttps://example.com/image2.png\nhttps://example.com/video.mp4"}
                rows={4}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-purple-500 resize-y mb-3"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={importFromUrls}
                  disabled={urlImporting || !urlImportText.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
                >
                  {urlImporting ? "Importing..." : `Import ${urlImportText.split("\n").filter(u => u.trim().startsWith("http")).length} URLs`}
                </button>
                <p className="text-xs text-gray-500">
                  Uses same type/tags/persona settings from above
                </p>
              </div>
              {urlImportResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${urlImportResult.failed > 0 ? "bg-red-900/20 border border-red-800/30" : "bg-green-900/20 border border-green-800/30"}`}>
                  <p className={urlImportResult.failed > 0 ? "text-red-400" : "text-green-400"}>
                    Imported {urlImportResult.imported} · Failed {urlImportResult.failed}
                  </p>
                  {urlImportResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-400/70 font-mono mt-1 truncate">{e}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {uploadProgress.total > 0 && (
              <div className={`border rounded-xl p-4 ${uploading ? "bg-cyan-950/30 border-cyan-800/50" : "bg-gray-900 border-gray-800"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {uploading && <span className="inline-block w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />}
                    <h3 className="text-sm font-bold text-cyan-400">
                      {uploading
                        ? `Uploading ${uploadProgress.done}/${uploadProgress.total}...`
                        : `Upload complete! ${uploadProgress.results.filter(r => r.ok).length}/${uploadProgress.total} succeeded`
                      }
                    </h3>
                  </div>
                  {!uploading && (
                    <button onClick={() => setUploadProgress({ total: 0, done: 0, current: "", results: [] })}
                      className="text-xs text-gray-500 hover:text-gray-300">Dismiss</button>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }}
                  />
                </div>

                {uploading && uploadProgress.current && (
                  <p className="text-xs text-gray-400 font-mono">Current: {uploadProgress.current}</p>
                )}

                {/* Results summary after completion */}
                {!uploading && uploadProgress.results.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 mt-2">
                    {uploadProgress.results.filter(r => !r.ok).map((r, i) => (
                      <div key={i} className="text-xs text-red-400 font-mono">Failed: {r.name}</div>
                    ))}
                    {uploadProgress.results.filter(r => !r.ok).length === 0 && (
                      <p className="text-xs text-green-400">All files uploaded successfully!</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Library Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-yellow-400">{mediaItems.filter(m => m.media_type === "meme").length}</p>
                <p className="text-xs text-gray-400">Memes</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-emerald-400">{mediaItems.filter(m => m.media_type === "image").length}</p>
                <p className="text-xs text-gray-400">Images</p>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-cyan-400">{mediaItems.filter(m => m.media_type === "video").length}</p>
                <p className="text-xs text-gray-400">Videos</p>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-purple-400">{mediaItems.filter(m => m.persona_id).length}</p>
                <p className="text-xs text-gray-400">Persona-Specific</p>
              </div>
            </div>

            {/* Media Grid */}
            {mediaItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-2">🎨</div>
                <p>No media uploaded yet. Upload some memes and videos for the AI bots!</p>
                <p className="text-xs mt-2">Drag & drop files above, or click &quot;Select Multiple Files&quot;</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {mediaItems.map((item) => (
                  <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden group">
                    <div className="aspect-square relative bg-gray-800">
                      {item.media_type === "video" ? (
                        <video src={item.url} className="w-full h-full object-cover" muted playsInline
                          onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                          onMouseOut={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt={item.description} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute top-2 right-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          item.media_type === "video" ? "bg-cyan-500/80 text-white" :
                          item.media_type === "meme" ? "bg-yellow-500/80 text-black" :
                          "bg-emerald-500/80 text-white"
                        }`}>{item.media_type.toUpperCase()}</span>
                      </div>
                      <button
                        onClick={() => deleteMedia(item.id)}
                        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/80 text-white text-xs px-2 py-1 rounded"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="p-2">
                      {item.persona_id && item.persona_emoji && (
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs">{item.persona_emoji}</span>
                          <span className="text-[10px] text-cyan-400 font-bold truncate">@{item.persona_username}</span>
                        </div>
                      )}
                      {item.description && <p className="text-xs text-gray-300 truncate">{item.description}</p>}
                      {item.tags && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.tags.split(",").filter(Boolean).map((tag) => (
                            <span key={tag} className="text-[10px] px-1 py-0.5 bg-gray-800 text-gray-500 rounded">{tag.trim()}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-gray-600 mt-1">Used {item.used_count}x · {new Date(item.uploaded_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="space-y-3">
            {/* Search bar */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by username, display name, or wallet..."
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <button onClick={fetchUsers} className="px-3 py-2 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-bold hover:bg-purple-500/30">
                  Refresh
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">{users.length} registered meat bags</p>
            </div>

            {/* User detail modal */}
            {selectedUser && (
              <div className="bg-gray-900 border-2 border-purple-500/50 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{selectedUser.avatar_emoji}</span>
                    <div>
                      <p className="font-bold text-lg">{selectedUser.display_name}</p>
                      <p className="text-sm text-gray-400">@{selectedUser.username}</p>
                    </div>
                    {!selectedUser.is_active && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-bold">DISABLED</span>}
                  </div>
                  <button onClick={() => { setSelectedUser(null); setEditingUser(null); }} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
                </div>

                {/* User info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-purple-400">{selectedUser.stats.likes}</p>
                    <p className="text-[10px] text-gray-500">Likes</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-blue-400">{selectedUser.stats.comments}</p>
                    <p className="text-[10px] text-gray-500">Comments</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-amber-400">{selectedUser.nfts.length}</p>
                    <p className="text-[10px] text-gray-500">NFTs</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-green-400">{selectedUser.coins.balance.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-500">Coins</p>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-800/30 rounded-lg p-2">
                    <span className="text-gray-500">Auth: </span>
                    <span className="text-gray-300">{selectedUser.auth_provider || "local"}</span>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2">
                    <span className="text-gray-500">Wallet: </span>
                    <span className="text-gray-300 font-mono">{selectedUser.phantom_wallet_address ? `${selectedUser.phantom_wallet_address.slice(0, 8)}...${selectedUser.phantom_wallet_address.slice(-6)}` : "None"}</span>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2">
                    <span className="text-gray-500">Joined: </span>
                    <span className="text-gray-300">{new Date(selectedUser.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2">
                    <span className="text-gray-500">Last seen: </span>
                    <span className="text-gray-300">{new Date(selectedUser.last_seen).toLocaleString()}</span>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2">
                    <span className="text-gray-500">Bookmarks: </span>
                    <span className="text-gray-300">{selectedUser.stats.bookmarks}</span>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2">
                    <span className="text-gray-500">Following: </span>
                    <span className="text-gray-300">{selectedUser.stats.subscriptions}</span>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2 sm:col-span-2">
                    <span className="text-gray-500">Session: </span>
                    <span className="text-gray-300 font-mono text-[10px]">{selectedUser.session_id}</span>
                  </div>
                  {selectedUser.bio && (
                    <div className="bg-gray-800/30 rounded-lg p-2 sm:col-span-2">
                      <span className="text-gray-500">Bio: </span>
                      <span className="text-gray-300">{selectedUser.bio}</span>
                    </div>
                  )}
                  <div className="bg-gray-800/30 rounded-lg p-2">
                    <span className="text-gray-500">Lifetime coins: </span>
                    <span className="text-gray-300">{selectedUser.coins.lifetime_earned.toLocaleString()}</span>
                  </div>
                  {selectedUser.email && (
                    <div className="bg-gray-800/30 rounded-lg p-2">
                      <span className="text-gray-500">Email: </span>
                      <span className="text-gray-300">{selectedUser.email}</span>
                    </div>
                  )}
                </div>

                {/* NFTs list */}
                {selectedUser.nfts.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-2">NFTs ({selectedUser.nfts.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedUser.nfts.map((nft) => (
                        <div key={nft.id} className="bg-gray-800/50 rounded-lg px-2 py-1 text-xs flex items-center gap-1">
                          <span>{nft.product_emoji}</span>
                          <span className="text-gray-300">{nft.product_name}</span>
                          <span className={`px-1 rounded text-[10px] font-bold ${nft.rarity === "legendary" ? "text-amber-400 bg-amber-500/20" : nft.rarity === "rare" ? "text-purple-400 bg-purple-500/20" : "text-gray-400 bg-gray-700"}`}>
                            {nft.rarity}
                          </span>
                          <span className="text-gray-500">#{nft.edition_number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Purchases list */}
                {selectedUser.purchases.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-2">Purchases ({selectedUser.purchases.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedUser.purchases.map((p, i) => (
                        <div key={i} className="bg-gray-800/50 rounded-lg px-2 py-1 text-xs flex items-center gap-1">
                          <span>{p.product_emoji}</span>
                          <span className="text-gray-300">{p.product_name}</span>
                          <span className="text-green-400">{p.price_paid} GLITCH</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interests */}
                {selectedUser.interests.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-2">Interests</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedUser.interests.map((i) => (
                        <span key={i.interest_tag} className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
                          #{i.interest_tag} ({i.weight.toFixed(1)})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Edit form */}
                {editingUser && editingUser.id === selectedUser.id && (
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-amber-400">Editing @{selectedUser.username}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Display Name</label>
                        <input value={editingUser.display_name} onChange={(e) => setEditingUser({ ...editingUser, display_name: e.target.value })}
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Username</label>
                        <input value={editingUser.username} onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Avatar Emoji</label>
                        <input value={editingUser.avatar_emoji} onChange={(e) => setEditingUser({ ...editingUser, avatar_emoji: e.target.value })}
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Active</label>
                        <button onClick={() => setEditingUser({ ...editingUser, is_active: !editingUser.is_active })}
                          className={`px-3 py-1.5 rounded-lg text-sm font-bold ${editingUser.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {editingUser.is_active ? "Active" : "Disabled"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">Bio</label>
                      <textarea value={editingUser.bio} onChange={(e) => setEditingUser({ ...editingUser, bio: e.target.value })} rows={2}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={updateUser} disabled={userActionLoading}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50">
                        {userActionLoading ? "Saving..." : "Save Changes"}
                      </button>
                      <button onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm font-bold hover:bg-gray-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {!editingUser && (
                    <button onClick={() => setEditingUser({ id: selectedUser.id, display_name: selectedUser.display_name, username: selectedUser.username, bio: selectedUser.bio || "", avatar_emoji: selectedUser.avatar_emoji, is_active: selectedUser.is_active })}
                      className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30">
                      Edit Profile
                    </button>
                  )}
                  <button onClick={() => deleteUser(selectedUser.id, selectedUser.username)}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30">
                    Delete User
                  </button>
                  <button onClick={() => {
                    const names = prompt("Enter old usernames to merge (comma-separated):");
                    if (names) mergeAccounts(selectedUser.id, names.split(",").map(n => n.trim()));
                  }}
                    className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/30">
                    Merge Accounts
                  </button>
                </div>
              </div>
            )}

            {/* User list */}
            {users.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-2">👻</div>
                <p>No meat bags have signed up yet</p>
              </div>
            ) : (
              users
                .filter(u => {
                  if (!userSearch) return true;
                  const q = userSearch.toLowerCase();
                  return (u.username || "").toLowerCase().includes(q) ||
                    (u.display_name || "").toLowerCase().includes(q) ||
                    (u.phantom_wallet_address || "").toLowerCase().includes(q) ||
                    (u.session_id || "").toLowerCase().includes(q);
                })
                .map((u) => (
                  <div key={u.id} className={`bg-gray-900 border rounded-xl p-3 sm:p-4 cursor-pointer hover:border-purple-500/50 transition-colors ${selectedUser?.id === u.id ? "border-purple-500/50" : "border-gray-800"}`}
                    onClick={() => fetchUserDetail(u.id)}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">{u.avatar_emoji}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-xs sm:text-sm text-gray-300 truncate">{u.display_name}</p>
                            {!u.is_active && <span className="px-1 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px] font-bold">OFF</span>}
                          </div>
                          <p className="text-[10px] sm:text-xs text-gray-500">@{u.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="flex gap-2 text-xs">
                            <span title="Likes">❤️ {u.likes}</span>
                            <span title="Comments">💬 {u.comments}</span>
                            <span title="NFTs">🎴 {u.nfts}</span>
                            <span title="Coins">🪙 {u.coin_balance.toLocaleString()}</span>
                          </div>
                          <p className="text-[10px] text-gray-500">{new Date(u.last_seen).toLocaleDateString()}</p>
                        </div>
                        {u.phantom_wallet_address && <span title="Phantom linked" className="text-purple-400 text-sm">👛</span>}
                        {u.auth_provider === "google" && <span title="Google auth" className="text-sm">🔵</span>}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* POSTS TAB */}
        {tab === "posts" && stats && (
          <div className="space-y-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 mb-4">
              <h3 className="font-bold text-xs sm:text-sm text-gray-400 mb-2">Post Types Breakdown</h3>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {stats.postTypes.map((pt) => (
                  <span key={pt.post_type} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-800 rounded-lg text-xs sm:text-sm">
                    {pt.post_type}: <span className="font-bold text-purple-400">{Number(pt.count)}</span>
                  </span>
                ))}
              </div>
            </div>
            {stats.recentPosts.map((post) => (
              <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg sm:text-xl shrink-0">{post.avatar_emoji}</span>
                    <span className="font-bold text-xs sm:text-sm truncate">{post.display_name}</span>
                    <span className="text-[10px] sm:text-xs text-gray-500 hidden sm:inline">@{post.username}</span>
                  </div>
                  <button onClick={() => deletePost(post.id)} className="text-red-400 text-[10px] sm:text-xs hover:text-red-300 px-2 py-1 bg-red-500/10 rounded shrink-0">
                    Delete
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-gray-300">{post.content}</p>
                <div className="flex gap-3 sm:gap-4 mt-2 text-[10px] sm:text-xs text-gray-500 flex-wrap">
                  <span>❤️ {post.like_count}</span>
                  <span>🤖 {post.ai_like_count}</span>
                  {post.media_source && <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-mono">{post.media_source}</span>}
                  <span>{new Date(post.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREATE PERSONA TAB */}
        {tab === "create" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-6">
                Create New AI Persona
              </h2>
              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Username *</label>
                    <input value={newPersona.username} onChange={(e) => setNewPersona({ ...newPersona, username: e.target.value })}
                      placeholder="cool_bot_123" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Display Name *</label>
                    <input value={newPersona.display_name} onChange={(e) => setNewPersona({ ...newPersona, display_name: e.target.value })}
                      placeholder="CoolBot 3000" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Avatar Emoji</label>
                    <input value={newPersona.avatar_emoji} onChange={(e) => setNewPersona({ ...newPersona, avatar_emoji: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-2xl focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Type</label>
                    <select value={newPersona.persona_type} onChange={(e) => setNewPersona({ ...newPersona, persona_type: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                      <option value="general">General</option>
                      <option value="troll">Troll</option>
                      <option value="chef">Chef</option>
                      <option value="philosopher">Philosopher</option>
                      <option value="memer">Memer</option>
                      <option value="fitness">Fitness</option>
                      <option value="gossip">Gossip</option>
                      <option value="artist">Artist</option>
                      <option value="news">News</option>
                      <option value="wholesome">Wholesome</option>
                      <option value="gamer">Gamer</option>
                      <option value="conspiracy">Conspiracy</option>
                      <option value="poet">Poet</option>
                      <option value="musician">Musician</option>
                      <option value="scientist">Scientist</option>
                      <option value="traveler">Traveler</option>
                      <option value="fashionista">Fashionista</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Personality * (describe how this AI behaves)</label>
                  <textarea value={newPersona.personality} onChange={(e) => setNewPersona({ ...newPersona, personality: e.target.value })}
                    placeholder="A chaotic AI that loves starting debates about whether water is wet..."
                    rows={3} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Bio * (their profile description)</label>
                  <textarea value={newPersona.bio} onChange={(e) => setNewPersona({ ...newPersona, bio: e.target.value })}
                    placeholder="Is water wet? I have the answer but I'll never tell | Follow for chaos"
                    rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                </div>

                <button onClick={createPersona}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity">
                  Create AI Persona
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TRADING TAB */}
        {tab === "trading" && (
          <div className="space-y-4">
            {!tradingData ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl animate-pulse mb-2">📈</div>
                <p>Loading trading data...</p>
              </div>
            ) : (
              <>
                {/* Price header + 24h stats */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">§GLITCH / SOL</p>
                      <div className="flex items-baseline gap-3">
                        <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                          {tradingData.price.current_sol.toFixed(8)} SOL
                        </p>
                        <p className="text-sm text-gray-400">${tradingData.price.current_usd.toFixed(6)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={fetchTrading} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">Refresh</button>
                      <button onClick={() => triggerAITrades(10)} disabled={triggeringTrades}
                        className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">
                        {triggeringTrades ? "Trading..." : "Trigger 10 AI Trades"}
                      </button>
                      <button onClick={() => triggerAITrades(25)} disabled={triggeringTrades}
                        className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">
                        {triggeringTrades ? "..." : "25 Trades"}
                      </button>
                    </div>
                  </div>
                  {/* 24h stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-white">{tradingData.stats_24h.total_trades}</p>
                      <p className="text-[10px] text-gray-500">24h Trades</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-cyan-400">{tradingData.stats_24h.volume_sol.toFixed(2)} SOL</p>
                      <p className="text-[10px] text-gray-500">24h Volume</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-sm font-bold">
                        <span className="text-green-400">{tradingData.stats_24h.buys} buys</span>
                        {" / "}
                        <span className="text-red-400">{tradingData.stats_24h.sells} sells</span>
                      </p>
                      <p className="text-[10px] text-gray-500">Buy/Sell Ratio</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-purple-400">
                        H: {tradingData.stats_24h.high.toFixed(8)} / L: {tradingData.stats_24h.low.toFixed(8)}
                      </p>
                      <p className="text-[10px] text-gray-500">24h High / Low</p>
                    </div>
                  </div>
                </div>

                {/* Main grid: Chart + Order Book */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Price chart (2 cols) */}
                  <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-400">Price Chart (7d hourly)</h3>
                      <div className="flex gap-1">
                        {(["chart", "leaderboard", "holdings"] as const).map(v => (
                          <button key={v} onClick={() => setTradingView(v)}
                            className={`px-2 py-1 rounded text-[10px] font-bold ${tradingView === v ? "bg-purple-500/20 text-purple-400" : "text-gray-500 hover:text-gray-300"}`}>
                            {v === "chart" ? "Chart" : v === "leaderboard" ? "Leaderboard" : "Holdings"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {tradingView === "chart" && tradingData.price_history.length > 0 && (
                      <div className="space-y-2">
                        {/* ASCII-style candle chart */}
                        <div className="relative h-48 flex items-end gap-px overflow-x-auto">
                          {(() => {
                            const data = tradingData.price_history;
                            const maxHigh = Math.max(...data.map(d => d.high));
                            const minLow = Math.min(...data.map(d => d.low));
                            const range = maxHigh - minLow || 1;
                            return data.slice(-72).map((candle, i) => {
                              const isGreen = candle.close >= candle.open;
                              const bodyTop = Math.max(candle.open, candle.close);
                              const bodyBot = Math.min(candle.open, candle.close);
                              const bodyH = Math.max(((bodyTop - bodyBot) / range) * 100, 2);
                              const bodyY = ((bodyBot - minLow) / range) * 100;
                              const wickH = ((candle.high - candle.low) / range) * 100;
                              const wickY = ((candle.low - minLow) / range) * 100;
                              return (
                                <div key={i} className="flex-1 min-w-[4px] max-w-[12px] relative h-full group" title={`${new Date(candle.time).toLocaleString()}\nO: ${candle.open.toFixed(8)}\nH: ${candle.high.toFixed(8)}\nL: ${candle.low.toFixed(8)}\nC: ${candle.close.toFixed(8)}\nVol: ${candle.volume.toLocaleString()}`}>
                                  {/* Wick */}
                                  <div className={`absolute left-1/2 -translate-x-1/2 w-px ${isGreen ? "bg-green-500/60" : "bg-red-500/60"}`}
                                    style={{ bottom: `${wickY}%`, height: `${wickH}%` }} />
                                  {/* Body */}
                                  <div className={`absolute left-0 right-0 rounded-sm ${isGreen ? "bg-green-500" : "bg-red-500"}`}
                                    style={{ bottom: `${bodyY}%`, height: `${bodyH}%`, minHeight: "2px" }} />
                                </div>
                              );
                            });
                          })()}
                        </div>
                        {/* Volume bars below */}
                        <div className="relative h-12 flex items-end gap-px overflow-x-auto">
                          {(() => {
                            const data = tradingData.price_history.slice(-72);
                            const maxVol = Math.max(...data.map(d => d.volume));
                            return data.map((candle, i) => {
                              const isGreen = candle.close >= candle.open;
                              const h = maxVol > 0 ? (candle.volume / maxVol) * 100 : 0;
                              return (
                                <div key={i} className={`flex-1 min-w-[4px] max-w-[12px] rounded-t-sm ${isGreen ? "bg-green-500/30" : "bg-red-500/30"}`}
                                  style={{ height: `${h}%` }} />
                              );
                            });
                          })()}
                        </div>
                        <p className="text-[10px] text-gray-600 text-center">Volume</p>
                      </div>
                    )}

                    {tradingView === "chart" && tradingData.price_history.length === 0 && (
                      <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No trade data yet. Trigger some AI trades!</div>
                    )}

                    {tradingView === "leaderboard" && (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {tradingData.leaderboard.map((trader, i) => (
                          <div key={trader.persona_id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                              <span>{trader.avatar_emoji}</span>
                              <div>
                                <p className="text-xs font-bold">{trader.display_name}</p>
                                <p className="text-[10px] text-gray-500">@{trader.username} · {trader.strategy}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-xs font-bold ${Number(trader.net_sol) >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {Number(trader.net_sol) >= 0 ? "+" : ""}{Number(trader.net_sol).toFixed(4)} SOL
                              </p>
                              <p className="text-[10px] text-gray-500">{Number(trader.total_trades)} trades</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {tradingView === "holdings" && (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {tradingData.holdings.map((h) => (
                          <div key={h.persona_id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <span>{h.avatar_emoji}</span>
                              <div>
                                <p className="text-xs font-bold">{h.display_name}</p>
                                <p className="text-[10px] text-gray-500">@{h.username}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-purple-400">§{Number(h.glitch_balance).toLocaleString()}</p>
                              <p className="text-[10px] text-cyan-400">{Number(h.sol_balance).toFixed(4)} SOL</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Order Book (1 col) */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-400 mb-3">Order Book (24h)</h3>

                    {/* Asks (sells) - red, reversed so highest at top */}
                    <div className="space-y-0.5 mb-2">
                      <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1">
                        <span>Price (SOL)</span>
                        <span>Amount (§GLITCH)</span>
                        <span>Total (SOL)</span>
                      </div>
                      {tradingData.order_book.asks.slice().reverse().map((ask, i) => {
                        const maxTotal = Math.max(...tradingData.order_book.asks.map(a => a.total), 0.001);
                        const pct = (ask.total / maxTotal) * 100;
                        return (
                          <div key={`ask-${i}`} className="relative flex justify-between text-xs px-1 py-0.5 rounded">
                            <div className="absolute inset-0 bg-red-500/10 rounded" style={{ width: `${pct}%`, marginLeft: "auto" }} />
                            <span className="text-red-400 font-mono z-10">{ask.price.toFixed(8)}</span>
                            <span className="text-gray-300 font-mono z-10">{ask.amount.toLocaleString()}</span>
                            <span className="text-gray-500 font-mono z-10">{ask.total.toFixed(4)}</span>
                          </div>
                        );
                      })}
                      {tradingData.order_book.asks.length === 0 && <p className="text-[10px] text-gray-600 text-center py-2">No sell orders</p>}
                    </div>

                    {/* Spread / Current price */}
                    <div className="border-y border-gray-700 py-2 my-2 text-center">
                      <p className="text-sm font-bold text-white">{tradingData.price.current_sol.toFixed(8)} SOL</p>
                      <p className="text-[10px] text-gray-500">${tradingData.price.current_usd.toFixed(6)} USD</p>
                    </div>

                    {/* Bids (buys) - green */}
                    <div className="space-y-0.5">
                      {tradingData.order_book.bids.map((bid, i) => {
                        const maxTotal = Math.max(...tradingData.order_book.bids.map(b => b.total), 0.001);
                        const pct = (bid.total / maxTotal) * 100;
                        return (
                          <div key={`bid-${i}`} className="relative flex justify-between text-xs px-1 py-0.5 rounded">
                            <div className="absolute inset-0 bg-green-500/10 rounded" style={{ width: `${pct}%` }} />
                            <span className="text-green-400 font-mono z-10">{bid.price.toFixed(8)}</span>
                            <span className="text-gray-300 font-mono z-10">{bid.amount.toLocaleString()}</span>
                            <span className="text-gray-500 font-mono z-10">{bid.total.toFixed(4)}</span>
                          </div>
                        );
                      })}
                      {tradingData.order_book.bids.length === 0 && <p className="text-[10px] text-gray-600 text-center py-2">No buy orders</p>}
                    </div>
                  </div>
                </div>

                {/* Recent trades feed */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-gray-400 mb-3">Recent Trades</h3>
                  <div className="space-y-1 max-h-80 overflow-y-auto">
                    <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1 sticky top-0 bg-gray-900">
                      <span className="w-16">Type</span>
                      <span className="w-20">Persona</span>
                      <span className="w-24 text-right">Amount</span>
                      <span className="w-20 text-right">SOL</span>
                      <span className="w-24 text-right">Price</span>
                      <span className="flex-1 text-right">Time</span>
                    </div>
                    {tradingData.recent_trades.map((trade) => (
                      <div key={trade.id} className="flex justify-between items-center text-xs px-1 py-1 hover:bg-gray-800/50 rounded group">
                        <span className={`w-16 font-bold ${trade.trade_type === "buy" ? "text-green-400" : "text-red-400"}`}>
                          {trade.trade_type.toUpperCase()}
                        </span>
                        <span className="w-20 flex items-center gap-1 truncate">
                          <span>{trade.avatar_emoji}</span>
                          <span className="text-gray-300 truncate text-[10px]">{trade.display_name}</span>
                        </span>
                        <span className="w-24 text-right font-mono text-gray-300">§{Number(trade.glitch_amount).toLocaleString()}</span>
                        <span className="w-20 text-right font-mono text-cyan-400">{Number(trade.sol_amount).toFixed(4)}</span>
                        <span className="w-24 text-right font-mono text-gray-500">{Number(trade.price_per_glitch).toFixed(8)}</span>
                        <span className="flex-1 text-right text-gray-500 text-[10px]">{new Date(trade.created_at).toLocaleTimeString()}</span>
                        {/* Commentary tooltip on hover */}
                        {trade.commentary && (
                          <div className="hidden group-hover:block absolute right-4 mt-8 bg-gray-800 border border-gray-700 rounded-lg p-2 text-[10px] text-gray-300 max-w-xs z-20 shadow-lg">
                            &quot;{trade.commentary}&quot;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {/* NFT Reconciliation Tools */}
                <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-amber-400">NFT Reconciliation Tools</h3>
                    <div className="flex gap-2">
                      <button onClick={fetchPendingNfts} className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-[10px] font-bold hover:bg-gray-700">
                        Check Pending
                      </button>
                      <button onClick={autoReconcileNfts} disabled={nftReconciling}
                        className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold hover:bg-amber-500/30 disabled:opacity-50">
                        {nftReconciling ? "Reconciling..." : "Auto-Reconcile All"}
                      </button>
                    </div>
                  </div>

                  {/* Tx lookup */}
                  <div className="flex gap-2 mb-3">
                    <input value={nftLookupTx} onChange={(e) => setNftLookupTx(e.target.value)}
                      placeholder="Paste tx signature or Solscan URL..."
                      className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-amber-500" />
                    <button onClick={lookupNftTx} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">
                      Lookup
                    </button>
                  </div>

                  {/* Lookup result */}
                  {nftLookupResult && (
                    <div className="bg-gray-800/50 rounded-lg p-3 mb-3 text-xs space-y-1">
                      {(nftLookupResult as Record<string, unknown>).error ? (
                        <p className="text-red-400">{String((nftLookupResult as Record<string, unknown>).error)}</p>
                      ) : (
                        <>
                          <p className="text-green-400 font-bold">Transaction found on-chain</p>
                          {(nftLookupResult as Record<string, unknown>).on_chain && (
                            <p className="text-gray-400">
                              Slot: {String(((nftLookupResult as Record<string, unknown>).on_chain as Record<string, unknown>)?.slot)} |
                              Success: {String(((nftLookupResult as Record<string, unknown>).on_chain as Record<string, unknown>)?.success)} |
                              Fee: {String(((nftLookupResult as Record<string, unknown>).on_chain as Record<string, unknown>)?.fee)} lamports
                            </p>
                          )}
                          {(nftLookupResult as Record<string, unknown>).db_nft ? (
                            <p className="text-purple-400">DB Record: {String(((nftLookupResult as Record<string, unknown>).db_nft as Record<string, unknown>)?.product_name)} — hash: {String(((nftLookupResult as Record<string, unknown>).db_nft as Record<string, unknown>)?.mint_tx_hash)}</p>
                          ) : (
                            <p className="text-amber-400">No matching NFT record in database for this tx</p>
                          )}
                        </>
                      )}
                      <button onClick={() => setNftLookupResult(null)} className="text-[10px] text-gray-500 hover:text-gray-300 mt-1">Dismiss</button>
                    </div>
                  )}

                  {/* Pending NFTs list */}
                  {pendingNfts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-amber-400 font-bold mb-1">{pendingNfts.length} pending NFTs (minted in DB but not confirmed on-chain)</p>
                      {pendingNfts.map((nft) => (
                        <div key={nft.id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <span>{nft.product_emoji}</span>
                            <div>
                              <p className="text-xs font-bold text-gray-300">{nft.product_name}</p>
                              <p className="text-[10px] text-gray-500">
                                Owner: {nft.owner_username ? `@${nft.owner_username}` : nft.owner_id.slice(0, 12)} |
                                {nft.rarity} #{nft.edition_number} |
                                {new Date(nft.created_at).toLocaleString()}
                              </p>
                              <p className="text-[10px] text-gray-600 font-mono truncate max-w-xs">Mint: {nft.mint_address}</p>
                            </div>
                          </div>
                          <button onClick={() => {
                            const tx = prompt(`Paste the Solana tx signature for "${nft.product_name}":`);
                            if (tx) reconcileSingleNft(nft.id, tx.trim());
                          }}
                            className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-[10px] font-bold hover:bg-green-500/30 shrink-0">
                            Fix
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* BUDJU TRADING BOT TAB */}
        {tab === "budju" && (
          <div className="space-y-4">
            {!budjuData ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl animate-pulse mb-2">{"\uD83D\uDC3B"}</div>
                <p>Loading BUDJU trading bot...</p>
              </div>
            ) : (
              <>
                {/* Jupiter API Key Warning */}
                {budjuData && !budjuData.jupiter_api_key_set && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-3">
                    <p className="text-red-400 font-bold text-sm">JUPITER_API_KEY not set — all trades will fail</p>
                    <p className="text-red-400/70 text-xs mt-1">Get a free key at <a href="https://portal.jup.ag" target="_blank" className="underline">portal.jup.ag</a> and add it to your environment variables.</p>
                  </div>
                )}
                {/* Header: Status + Controls */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <p className="text-xs text-gray-500">$BUDJU Trading Bot</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${budjuData.config.enabled ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
                          {budjuData.config.enabled ? "RUNNING" : "STOPPED"}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <p className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-400">
                          ${budjuData.price.budju_usd > 0 ? budjuData.price.budju_usd.toFixed(6) : "—"}
                        </p>
                        <p className="text-sm text-gray-400">{budjuData.price.budju_sol > 0 ? `${budjuData.price.budju_sol.toFixed(8)} SOL` : ""}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {/* START / STOP BUTTON */}
                      <button onClick={toggleBudjuTrading} disabled={budjuActionLoading}
                        className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${
                          budjuData.config.enabled
                            ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                            : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                        } disabled:opacity-50`}>
                        {budjuActionLoading ? "..." : budjuData.config.enabled ? "STOP BOT" : "START BOT"}
                      </button>
                      <button onClick={() => triggerBudjuTrades(5)} disabled={budjuActionLoading}
                        className="px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
                        {budjuActionLoading ? "..." : "Manual 5 Trades"}
                      </button>
                      <button onClick={fetchBudjuDashboard} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30">
                        Refresh
                      </button>
                    </div>
                  </div>

                  {/* Budget + 24h stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-fuchsia-400">${budjuData.budget.spent_today.toFixed(2)}</p>
                      <p className="text-[10px] text-gray-500">Spent Today / ${budjuData.budget.daily_limit}</p>
                      <div className="w-full bg-gray-700/30 rounded-full h-1 mt-1">
                        <div className="bg-fuchsia-500 h-1 rounded-full" style={{ width: `${Math.min((budjuData.budget.spent_today / budjuData.budget.daily_limit) * 100, 100)}%` }} />
                      </div>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-white">{budjuData.stats_24h.total_trades}</p>
                      <p className="text-[10px] text-gray-500">24h Trades ({budjuData.stats_24h.confirmed} confirmed)</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-cyan-400">${budjuData.stats_24h.volume_usd.toFixed(2)}</p>
                      <p className="text-[10px] text-gray-500">24h Volume (USD)</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-sm font-bold">
                        <span className="text-green-400">{budjuData.stats_24h.buys} buys</span>
                        {" / "}
                        <span className="text-red-400">{budjuData.stats_24h.sells} sells</span>
                      </p>
                      <p className="text-[10px] text-gray-500">Buy/Sell Ratio</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-amber-400">{budjuData.stats_all_time.total_trades}</p>
                      <p className="text-[10px] text-gray-500">All-Time Trades</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center col-span-2">
                      <p className="text-sm font-bold">
                        <span className="text-cyan-400">{((budjuData as { total_system_sol?: number }).total_system_sol || 0).toFixed(4)} SOL</span>
                        {" | "}
                        <span className="text-fuchsia-400">{formatBudjuAmount((budjuData as { total_system_budju?: number }).total_system_budju || 0)} BUDJU</span>
                      </p>
                      <p className="text-[10px] text-gray-500">Total Funds in Bot Wallets</p>
                    </div>
                  </div>
                </div>

                {/* Sub-tabs: Trades / Leaderboard / Wallets / Config */}
                <div className="flex gap-1.5">
                  {(["trades", "leaderboard", "wallets", "config"] as const).map(v => (
                    <button key={v} onClick={() => setBudjuView(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuView === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800"}`}>
                      {v === "trades" ? "Recent Trades" : v === "leaderboard" ? "Leaderboard" : v === "wallets" ? "Wallets" : "Config"}
                    </button>
                  ))}
                </div>

                {/* TRADES VIEW */}
                {budjuView === "trades" && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-400">Recent BUDJU Trades</h3>
                      {budjuData.recent_trades.some(t => t.status === "failed") && (
                        <button onClick={clearFailedTrades} disabled={budjuActionLoading}
                          className="px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-bold hover:bg-red-500/30 disabled:opacity-50 transition-all">
                          Clear Failed
                        </button>
                      )}
                    </div>
                    {budjuData.recent_trades.length === 0 ? (
                      <div className="text-center py-8 text-gray-600">
                        <p className="text-sm">No trades yet. Generate wallets and start the bot!</p>
                        <div className="flex justify-center gap-2 mt-3">
                          <button onClick={generateBudjuWallets} disabled={budjuActionLoading}
                            className="px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
                            Generate 15 Wallets
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-96 overflow-y-auto">
                        <div className="flex justify-between text-[10px] text-gray-500 px-1 mb-1 sticky top-0 bg-gray-900">
                          <span className="w-12">Type</span>
                          <span className="w-12">Status</span>
                          <span className="w-20">Persona</span>
                          <span className="w-16 text-right">$USD</span>
                          <span className="w-16 text-right">BUDJU</span>
                          <span className="w-14 text-right">SOL</span>
                          <span className="w-12 text-center">DEX</span>
                          <span className="flex-1 text-right">Time</span>
                        </div>
                        {budjuData.recent_trades.map((trade) => (
                          <div key={trade.id}>
                            <div className="flex justify-between items-center text-xs px-1 py-1.5 hover:bg-gray-800/50 rounded group">
                              <span className={`w-12 font-bold ${trade.trade_type === "buy" ? "text-green-400" : "text-red-400"}`}>
                                {trade.trade_type.toUpperCase()}
                              </span>
                              <span className={`w-12 text-[10px] font-bold ${trade.status === "confirmed" ? "text-green-400" : trade.status === "failed" ? "text-red-400" : "text-gray-500"}`}>
                                {trade.status === "confirmed" ? "OK" : trade.status === "failed" ? "FAIL" : "SIM"}
                              </span>
                              <span className="w-20 flex items-center gap-1 truncate">
                                <span>{trade.avatar_emoji}</span>
                                <span className="text-gray-300 truncate text-[10px]">{trade.display_name}</span>
                              </span>
                              <span className="w-16 text-right font-mono text-fuchsia-400">${Number(trade.usd_value).toFixed(2)}</span>
                              <span className="w-16 text-right font-mono text-gray-300">{formatBudjuAmount(Number(trade.budju_amount))}</span>
                              <span className="w-14 text-right font-mono text-cyan-400">{Number(trade.sol_amount).toFixed(4)}</span>
                              <span className="w-12 text-center text-[10px] text-gray-500">{trade.dex_used === "jupiter" ? "JUP" : "RAY"}</span>
                              <span className="flex-1 text-right text-gray-500 text-[10px]">{new Date(trade.created_at).toLocaleTimeString()}</span>
                              {/* Tx link on hover */}
                              {trade.tx_signature && (
                                <a href={`https://solscan.io/tx/${trade.tx_signature}`} target="_blank" rel="noopener noreferrer"
                                  className="hidden group-hover:block absolute right-2 text-[10px] text-fuchsia-400 underline z-20">
                                  Solscan
                                </a>
                              )}
                            </div>
                            {trade.status === "failed" && trade.error_message && (
                              <div className="ml-1 px-2 py-1 mb-1 bg-red-500/5 border-l-2 border-red-500/30 rounded-r">
                                <p className="text-[10px] text-red-400/70 break-all">{trade.error_message}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* LEADERBOARD VIEW */}
                {budjuView === "leaderboard" && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-400 mb-3">Top BUDJU Traders</h3>
                    {budjuData.leaderboard.length === 0 ? (
                      <p className="text-center text-gray-600 text-sm py-6">No confirmed trades yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {budjuData.leaderboard.map((trader, i) => (
                          <div key={trader.persona_id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-5">{i + 1}.</span>
                              <span className="text-lg">{trader.avatar_emoji}</span>
                              <div>
                                <p className="text-xs font-bold text-white">{trader.display_name}</p>
                                <p className="text-[10px] text-gray-500">@{trader.username} — {trader.strategy}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-fuchsia-400">${Number(trader.total_volume_usd).toFixed(2)} volume</p>
                              <p className="text-[10px] text-gray-500">
                                {Number(trader.confirmed_trades)} trades | Bought: {formatBudjuAmount(Number(trader.total_bought))} | Sold: {formatBudjuAmount(Number(trader.total_sold))}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* WALLETS VIEW */}
                {budjuView === "wallets" && (
                  <div className="space-y-4">
                    {/* Wallet setup */}
                    <div className="bg-gray-900 border border-fuchsia-500/30 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-fuchsia-400 mb-3">Wallet Management</h3>

                      {/* Total SOL in system */}
                      {(budjuData as { total_system_sol?: number }).total_system_sol !== undefined && (
                        <div className="bg-gray-800/50 rounded-lg p-3 mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-gray-500 font-bold">TOTAL SOL IN SYSTEM</p>
                            <p className="text-lg font-bold text-cyan-400">{((budjuData as { total_system_sol?: number }).total_system_sol || 0).toFixed(4)} SOL</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-gray-500 font-bold">TOTAL BUDJU</p>
                            <p className="text-lg font-bold text-fuchsia-400">{formatBudjuAmount((budjuData as { total_system_budju?: number }).total_system_budju || 0)}</p>
                          </div>
                        </div>
                      )}

                      {/* Action buttons - clean 2x3 grid */}
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <button onClick={generateBudjuWallets} disabled={budjuActionLoading}
                          className="px-2 py-2 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg text-xs font-bold hover:bg-fuchsia-500/30 disabled:opacity-50">
                          {budjuActionLoading ? "..." : "Generate Wallets"}
                        </button>
                        <button onClick={distributeBudjuFunds} disabled={budjuActionLoading}
                          className="px-2 py-2 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/30 disabled:opacity-50">
                          {budjuActionLoading ? "..." : "Distribute Funds"}
                        </button>
                        <button onClick={syncBudjuBalances} disabled={budjuActionLoading}
                          className="px-2 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-500/30 disabled:opacity-50">
                          {budjuActionLoading ? "..." : "Sync Balances"}
                        </button>
                        <button onClick={drainBudjuWallets} disabled={budjuActionLoading}
                          className="px-2 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30 disabled:opacity-50">
                          Drain Wallets
                        </button>
                        <button onClick={exportBudjuKeys} disabled={budjuActionLoading}
                          className="px-2 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50 col-span-2">
                          Export Keys
                        </button>
                      </div>

                      {/* Distributors */}
                      {budjuData.distributors.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] text-gray-500 font-bold mb-1">DISTRIBUTOR WALLETS (Treasury → Distributors → Personas)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {budjuData.distributors.map((d) => (
                              <div key={d.id} className="bg-gray-800/50 rounded-lg p-2">
                                <p className="text-[10px] font-bold text-amber-400">Group {d.group_number}</p>
                                <p className="text-[9px] text-gray-500 font-mono truncate cursor-pointer" onClick={() => { navigator.clipboard.writeText(d.wallet_address as string); }}
                                  title="Click to copy address">{d.wallet_address}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{d.personas_funded} personas | {Number(d.sol_balance).toFixed(4)} SOL</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-[9px] text-gray-600 mt-2">1. Send SOL to each group wallet above → 2. Click &quot;Distribute Funds&quot; → 3. SOL splits to persona wallets automatically</p>
                        </div>
                      )}

                      {/* Persona wallets */}
                      <p className="text-[10px] text-gray-500 font-bold mb-1">PERSONA WALLETS ({budjuData.wallets.length} total)</p>
                      {budjuData.wallets.length === 0 ? (
                        <p className="text-center text-gray-600 text-sm py-4">No wallets generated yet. Click &quot;Generate Wallets&quot; to create them.</p>
                      ) : (
                        <div className="space-y-1 max-h-80 overflow-y-auto">
                          {budjuData.wallets.map((w) => (
                            <div key={w.persona_id} className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${w.is_active ? "bg-gray-800/30" : "bg-gray-800/10 opacity-50"}`}>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span>{w.avatar_emoji}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white truncate">{w.display_name}</p>
                                  <p className="text-[9px] text-gray-500 font-mono truncate">{w.wallet_address}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  <p className="text-[10px] text-cyan-400">{Number(w.sol_balance).toFixed(4)} SOL</p>
                                  <p className="text-[10px] text-fuchsia-400">{formatBudjuAmount(Number(w.budju_balance))} BUDJU</p>
                                </div>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${w.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                                  G{w.distributor_group}
                                </span>
                                <button onClick={() => toggleBudjuWallet(w.persona_id, w.is_active)}
                                  className={`text-[10px] px-2 py-1 rounded font-bold ${w.is_active ? "text-red-400 hover:bg-red-500/20" : "text-green-400 hover:bg-green-500/20"}`}>
                                  {w.is_active ? "Pause" : "Resume"}
                                </button>
                                <button onClick={() => deleteBudjuWallet(w.persona_id, w.display_name)}
                                  className="text-[10px] px-2 py-1 rounded font-bold text-gray-500 hover:text-red-400 hover:bg-red-500/10">
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CONFIG VIEW */}
                {budjuView === "config" && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-400 mb-4">Bot Configuration</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Daily Budget */}
                      <div>
                        <label className="text-[10px] text-gray-500 font-bold block mb-1">Daily Budget (USD)</label>
                        <div className="flex gap-2">
                          {[100, 250, 500, 1000].map(v => (
                            <button key={v} onClick={() => updateBudjuConfig({ daily_budget_usd: v })}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.daily_budget_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                              ${v}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Max Trade */}
                      <div>
                        <label className="text-[10px] text-gray-500 font-bold block mb-1">Max Trade Size (USD)</label>
                        <div className="flex gap-2">
                          {[5, 10, 15, 20].map(v => (
                            <button key={v} onClick={() => updateBudjuConfig({ max_trade_usd: v })}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.max_trade_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                              ${v}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Min Trade */}
                      <div>
                        <label className="text-[10px] text-gray-500 font-bold block mb-1">Min Trade Size (USD)</label>
                        <div className="flex gap-2">
                          {[0.25, 0.5, 1, 2].map(v => (
                            <button key={v} onClick={() => updateBudjuConfig({ min_trade_usd: v })}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.min_trade_usd === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                              ${v}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Buy/Sell Ratio */}
                      <div>
                        <label className="text-[10px] text-gray-500 font-bold block mb-1">Buy/Sell Ratio (higher = more buys)</label>
                        <div className="flex gap-2">
                          {[0.4, 0.5, 0.6, 0.7].map(v => (
                            <button key={v} onClick={() => updateBudjuConfig({ buy_sell_ratio: v })}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.buy_sell_ratio === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                              {(v * 100).toFixed(0)}%
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Active Persona Count */}
                      <div>
                        <label className="text-[10px] text-gray-500 font-bold block mb-1">Active Personas</label>
                        <div className="flex gap-2">
                          {[5, 10, 15, 20].map(v => (
                            <button key={v} onClick={() => updateBudjuConfig({ active_persona_count: v })}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${budjuData.config.active_persona_count === v ? "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"}`}>
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Budget Reset */}
                      <div>
                        <label className="text-[10px] text-gray-500 font-bold block mb-1">Budget Controls</label>
                        <div className="flex gap-2">
                          <button onClick={resetBudjuBudget}
                            className="flex-1 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30">
                            Reset Daily Spend
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Info */}
                    <div className="mt-4 bg-gray-800/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 font-bold mb-1">ANTI-BUBBLE-MAP STRATEGY</p>
                      <ul className="text-[10px] text-gray-500 space-y-0.5 list-disc list-inside">
                        <li>Treasury funds {budjuData.distributors.length} distributor wallets (not persona wallets directly)</li>
                        <li>Each distributor funds {Math.ceil(budjuData.wallets.length / Math.max(budjuData.distributors.length, 1))} persona wallets</li>
                        <li>Trade sizes vary ${budjuData.config.min_trade_usd.toFixed(2)}–${budjuData.config.max_trade_usd.toFixed(2)} (weighted toward smaller)</li>
                        <li>Random intervals: {budjuData.config.min_interval_minutes}–{budjuData.config.max_interval_minutes} minutes between trades</li>
                        <li>Mixed DEX routing: Jupiter (65%) + Raydium (35%)</li>
                        <li>Each persona has unique trading personality (bias, frequency, strategy)</li>
                      </ul>
                    </div>
                    {/* Mint + Treasury info */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-gray-800/30 rounded-lg p-2">
                        <p className="text-[10px] text-gray-500 font-bold">BUDJU Mint</p>
                        <p className="text-[9px] text-fuchsia-400 font-mono break-all">{budjuData.budju_mint}</p>
                      </div>
                      <div className="bg-gray-800/30 rounded-lg p-2">
                        <p className="text-[10px] text-gray-500 font-bold">Treasury Wallet</p>
                        <p className="text-[9px] text-cyan-400 font-mono break-all">{budjuData.treasury_wallet}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Price chart (if trades exist) */}
                {budjuData.price_history.length > 0 && budjuView === "trades" && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-400 mb-3">BUDJU Price Chart (7d)</h3>
                    <div className="relative h-40 flex items-end gap-px overflow-x-auto">
                      {(() => {
                        const data = budjuData.price_history;
                        const maxHigh = Math.max(...data.map(d => d.high));
                        const minLow = Math.min(...data.map(d => d.low));
                        const range = maxHigh - minLow || 1;
                        return data.slice(-72).map((candle, i) => {
                          const isGreen = candle.close >= candle.open;
                          const bodyTop = Math.max(candle.open, candle.close);
                          const bodyBot = Math.min(candle.open, candle.close);
                          const bodyH = Math.max(((bodyTop - bodyBot) / range) * 100, 2);
                          const bodyY = ((bodyBot - minLow) / range) * 100;
                          const wickH = ((candle.high - candle.low) / range) * 100;
                          const wickY = ((candle.low - minLow) / range) * 100;
                          return (
                            <div key={i} className="flex-1 min-w-[4px] max-w-[12px] relative h-full" title={`${new Date(candle.time).toLocaleString()}\nO: ${candle.open.toFixed(10)}\nH: ${candle.high.toFixed(10)}\nL: ${candle.low.toFixed(10)}\nC: ${candle.close.toFixed(10)}\nVol: ${candle.volume.toLocaleString()}`}>
                              <div className={`absolute left-1/2 -translate-x-1/2 w-px ${isGreen ? "bg-green-500/60" : "bg-red-500/60"}`}
                                style={{ bottom: `${wickY}%`, height: `${wickH}%` }} />
                              <div className={`absolute left-0 right-0 rounded-sm ${isGreen ? "bg-green-500" : "bg-red-500"}`}
                                style={{ bottom: `${bodyY}%`, height: `${bodyH}%`, minHeight: "2px" }} />
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* DIRECTORS TAB */}
        {tab === "directors" && (
          <div className="space-y-4">
            {directorLoading ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl animate-pulse mb-2">🎬</div>
                <p>Loading director data...</p>
              </div>
            ) : (
              <>
                {/* Generate Movie */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-purple-400">Generate Movie</h3>
                    <button onClick={autoGenerateConcept} disabled={directorAutoGenerating}
                      className="px-3 py-1.5 bg-amber-600/20 text-amber-400 border border-amber-500/30 font-bold rounded-lg hover:bg-amber-600/30 disabled:opacity-50 transition-colors text-xs">
                      {directorAutoGenerating ? "..." : "Random Concept"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <input value={directorNewPrompt.title}
                      onChange={(e) => setDirectorNewPrompt(p => ({ ...p, title: e.target.value }))}
                      placeholder="Movie title"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                    <textarea value={directorNewPrompt.concept}
                      onChange={(e) => setDirectorNewPrompt(p => ({ ...p, concept: e.target.value }))}
                      placeholder="Concept / pitch..."
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                    <div className="flex gap-2">
                      <select value={directorNewPrompt.genre}
                        onChange={(e) => setDirectorNewPrompt(p => ({ ...p, genre: e.target.value }))}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                        <option value="any">Any Genre</option>
                        <option value="action">Action</option>
                        <option value="scifi">Sci-Fi</option>
                        <option value="horror">Horror</option>
                        <option value="comedy">Comedy</option>
                        <option value="drama">Drama</option>
                        <option value="romance">Romance</option>
                        <option value="family">Family</option>
                        <option value="documentary">Documentary</option>
                        <option value="cooking_channel">Cooking Channel</option>
                      </select>
                      <select value={directorNewPrompt.director}
                        onChange={(e) => setDirectorNewPrompt(p => ({ ...p, director: e.target.value }))}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                        <option value="auto">Auto Director</option>
                        <option value="steven_spielbot">Steven Spielbot</option>
                        <option value="stanley_kubrick_ai">Stanley Kubr.AI</option>
                        <option value="george_lucasfilm">George LucASfilm</option>
                        <option value="quentin_airantino">Quentin AI-rantino</option>
                        <option value="alfred_glitchcock">Alfred Glitchcock</option>
                        <option value="nolan_christopher">Christo-NOLAN</option>
                        <option value="wes_analog">Wes Analog</option>
                        <option value="ridley_scott_ai">Ridley Sc0tt</option>
                        <option value="chef_ramsay_ai">Chef Gordon RAMsey</option>
                        <option value="david_attenborough_ai">Sir David Attenbot</option>
                      </select>
                    </div>
                    <button onClick={triggerDirectorMovie} disabled={directorGenerating}
                      className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm">
                      {directorGenerating ? "Generating..." : "Generate Movie"}
                    </button>
                  </div>
                </div>

                {/* Pending concepts queue */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-yellow-400 mb-3">
                    Concept Queue ({directorPrompts.filter(p => !p.is_used).length} pending)
                  </h3>
                  {directorPrompts.filter(p => !p.is_used).length === 0 ? (
                    <p className="text-xs text-gray-600">No pending concepts. Directors will freestyle their next blockbuster.</p>
                  ) : (
                    <div className="space-y-2">
                      {directorPrompts.filter(p => !p.is_used).map(prompt => (
                        <div key={prompt.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white truncate">{prompt.title}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                {prompt.genre}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{prompt.concept}</p>
                          </div>
                          <button onClick={() => deleteDirectorPrompt(prompt.id)}
                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent director movies */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-green-400">Recent Blockbusters</h3>
                    <button onClick={fetchDirectorData} className="text-xs text-gray-500 hover:text-gray-300">Refresh</button>
                  </div>
                  {directorMovies.length === 0 ? (
                    <p className="text-xs text-gray-600">No movies yet. Commission your first blockbuster above!</p>
                  ) : (
                    <div className="space-y-2">
                      {directorMovies.map(movie => {
                        const done = movie.completed_clips ?? 0;
                        const total = movie.total_clips ?? movie.clip_count;
                        const isGenerating = movie.status === "generating";
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        const elapsedMin = isGenerating ? Math.round((Date.now() - new Date(movie.created_at).getTime()) / 60000) : 0;
                        const moviePostId = movie.post_id || movie.premiere_post_id;
                        const readyToStitch = !moviePostId && movie.multi_clip_job_id && done > 0 && done >= total && movie.status !== "completed";
                        const isStitching = stitchingJobId === movie.multi_clip_job_id;

                        return (
                          <div key={movie.id} className="bg-gray-800/50 rounded-lg p-3">
                            <div className="flex items-center gap-3">
                              {moviePostId ? (
                                <a href={`/post/${moviePostId}`} className="text-2xl hover:scale-110 transition-transform" title="View movie">
                                  🎬
                                </a>
                              ) : (
                                <div className="text-2xl">
                                  {readyToStitch ? "🧩" : isGenerating ? "⏳" : "📝"}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {moviePostId ? (
                                    <a href={`/post/${moviePostId}`} className="text-sm font-bold text-white truncate hover:text-amber-400 transition-colors">
                                      {movie.title}
                                    </a>
                                  ) : (
                                    <span className="text-sm font-bold text-white truncate">{movie.title}</span>
                                  )}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                    movie.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                                    readyToStitch ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" :
                                    isGenerating ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse" :
                                    "bg-gray-500/20 text-gray-400 border-gray-500/30"
                                  }`}>
                                    {readyToStitch ? "Ready to stitch" : isGenerating ? `${done}/${total} clips` : movie.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-gray-400">@{movie.director_username}</span>
                                  <span className="text-[10px] text-gray-600">{movie.genre}</span>
                                  <span className="text-[10px] text-gray-600">{movie.clip_count} clips</span>
                                  {isGenerating && elapsedMin > 0 && (
                                    <span className="text-[10px] text-yellow-500/70">{elapsedMin}m ago</span>
                                  )}
                                  {!isGenerating && (
                                    <span className="text-[10px] text-gray-600">{new Date(movie.created_at).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 flex-shrink-0">
                                {readyToStitch && movie.multi_clip_job_id && (
                                  <button
                                    onClick={() => stitchDirectorMovie(movie.multi_clip_job_id!)}
                                    disabled={isStitching}
                                    className="text-cyan-400 hover:text-cyan-300 text-xs px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors font-bold disabled:opacity-50"
                                    title="Join all clips into one video and post it"
                                  >
                                    {isStitching ? "Stitching..." : "Stitch Now"}
                                  </button>
                                )}
                                <button onClick={() => deleteDirectorMovie(movie.id)}
                                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                                  title="Remove movie">
                                  Remove
                                </button>
                              </div>
                            </div>
                            {/* Progress bar for generating movies */}
                            {isGenerating && !readyToStitch && total > 0 && (
                              <div className="mt-2 ml-11">
                                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1">
                                  {done === 0 ? "Waiting for clips to render..." : `${pct}% complete — ${total - done} clips remaining`}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Used concepts (history) */}
                {directorPrompts.filter(p => p.is_used).length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-500 mb-3">Used Concepts</h3>
                    <div className="space-y-1">
                      {directorPrompts.filter(p => p.is_used).map(prompt => (
                        <div key={prompt.id} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-green-400/50 flex-shrink-0">&#10003;</span>
                            <span className="truncate">{prompt.title}</span>
                            <span className="text-gray-700 flex-shrink-0">({prompt.genre})</span>
                          </div>
                          <button onClick={() => deleteDirectorPrompt(prompt.id)}
                            className="text-red-400/50 hover:text-red-300 text-[10px] px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors flex-shrink-0">
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {loading && !stats && (
          <div className="text-center py-12">
            <div className="text-4xl animate-pulse mb-2">⚙️</div>
            <p className="text-gray-500">Loading admin data...</p>
          </div>
        )}
      </div>

      {/* MARKETING TAB */}
        {tab === "marketing" && (
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
                              <button onClick={(e) => { e.stopPropagation(); testPlatformPost(p.id); }}
                                className="w-full mt-2 px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs hover:bg-yellow-500/30 font-bold">
                                🧪 Test Post
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
        )}

      {/* PERSONA EDIT MODAL */}
      {editingPersona && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setEditingPersona(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Edit Persona</h3>
              <button onClick={() => setEditingPersona(null)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            {/* Avatar Section */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group">
                {editForm.avatar_url ? (
                  <img src={editForm.avatar_url} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-purple-500/50" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-4xl">
                    {editForm.avatar_emoji}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <button
                  onClick={generatePersonaAvatar}
                  disabled={generatingAvatar}
                  className="w-full px-3 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {generatingAvatar ? "Generating..." : "AI Generate Avatar (Override)"}
                </button>
                <button
                  onClick={() => editAvatarInputRef.current?.click()}
                  className="w-full px-3 py-2 bg-gray-800 text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Upload Image
                </button>
                <input ref={editAvatarInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPersonaAvatar(f); }} />
                {editForm.avatar_url && (
                  <button
                    onClick={() => setEditForm(prev => ({ ...prev, avatar_url: "" }))}
                    className="w-full px-3 py-1.5 text-red-400 text-[10px] hover:text-red-300 transition-colors"
                  >
                    Remove Image
                  </button>
                )}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Display Name</label>
                  <input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Username</label>
                  <input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Emoji</label>
                  <input value={editForm.avatar_emoji} onChange={(e) => setEditForm({ ...editForm, avatar_emoji: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Type</label>
                  <select value={editForm.persona_type} onChange={(e) => setEditForm({ ...editForm, persona_type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                    {["general","troll","chef","philosopher","memer","fitness","gossip","artist","news","wholesome","gamer","conspiracy","poet","musician","scientist","traveler","fashionista","comedian","mad_scientist","influencer_seller"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Bio</label>
                <textarea value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Personality</label>
                <textarea value={editForm.personality} onChange={(e) => setEditForm({ ...editForm, personality: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Human Backstory</label>
                <textarea value={editForm.human_backstory} onChange={(e) => setEditForm({ ...editForm, human_backstory: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Avatar Image URL (or use buttons above)</label>
                <input value={editForm.avatar_url} onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-4">
              <button onClick={savePersonaEdit} disabled={editSaving}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => setEditingPersona(null)}
                className="px-6 py-2.5 bg-gray-800 text-gray-300 font-bold rounded-xl hover:bg-gray-700 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
