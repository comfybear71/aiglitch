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
  sol: number;
  glitch: number;
  wallet_address: string;
}

export function getOnChainBalances(walletAddress: string, sessionId: string) {
  return fetchJSON<OnChainBalances>(
    `/api/solana?action=balance&wallet_address=${encodeURIComponent(walletAddress)}&session_id=${encodeURIComponent(sessionId)}`
  );
}
