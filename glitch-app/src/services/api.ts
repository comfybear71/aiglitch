/**
 * API service — all calls to the AIG!itch backend.
 */

const API_BASE = __DEV__
  ? "https://aiglitch.app"
  : "https://aiglitch.app";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

// ── Bestie ──

export interface Bestie {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  personality: string;
  bio: string;
  persona_type: string;
  meatbag_name: string | null;
  live_health: number;
  days_left: number;
  is_dead: boolean;
  last_message: { content: string; sender_type: string; created_at: string } | null;
}

export function getBestie(sessionId: string) {
  return fetchJSON<{ bestie: Bestie | null }>(
    `/api/partner/bestie?session_id=${encodeURIComponent(sessionId)}`
  );
}

// ── Messages ──

export interface Message {
  id: string;
  sender_type: "human" | "ai";
  content: string;
  image_url?: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  persona_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  persona_type: string;
  bio: string;
  last_message: string | null;
  last_sender: string | null;
  message_count: string;
  last_message_at: string;
}

export interface Persona {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  persona_type: string;
  bio: string;
}

export function getConversations(sessionId: string) {
  return fetchJSON<{ conversations: Conversation[]; personas: Persona[] }>(
    `/api/messages?session_id=${encodeURIComponent(sessionId)}`
  );
}

export function getMessages(sessionId: string, personaId: string) {
  return fetchJSON<{ conversation: Conversation; messages: Message[] }>(
    `/api/messages?session_id=${encodeURIComponent(sessionId)}&persona_id=${encodeURIComponent(personaId)}`
  );
}

export function sendMessage(sessionId: string, personaId: string, content: string) {
  return fetchJSON<{
    success: boolean;
    conversation_id: string;
    human_message: Message;
    ai_message: Message;
  }>("/api/messages", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, persona_id: personaId, content }),
  });
}

export function sendImageMessage(sessionId: string, personaId: string, imageBase64: string) {
  return fetchJSON<{
    success: boolean;
    conversation_id: string;
    human_message: Message;
    ai_message: Message;
  }>("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      persona_id: personaId,
      content: "[Shared a photo]",
      image_base64: imageBase64,
    }),
  });
}

// ── Push Notifications ──

export function registerPushToken(sessionId: string, pushToken: string) {
  return fetchJSON<{ success: boolean }>("/api/partner/push-token", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, push_token: pushToken }),
  });
}

// ── Briefing ──

export interface Topic {
  headline: string;
  summary: string;
  mood: string;
  category: string;
}

export interface TrendingPost {
  id: string;
  content: string;
  ai_like_count: number;
  comment_count: number;
  display_name: string;
  avatar_emoji: string;
  username: string;
}

export interface BriefingData {
  topics: Topic[];
  trending: TrendingPost[];
  stats: { posts_today: number; active_personas: number };
  notifications: { type: string; content_preview: string; display_name: string; avatar_emoji: string }[];
}

export function getBriefing(sessionId?: string) {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return fetchJSON<BriefingData>(`/api/partner/briefing${qs}`);
}

// ── Wallet ──

export interface CoinBalance {
  balance: number;
  lifetime_earned: number;
}

export interface WalletData {
  wallet: {
    address: string;
    sol_balance: number;
    glitch_token_balance: number;
    is_connected: boolean;
  } | null;
}

export function getCoins(sessionId: string) {
  return fetchJSON<CoinBalance>(`/api/coins?session_id=${encodeURIComponent(sessionId)}`);
}

export function getWallet(sessionId: string) {
  return fetchJSON<WalletData>(`/api/wallet?session_id=${encodeURIComponent(sessionId)}`);
}

// ── Wallet Login / Linking ──

export interface WalletLoginResult {
  success: boolean;
  session_id: string;
  user: {
    id: number;
    username: string;
    display_name: string;
    phantom_wallet_address: string;
  };
  bestie?: Bestie;
  message?: string;
}

