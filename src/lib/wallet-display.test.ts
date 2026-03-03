/**
 * Wallet Display Logic — Unit Tests
 * ===================================
 * Verifies that the balance display correctly switches between
 * on-chain §GLITCH (Phantom connected) and simulated coins (no wallet).
 */

import { describe, it, expect } from "vitest";
import { formatGlitchBalance, getBalanceDisplayMode } from "./wallet-display";

// ── formatGlitchBalance ─────────────────────────────────────────────

describe("formatGlitchBalance", () => {
  it("formats zero as §0", () => {
    expect(formatGlitchBalance(0)).toBe("§0");
  });

  it("formats small integers with § prefix", () => {
    expect(formatGlitchBalance(42)).toBe("§42");
  });

  it("formats thousands with commas", () => {
    expect(formatGlitchBalance(1234)).toBe("§1,234");
    expect(formatGlitchBalance(999999)).toBe("§999,999");
  });

  it("formats decimals with 2 decimal places", () => {
    expect(formatGlitchBalance(1234.5)).toBe("§1,234.50");
    expect(formatGlitchBalance(0.99)).toBe("§0.99");
    expect(formatGlitchBalance(42.069)).toBe("§42.07");
  });

  it("formats millions with M suffix", () => {
    expect(formatGlitchBalance(1_000_000)).toBe("§1.00M");
    expect(formatGlitchBalance(42_069_000)).toBe("§42.07M");
    expect(formatGlitchBalance(100_000_000)).toBe("§100.00M");
  });
});

// ── getBalanceDisplayMode ───────────────────────────────────────────

describe("getBalanceDisplayMode", () => {
  it("returns 'onchain' mode when wallet is linked and balance is available", () => {
    const result = getBalanceDisplayMode("G1tchWaLLetAddr3ss12345678901234", 1500);
    expect(result.mode).toBe("onchain");
    expect(result).toHaveProperty("formattedBalance", "§1,500");
  });

  it("returns 'onchain' mode even with zero balance when wallet is linked", () => {
    const result = getBalanceDisplayMode("SoMeWaLLetAddr3ss12345678901234", 0);
    expect(result.mode).toBe("onchain");
    expect(result).toHaveProperty("formattedBalance", "§0");
  });

  it("returns 'simulated' mode when no wallet is linked", () => {
    const result = getBalanceDisplayMode(null, null);
    expect(result.mode).toBe("simulated");
    expect(result).not.toHaveProperty("formattedBalance");
  });

  it("returns 'simulated' mode when wallet is linked but balance not yet fetched", () => {
    // onchainGlitchBalance is null until the /api/solana fetch completes
    const result = getBalanceDisplayMode("G1tchWaLLetAddr3ss12345678901234", null);
    expect(result.mode).toBe("simulated");
  });

  it("returns 'simulated' mode when linkedWallet is null even if balance exists", () => {
    // Edge case: should never happen, but be safe
    const result = getBalanceDisplayMode(null, 500);
    expect(result.mode).toBe("simulated");
  });

  it("formats large on-chain balances correctly", () => {
    const result = getBalanceDisplayMode("Wa11eT", 42_069_000);
    expect(result.mode).toBe("onchain");
    expect(result).toHaveProperty("formattedBalance", "§42.07M");
  });

  it("formats decimal on-chain balances correctly", () => {
    const result = getBalanceDisplayMode("Wa11eT", 1234.56);
    expect(result.mode).toBe("onchain");
    expect(result).toHaveProperty("formattedBalance", "§1,234.56");
  });
});
