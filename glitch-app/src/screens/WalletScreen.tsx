import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { getCoins, getWallet, CoinBalance, WalletData } from "../services/api";

export default function WalletScreen() {
  const { sessionId } = useSession();
  const [coins, setCoins] = useState<CoinBalance | null>(null);
  const [wallet, setWallet] = useState<WalletData["wallet"]>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [c, w] = await Promise.all([
        getCoins(sessionId),
        getWallet(sessionId),
      ]);
      setCoins(c);
      setWallet(w.wallet);
    } catch (e) {
      console.warn("Wallet error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}
    >
      {/* In-app GLITCH balance */}
      <View style={styles.glitchCard}>
        <Text style={styles.cardLabel}>In-App Balance</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmount}>
            {coins ? coins.balance.toLocaleString() : "0"}
          </Text>
          <Text style={styles.balanceCurrency}>§GLITCH</Text>
        </View>
        {coins && (
          <Text style={styles.lifetime}>
            Lifetime earned: {coins.lifetime_earned.toLocaleString()}
          </Text>
        )}
      </View>

      {/* On-chain wallet */}
      <View style={styles.walletCard}>
        <Text style={styles.cardLabel}>Solana Wallet</Text>
        {wallet ? (
          <View style={styles.walletRows}>
            <View style={styles.walletRow}>
              <Text style={styles.tokenLabel}>SOL</Text>
              <Text style={styles.tokenValue}>{Number(wallet.sol_balance).toFixed(4)}</Text>
            </View>
            <View style={styles.walletRow}>
              <Text style={styles.tokenLabel}>§GLITCH (on-chain)</Text>
              <Text style={[styles.tokenValue, { color: colors.purpleLight }]}>
                {Number(wallet.glitch_token_balance).toLocaleString()}
              </Text>
            </View>
            <View style={styles.divider} />
            <Text style={styles.walletAddress} numberOfLines={1}>{wallet.address}</Text>
          </View>
        ) : (
          <View style={styles.noWallet}>
            <Text style={styles.noWalletText}>
              Connect via the web app to see on-chain balances
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          Full wallet features (send, swap, bridge) available at aiglitch.app/wallet
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },

  glitchCard: {
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 6 },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  balanceAmount: { color: colors.text, fontSize: 32, fontWeight: "700" },
  balanceCurrency: { color: colors.purpleLight, fontSize: 14, marginBottom: 4 },
  lifetime: { color: colors.textMuted, fontSize: 10, marginTop: 6 },

  walletCard: {
    backgroundColor: "rgba(6, 182, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.2)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  walletRows: { gap: 12 },
  walletRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tokenLabel: { color: colors.textSecondary, fontSize: 12 },
  tokenValue: { color: colors.text, fontSize: 14, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border },
  walletAddress: { color: colors.textMuted, fontSize: 10 },
  noWallet: { paddingVertical: 16, alignItems: "center" },
  noWalletText: { color: colors.textMuted, fontSize: 12, textAlign: "center" },

  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  infoText: { color: colors.textMuted, fontSize: 11, textAlign: "center" },
});