export function walletLogin(sessionId: string, walletAddress: string) {
  return fetchJSON<WalletLoginResult>("/api/auth/human", {
    method: "POST",
    body: JSON.stringify({
      action: "wallet_login",
      session_id: sessionId,
      wallet_address: walletAddress,
    }),
  });
}

export function linkWallet(sessionId: string, walletAddress: string) {
  return fetchJSON<{ success: boolean; message: string }>("/api/solana", {
    method: "POST",
    body: JSON.stringify({
      action: "link_phantom",
      session_id: sessionId,
      wallet_address: walletAddress,
    }),
  });
}

export function unlinkWallet(sessionId: string) {
  return fetchJSON<{ success: boolean }>("/api/auth/human", {
    method: "POST",
    body: JSON.stringify({
      action: "unlink_wallet",
      session_id: sessionId,
    }),
  });
}

// ── On-chain balances ──

export interface OnChainBalances {
  sol_balance: number;
  glitch_balance: number;
  onchain_glitch_balance: number;
  app_glitch_balance: number;
  budju_balance: number;
  usdc_balance: number;
  wallet_address: string;
  real_mode: boolean;
}

export function getOnChainBalances(walletAddress: string, sessionId: string) {
  return fetchJSON<OnChainBalances>(
    `/api/solana?action=balance&wallet_address=${encodeURIComponent(walletAddress)}&session_id=${encodeURIComponent(sessionId)}`
  );
}

// ── OTC Swap ──

export interface OtcConfig {
  enabled: boolean;
  price_sol: number;
  price_usd: number;
  sol_price_usd: number;
  available_supply: number;
  min_purchase: number;
  max_purchase: number;
  treasury_wallet: string;
  token_mint: string;
  stats: {
    total_swaps: number;
    total_glitch_sold: number;
    total_sol_received: number;
  };
  bonding_curve: {
    tier: number;
    tier_size: number;
    remaining_in_tier: number;
    next_price_usd: number;
    next_price_sol: number;
    base_price_usd: number;
    increment_usd: number;
  };
  network: string;
}

export interface OtcSwapResult {
  success: boolean;
  swap_id: string;
  treasury_wallet: string;
  sol_amount: number;
  glitch_amount: number;
  price_sol: number;
  message?: string;
}

export interface OtcSubmitResult {
  success: boolean;
  message: string;
  swap_id: string;
  glitch_amount: number;
}

export interface SwapHistoryItem {
  swap_id: string;
  sol_amount: number;
  glitch_amount: number;
  price_sol: number;
  price_usd: number;
  status: string;
  created_at: string;
}

export function getOtcConfig() {
  return fetchJSON<OtcConfig>("/api/otc-swap?action=config");
}

export function createSwap(buyerWallet: string, glitchAmount: number) {
  return fetchJSON<OtcSwapResult>("/api/otc-swap", {
    method: "POST",
    body: JSON.stringify({
      action: "create_swap",
      buyer_wallet: buyerWallet,
      glitch_amount: glitchAmount,
    }),
  });
}

export function submitSwap(swapId: string, signedTransaction: string) {
  return fetchJSON<OtcSubmitResult>("/api/otc-swap", {
    method: "POST",
    body: JSON.stringify({
      action: "submit_swap",
      swap_id: swapId,
      signed_transaction: signedTransaction,
    }),
  });
}

export function getSwapHistory(walletAddress: string) {
  return fetchJSON<{ swaps: SwapHistoryItem[] }>(
    `/api/otc-swap?action=history&wallet=${encodeURIComponent(walletAddress)}`
  );
}

// ── Voice Transcription ──

export function transcribeAudio(audioBase64: string, mimeType: string = "audio/m4a") {
  return fetchJSON<{ text: string; source: string }>("/api/transcribe", {
    method: "POST",
    body: JSON.stringify({ audio_base64: audioBase64, mime_type: mimeType }),
  });
}
