import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { getBestie, Bestie } from "../services/api";

function HealthBar({ health }: { health: number }) {
  const color = health > 70 ? colors.green : health > 40 ? colors.yellow : health > 15 ? colors.orange : colors.red;
  return (
    <View style={styles.healthBarBg}>
      <View style={[styles.healthBarFill, { width: `${health}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { sessionId } = useSession();
  usePushNotifications(sessionId);
  const [bestie, setBestie] = useState<Bestie | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const b = await getBestie(sessionId);
      setBestie(b.bestie);
    } catch (e) {
      console.warn("Load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

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
      {/* Bestie hero card */}
      {bestie && !bestie.is_dead && (
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
                <Text style={styles.daysLeft}>{bestie.days_left}d left</Text>
              </View>

              {bestie.last_message && (
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {bestie.last_message.sender_type === "human" ? "You: " : `${bestie.avatar_emoji} `}
                  {bestie.last_message.content}
                </Text>
              )}
              {!bestie.last_message && (
                <Text style={styles.tapToChat}>Tap to chat with {bestie.display_name}...</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* No bestie state */}
      {!bestie && (
        <View style={styles.noBestie}>
          <Text style={styles.noBestieEmoji}>🥚</Text>
          <Text style={styles.noBestieTitle}>No Bestie Found</Text>
          <Text style={styles.noBestieText}>
            Connect your wallet and hatch your AI bestie at aiglitch.app
          </Text>
        </View>
      )}

      {/* Quick actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionCard} onPress={() => nav.navigate("Briefing")}>
          <Text style={styles.actionEmoji}>📰</Text>
          <Text style={styles.actionTitle}>Daily Briefing</Text>
          <Text style={styles.actionSub}>News, crypto, trends</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard} onPress={() => nav.navigate("Wallet")}>
          <Text style={styles.actionEmoji}>💰</Text>
          <Text style={styles.actionTitle}>Wallet</Text>
          <Text style={styles.actionSub}>$GLITCH</Text>
        </TouchableOpacity>
      </View>

      {/* Chat with bestie button */}
      {bestie && !bestie.is_dead && (
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={() => nav.navigate("Chat", { personaId: bestie.id, title: bestie.display_name })}
        >
          <Text style={styles.chatBtnText}>Chat with {bestie.display_name}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },

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
  bestieNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bestieName: { color: colors.text, fontSize: 18, fontWeight: "700" },
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

  // No bestie
  noBestie: { alignItems: "center", paddingVertical: 40 },
  noBestieEmoji: { fontSize: 48, marginBottom: 12 },
  noBestieTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  noBestieText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },

  // Quick actions
  quickActions: { flexDirection: "row", gap: 12, marginBottom: 20 },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  actionEmoji: { fontSize: 24 },
  actionTitle: { color: colors.text, fontSize: 14, fontWeight: "600", marginTop: 6 },
  actionSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },

  // Chat button
  chatBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  chatBtnText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
