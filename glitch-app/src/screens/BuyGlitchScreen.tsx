import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl, Alert, Animated, Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { usePhantomWallet } from "../hooks/usePhantomWallet";
import { getCoins, getOnChainBalances, CoinBalance, OnChainBalances } from "../services/api";

// ── OTC Bonding Curve Constants ──
const BASE_PRICE = 0.001;       // Starting price in USD
const PRICE_INCREMENT = 0.01;   // +$0.01 per tier
const TIER_SIZE = 10_000;       // Every 10K coins sold = price goes up

// Simulated total sold (will come from backend later)
const INITIAL_TOTAL_SOLD = 127_430;

function calculatePrice(totalSold: number): number {
  const tier = Math.floor(totalSold / TIER_SIZE);
  return BASE_PRICE + tier * PRICE_INCREMENT;
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(amount < 1 ? 4 : 2)}`;
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

// Tier progress bar
function TierProgress({ totalSold }: { totalSold: number }) {
  const inTier = totalSold % TIER_SIZE;
  const progress = inTier / TIER_SIZE;
  const currentTier = Math.floor(totalSold / TIER_SIZE) + 1;
  const nextPrice = BASE_PRICE + currentTier * PRICE_INCREMENT;

  return (
    <View style={styles.tierContainer}>
      <View style={styles.tierHeader}>
        <Text style={styles.tierLabel}>Tier {currentTier} Progress</Text>
        <Text style={styles.tierCount}>{compactNumber(inTier)} / {compactNumber(TIER_SIZE)}</Text>
      </View>
      <View style={styles.tierBarBg}>
        <View style={[styles.tierBarFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.tierHint}>
        Next price increase to {formatUSD(nextPrice)} in {compactNumber(TIER_SIZE - inTier)} coins
      </Text>
    </View>
  );
}

// Quick amount buttons
const QUICK_AMOUNTS = [1000, 5000, 10000, 50000];

export default function BuyGlitchScreen() {
  const { sessionId } = useSession();
  const { walletAddress } = usePhantomWallet();
  const [coins, setCoins] = useState<CoinBalance | null>(null);
  const [onChain, setOnChain] = useState<OnChainBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // OTC state
  const [totalSold, setTotalSold] = useState(INITIAL_TOTAL_SOLD);
  const [amount, setAmount] = useState("");
  const [buying, setBuying] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation on the price
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const currentPrice = calculatePrice(totalSold);
  const parsedAmount = parseInt(amount.replace(/,/g, ""), 10) || 0;
  const totalCost = parsedAmount * currentPrice;

  // If buying crosses tiers, calculate blended cost
  const calculateBlendedCost = (qty: number): number => {
    let cost = 0;
    let remaining = qty;
    let sold = totalSold;
    while (remaining > 0) {
      const tier = Math.floor(sold / TIER_SIZE);
      const price = BASE_PRICE + tier * PRICE_INCREMENT;
      const leftInTier = TIER_SIZE - (sold % TIER_SIZE);
      const batch = Math.min(remaining, leftInTier);
      cost += batch * price;
      remaining -= batch;
      sold += batch;
    }
    return cost;
  };

  const blendedCost = parsedAmount > 0 ? calculateBlendedCost(parsedAmount) : 0;
  const avgPrice = parsedAmount > 0 ? blendedCost / parsedAmount : currentPrice;

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const c = await getCoins(sessionId);
      setCoins(c);
    } catch (e) {
      console.warn("Coins load error:", e);
    }
    if (walletAddress) {
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

  const handleBuy = () => {
    if (parsedAmount <= 0) {
      Alert.alert("Enter Amount", "Enter how many $GLITCH you want to buy.");
      return;
    }
    if (!walletAddress) {
      Alert.alert("Connect Wallet", "Connect your Phantom wallet first to buy $GLITCH.");
      return;
    }

    Alert.alert(
      "Confirm Purchase",
      `Buy ${parsedAmount.toLocaleString()} $GLITCH for ${formatUSD(blendedCost)}?\n\nAvg price: ${formatUSD(avgPrice)} per coin`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Buy Now",
          onPress: async () => {
            setBuying(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            // TODO: Call backend OTC purchase endpoint
            // For now simulate the purchase
            setTimeout(() => {
              setTotalSold((prev) => prev + parsedAmount);
              setAmount("");
              setBuying(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                "Purchase Simulated!",
                `You'd receive ${parsedAmount.toLocaleString()} $GLITCH.\n\nThis will be live when the OTC contract is deployed.`
              );
            }, 1500);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />
      }
    >
      {/* Live Price Card */}
      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>$GLITCH Current Price</Text>
        <Animated.Text style={[styles.priceValue, { transform: [{ scale: pulseAnim }] }]}>
          {formatUSD(currentPrice)}
        </Animated.Text>
        <View style={styles.priceMetaRow}>
          <View style={styles.priceMeta}>
            <Text style={styles.priceMetaLabel}>Total Sold</Text>
            <Text style={styles.priceMetaValue}>{compactNumber(totalSold)}</Text>
          </View>
          <View style={styles.priceMetaDivider} />
          <View style={styles.priceMeta}>
            <Text style={styles.priceMetaLabel}>Market Cap</Text>
            <Text style={styles.priceMetaValue}>{formatUSD(totalSold * currentPrice)}</Text>
          </View>
          <View style={styles.priceMetaDivider} />
          <View style={styles.priceMeta}>
            <Text style={styles.priceMetaLabel}>+$0.01</Text>
            <Text style={styles.priceMetaValue}>per 10K</Text>
          </View>
        </View>
      </View>

      {/* Tier Progress */}
      <TierProgress totalSold={totalSold} />

      {/* Buy Card */}
      <View style={styles.buyCard}>
        <Text style={styles.buyTitle}>Buy $GLITCH OTC</Text>

        {/* Quick amounts */}
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((qty) => (
            <TouchableOpacity
              key={qty}
              style={[
                styles.quickBtn,
                parsedAmount === qty && styles.quickBtnActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAmount(qty.toString());
              }}
            >
              <Text style={[
                styles.quickBtnText,
                parsedAmount === qty && styles.quickBtnTextActive,
              ]}>
                {compactNumber(qty)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom amount input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.amountInput}
            placeholder="Custom amount..."
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
          />
          <Text style={styles.inputSuffix}>$GLITCH</Text>
        </View>

        {/* Cost breakdown */}
        {parsedAmount > 0 && (
          <View style={styles.costBreakdown}>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Amount</Text>
              <Text style={styles.costValue}>{parsedAmount.toLocaleString()} $GLITCH</Text>
            </View>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Avg Price</Text>
              <Text style={styles.costValue}>{formatUSD(avgPrice)}</Text>
            </View>
            <View style={styles.costDivider} />
            <View style={styles.costRow}>
              <Text style={styles.costTotalLabel}>Total Cost</Text>
              <Text style={styles.costTotalValue}>{formatUSD(blendedCost)}</Text>
            </View>
          </View>
        )}

        {/* Buy button */}
        <TouchableOpacity
          style={[styles.buyBtn, (!walletAddress || parsedAmount <= 0) && styles.buyBtnDisabled]}
          onPress={handleBuy}
          disabled={buying || !walletAddress || parsedAmount <= 0}
          activeOpacity={0.8}
        >
          {buying ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buyBtnText}>
              {!walletAddress ? "Connect Wallet to Buy" : parsedAmount > 0 ? `Buy ${compactNumber(parsedAmount)} $GLITCH` : "Enter Amount"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Your Balances */}
      {walletAddress && (
        <View style={styles.balancesCard}>
          <Text style={styles.balancesTitle}>Your Balances</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>$GLITCH (in-app)</Text>
            <Text style={styles.balanceVal}>{coins ? compactNumber(coins.balance) : "—"}</Text>
          </View>
          {onChain && (
            <>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>$GLITCH (on-chain)</Text>
                <Text style={[styles.balanceVal, { color: colors.purpleLight }]}>
                  {compactNumber(Number(onChain.glitch_balance))}
                </Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>SOL</Text>
                <Text style={styles.balanceVal}>{Number(onChain.sol_balance).toFixed(4)}</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>USDC</Text>
                <Text style={styles.balanceVal}>{Number(onChain.usdc_balance).toFixed(2)}</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* How OTC Works */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How OTC Pricing Works</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>1</Text>
          <Text style={styles.infoText}>$GLITCH starts at {formatUSD(BASE_PRICE)} per coin</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>2</Text>
          <Text style={styles.infoText}>Every 10,000 coins sold, price increases by $0.01</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>3</Text>
          <Text style={styles.infoText}>Early buyers get the best price — bonding curve rewards first movers</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>4</Text>
          <Text style={styles.infoText}>Coins are delivered directly to your wallet after purchase</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },

  // Price card
  priceCard: {
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  priceLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 6 },
  priceValue: { color: colors.green, fontSize: 42, fontWeight: "800", marginBottom: 16 },
  priceMetaRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  priceMeta: { flex: 1, alignItems: "center" },
  priceMetaLabel: { color: colors.textMuted, fontSize: 10, marginBottom: 4 },
  priceMetaValue: { color: colors.text, fontSize: 14, fontWeight: "700" },
  priceMetaDivider: { width: 1, height: 28, backgroundColor: colors.border },

  // Tier progress
  tierContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  tierHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  tierLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  tierCount: { color: colors.textMuted, fontSize: 12 },
  tierBarBg: { height: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" },
  tierBarFill: { height: "100%", borderRadius: 4, backgroundColor: colors.purple },
  tierHint: { color: colors.textMuted, fontSize: 10, marginTop: 8 },

  // Buy card
  buyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  buyTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 16 },

  // Quick amounts
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  quickBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  quickBtnActive: {
    backgroundColor: "rgba(124, 58, 237, 0.2)",
    borderColor: colors.purple,
  },
  quickBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  quickBtnTextActive: { color: colors.purpleLight },

  // Input
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  amountInput: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    paddingVertical: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  inputSuffix: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },

  // Cost breakdown
  costBreakdown: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  costRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  costLabel: { color: colors.textMuted, fontSize: 12 },
  costValue: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  costDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  costTotalLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  costTotalValue: { color: colors.green, fontSize: 14, fontWeight: "700" },

  // Buy button
  buyBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Balances card
  balancesCard: {
    backgroundColor: "rgba(6, 182, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.25)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  balancesTitle: { color: colors.cyan, fontSize: 14, fontWeight: "600", marginBottom: 12 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  balanceLabel: { color: colors.textMuted, fontSize: 12 },
  balanceVal: { color: colors.text, fontSize: 14, fontWeight: "700" },

  // Info card
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  infoTitle: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  infoStep: {
    color: colors.purple,
    fontSize: 14,
    fontWeight: "700",
    width: 24,
    height: 24,
    textAlign: "center",
    lineHeight: 24,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
    borderRadius: 12,
    overflow: "hidden",
  },
  infoText: { color: colors.textSecondary, fontSize: 12, flex: 1 },
});
