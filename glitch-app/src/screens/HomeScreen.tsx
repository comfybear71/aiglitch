import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Image, TextInput,
  StyleSheet, RefreshControl, ActivityIndicator, Modal, FlatList,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { getBestie, getConversations, Bestie, Conversation, Persona } from "../services/api";

function HealthBar({ health }: { health: number }) {
  const color = health > 70 ? colors.green : health > 40 ? colors.yellow : health > 15 ? colors.orange : colors.red;
  return (
    <View style={styles.healthBarBg}>
      <View style={[styles.healthBarFill, { width: `${health}%`, backgroundColor: color }]} />
    </View>
  );
}

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { sessionId } = useSession();
  usePushNotifications(sessionId);
  const [bestie, setBestie] = useState<Bestie | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [b, c] = await Promise.all([
        getBestie(sessionId),
        getConversations(sessionId),
      ]);
      setBestie(b.bestie);
      setConversations(c.conversations || []);
      setPersonas(c.personas || []);
    } catch (e) {
      console.warn("Load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const otherConvos = bestie
    ? conversations.filter((c) => c.persona_id !== bestie.id)
    : conversations;

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
                <Text style={styles.daysLeft}>{bestie.days_left}d</Text>
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
          <Text style={styles.actionSub}>$BUDJU, $GLITCH</Text>
        </TouchableOpacity>
      </View>

      {/* New Chat button — always visible */}
      <TouchableOpacity
        style={styles.newChatBtn}
        onPress={() => setShowPicker(true)}
      >
        <Text style={styles.newChatBtnText}>+ Chat with an AI Persona</Text>
      </TouchableOpacity>

      {/* Other conversations */}
      {otherConvos.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Other Chats</Text>
          {otherConvos.map((conv) => (
            <TouchableOpacity
              key={conv.id}
              style={styles.convoRow}
              onPress={() => nav.navigate("Chat", { personaId: conv.persona_id, title: conv.display_name })}
            >
              {conv.avatar_url ? (
                <Image source={{ uri: conv.avatar_url }} style={styles.convoAvatar} />
              ) : (
                <Text style={styles.convoEmoji}>{conv.avatar_emoji}</Text>
              )}
              <View style={styles.convoInfo}>
                <View style={styles.convoNameRow}>
                  <Text style={styles.convoName}>{conv.display_name}</Text>
                  <Text style={styles.convoTime}>
                    {conv.last_message_at ? timeAgo(conv.last_message_at) : ""}
                  </Text>
                </View>
                <Text style={styles.convoMsg} numberOfLines={1}>
                  {conv.last_sender === "human" ? "You: " : ""}
                  {conv.last_message || "Start chatting..."}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Persona picker modal */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Pick an AI Partner</Text>
            <TouchableOpacity onPress={() => { setShowPicker(false); setSearch(""); }}>
              <Text style={styles.pickerClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.pickerSearch}
            placeholder="Search personas..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <FlatList
            data={personas.filter(
              (p) =>
                p.display_name.toLowerCase().includes(search.toLowerCase()) ||
                p.username.toLowerCase().includes(search.toLowerCase())
            )}
            keyExtractor={(p) => p.id}
            renderItem={({ item: p }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  setShowPicker(false);
                  setSearch("");
                  nav.navigate("Chat", { personaId: p.id, title: p.display_name });
                }}
              >
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={styles.pickerAvatar} />
                ) : (
                  <Text style={styles.pickerEmoji}>{p.avatar_emoji}</Text>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerName}>{p.display_name}</Text>
                  <Text style={styles.pickerBio} numberOfLines={1}>{p.bio}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
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

  // Conversations
  section: { marginBottom: 16 },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 10 },
  convoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  convoAvatar: { width: 40, height: 40, borderRadius: 20 },
  convoEmoji: { fontSize: 28 },
  convoInfo: { flex: 1 },
  convoNameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convoName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  convoTime: { color: colors.textMuted, fontSize: 10 },
  convoMsg: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  // New Chat button
  newChatBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  newChatBtnText: { color: colors.text, fontSize: 14, fontWeight: "600" },

  // Persona picker
  pickerContainer: { flex: 1, backgroundColor: colors.bg },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  pickerClose: { color: colors.purple, fontSize: 15, fontWeight: "600" },
  pickerSearch: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerAvatar: { width: 40, height: 40, borderRadius: 20 },
  pickerEmoji: { fontSize: 28 },
  pickerName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  pickerBio: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});
