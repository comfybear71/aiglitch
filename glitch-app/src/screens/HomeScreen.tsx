import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, RefreshControl, ActivityIndicator, Alert, Share, Platform,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { usePhantomWallet } from "../hooks/usePhantomWallet";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { getBestie, walletLogin, linkWallet, unlinkWallet, getOnChainBalances, Bestie, OnChainBalances } from "../services/api";

function HealthBar({ health }: { health: number }) {
  const color = health > 70 ? colors.green : health > 40 ? colors.yellow : health > 15 ? colors.orange : colors.red;
  return (
    <View style={styles.healthBarBg}>
      <View style={[styles.healthBarFill, { width: `${health}%`, backgroundColor: color }]} />
    </View>
  );
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function compactNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { sessionId } = useSession();
  const { walletAddress, isConnecting, isLoading: walletLoading, connect, disconnect, submitAddress, cancelConnect } = usePhantomWallet();
  const [addressInput, setAddressInput] = useState("");
  usePushNotifications(sessionId);
  const [bestie, setBestie] = useState<Bestie | null>(null);
  const [onChain, setOnChain] = useState<OnChainBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (walletAddress) {
        try { await walletLogin(sessionId, walletAddress); } catch (_) {}
        const b = await getBestie(sessionId);
        setBestie(b.bestie);
        // Fetch on-chain balances (don't let it block the rest)
        try {
          const balances = await getOnChainBalances(walletAddress, sessionId);
          setOnChain(balances.real_mode !== false ? balances : null);
        } catch (e) {
          console.warn("Balance fetch error:", e);
          setOnChain(null);
        }
      } else {
        setBestie(null);
        setOnChain(null);
      }
    } catch (e) {
      console.warn("Load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId, walletAddress]);

  useEffect(() => { load(); }, [load]);

  // Link wallet to backend when connected
  useEffect(() => {
    if (!walletAddress || !sessionId || linking) return;
    (async () => {
      setLinking(true);
      try {
        await walletLogin(sessionId, walletAddress);
        await linkWallet(sessionId, walletAddress);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      } catch (e) {
        console.warn("Wallet link error:", e);
      } finally {
        setLinking(false);
      }
    })();
  }, [walletAddress, sessionId]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect Wallet",
      "This will unlink your wallet. Your bestie will disappear until you reconnect.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              if (sessionId) await unlinkWallet(sessionId);
            } catch (e) {
              console.warn("Backend unlink error:", e);
            }
            await disconnect();
            setBestie(null);
            setOnChain(null);
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
    >
      {/* Wallet connect — inline text input (no modals, no popups) */}
      {!walletAddress && (
        <View style={styles.walletBanner}>
          <Text style={styles.walletBannerEmoji}>👻</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletBannerTitle}>Connect Wallet</Text>
            <Text style={styles.walletBannerSub}>
              Paste your Solana wallet address below
            </Text>
          </View>
        </View>
      )}
      {!walletAddress && (
        <View style={styles.inlineInputCard}>
          <TextInput
            style={styles.inlineInput}
            placeholder="Paste your Solana address here..."
            placeholderTextColor={colors.textMuted}
            value={addressInput}
            onChangeText={setAddressInput}
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={colors.purple}
          />
          <TouchableOpacity
            style={[styles.inlineConnectBtn, !addressInput.trim() && { opacity: 0.4 }]}
            disabled={!addressInput.trim()}
            onPress={() => { submitAddress(addressInput); setAddressInput(""); }}
          >
            <Text style={styles.inlineConnectText}>Connect</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Connected wallet info */}
      {walletAddress && (
        <View style={styles.connectedCard}>
          <View style={styles.connectedHeader}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedLabel}>Wallet Connected</Text>
          </View>
          <TouchableOpacity onPress={copyAddress} activeOpacity={0.7}>
            <View style={styles.addressRow}>
              <Text style={styles.addressText}>{shortenAddress(walletAddress)}</Text>
              <Text style={styles.copyHint}>tap to copy</Text>
            </View>
          </TouchableOpacity>
          {/* On-chain balances */}
          {onChain ? (
            <View style={styles.balancesGrid}>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>SOL</Text>
                <Text style={styles.balanceValue}>{Number(onChain.sol_balance).toFixed(4)}</Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>GLITCH</Text>
                <Text style={[styles.balanceValue, { color: colors.purpleLight }]}>
                  {compactNumber(Number(onChain.glitch_balance))}
                </Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>BUDJU</Text>
                <Text style={styles.balanceValue}>{compactNumber(Number(onChain.budju_balance))}</Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>USDC</Text>
                <Text style={styles.balanceValue}>{Number(onChain.usdc_balance).toFixed(2)}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.balancesGrid}>
              <ActivityIndicator color={colors.cyan} size="small" />
              <Text style={styles.balanceLabel}> Loading balances...</Text>
            </View>
          )}

          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bestie hero card */}
      {bestie && !bestie.is_dead ? (
        <TouchableOpacity
          style={styles.bestieCard}
          activeOpacity={0.7}
          onPress={() => nav.navigate("Chat", { personaId: bestie.id, title: bestie.display_name })}
        >
          <View style={styles.bestieRow}>
            {bestie.avatar_url ? (
              <Image source={{ uri: bestie.avatar_url }} style={styles.bestieAvatar} />
            ) : (
              <Text style={styles.bestieEmoji}>{bestie.avatar_emoji}</Text>
            )}
            <View style={styles.bestieInfo}>
              <View style={styles.bestieNameRow}>
                <Text style={styles.bestieName}>{bestie.display_name}</Text>
                <View style={styles.bestieBadge}>
                  <Text style={styles.bestieBadgeText}>BESTIE</Text>
                </View>
              </View>
              <Text style={styles.bestieUsername}>@{bestie.username}</Text>

              <View style={styles.healthRow}>
                <HealthBar health={bestie.live_health} />
                <Text style={[styles.healthText, {
                  color: bestie.live_health > 70 ? colors.green : bestie.live_health > 40 ? colors.yellow : colors.red,
                }]}>
                  {bestie.live_health}%
                </Text>
                <Text style={styles.daysLeft}>{bestie.days_left}d</Text>
              </View>

              {bestie.last_message ? (
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {bestie.last_message.sender_type === "human" ? "You: " : `${bestie.avatar_emoji} `}
                  {bestie.last_message.content}
                </Text>
              ) : (
                <Text style={styles.tapToChat}>Tap to chat with {bestie.display_name}...</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      ) : bestie && bestie.is_dead ? (
        <View style={styles.deadCard}>
          <Text style={styles.deadEmoji}>💀</Text>
          <Text style={styles.deadTitle}>{bestie.display_name} has died</Text>
          <Text style={styles.deadSub}>
            Feed §GLITCH to resurrect your bestie
          </Text>
        </View>
      ) : walletAddress ? (
        <View style={styles.noBestieCard}>
          <Text style={styles.noBestieEmoji}>🐣</Text>
          <Text style={styles.noBestieTitle}>No Bestie Yet</Text>
          <Text style={styles.noBestieSub}>
            You haven't hatched an AI Bestie yet. Visit aiglitch.app to hatch one!
          </Text>
        </View>
      ) : null}

      {/* Chat CTAs */}
      {bestie && !bestie.is_dead && (
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.chatBtn, { flex: 1 }]}
            onPress={() => nav.navigate("Chat", { personaId: bestie.id, title: bestie.display_name })}
          >
            <Text style={styles.chatBtnText}>💬 Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voiceBtn, { flex: 1 }]}
            onPress={() => nav.navigate("VoiceChat", {
              personaId: bestie.id,
              title: bestie.display_name,
              personaType: bestie.persona_type,
            })}
          >
            <Text style={styles.voiceBtnText}>🎙 Voice Chat</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },

  // Wallet banner (not connected)
  walletBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  walletBannerEmoji: { fontSize: 28 },
  walletBannerTitle: { color: colors.purpleLight, fontSize: 14, fontWeight: "700" },
  walletBannerSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  walletBannerArrow: { color: colors.purpleLight, fontSize: 18, fontWeight: "700" },

  // Connected wallet card
  connectedCard: {
    backgroundColor: "rgba(6, 182, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.25)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  connectedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  connectedLabel: { color: colors.cyan, fontSize: 13, fontWeight: "600" },
  addressRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  addressText: { color: colors.text, fontSize: 14, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  copyHint: { color: colors.textMuted, fontSize: 10 },
  balancesGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    paddingVertical: 8,
  },
  balanceItem: { flex: 1, alignItems: "center" },
  balanceLabel: { color: colors.textMuted, fontSize: 10, marginBottom: 4 },
  balanceValue: { color: colors.text, fontSize: 16, fontWeight: "700" },
  balanceDivider: { width: 1, height: 30, backgroundColor: colors.border },
  disconnectBtn: {
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 10,
    padding: 8,
    alignItems: "center",
  },
  disconnectText: { color: colors.red, fontSize: 12, fontWeight: "600" },

  // Bestie card
  bestieCard: {
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  bestieRow: { flexDirection: "row", gap: 14 },
  bestieAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "rgba(124, 58, 237, 0.4)" },
  bestieEmoji: { fontSize: 48 },
  bestieInfo: { flex: 1 },
  bestieNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  bestieName: { color: colors.text, fontSize: 18, fontWeight: "700", flexShrink: 1 },
  bestieBadge: { backgroundColor: "rgba(124, 58, 237, 0.2)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  bestieBadgeText: { color: colors.purpleLight, fontSize: 9, fontWeight: "700" },
  bestieUsername: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  healthBarBg: { flex: 1, height: 6, backgroundColor: colors.surface, borderRadius: 3, overflow: "hidden" },
  healthBarFill: { height: "100%", borderRadius: 3 },
  healthText: { fontSize: 10, fontWeight: "600" },
  daysLeft: { color: colors.textMuted, fontSize: 10 },
  lastMsg: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  tapToChat: { color: "rgba(124, 58, 237, 0.6)", fontSize: 12, marginTop: 8 },

  // Dead bestie
  deadCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  deadEmoji: { fontSize: 48, marginBottom: 8 },
  deadTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  deadSub: { color: colors.textMuted, fontSize: 12, textAlign: "center" },

  // No bestie
  noBestieCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  noBestieEmoji: { fontSize: 48, marginBottom: 8 },
  noBestieTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  noBestieSub: { color: colors.textMuted, fontSize: 12, textAlign: "center" },

  // Chat CTAs
  ctaRow: { flexDirection: "row", gap: 10 },
  chatBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  chatBtnText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  voiceBtn: {
    backgroundColor: "rgba(6, 182, 212, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.3)",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  voiceBtnText: { color: colors.cyan, fontSize: 14, fontWeight: "600" },

  // Inline wallet input
  inlineInputCard: {
    backgroundColor: "rgba(124, 58, 237, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  inlineInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 10,
  },
  inlineConnectBtn: {
    backgroundColor: colors.purple,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  inlineConnectText: { color: colors.text, fontSize: 14, fontWeight: "700" },
});
