import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { getMessages, sendMessage, Message } from "../services/api";

export default function ChatScreen() {
  const route = useRoute<any>();
  const { personaId } = route.params;
  const { sessionId } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [persona, setPersona] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!sessionId) return;
    getMessages(sessionId, personaId)
      .then((data) => {
        setMessages(data.messages || []);
        setPersona(data.conversation || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId, personaId]);

  const handleSend = async () => {
    if (!input.trim() || sending || !sessionId) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic update
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_type: "human",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const data = await sendMessage(sessionId, personaId, text);
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempMsg.id);
          return [...filtered, data.human_message, data.ai_message];
        });
      }
    } catch {
      // Keep temp message
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isHuman = item.sender_type === "human";
    return (
      <View style={[styles.msgRow, isHuman ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isHuman && persona && (
          persona.avatar_url ? (
            <Image source={{ uri: persona.avatar_url }} style={styles.msgAvatar} />
          ) : (
            <Text style={styles.msgEmoji}>{persona.avatar_emoji}</Text>
          )
        )}
        <View style={[styles.msgBubble, isHuman ? styles.msgHuman : styles.msgAI]}>
          <Text style={[styles.msgText, isHuman ? styles.msgTextHuman : styles.msgTextAI]}>
            {item.content}
          </Text>
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Empty state */}
      {messages.length === 0 && persona && (
        <View style={styles.emptyState}>
          {persona.avatar_url ? (
            <Image source={{ uri: persona.avatar_url }} style={styles.emptyAvatar} />
          ) : (
            <Text style={styles.emptyEmoji}>{persona.avatar_emoji}</Text>
          )}
          <Text style={styles.emptyTitle}>
            {persona.hatching_type === "meatbag-hatch"
              ? `Hey ${persona.meatbag_name || "there"}! It's me, ${persona.display_name}!`
              : `Start chatting with ${persona.display_name}`}
          </Text>
          <Text style={styles.emptyBio}>{persona.bio}</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          sending ? (
            <View style={[styles.msgRow, styles.msgRowLeft]}>
              {persona && (
                persona.avatar_url ? (
                  <Image source={{ uri: persona.avatar_url }} style={styles.msgAvatar} />
                ) : (
                  <Text style={styles.msgEmoji}>{persona?.avatar_emoji}</Text>
                )
              )}
              <View style={[styles.msgBubble, styles.msgAI]}>
                <Text style={styles.typingText}>typing...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={persona ? `Message ${persona.display_name}...` : "Type a message..."}
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
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
  messageList: { padding: 16, paddingBottom: 8 },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: "rgba(124, 58, 237, 0.3)", marginBottom: 12 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  emptyBio: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 6 },

  // Messages
  msgRow: { flexDirection: "row", marginBottom: 10, gap: 8 },
  msgRowLeft: { justifyContent: "flex-start" },
  msgRowRight: { justifyContent: "flex-end" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, marginTop: 4 },
  msgEmoji: { fontSize: 18, marginTop: 4 },
  msgBubble: { maxWidth: "75%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  msgHuman: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
  msgAI: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextHuman: { color: colors.text },
  msgTextAI: { color: "#e5e5e5" },
  typingText: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },

  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purple,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: { color: colors.text, fontSize: 20, fontWeight: "700" },
});
