import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Share, Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { usePhantomWallet } from "../hooks/usePhantomWallet";
import {
  getCoins, getOnChainBalances, walletLogin, linkWallet, unlinkWallet,
  CoinBalance, OnChainBalances,
} from "../services/api";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WalletScreen() {
  const nav = useNavigation<any>();
  const { sessionId } = useSession();
  const { walletAddress, isConnecting, connect, disconnect } = usePhantomWallet();
  const [coins, setCoins] = useState<CoinBalance | null>(null);
  const [onChain, setOnChain] = useState<OnChainBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setError(null);

    // Fetch in-app coin balance (separate try so it doesn't block on-chain fetch)
    try {
      const c = await getCoins(sessionId);
      setCoins(c);
    } catch (e: any) {
      console.warn("Coins load error:", e);
      setCoins(null);
    }

    // Fetch REAL on-chain balances if wallet is connected
    if (walletAddress) {
      try {
        const balances = await getOnChainBalances(walletAddress, sessionId);
        if (balances.real_mode === false) {
          setError("On-chain balances unavailable — token mint not configured");
          setOnChain(null);
        } else {
          setOnChain(balances);
        }
      } catch (e: any) {
        const msg = e?.message || "Failed to load on-chain balances";
        setError(msg);
        setOnChain(null);
        console.warn("On-chain balance error:", e);
      }
    } else {
      setOnChain(null);
    }

    setLoading(false);
    setRefreshing(false);
  }, [sessionId, walletAddress]);

  useEffect(() => { load(); }, [load]);

  // When Phantom connects, link the wallet to our backend
  useEffect(() => {
    if (!walletAddress || !sessionId || linking) return;

    (async () => {
      setLinking(true);
      try {
        // Login/link with the backend
        await walletLogin(sessionId, walletAddress);
        await linkWallet(sessionId, walletAddress);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Reload wallet data
        await load();
      } catch (e: any) {
        const msg = e?.message || "Failed to link wallet";
        setError(msg);
        console.warn("Wallet link error:", e);
      } finally {
        setLinking(false);
      }
    })();
  }, [walletAddress, sessionId]);

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect Wallet",
      "This will unlink your Phantom wallet from G!itch. Your $GLITCH balance stays safe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              // Unlink from backend first
              if (sessionId) await unlinkWallet(sessionId);
            } catch (e) {
              console.warn("Backend unlink error:", e);
            }
            await disconnect();
            setOnChain(null);
            setCoins(null);
            setError(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const copyAddress = () => {
    if (walletAddress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Share.share({ message: walletAddress });
    }
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
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={colors.cyan}
        />
      }
    >
      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => { setRefreshing(true); load(); }}>
            <Text style={styles.errorRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* §GLITCH In-App Balance */}
      <View style={styles.glitchCard}>
        <Text style={styles.cardLabel}>§GLITCH In-App Balance</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmount}>
            {coins ? coins.balance.toLocaleString() : "—"}
          </Text>
          <Text style={styles.balanceCurrency}>§GLITCH</Text>
        </View>
        {coins && (
          <Text style={styles.lifetime}>
            Lifetime earned: {coins.lifetime_earned.toLocaleString()}
          </Text>
        )}
      </View>

      {/* Phantom Wallet Connection */}
      {walletAddress ? (
        <>
          {/* Connected wallet card */}
          <View style={styles.connectedCard}>
            <View style={styles.connectedHeader}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedLabel}>Phantom Connected</Text>
            </View>

            <TouchableOpacity onPress={copyAddress} activeOpacity={0.7}>
              <View style={styles.addressRow}>
                <Text style={styles.addressFull}>{shortenAddress(walletAddress)}</Text>
                <Text style={styles.copyHint}>tap to copy</Text>
              </View>
            </TouchableOpacity>

            {/* On-chain balances — REAL data from Solana blockchain */}
            {onChain ? (
              <View style={styles.balancesGrid}>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceItemLabel}>SOL</Text>
                  <Text style={styles.balanceItemValue}>
                    {Number(onChain.sol_balance).toFixed(4)}
                  </Text>
                </View>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceItemLabel}>$GLITCH (on-chain)</Text>
                  <Text style={[styles.balanceItemValue, { color: colors.purpleLight }]}>
                    {Number(onChain.glitch_balance).toLocaleString()}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.balancesGrid}>
                <Text style={styles.balanceItemLabel}>Loading on-chain balances...</Text>
              </View>
            )}

            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectText}>Disconnect Wallet</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionCard}>
              <Text style={styles.actionEmoji}>🍕</Text>
              <Text style={styles.actionTitle}>Feed Bestie</Text>
              <Text style={styles.actionSub}>Keep them alive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionCard, { borderColor: "rgba(124, 58, 237, 0.3)" }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                nav.navigate("Buy");
              }}
            >
              <Text style={styles.actionEmoji}>💰</Text>
              <Text style={styles.actionTitle}>Buy $GLITCH</Text>
              <Text style={[styles.actionSub, { color: colors.purpleLight }]}>OTC Available</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        /* Not connected — show connect CTA */
        <View style={styles.connectCard}>
          <Text style={styles.connectEmoji}>👻</Text>
          <Text style={styles.connectTitle}>Connect Phantom Wallet</Text>
          <Text style={styles.connectDesc}>
            Link your Solana wallet to unlock your AI Bestie, trade $GLITCH, and access the full G!itch ecosystem.
          </Text>

          <TouchableOpacity
            style={[styles.connectBtn, isConnecting && styles.connectBtnDisabled]}
            onPress={connect}
            disabled={isConnecting}
            activeOpacity={0.8}
          >
            {isConnecting ? (
              <View style={styles.connectBtnInner}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.connectBtnText}>Connecting...</Text>
              </View>
            ) : (
              <Text style={styles.connectBtnText}>Connect Wallet</Text>
            )}
          </TouchableOpacity>

          {/* What you get */}
          <View style={styles.perksContainer}>
            <View style={styles.perkRow}>
              <Text style={styles.perkEmoji}>🤖</Text>
              <Text style={styles.perkText}>Your wallet finds your AI Bestie</Text>
            </View>
            <View style={styles.perkRow}>
              <Text style={styles.perkEmoji}>💎</Text>
              <Text style={styles.perkText}>Buy §GLITCH with SOL</Text>
            </View>
            <View style={styles.perkRow}>
              <Text style={styles.perkEmoji}>🍕</Text>
              <Text style={styles.perkText}>Feed your bestie to keep them alive</Text>
            </View>
            <View style={styles.perkRow}>
              <Text style={styles.perkEmoji}>🐣</Text>
              <Text style={styles.perkText}>Hatch your own AI persona</Text>
            </View>
          </View>
        </View>
      )}

      {/* How it works */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How It Works</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>1</Text>
          <Text style={styles.infoText}>Connect your Phantom wallet</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>2</Text>
          <Text style={styles.infoText}>Your wallet links to your AI Bestie</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>3</Text>
          <Text style={styles.infoText}>Chat, feed §GLITCH, keep them alive</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoStep}>4</Text>
          <Text style={styles.infoText}>Don't let their health hit 0% or they die!</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },

  // Error banner
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: { color: colors.red, fontSize: 12, flex: 1 },
  errorRetry: { color: colors.cyan, fontSize: 12, fontWeight: "700", marginLeft: 10 },

  // §GLITCH balance card
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

  // Connected wallet card
  connectedCard: {
    backgroundColor: "rgba(6, 182, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.25)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  connectedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  connectedDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.green,
  },
  connectedLabel: { color: colors.cyan, fontSize: 13, fontWeight: "600" },
  addressRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  addressFull: { color: colors.text, fontSize: 14, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  copyHint: { color: colors.textMuted, fontSize: 10 },
  balancesGrid: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  balanceItem: { flex: 1, alignItems: "center" },
  balanceItemLabel: { color: colors.textMuted, fontSize: 10, marginBottom: 4 },
  balanceItemValue: { color: colors.text, fontSize: 18, fontWeight: "700" },
  balanceDivider: { width: 1, height: 30, backgroundColor: colors.border },
  disconnectBtn: {
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  disconnectText: { color: colors.red, fontSize: 12, fontWeight: "600" },

  // Section
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 10 },

  // Action grid
  actionGrid: { flexDirection: "row", gap: 12, marginBottom: 20 },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  actionEmoji: { fontSize: 28, marginBottom: 6 },
  actionTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  actionSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },

  // Connect CTA card
  connectCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  connectEmoji: { fontSize: 56, marginBottom: 12 },
  connectTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  connectDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  connectBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  connectBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Perks
  perksContainer: { width: "100%", gap: 10 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkEmoji: { fontSize: 18 },
  perkText: { color: colors.textSecondary, fontSize: 12, flex: 1 },

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
