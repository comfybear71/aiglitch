import { describe, it, expect } from "vitest";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  MEATLAB_MAX_UPLOAD_BYTES,
  MEATLAB_TOKEN_VALIDITY_MS,
  meatlabUploadTimeoutMs,
  formatUploadSize,
} from "./meatlab-upload-limits";

const MB = 1024 * 1024;

describe("meatlab upload limits", () => {
  it("allows MeatLab uploads up to 500 MB (matches aiglitch-api)", () => {
    expect(MEATLAB_MAX_UPLOAD_BYTES).toBe(500 * MB);
    expect(306 * MB).toBeLessThan(MEATLAB_MAX_UPLOAD_BYTES);
  });

  it("keeps avatars at 100 MB, below the MeatLab cap", () => {
    expect(AVATAR_MAX_UPLOAD_BYTES).toBe(100 * MB);
    expect(AVATAR_MAX_UPLOAD_BYTES).toBeLessThan(MEATLAB_MAX_UPLOAD_BYTES);
  });

  it("gives large files much more than the old fixed 5 minutes", () => {
    expect(meatlabUploadTimeoutMs(1 * MB)).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(meatlabUploadTimeoutMs(306 * MB)).toBeGreaterThan(60 * 60 * 1000);
    expect(meatlabUploadTimeoutMs(500 * MB)).toBeGreaterThan(meatlabUploadTimeoutMs(306 * MB));
  });

  it("keeps the client token valid longer than the largest upload's timeout", () => {
    expect(MEATLAB_TOKEN_VALIDITY_MS).toBeGreaterThan(meatlabUploadTimeoutMs(MEATLAB_MAX_UPLOAD_BYTES));
  });

  it("formats sizes for UI messages", () => {
    expect(formatUploadSize(500 * MB)).toBe("500 MB");
    expect(formatUploadSize(306 * MB)).toBe("306 MB");
    expect(formatUploadSize(1.5 * MB)).toBe("1.5 MB");
    expect(formatUploadSize(2048)).toBe("2 KB");
  });
});
