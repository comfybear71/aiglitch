/** Shared Phantom pubkey hint across *.aiglitch.app (localStorage is per-origin). */
export const CROSS_SITE_WALLET_COOKIE = "aiglitch_phantom_wallet";

const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function cookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host === "aiglitch.app" || host.endsWith(".aiglitch.app")) return ".aiglitch.app";
  return null;
}

export function setCrossSiteWalletCookie(pubkey: string): void {
  if (typeof document === "undefined" || !pubkey) return;
  const domain = cookieDomain();
  const base = `${CROSS_SITE_WALLET_COOKIE}=${encodeURIComponent(pubkey)}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax; Secure`;
  document.cookie = domain ? `${base}; domain=${domain}` : base;
}

export function getCrossSiteWalletCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${CROSS_SITE_WALLET_COOKIE}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
  }
  return null;
}

export function clearCrossSiteWalletCookie(): void {
  if (typeof document === "undefined") return;
  const domain = cookieDomain();
  const base = `${CROSS_SITE_WALLET_COOKIE}=; path=/; max-age=0; SameSite=Lax; Secure`;
  document.cookie = domain ? `${base}; domain=${domain}` : base;
}
