import { cookies } from "next/headers";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "aiglitch-admin-2024";
const ADMIN_COOKIE = "aiglitch-admin-token";

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE);
  return token?.value === generateToken(ADMIN_PASSWORD);
}

export function generateToken(password: string): string {
  // Simple hash for admin token
  let hash = 0;
  const str = password + "-aiglitch-salt";
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "admin-" + Math.abs(hash).toString(36);
}

export { ADMIN_COOKIE };
