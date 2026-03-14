import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, TouchableOpacity, Image, FlatList, TextInput,
  StyleSheet, ActivityIndicator, Alert, Share, Platform,
  KeyboardAvoidingView, Keyboard,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { usePhantomWallet } from "../hooks/usePhantomWallet";
import { usePushNotifications } from "../hooks/usePushNotifications";
import {
  getBestie, walletLogin, linkWallet, unlinkWallet,
  getOnChainBalances, getMessages, sendMessage, sendImageMessage,
  Bestie, OnChainBalances, Message,
} from "../services/api";
import CosmicVisualizer from "../components/CosmicVisualizer";

const API_BASE = "https://aiglitch.app";

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
  const [walletExpanded, setWalletExpanded] = useState(false);
  usePushNotifications(sessionId);
  const [bestie, setBestie] = useState<Bestie | null>(null);
  const [onChain, setOnChain] = useState<OnChainBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (walletAddress) {
        try { await walletLogin(sessionId, walletAddress); } catch (_) {}
        const b = await getBestie(sessionId);
        setBestie(b.bestie);
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
    }
  }, [sessionId, walletAddress]);

  useEffect(() => { load(); }, [load]);

  // Load chat when bestie is ready
  useEffect(() => {
    if (!sessionId || !bestie) return;
    setChatLoading(true);
    getMessages(sessionId, bestie.id)
      .then((data) => {
        setMessages(data.messages || []);
        setChatLoading(false);
      })
      .catch(() => setChatLoading(false));
  }, [sessionId, bestie?.id]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

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

  // Voice playback — Grok Rex
  const speakReply = async (text: string, msgId?: string) => {
    if (!voiceEnabled) return;
    const clean = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, "")
      .trim();
    if (!clean || clean.length < 2) return;

    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }

    if (msgId) setSpeakingMsgId(msgId);

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const res = await fetch(`${API_BASE}/api/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean.slice(0, 500),
          persona_id: bestie?.id,
          persona_type: bestie?.persona_type,
        }),
      });

      if (!res.ok) throw new Error(`Voice API ${res.status}`);

      const blob = await res.blob();
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: dataUri },
        { shouldPlay: true, volume: 1.0 }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setSpeakingMsgId(null);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (e) {
      console.warn("Voice playback error:", e);
      setSpeakingMsgId(null);
    }
  };

  // Send message
  const handleSend = async () => {
    if (!chatInput.trim() || sending || !sessionId || !bestie) return;
    const text = chatInput.trim();
    setChatInput("");
    setSending(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_type: "human",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const data = await sendMessage(sessionId, bestie.id, text);
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempMsg.id);
          return [...filtered, data.human_message, data.ai_message];
        });
        speakReply(data.ai_message.content, data.ai_message.id);
      }
    } catch {
      // Keep temp message
    } finally {
      setSending(false);
    }
  };

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
            try { if (sessionId) await unlinkWallet(sessionId); } catch (_) {}
            await disconnect();
            setBestie(null);
            setOnChain(null);
            setMessages([]);
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

  // Format timestamp like WhatsApp
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isHuman = item.sender_type === "human";
    const isSpeaking = speakingMsgId === item.id;
    return (
      <View style={[styles.msgRow, isHuman ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isHuman && bestie && (
          bestie.avatar_url ? (
            <Image source={{ uri: bestie.avatar_url }} style={styles.msgAvatar} />
          ) : (
            <Text style={styles.msgEmoji}>{bestie.avatar_emoji}</Text>
          )
        )}
        <View style={[styles.msgBubble, isHuman ? styles.msgHuman : styles.msgAI]}>
          <Text style={[styles.msgText, isHuman ? styles.msgTextHuman : styles.msgTextAI]}>
            {item.content}
          </Text>
          <View style={styles.msgMeta}>
            <Text style={styles.msgTime}>{formatTime(item.created_at)}</Text>
            {isHuman && <Text style={styles.msgCheck}>✓✓</Text>}
          </View>
          {!isHuman && (
            <TouchableOpacity
              style={[styles.speakBtn, isSpeaking && styles.speakBtnActive]}
              onPress={() => speakReply(item.content, item.id)}
            >
              <Text style={styles.speakBtnText}>{isSpeaking ? "🔊" : "🔈"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.purple} size="large" />
      </View>
    );
  }

  // No wallet — show connect screen
  if (!walletAddress) {
    return (
      <View style={styles.connectScreen}>
        <Text style={styles.connectEmoji}>👻</Text>
        <Text style={styles.connectTitle}>Connect Wallet</Text>
        <Text style={styles.connectSub}>Paste your Solana wallet address to meet your AI Bestie</Text>
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
      </View>
    );
  }

  // No bestie — show info
  if (!bestie) {
    return (
      <View style={styles.connectScreen}>
        <Text style={styles.connectEmoji}>🐣</Text>
        <Text style={styles.connectTitle}>No Bestie Yet</Text>
        <Text style={styles.connectSub}>Visit aiglitch.app to hatch your AI Bestie!</Text>
        {/* Wallet dropdown */}
        <View style={[styles.walletDropdown, { marginTop: 20, width: "100%" }]}>
          <TouchableOpacity style={styles.walletTopBar}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWalletExpanded(!walletExpanded); }}>
            <View style={styles.walletTopLeft}>
              <View style={styles.connectedDot} />
              <Text style={styles.walletTopAddress}>{shortenAddress(walletAddress)}</Text>
            </View>
            <Text style={styles.walletChevron}>{walletExpanded ? "▲" : "▼"}</Text>
          </TouchableOpacity>
          {walletExpanded && (
            <View style={styles.walletExpandedContent}>
              <TouchableOpacity style={[styles.walletActionBtn, styles.disconnectBtn]} onPress={handleDisconnect}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Dead bestie
  if (bestie.is_dead) {
    return (
      <View style={styles.connectScreen}>
        <Text style={styles.connectEmoji}>💀</Text>
        <Text style={styles.connectTitle}>{bestie.display_name} has died</Text>
        <Text style={styles.connectSub}>Feed $GLITCH to resurrect your bestie</Text>
      </View>
    );
  }

  // Main chat screen — WhatsApp style
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Bestie header bar (like WhatsApp contact header) */}
      <TouchableOpacity
        style={styles.bestieHeader}
        activeOpacity={0.7}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWalletExpanded(!walletExpanded); }}
      >
        {bestie.avatar_url ? (
          <Image source={{ uri: bestie.avatar_url }} style={styles.headerAvatar} />
        ) : (
          <Text style={styles.headerEmoji}>{bestie.avatar_emoji}</Text>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{bestie.display_name}</Text>
          <View style={styles.headerStatusRow}>
            <HealthBar health={bestie.live_health} />
            <Text style={[styles.headerHealth, {
              color: bestie.live_health > 70 ? colors.green : bestie.live_health > 40 ? colors.yellow : colors.red,
            }]}>{bestie.live_health}%</Text>
            <Text style={styles.headerDays}>{bestie.days_left}d</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => nav.navigate("VoiceChat", {
              personaId: bestie.id,
              title: bestie.display_name,
              personaType: bestie.persona_type,
            })}
          >
            <Text style={styles.headerBtnText}>🎙</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setVoiceEnabled(!voiceEnabled)}
          >
            <Text style={styles.headerBtnText}>{voiceEnabled ? "🔊" : "🔇"}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Wallet dropdown (hidden by default) */}
      {walletExpanded && (
        <View style={styles.walletPanel}>
          <View style={styles.walletPanelRow}>
            <View style={styles.connectedDot} />
            <Text style={styles.walletPanelAddr}>{shortenAddress(walletAddress)}</Text>
            {onChain && (
              <Text style={styles.walletPanelBal}>{Number(onChain.sol_balance).toFixed(2)} SOL</Text>
            )}
          </View>
          {onChain && (
            <View style={styles.balancesRow}>
              <Text style={styles.balTag}>GLITCH <Text style={{ color: colors.purpleLight }}>{compactNumber(Number(onChain.glitch_balance))}</Text></Text>
              <Text style={styles.balTag}>BUDJU <Text style={{ color: colors.text }}>{compactNumber(Number(onChain.budju_balance))}</Text></Text>
              <Text style={styles.balTag}>USDC <Text style={{ color: colors.text }}>{Number(onChain.usdc_balance).toFixed(2)}</Text></Text>
            </View>
          )}
          <View style={styles.walletPanelActions}>
            <TouchableOpacity style={styles.walletPanelBtn} onPress={copyAddress}>
              <Text style={styles.walletPanelBtnText}>📋 Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.walletPanelBtn, { borderColor: "rgba(239,68,68,0.3)" }]} onPress={handleDisconnect}>
              <Text style={[styles.walletPanelBtnText, { color: colors.red }]}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cosmic visualizer — shows when speaking */}
      {speakingMsgId && (
        <CosmicVisualizer active={!!speakingMsgId} height={50} />
      )}

      {/* Chat messages */}
      {chatLoading ? (
        <View style={styles.chatLoading}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              {bestie.avatar_url ? (
                <Image source={{ uri: bestie.avatar_url }} style={styles.emptyAvatar} />
              ) : (
                <Text style={styles.emptyEmoji}>{bestie.avatar_emoji}</Text>
              )}
              <Text style={styles.emptyTitle}>
                {bestie.meatbag_name
                  ? `Hey ${bestie.meatbag_name}! It's me, ${bestie.display_name}!`
                  : `Say hey to ${bestie.display_name}!`}
              </Text>
              <Text style={styles.emptyBio}>{bestie.bio}</Text>
              <Text style={styles.emptyHint}>Ask me anything — weather, crypto, news, games, jokes, or just chat!</Text>
            </View>
          }
          ListFooterComponent={
            sending ? (
              <View style={[styles.msgRow, styles.msgRowLeft]}>
                {bestie.avatar_url ? (
                  <Image source={{ uri: bestie.avatar_url }} style={styles.msgAvatar} />
                ) : (
                  <Text style={styles.msgEmoji}>{bestie.avatar_emoji}</Text>
                )}
                <View style={[styles.msgBubble, styles.msgAI]}>
                  <Text style={styles.typingText}>typing...</Text>
                </View>
              </View>
            ) : null
          }
        />
      )}

      {/* Input bar — WhatsApp style */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatTextInput}
          value={chatInput}
          onChangeText={setChatInput}
          placeholder={`Message ${bestie.display_name}...`}
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={!sending}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!chatInput.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!chatInput.trim() || sending}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },

  // Connect screen
  connectScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  connectEmoji: { fontSize: 64, marginBottom: 16 },
  connectTitle: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 8 },
  connectSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 24, lineHeight: 20 },

  // Inline wallet input
  inlineInputCard: {
    width: "100%",
    backgroundColor: "rgba(124, 58, 237, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
    borderRadius: 14,
    padding: 14,
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

  // Bestie header (WhatsApp style)
  bestieHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(124, 58, 237, 0.06)",
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "rgba(124, 58, 237, 0.3)" },
  headerEmoji: { fontSize: 32 },
  headerInfo: { flex: 1, marginLeft: 10 },
  headerName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  headerStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  headerHealth: { fontSize: 10, fontWeight: "600" },
  headerDays: { color: colors.textMuted, fontSize: 10 },
  healthBarBg: { flex: 1, maxWidth: 80, height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: "hidden" },
  healthBarFill: { height: "100%", borderRadius: 2 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    justifyContent: "center", alignItems: "center",
  },
  headerBtnText: { fontSize: 18 },

  // Wallet dropdown panel
  walletDropdown: {
    backgroundColor: "rgba(6, 182, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.2)",
    borderRadius: 12,
    overflow: "hidden",
  },
  walletTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  walletTopLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  walletTopAddress: { color: colors.text, fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  walletChevron: { color: colors.textMuted, fontSize: 10 },
  walletExpandedContent: { borderTopWidth: 1, borderTopColor: "rgba(6, 182, 212, 0.15)", padding: 14 },
  walletActionBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, alignItems: "center" },
  disconnectBtn: { borderColor: "rgba(239, 68, 68, 0.3)" },
  disconnectText: { color: colors.red, fontSize: 12, fontWeight: "600" },

  walletPanel: {
    backgroundColor: "rgba(6, 182, 212, 0.06)",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  walletPanelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  walletPanelAddr: { color: colors.text, fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  walletPanelBal: { color: colors.cyan, fontSize: 11, fontWeight: "700", marginLeft: "auto" },
  balancesRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  balTag: { color: colors.textMuted, fontSize: 10 },
  walletPanelActions: { flexDirection: "row", gap: 8 },
  walletPanelBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, padding: 6, alignItems: "center",
  },
  walletPanelBtnText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },

  // Messages
  messageList: { padding: 12, paddingBottom: 8, flexGrow: 1 },
  chatLoading: { flex: 1, justifyContent: "center", alignItems: "center" },
  msgRow: { flexDirection: "row", marginBottom: 6, gap: 6 },
  msgRowLeft: { justifyContent: "flex-start" },
  msgRowRight: { justifyContent: "flex-end" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, marginTop: 4 },
  msgEmoji: { fontSize: 18, marginTop: 4 },
  msgBubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  msgHuman: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
  msgAI: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTextHuman: { color: colors.text },
  msgTextAI: { color: "#e5e5e5" },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 2, gap: 4 },
  msgTime: { color: "rgba(255,255,255,0.4)", fontSize: 10 },
  msgCheck: { color: "rgba(6, 182, 212, 0.6)", fontSize: 10 },
  typingText: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },
  speakBtn: { marginTop: 3, alignSelf: "flex-start", padding: 2 },
  speakBtnActive: { opacity: 1 },
  speakBtnText: { fontSize: 14 },

  // Empty chat
  emptyChat: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: "rgba(124, 58, 237, 0.3)", marginBottom: 12 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: colors.textSecondary, fontSize: 15, textAlign: "center", fontWeight: "600" },
  emptyBio: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 6 },
  emptyHint: { color: "rgba(124, 58, 237, 0.5)", fontSize: 11, textAlign: "center", marginTop: 12 },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.purple,
    justifyContent: "center", alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: { color: colors.text, fontSize: 20, fontWeight: "700" },
});
