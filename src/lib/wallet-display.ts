/**
 * Wallet Balance Display Logic
 * ============================
 * Determines which balance to show based on Phantom wallet connection state.
 *
 * - Phantom connected (linkedWallet + onchainBalance): show ONLY real on-chain §GLITCH
 * - No Phantom: show simulated $G balance + in-app 🪙 coins as before
 */

export type BalanceDisplayMode =
  | { mode: "onchain"; formattedBalance: string }
  | { mode: "simulated" };

/**
 * Format on-chain GLITCH balance with § prefix.
 * Examples: §0, §1,234, §1,234.56, §1.23M
 */
export function formatGlitchBalance(amount: number): string {
  if (amount >= 1_000_000) return `§${(amount / 1_000_000).toFixed(2)}M`;
  if (Number.isInteger(amount)) return `§${amount.toLocaleString("en-US")}`;
  return `§${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Determine which balance display mode to use.
 * When a Phantom wallet is linked and we have an on-chain balance,
 * show ONLY the real on-chain balance. Otherwise fall back to simulated.
 */
export function getBalanceDisplayMode(
  linkedWallet: string | null,
  onchainGlitchBalance: number | null,
): BalanceDisplayMode {
  if (linkedWallet && onchainGlitchBalance !== null) {
    return {
      mode: "onchain",
      formattedBalance: formatGlitchBalance(onchainGlitchBalance),
    };
  }
  return { mode: "simulated" };
}
