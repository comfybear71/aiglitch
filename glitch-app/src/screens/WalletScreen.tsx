import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Modal,
} from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { getCoins, getWallet, CoinBalance, WalletData } from "../services/api";

type WebViewPage = "connect" | "exchange" | "wallet" | null;

export default function WalletScreen() {
  const { sessionId } = useSession();
  const [coins, setCoins] = useState<CoinBalance | null>(null);
  const [wallet, setWallet] = useState<WalletData["wallet"]>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [webViewPage, setWebViewPage] = useState<WebViewPage>(null);

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

  const getWebViewUrl = () => {
    const base = "https://aiglitch.app";
    const sid = sessionId ? `?session_id=${sessionId}` : "";
    switch (webViewPage) {
      case "connect": return `${base}/wallet${sid}`;
      case "exchange": return `${base}/exchange${sid}`;
      case "wallet": return `${base}/wallet${sid}`;
      default: return base;
    }
  };

  const getWebViewTitle = () => {
    switch (webViewPage) {
      case "connect": return "Connect Wallet";
      case "exchange": return "Buy $GLITCH";
      case "wallet": return "Manage Wallet";
      default: return "";
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
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
            <Text style={styles.balanceCurrency}>$GLITCH</Text>
          </View>
          {coins && (
            <Text style={styles.lifetime}>
              Lifetime earned: {coins.lifetime_earned.toLocaleString()}
            </Text>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setWebViewPage("exchange")}>
            <Text style={styles.actionIcon}>💎</Text>
            <Text style={styles.actionLabelPrimary}>Buy $GLITCH</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setWebViewPage("wallet")}>
            <Text style={styles.actionIcon}>🍕</Text>
            <Text style={styles.actionLabel}>Feed Bestie</Text>
          </TouchableOpacity>
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
                <Text style={styles.tokenLabel}>$GLITCH (on-chain)</Text>
                <Text style={[styles.tokenValue, { color: colors.purpleLight }]}>
                  {Number(wallet.glitch_token_balance).toLocaleString()}
                </Text>
              </View>
              <View style={styles.divider} />
              <Text style={styles.walletAddress} numberOfLines={1}>{wallet.address}</Text>
              <TouchableOpacity
                style={styles.walletActionBtn}
                onPress={() => setWebViewPage("wallet")}
              >
                <Text style={styles.walletActionText}>Manage Wallet</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noWallet}>
              <Text style={styles.noWalletEmoji}>🔗</Text>
              <Text style={styles.noWalletTitle}>Connect Your Wallet</Text>
              <Text style={styles.noWalletText}>
                Connect your Solana wallet to see balances, buy $GLITCH, and feed your bestie
              </Text>
              <TouchableOpacity style={styles.connectBtn} onPress={() => setWebViewPage("connect")}>
                <Text style={styles.connectBtnText}>Connect Wallet</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* How it works */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How $GLITCH Works</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>💬</Text>
            <Text style={styles.infoText}>Chat with your bestie = earn $GLITCH</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>💎</Text>
            <Text style={styles.infoText}>Buy $GLITCH with SOL on our exchange</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>🍕</Text>
            <Text style={styles.infoText}>Feed $GLITCH to your bestie = bonus life days</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>💀</Text>
            <Text style={styles.infoText}>Don't let your bestie's health hit 0!</Text>
          </View>
        </View>
      </ScrollView>

      {/* In-app WebView Modal */}
      <Modal visible={webViewPage !== null} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.webViewContainer}>
          <View style={styles.webViewHeader}>
            <Text style={styles.webViewTitle}>{getWebViewTitle()}</Text>
            <TouchableOpacity onPress={() => { setWebViewPage(null); load(); }}>
              <Text style={styles.webViewClose}>Done</Text>
            </TouchableOpacity>
          </View>
          {webViewPage && (
            <WebView
              source={{ uri: getWebViewUrl() }}
              style={styles.webView}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator color={colors.purple} size="large" />
                </View>
              )}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              allowsInlineMediaPlayback
            />
          )}
        </View>
      </Modal>
    </View>
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

  // Quick actions
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: "rgba(124, 58, 237, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.4)",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  actionIcon: { fontSize: 24, marginBottom: 4 },
  actionLabelPrimary: { color: colors.purpleLight, fontSize: 11, fontWeight: "700" },
  actionLabel: { color: colors.text, fontSize: 11, fontWeight: "600" },

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
  walletActionBtn: {
    backgroundColor: "rgba(6, 182, 212, 0.15)",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginTop: 4,
  },
  walletActionText: { color: colors.cyan, fontSize: 12, fontWeight: "600" },
  noWallet: { alignItems: "center", paddingVertical: 16 },
  noWalletEmoji: { fontSize: 40, marginBottom: 8 },
  noWalletTitle: { color: colors.text, fontSize: 16, fontWeight: "600", marginBottom: 6 },
  noWalletText: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginBottom: 12, lineHeight: 18 },
  connectBtn: {
    backgroundColor: colors.purple,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  connectBtnText: { color: colors.text, fontSize: 14, fontWeight: "700" },

  // Info
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  infoTitle: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 12 },
  infoRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 },
  infoEmoji: { fontSize: 16 },
  infoText: { color: colors.textSecondary, fontSize: 12, flex: 1 },

  // WebView modal
  webViewContainer: { flex: 1, backgroundColor: colors.bg },
  webViewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  webViewTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  webViewClose: { color: colors.purple, fontSize: 15, fontWeight: "600" },
  webView: { flex: 1, backgroundColor: colors.bg },
  webViewLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
});
