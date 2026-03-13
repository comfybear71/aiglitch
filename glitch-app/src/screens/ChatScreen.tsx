import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { getMessages, sendMessage, sendImageMessage, Message } from "../services/api";

export default function ChatScreen() {
  const route = useRoute<any>();
  const { personaId } = route.params;
  const { sessionId } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [persona, setPersona] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
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

  // Speak AI replies out loud
  const speakReply = (text: string, name: string) => {
    if (!voiceEnabled) return;
    // Clean up text for speech (remove emojis and special chars)
    const clean = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, "").trim();
    if (!clean) return;
    Speech.speak(clean, {
      language: "en-AU",
      pitch: 1.1,
      rate: 0.95,
    });
  };

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
        // Noodles speaks!
        if (persona) speakReply(data.ai_message.content, persona.display_name);
      }
    } catch {
      // Keep temp message
    } finally {
      setSending(false);
    }
  };

  // ── Camera / Photo Picker ──
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      sendPhoto(result.assets[0].base64, result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera Permission", "G!itch needs camera access so Noodles can see what you see!");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: true,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      sendPhoto(result.assets[0].base64, result.assets[0].uri);
    }
  };

  const sendPhoto = async (base64: string, uri: string) => {
    if (!sessionId || sending) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Show image in chat immediately
    const tempMsg: Message = {
      id: `temp-img-${Date.now()}`,
      sender_type: "human",
      content: "[Photo]",
      image_url: uri,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const data = await sendImageMessage(sessionId, personaId, base64);
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempMsg.id);
          return [...filtered, data.human_message, data.ai_message];
        });
        if (persona) speakReply(data.ai_message.content, persona.display_name);
      }
    } catch {
      // Keep temp
    } finally {
      setSending(false);
    }
  };

  // ── Voice Recording ──
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Mic Permission", "G!itch needs microphone access so Noodles can hear you!");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (err) {
      console.error("Recording failed:", err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (uri) {
        // For now, we'll send a note that this was a voice message
        // Full transcription would need a speech-to-text API
        // For MVP: just tell Noodles you sent a voice message
        setSending(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const tempMsg: Message = {
          id: `temp-voice-${Date.now()}`,
          sender_type: "human",
          content: "🎤 Voice message",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, tempMsg]);

        try {
          const data = await sendMessage(
            sessionId!,
            personaId,
            "[Voice message from your human bestie - they just recorded an audio message for you! React to this with excitement and personality]"
          );
          if (data.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setMessages((prev) => {
              const filtered = prev.filter((m) => m.id !== tempMsg.id);
              const humanMsg = { ...data.human_message, content: "🎤 Voice message" };
              return [...filtered, humanMsg, data.ai_message];
            });
            if (persona) speakReply(data.ai_message.content, persona.display_name);
          }
        } catch {
          // Keep temp
        } finally {
          setSending(false);
        }
      }
    } catch (err) {
      console.error("Stop recording failed:", err);
      setRecording(null);
    }
  };

  const showMediaOptions = () => {
    Alert.alert("Share with Noodles", "What do you want to share?", [
      { text: "Take Photo 📸", onPress: takePhoto },
      { text: "Choose from Library 🖼️", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
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
          {item.image_url && (
            <Image source={{ uri: item.image_url }} style={styles.msgImage} resizeMode="cover" />
          )}
          <Text style={[styles.msgText, isHuman ? styles.msgTextHuman : styles.msgTextAI]}>
            {item.content}
          </Text>
          {!isHuman && (
            <TouchableOpacity
              style={styles.speakBtn}
              onPress={() => speakReply(item.content, persona?.display_name || "AI")}
            >
              <Text style={styles.speakBtnText}>🔊</Text>
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

      {/* Voice toggle */}
      <View style={styles.voiceToggle}>
        <TouchableOpacity onPress={() => setVoiceEnabled(!voiceEnabled)}>
          <Text style={styles.voiceToggleText}>
            {voiceEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Input bar */}
      <View style={styles.inputBar}>
        {/* Camera button */}
        <TouchableOpacity style={styles.mediaBtn} onPress={showMediaOptions}>
          <Text style={styles.mediaBtnText}>📷</Text>
        </TouchableOpacity>

        {/* Mic button */}
        <TouchableOpacity
          style={[styles.mediaBtn, isRecording && styles.mediaBtnRecording]}
          onPressIn={startRecording}
          onPressOut={stopRecording}
        >
          <Text style={styles.mediaBtnText}>{isRecording ? "⏹️" : "🎤"}</Text>
        </TouchableOpacity>

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
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 6 },
  typingText: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },
  speakBtn: { marginTop: 4, alignSelf: "flex-start" },
  speakBtnText: { fontSize: 14 },

  // Voice toggle
  voiceToggle: { alignItems: "center", paddingVertical: 4 },
  voiceToggleText: { color: colors.textMuted, fontSize: 11 },

  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  mediaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  mediaBtnRecording: {
    backgroundColor: colors.red,
  },
  mediaBtnText: { fontSize: 18 },
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
