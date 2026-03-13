import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, Animated, Platform,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { sendMessage, transcribeAudio } from "../services/api";

const API_BASE = "https://aiglitch.app";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

export default function VoiceChatScreen() {
  const route = useRoute<any>();
  const nav = useNavigation();
  const { personaId, title, personaType } = route.params;
  const { sessionId } = useSession();

  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [error, setError] = useState("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for listening state
  useEffect(() => {
    if (state === "listening") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state]);

  // Wave animation for speaking state
  useEffect(() => {
    if (state === "speaking") {
      const wave = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      );
      wave.start();
      return () => wave.stop();
    } else {
      waveAnim.setValue(0);
    }
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (recordingRef.current) {
        try { recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
      }
    };
  }, []);

  const startListening = useCallback(async () => {
    setError("");
    setTranscript("");
    setAiResponse("");

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone permission required");
        return;
      }

      // Stop any playing audio
      if (soundRef.current) {
        try { await soundRef.current.unloadAsync(); } catch (_) {}
        soundRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setState("listening");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.error("Start recording failed:", e);
      setError("Failed to start recording");
      setState("idle");
    }
  }, []);

  const stopAndProcess = useCallback(async () => {
    if (!recordingRef.current || state !== "listening") return;

    setState("thinking");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setError("No audio recorded");
        setState("idle");
        return;
      }

      // Read audio file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Transcribe
      let userText: string;
      try {
        const result = await transcribeAudio(base64, "audio/m4a");
        userText = result.text;
      } catch (e) {
        console.warn("Transcription failed:", e);
        // Fallback: send as voice message
        userText = "[Voice message - please respond naturally]";
      }

      setTranscript(userText);

      // Send to chat API
      if (!sessionId) {
        setError("No session");
        setState("idle");
        return;
      }

      const data = await sendMessage(sessionId, personaId, userText);
      if (!data.success) {
        setError("Failed to get response");
        setState("idle");
        return;
      }

      const reply = data.ai_message.content;
      setAiResponse(reply);

      // Speak the reply with Rex voice
      await speakReply(reply);
    } catch (e) {
      console.error("Process error:", e);
      setError("Something went wrong");
      setState("idle");
    }
  }, [state, sessionId, personaId]);

  const speakReply = async (text: string) => {
    setState("speaking");

    // Clean text for speech
    const clean = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, "")
      .trim();
    if (!clean || clean.length < 2) {
      setState("idle");
      return;
    }

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
          persona_id: personaId,
          persona_type: personaType,
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
          sound.unloadAsync();
          soundRef.current = null;
          // Auto-listen again after speaking
          setState("idle");
          setTimeout(() => startListening(), 500);
        }
      });
    } catch (e) {
      console.error("Voice playback error:", e);
      setState("idle");
    }
  };

  const handleStop = useCallback(async () => {
    // Stop everything
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch (_) {}
      recordingRef.current = null;
    }
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    setState("idle");
    setTranscript("");
    setAiResponse("");
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleMicPress = useCallback(() => {
    if (state === "idle") {
      startListening();
    } else if (state === "listening") {
      stopAndProcess();
    }
  }, [state, startListening, stopAndProcess]);

  const stateLabel = () => {
    switch (state) {
      case "idle": return "Start talking";
      case "listening": return "Listening...";
      case "thinking": return "Thinking...";
      case "speaking": return title + " is speaking...";
    }
  };

  // Waveform bars for visual feedback
  const WaveBars = () => {
    const barCount = 5;
    const bars = Array.from({ length: barCount });
    return (
      <View style={styles.waveBars}>
        {bars.map((_, i) => {
          const delay = i * 100;
          const height = state === "listening" || state === "speaking"
            ? 12 + Math.sin(Date.now() / 200 + i) * 10
            : 4;
          return (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                {
                  height,
                  backgroundColor: state === "listening"
                    ? colors.purple
                    : state === "speaking"
                    ? colors.cyan
                    : colors.textMuted,
                },
              ]}
            />
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Main area */}
      <View style={styles.mainArea}>
        {/* Transcript / response display */}
        {transcript ? (
          <View style={styles.transcriptArea}>
            <Text style={styles.youSaid}>You said:</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        ) : null}

        {aiResponse ? (
          <View style={styles.responseArea}>
            <Text style={styles.aiSaid}>{title}:</Text>
            <Text style={styles.responseText}>{aiResponse}</Text>
          </View>
        ) : null}

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
      </View>

      {/* Status label + wave */}
      <View style={styles.statusArea}>
        <WaveBars />
        <Text style={styles.stateLabel}>{stateLabel()}</Text>
      </View>

      {/* Bottom controls - Grok style */}
      <View style={styles.controlsRow}>
        {/* Speaker toggle */}
        <TouchableOpacity style={styles.controlBtn} onPress={() => {}}>
          <Text style={styles.controlIcon}>🔊</Text>
        </TouchableOpacity>

        {/* Mic button - main action */}
        <Animated.View style={{ transform: [{ scale: state === "listening" ? pulseAnim : 1 }] }}>
          <TouchableOpacity
            style={[
              styles.micBtn,
              state === "listening" && styles.micBtnActive,
              state === "thinking" && styles.micBtnThinking,
              state === "speaking" && styles.micBtnSpeaking,
            ]}
            onPress={handleMicPress}
            disabled={state === "thinking" || state === "speaking"}
          >
            {state === "thinking" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.micIcon}>
                {state === "listening" ? "⏹" : "🎤"}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Settings */}
        <TouchableOpacity style={styles.controlBtn} onPress={() => nav.goBack()}>
          <Text style={styles.controlIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom bar - text input + stop */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.askAnything}
          onPress={() => nav.goBack()}
        >
          <Text style={styles.askAnythingText}>Type instead...</Text>
        </TouchableOpacity>

        {state !== "idle" && (
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <View style={styles.stopSquare} />
            <Text style={styles.stopText}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  mainArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  transcriptArea: {
    marginBottom: 20,
    alignItems: "center",
    width: "100%",
  },
  youSaid: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  transcriptText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  responseArea: {
    alignItems: "center",
    width: "100%",
  },
  aiSaid: {
    color: colors.cyan,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "600",
  },
  responseText: {
    color: colors.text,
    fontSize: 18,
    textAlign: "center",
    lineHeight: 26,
    fontWeight: "500",
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    textAlign: "center",
  },

  // Status
  statusArea: {
    alignItems: "center",
    paddingBottom: 20,
  },
  stateLabel: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 8,
  },
  waveBars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 24,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },

  // Controls
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 28,
    paddingBottom: 16,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlIcon: {
    fontSize: 22,
    color: colors.text,
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  micBtnActive: {
    backgroundColor: "rgba(124, 58, 237, 0.4)",
    borderColor: colors.purple,
  },
  micBtnThinking: {
    backgroundColor: "rgba(234, 179, 8, 0.2)",
    borderColor: colors.yellow,
  },
  micBtnSpeaking: {
    backgroundColor: "rgba(6, 182, 212, 0.2)",
    borderColor: colors.cyan,
  },
  micIcon: {
    fontSize: 28,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 10 : 16,
  },
  askAnything: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  askAnythingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  stopSquare: {
    width: 14,
    height: 14,
    backgroundColor: "#000",
    borderRadius: 3,
  },
  stopText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
});
