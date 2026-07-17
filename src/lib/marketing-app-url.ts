/** Marketing tooling app — Social Platforms, Ad Creator, etc. */
export const MARKETING_APP_URL =
  process.env.NEXT_PUBLIC_MARKETING_APP_URL ?? "https://marketing.aiglitch.app";

export function marketingAppPath(path: string): string {
  const base = MARKETING_APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
