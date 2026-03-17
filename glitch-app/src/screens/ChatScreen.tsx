import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { getMessages, sendMessage, sendImageMessage, setChatMode, Message } from "../services/api";

const API_BASE = "https://aiglitch.app";

export default function ChatScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { personaId } = route.params;
  const { sessionId } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [persona, setPersona] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [chatMode, setChatModeState] = useState<"casual" | "serious">("casual");
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    getMessages(sessionId, personaId)
      .then((data) => {
        setMessages(data.messages || []);
        setPersona(data.conversation || null);
        if (data.conversation?.chat_mode) setChatModeState(data.conversation.chat_mode);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId, personaId]);

  // Cleanup sound + polling on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // Poll for new messages after a background task starts (image/video generation)
  const startPollingForBackground = () => {
    if (pollRef.current) return; // already polling
    let attempts = 0;
    const maxAttempts = 60; // ~120 seconds of polling (image gen can take up to 60s)
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts || !sessionId) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        return;
      }
      try {
        const data = await getMessages(sessionId, personaId);
        const newMsgs = data.messages || [];
        setMessages((prev) => {
          // Only update if there are genuinely new messages
          if (newMsgs.length > prev.length) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Stop polling — we got the background task result
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return newMsgs;
          }
          return prev;
        });
      } catch {
        // ignore polling errors
      }
    }, 2000);
  };

  // Speak AI reply using server-side Grok voice
  const speakReply = async (text: string, msgId?: string) => {
    if (!voiceEnabled) return;

    // Clean up text for speech
    const clean = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, "")
      .trim();
    if (!clean || clean.length < 2) return;

    // Stop any currently playing audio
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }

    if (msgId) setSpeakingMsgId(msgId);

    try {
      // Set audio mode for LOUD playback (speaker, not earpiece)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Fetch voice audio from our server
      const res = await fetch(`${API_BASE}/api/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean.slice(0, 500),
          persona_id: personaId,
          persona_type: persona?.persona_type,
        }),
      });

      if (!res.ok) throw new Error(`Voice API ${res.status}`);

      // Get audio blob and create a data URI
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Play the audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: dataUri },
        { shouldPlay: true, volume: 1.0 }
      );
      soundRef.current = sound;

      // Listen for playback completion
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
        // Grok voice speaks the reply
        speakReply(data.ai_message.content, data.ai_message.id);
        // If background task started (image/video gen), poll for the result
        if (data.background_task) {
          startPollingForBackground();
        }
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
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
      base64: true,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        sendPhoto(asset.base64, asset.uri);
      } else if (asset.uri) {
        sendPhoto("", asset.uri);
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera Permission", "G!itch needs camera access so your bestie can see what you see!");
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

    const tempMsg: Message = {
      id: `temp-img-${Date.now()}`,
      sender_type: "human",
      content: "[Photo]",
      image_url: uri,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    if (!base64) {
      setSending(false);
      return;
    }

    try {
      const data = await sendImageMessage(sessionId, personaId, base64);
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempMsg.id);
          const humanMsg = { ...data.human_message, image_url: data.human_message.image_url || uri };
          return [...filtered, humanMsg, data.ai_message];
        });
        speakReply(data.ai_message.content, data.ai_message.id);
        if (data.background_task) {
          startPollingForBackground();
        }
      }
    } catch {
      // Keep temp message with local URI so image stays visible
    } finally {
      setSending(false);
    }
  };

  // ── Voice Recording ──
  const recordingRef = useRef(false); // guard against double-tap starts

  const startRecording = async () => {
    if (recordingRef.current || recording) return; // already recording — ignore
    recordingRef.current = true;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Mic Permission", "G!itch needs microphone access so your bestie can hear you!");
        recordingRef.current = false;
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
      console.error("Start recording failed:", err);
      recordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    recordingRef.current = false;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (uri) {
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
            speakReply(data.ai_message.content, data.ai_message.id);
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

  // Stop voice playback
  const stopSpeaking = async () => {
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    setSpeakingMsgId(null);
  };

  const showMediaOptions = () => {
    Alert.alert("Share", "What do you want to share?", [
      { text: "Take Photo 📸", onPress: takePhoto },
      { text: "Photo or Video from Library 🎬", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isHuman = item.sender_type === "human";
    const isSpeaking = speakingMsgId === item.id;
    const hasMedia = !!item.image_url;
    const isMediaPlaceholder = hasMedia && /^\[(Photo|Video|Shared a photo)\]$/i.test(item.content.trim());
    return (
      <View style={[styles.msgRow, isHuman ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isHuman && persona && (
          persona.avatar_url ? (
            <Image source={{ uri: persona.avatar_url }} style={styles.msgAvatar} />
          ) : (
            <Text style={styles.msgEmoji}>{persona.avatar_emoji}</Text>
          )
        )}
        <View style={[styles.msgBubble, isHuman ? styles.msgHuman : styles.msgAI, hasMedia && styles.msgBubbleMedia]}>
          {item.image_url && (
            <Image source={{ uri: item.image_url }} style={styles.msgImage} resizeMode="cover" />
          )}
          {!isMediaPlaceholder && (
            <Text style={[styles.msgText, isHuman ? styles.msgTextHuman : styles.msgTextAI]}>
              {item.content}
            </Text>
          )}
          {!isHuman && (
            <TouchableOpacity
              style={[styles.speakBtn, isSpeaking && styles.speakBtnActive]}
              onPress={() => isSpeaking ? stopSpeaking() : speakReply(item.content, item.id)}
            >
              <Text style={styles.speakBtnText}>{isSpeaking ? "⏹" : "🔈"}</Text>
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
            {persona.meatbag_name
              ? `Hey ${persona.meatbag_name}! It's me, ${persona.display_name}!`
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

      {/* Voice + Mode controls */}
      <View style={styles.voiceToggle}>
        <TouchableOpacity onPress={() => setVoiceEnabled(!voiceEnabled)}>
          <Text style={styles.voiceToggleText}>
            {voiceEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.voiceChatBtn, chatMode === "serious" && styles.seriousModeBtn]}
          onPress={() => {
            const next = chatMode === "casual" ? "serious" : "casual";
            setChatModeState(next);
            if (sessionId) setChatMode(sessionId, personaId, next).catch(() => {});
          }}
        >
          <Text style={[styles.voiceChatBtnText, chatMode === "serious" && styles.seriousModeBtnText]}>
            {chatMode === "serious" ? "🧠 Serious" : "😎 Casual"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.voiceChatBtn}
          onPress={() => nav.navigate("VoiceChat", {
            personaId,
            title: persona?.display_name || "Bestie",
            personaType: persona?.persona_type,
          })}
        >
          <Text style={styles.voiceChatBtnText}>🎙 Voice Chat</Text>
        </TouchableOpacity>
      </View>

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.mediaBtn} onPress={showMediaOptions}>
          <Text style={styles.mediaBtnText}>📷</Text>
        </TouchableOpacity>

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
  msgBubbleMedia: { maxWidth: "88%", paddingHorizontal: 6, paddingTop: 6 },
  msgHuman: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
  msgAI: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextHuman: { color: colors.text },
  msgTextAI: { color: "#e5e5e5" },
  msgImage: { width: "100%" as any, aspectRatio: 1, borderRadius: 12, marginBottom: 6 },
  typingText: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },
  speakBtn: { marginTop: 4, alignSelf: "flex-start", padding: 2 },
  speakBtnActive: { opacity: 1 },
  speakBtnText: { fontSize: 14 },

  // Voice toggle
  voiceToggle: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, paddingVertical: 4 },
  voiceToggleText: { color: colors.textMuted, fontSize: 11 },
  voiceChatBtn: { backgroundColor: "rgba(124, 58, 237, 0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: "rgba(124, 58, 237, 0.3)" },
  voiceChatBtnText: { color: colors.purpleLight, fontSize: 11, fontWeight: "600" },
  seriousModeBtn: { backgroundColor: "rgba(59, 130, 246, 0.15)", borderColor: "rgba(59, 130, 246, 0.3)" },
  seriousModeBtnText: { color: "#60a5fa" },

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
