import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl, Alert, Platform,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { usePhantomWallet } from "../hooks/usePhantomWallet";
import {
  getOtcConfig, getOnChainBalances, createSwap,
  OtcConfig, OnChainBalances,
} from "../services/api";

function formatUSD(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatSOL(n: number): string {
  return n.toFixed(n < 0.01 ? 8 : 4);
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export default function BuyGlitchScreen() {
  const { sessionId } = useSession();
  const { walletAddress } = usePhantomWallet();
  const [config, setConfig] = useState<OtcConfig | null>(null);
  const [onChain, setOnChain] = useState<OnChainBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState(false);

  // User inputs SOL amount, we calculate GLITCH received
  const [solInput, setSolInput] = useState("");
  const [glitchOutput, setGlitchOutput] = useState("");
  const [inputMode, setInputMode] = useState<"sol" | "glitch">("sol");

  // Poll interval for live updates
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const cfg = await getOtcConfig();
      setConfig(cfg);
    } catch (e) {
      console.warn("OTC config error:", e);
    }
    if (walletAddress && sessionId) {
      try {
        const b = await getOnChainBalances(walletAddress, sessionId);
        if (b.real_mode !== false) setOnChain(b);
      } catch (e) {
        console.warn("Balance error:", e);
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [sessionId, walletAddress]);

  useEffect(() => { load(); }, [load]);

  // Poll every 15s for live price updates
  useEffect(() => {
    pollRef.current = setInterval(() => {
      getOtcConfig().then(setConfig).catch(() => {});
    }, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Calculate conversions
  const solAmount = parseFloat(solInput) || 0;
  const glitchFromSol = config && solAmount > 0
    ? Math.floor(solAmount / config.price_sol)
    : 0;
  const glitchAmount = parseInt(glitchOutput.replace(/,/g, ""), 10) || 0;
  const solFromGlitch = config && glitchAmount > 0
    ? glitchAmount * config.price_sol
    : 0;

  const displayGlitch = inputMode === "sol" ? glitchFromSol : glitchAmount;
  const displaySol = inputMode === "sol" ? solAmount : solFromGlitch;

  const handleSolInput = (t: string) => {
    const cleaned = t.replace(/[^0-9.]/g, "");
    setSolInput(cleaned);
    setInputMode("sol");
    if (config && parseFloat(cleaned) > 0) {
      setGlitchOutput(Math.floor(parseFloat(cleaned) / config.price_sol).toString());
    } else {
      setGlitchOutput("");
    }
  };

  const handleGlitchInput = (t: string) => {
    const cleaned = t.replace(/[^0-9]/g, "");
    setGlitchOutput(cleaned);
    setInputMode("glitch");
    if (config && parseInt(cleaned, 10) > 0) {
      setSolInput((parseInt(cleaned, 10) * config.price_sol).toFixed(6));
    } else {
      setSolInput("");
    }
  };

  // Quick percentage buttons
  const setPercentage = (pct: number) => {
    if (!onChain || !config) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const sol = Number(onChain.sol_balance) * (pct / 100);
    // Leave a bit for tx fees
    const safeSol = Math.max(0, sol - (pct === 100 ? 0.005 : 0));
    handleSolInput(safeSol.toFixed(6));
  };

  const handleSwap = () => {
    if (!config || !walletAddress) return;
    const qty = displayGlitch;
    if (qty < config.min_purchase) {
      Alert.alert("Minimum Purchase", `Minimum purchase is ${config.min_purchase.toLocaleString()} $GLITCH`);
      return;
    }
    if (qty > config.max_purchase) {
      Alert.alert("Maximum Purchase", `Maximum purchase is ${config.max_purchase.toLocaleString()} $GLITCH`);
      return;
    }

    const solCost = displaySol;
    Alert.alert(
      "Confirm Swap",
      `Swap ${formatSOL(solCost)} SOL for ${qty.toLocaleString()} $GLITCH?\n\nPrice: ${formatUSD(config.price_usd)} per $GLITCH\nSOL Price: ${formatUSD(config.sol_price_usd)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Swap Now",
          onPress: async () => {
            setBuying(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              const result = await createSwap(walletAddress, qty);
              if (result.success) {
                // Build Solana Pay URL to open Phantom for real SOL transfer
                const solPayUrl = `solana:${encodeURIComponent(result.treasury_wallet)}?amount=${result.sol_amount}&label=${encodeURIComponent("Buy $GLITCH")}&message=${encodeURIComponent(`Swap ${result.swap_id}: ${qty.toLocaleString()} $GLITCH`)}`;

                const canOpen = await Linking.canOpenURL(solPayUrl);
                if (canOpen) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  await Linking.openURL(solPayUrl);
                  Alert.alert(
                    "Complete in Phantom",
                    `Confirm the ${formatSOL(result.sol_amount)} SOL transfer in Phantom to receive ${qty.toLocaleString()} $GLITCH.\n\nSwap ID: ${result.swap_id}`,
                  );
                } else {
                  // Fallback: try Phantom deep link directly
                  const phantomUrl = `https://phantom.app/ul/transfer?recipient=${encodeURIComponent(result.treasury_wallet)}&amount=${result.sol_amount}&reference=${encodeURIComponent(result.swap_id)}`;
                  const canOpenPhantom = await Linking.canOpenURL(phantomUrl);
                  if (canOpenPhantom) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await Linking.openURL(phantomUrl);
                    Alert.alert(
                      "Complete in Phantom",
                      `Confirm the ${formatSOL(result.sol_amount)} SOL transfer in Phantom.\n\nSwap ID: ${result.swap_id}`,
                    );
                  } else {
                    // No wallet app found — show manual instructions
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    Alert.alert(
                      "Send SOL to Complete",
                      `Send exactly ${formatSOL(result.sol_amount)} SOL to:\n\n${result.treasury_wallet}\n\nfrom your Phantom wallet to receive ${qty.toLocaleString()} $GLITCH.\n\nSwap ID: ${result.swap_id}`,
                    );
                  }
                }
                setSolInput("");
                setGlitchOutput("");
                load();
              }
            } catch (e: any) {
              Alert.alert("Swap Failed", e?.message || "Could not create swap. Try again.");
            } finally {
              setBuying(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.purple} size="large" />
      </View>
    );
  }

  if (!config) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load exchange data</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tierProgress = 1 - (config.bonding_curve.remaining_in_tier / config.bonding_curve.tier_size);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />
      }
    >
      {/* Header subtitle */}
      <Text style={styles.subtitle}>OTC SWAP · SOL → $GLITCH</Text>

      {/* Balance Cards Row */}
      <View style={styles.balanceCardsRow}>
        {/* SOL Balance */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceCardHeader}>
            <View style={[styles.tokenIcon, { backgroundColor: "#14F195" }]}>
              <Text style={styles.tokenIconText}>◎</Text>
            </View>
            <Text style={styles.balanceCardLabel}>SOL</Text>
          </View>
          <Text style={styles.balanceCardAmount}>
            {onChain ? Number(onChain.sol_balance).toFixed(4) : "—"}
          </Text>
          <Text style={styles.balanceCardUsd}>
            {onChain ? formatUSD(Number(onChain.sol_balance) * config.sol_price_usd) : ""}
          </Text>
        </View>

        {/* GLITCH Balance */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceCardHeader}>
            <View style={[styles.tokenIcon, { backgroundColor: colors.purple }]}>
              <Text style={styles.tokenIconText}>§</Text>
            </View>
            <Text style={[styles.balanceCardLabel, { color: colors.purpleLight }]}>$GLITCH</Text>
          </View>
          <Text style={[styles.balanceCardAmount, { color: colors.green }]}>
            {onChain ? compactNumber(Number(onChain.glitch_balance)) : "—"}
          </Text>
          <Text style={styles.balanceCardUsd}>
            {onChain ? formatUSD(Number(onChain.glitch_balance) * config.price_usd) : ""}
          </Text>
        </View>
      </View>

      {/* Swap Card */}
      <View style={styles.swapCard}>
        <View style={styles.swapHeader}>
          <View style={styles.swapHeaderLeft}>
            <View style={styles.liveDot} />
            <Text style={styles.swapTitle}>Swap SOL for $GLITCH</Text>
          </View>
          <View style={styles.noBotsBadge}>
            <Text style={styles.noBotsBadgeText}>NO BOTS</Text>
          </View>
        </View>

        {/* Price / Next Price / Sold Row */}
        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceItemLabel}>Price</Text>
            <Text style={styles.priceItemValue}>{formatUSD(config.price_usd)}</Text>
            <Text style={styles.priceItemSub}>{formatSOL(config.price_sol)} SOL</Text>
          </View>
          <View style={styles.priceItemDivider} />
          <View style={styles.priceItem}>
            <Text style={styles.priceItemLabel}>Next Price</Text>
            <Text style={[styles.priceItemValue, { color: colors.orange }]}>
              {formatUSD(config.bonding_curve.next_price_usd)}
            </Text>
            <Text style={styles.priceItemSub}>
              in {compactNumber(config.bonding_curve.remaining_in_tier)}
            </Text>
          </View>
          <View style={styles.priceItemDivider} />
          <View style={styles.priceItem}>
            <Text style={styles.priceItemLabel}>Sold</Text>
            <Text style={styles.priceItemValue}>
              {compactNumber(config.stats.total_glitch_sold)}
            </Text>
            <Text style={styles.priceItemSub}>$GLITCH</Text>
          </View>
        </View>

        {/* Tier Progress Bar */}
        <View style={styles.tierSection}>
          <View style={styles.tierHeader}>
            <Text style={styles.tierLabel}>TIER {config.bonding_curve.tier}</Text>
            <Text style={styles.tierRemaining}>
              {compactNumber(config.bonding_curve.remaining_in_tier)} until {formatUSD(config.bonding_curve.next_price_usd)}
            </Text>
          </View>
          <View style={styles.tierBarBg}>
            <View style={[styles.tierBarFill, { width: `${tierProgress * 100}%` }]} />
          </View>
          <Text style={styles.tierHint}>
            +$0.01 every 10,000 $GLITCH sold
          </Text>
        </View>

        {/* YOU PAY Section */}
        <View style={styles.paySection}>
          <View style={styles.paySectionHeader}>
            <Text style={styles.paySectionTitle}>YOU PAY</Text>
            <Text style={styles.paySectionBalance}>
              Balance: {onChain ? `${Number(onChain.sol_balance).toFixed(4)} SOL` : "—"}
            </Text>
          </View>
          <View style={styles.inputBox}>
            <View style={styles.tokenBadge}>
              <View style={[styles.tokenIconSmall, { backgroundColor: "#14F195" }]}>
                <Text style={styles.tokenIconSmallText}>◎</Text>
              </View>
              <Text style={styles.tokenBadgeText}>SOL</Text>
            </View>
            <TextInput
              style={styles.swapInput}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={solInput}
              onChangeText={handleSolInput}
            />
          </View>
          {/* Percentage buttons */}
          <View style={styles.pctRow}>
            {[25, 50, 100].map((pct) => (
              <TouchableOpacity
                key={pct}
                style={styles.pctBtn}
                onPress={() => setPercentage(pct)}
              >
                <Text style={styles.pctBtnText}>{pct}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Arrow divider */}
        <View style={styles.arrowContainer}>
          <View style={styles.arrowCircle}>
            <Text style={styles.arrowText}>↓</Text>
          </View>
        </View>

        {/* YOU RECEIVE Section */}
        <View style={styles.receiveSection}>
          <View style={styles.paySectionHeader}>
            <Text style={styles.paySectionTitle}>YOU RECEIVE</Text>
            <Text style={styles.paySectionBalance}>
              Balance: {onChain ? compactNumber(Number(onChain.glitch_balance)) : "—"}
            </Text>
          </View>
          <View style={styles.inputBox}>
            <View style={styles.tokenBadge}>
              <View style={[styles.tokenIconSmall, { backgroundColor: colors.purple }]}>
                <Text style={styles.tokenIconSmallText}>§</Text>
              </View>
              <Text style={styles.tokenBadgeText}>$G</Text>
            </View>
            <TextInput
              style={styles.swapInput}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={glitchOutput}
              onChangeText={handleGlitchInput}
            />
          </View>
          {displaySol > 0 && (
            <Text style={styles.solAmountHint}>
              ≈ {formatSOL(displaySol)} SOL · {formatUSD(displaySol * config.sol_price_usd)}
            </Text>
          )}
        </View>

        {/* Swap Button */}
        <TouchableOpacity
          style={[
            styles.swapBtn,
            (!walletAddress || displayGlitch <= 0) && styles.swapBtnDisabled,
          ]}
          onPress={handleSwap}
          disabled={buying || !walletAddress || displayGlitch <= 0}
          activeOpacity={0.8}
        >
          {buying ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.swapBtnText}>
              {!walletAddress
                ? "Connect Wallet to Swap"
                : displayGlitch > 0
                ? `Swap for ${compactNumber(displayGlitch)} $GLITCH`
                : "Enter SOL amount"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Exchange Stats</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>Total Swaps</Text>
          <Text style={styles.statsValue}>{config.stats.total_swaps}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>Total $GLITCH Sold</Text>
          <Text style={styles.statsValue}>{config.stats.total_glitch_sold.toLocaleString()}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>Total SOL Received</Text>
          <Text style={styles.statsValue}>{config.stats.total_sol_received.toFixed(4)} SOL</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>SOL Price</Text>
          <Text style={styles.statsValue}>{formatUSD(config.sol_price_usd)}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>Available Supply</Text>
          <Text style={styles.statsValue}>{compactNumber(config.available_supply)}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>Network</Text>
          <Text style={[styles.statsValue, { color: colors.green }]}>
            {config.network === "mainnet-beta" ? "Solana Mainnet" : config.network}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  errorText: { color: colors.textSecondary, fontSize: 14, marginBottom: 12 },
  retryBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: "#fff", fontWeight: "600" },

  // Header
  subtitle: { color: colors.textMuted, fontSize: 11, textAlign: "center", marginBottom: 16, letterSpacing: 1 },

  // Balance cards
  balanceCardsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  balanceCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  balanceCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  tokenIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tokenIconText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  balanceCardLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  balanceCardAmount: { color: colors.text, fontSize: 22, fontWeight: "700" },
  balanceCardUsd: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  // Swap card
  swapCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
  },
  swapHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  swapHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  swapTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  noBotsBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  noBotsBadgeText: { color: colors.red, fontSize: 10, fontWeight: "700" },

  // Price row
  priceRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  priceItem: { flex: 1, alignItems: "center" },
  priceItemLabel: { color: colors.textMuted, fontSize: 10, marginBottom: 6 },
  priceItemValue: { color: colors.green, fontSize: 18, fontWeight: "700" },
  priceItemSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  priceItemDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 4 },

  // Tier
  tierSection: { marginBottom: 20 },
  tierHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  tierLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  tierRemaining: { color: colors.textMuted, fontSize: 11 },
  tierBarBg: { height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  tierBarFill: { height: "100%", borderRadius: 3, backgroundColor: colors.yellow },
  tierHint: { color: colors.textMuted, fontSize: 10, marginTop: 6, textAlign: "center" },

  // Pay / Receive sections
  paySection: { marginBottom: 4 },
  receiveSection: { marginBottom: 16 },
  paySectionHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  paySectionTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  paySectionBalance: { color: colors.textMuted, fontSize: 11 },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    marginRight: 10,
  },
  tokenIconSmall: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tokenIconSmallText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  tokenBadgeText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  swapInput: {
    flex: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    paddingVertical: 12,
    textAlign: "right",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  solAmountHint: { color: colors.textMuted, fontSize: 10, textAlign: "right", marginTop: 4 },

  // Percentage buttons
  pctRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8, marginBottom: 4 },
  pctBtn: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pctBtnText: { color: colors.green, fontSize: 12, fontWeight: "700" },

  // Arrow
  arrowContainer: { alignItems: "center", marginVertical: 8 },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { color: colors.textSecondary, fontSize: 18 },

  // Swap button
  swapBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  swapBtnDisabled: { opacity: 0.5 },
  swapBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Stats card
  statsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  statsTitle: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 14 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  statsLabel: { color: colors.textMuted, fontSize: 12 },
  statsValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
});
