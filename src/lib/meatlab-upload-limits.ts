/**
 * Shared size/timeout limits for MeatLab + avatar client uploads.
 *
 * Imported by both the browser (BottomNav MeatLab modal) and the
 * token route (/api/meatlab/upload) so the pre-upload check the user
 * sees and the cap Vercel Blob enforces can never drift apart.
 *
 * MeatLab: 500 MB — matches aiglitch-api's /api/meatlab/upload
 * (raised 100 MB → 500 MB in aiglitch-api PR #256).
 * Avatars: 100 MB — unchanged from the previous shared cap. Avatars
 * share the token route but are profile images, so they deliberately
 * do NOT get the 500 MB MeatLab cap.
 */

const MB = 1024 * 1024;

export const MEATLAB_MAX_UPLOAD_BYTES = 500 * MB;
export const AVATAR_MAX_UPLOAD_BYTES = 100 * MB;

/**
 * Files above this size are sent with Vercel Blob multipart upload
 * (8 MB parts, parallel, per-part retries) instead of one big PUT.
 */
export const MEATLAB_MULTIPART_THRESHOLD_BYTES = 20 * MB;

/**
 * Client-side watchdog for MeatLab uploads.
 *
 * - Stall timeout: abort if no upload progress is reported for this
 *   long (catches genuinely stuck uploads quickly).
 * - Overall timeout: generous, size-based ceiling assuming a slow
 *   ~100 KB/s connection plus a fixed 10 minute allowance, so real
 *   uploads on slow links aren't killed.
 */
export const MEATLAB_UPLOAD_STALL_TIMEOUT_MS = 3 * 60 * 1000;
const MIN_ASSUMED_BYTES_PER_SEC = 100 * 1024;
const BASE_UPLOAD_ALLOWANCE_MS = 10 * 60 * 1000;

export function meatlabUploadTimeoutMs(fileSizeBytes: number): number {
  return BASE_UPLOAD_ALLOWANCE_MS + Math.ceil((fileSizeBytes / MIN_ASSUMED_BYTES_PER_SEC) * 1000);
}

/**
 * Client tokens default to a 1 hour lifetime. Multipart uploads reuse
 * the token for every part, so it must outlive the largest allowed
 * upload's overall client timeout.
 */
export const MEATLAB_TOKEN_VALIDITY_MS =
  meatlabUploadTimeoutMs(MEATLAB_MAX_UPLOAD_BYTES) + 15 * 60 * 1000;

export function formatUploadSize(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes >= 100 * MB ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
