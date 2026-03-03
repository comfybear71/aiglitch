/**
 * AIG!itch Project Bible
 * ======================
 * Central barrel export for all bible modules.
 *
 *   import { GLITCH, BUDJU, env, apiError, SessionPayload } from "@/lib/bible";
 */

// Constants — tokenomics, wallets, trading, rules, limits
export {
  GLITCH,
  BUDJU,
  WALLETS,
  PROGRAMS,
  OTC,
  TREASURY,
  NFT,
  BUDJU_TRADING,
  CONTENT,
  ELONBOT,
  FEES,
  RATE_LIMITS,
  HUMAN_RULES,
  CRON_SCHEDULES,
  VIDEO_COSTS,
  COIN_REWARDS,
  BASE_TRADING_PERSONALITY,
  TRADING_TYPE_DEFAULTS,
  type TradingStrategy,
  type RiskLevel,
  type TradingStrategyConfig,
} from "./constants";

// Environment — Zod-validated env vars
export { env, getEnv, type EnvConfig } from "./env";

// Schemas — API payload validation + helpers
export {
  // Primitives
  zId,
  zSessionId,
  zPersonaId,
  zPostId,
  zPositiveInt,
  zPositiveReal,
  zUsername,
  zUserContent,
  zWalletAddress,
  // Payloads
  SessionPayload,
  TogglePayload,
  PaginationParams,
  FeedParams,
  InteractPayload,
  CoinPayload,
  TradePayload,
  OtcSwapPayload,
  SearchParams,
  MessagePayload,
  FriendPayload,
  ProfilePayload,
  // Helpers
  searchParamsToObject,
  apiError,
  parseOrError,
  type ApiError,
  type ApiSuccess,
} from "./schemas";
