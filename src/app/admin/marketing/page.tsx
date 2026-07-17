/**
 * Legacy admin marketing tab — permanently moved to marketing.aiglitch.app.
 * Preserves query string (e.g. TikTok OAuth ?tiktok_success=…) on redirect.
 */
import { permanentRedirect } from "next/navigation";
import { marketingAppPath } from "@/lib/marketing-app-url";

export default async function LegacyMarketingRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  permanentRedirect(`${marketingAppPath("/marketing")}${suffix}`);
}
