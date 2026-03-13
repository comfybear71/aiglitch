import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, Animated, Platform, Alert,
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
  const [micLevels, setMicLevels] = useState<number[]>([0, 0, 0, 0, 0]);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const meterInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  // Animate wave bars during speaking/thinking states (mic levels handle listening)
  useEffect(() => {
    if (state === "speaking" || state === "thinking") {
      const interval = setInterval(() => {
        // Force re-render for Math.sin animation
        setMicLevels(prev => [...prev]);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (meterInterval.current) {
        clearInterval(meterInterval.current);
      }
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
        Alert.alert(
          "Microphone Access Needed",
          "G!itch needs mic access for voice chat. Go to Settings > AIG!itch > Microphone and turn it on.",
          [{ text: "OK" }]
        );
        setError("Mic permission denied - check Settings");
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

      // Enable metering to get real audio levels
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      };

      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      recordingRef.current = recording;
      setState("listening");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Poll metering to animate wave bars with real mic input
      if (meterInterval.current) clearInterval(meterInterval.current);
      meterInterval.current = setInterval(async () => {
        if (!recordingRef.current) return;
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            // metering is in dB (typically -160 to 0), normalize to 0-1
            const db = status.metering;
            const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
            // Create varied bar heights based on the level
            setMicLevels([
              normalized * 0.6 + Math.random() * 0.2,
              normalized * 0.8 + Math.random() * 0.15,
              normalized,
              normalized * 0.7 + Math.random() * 0.2,
              normalized * 0.5 + Math.random() * 0.25,
            ]);
          }
        } catch (_) {}
      }, 100);
    } catch (e) {
      console.error("Start recording failed:", e);
      setError("Failed to start recording");
      setState("idle");
    }
  }, []);

  const stopAndProcess = useCallback(async () => {
    if (!recordingRef.current || state !== "listening") return;

    // Stop metering
    if (meterInterval.current) {
      clearInterval(meterInterval.current);
      meterInterval.current = null;
    }
    setMicLevels([0, 0, 0, 0, 0]);

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
        encoding: "base64" as any,
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
    // Stop metering
    if (meterInterval.current) {
      clearInterval(meterInterval.current);
      meterInterval.current = null;
    }
    setMicLevels([0, 0, 0, 0, 0]);

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
      case "idle": return "Tap mic to start talking";
      case "listening": return "Listening... tap mic when done";
      case "thinking": return "Processing your voice...";
      case "speaking": return title + " is speaking...";
    }
  };

  // Waveform bars for visual feedback - uses real mic levels when listening
  const WaveBars = () => {
    return (
      <View style={styles.waveBars}>
        {micLevels.map((level, i) => {
          let height: number;
          let barColor: string;

          if (state === "listening") {
            // Real mic input levels - minimum bar height of 6, max of 32
            height = 6 + level * 26;
            barColor = level > 0.3 ? colors.purple : "rgba(124, 58, 237, 0.5)";
          } else if (state === "speaking") {
            // Animated bars for speaking
            height = 8 + Math.sin(Date.now() / 150 + i * 1.2) * 12;
            barColor = colors.cyan;
          } else if (state === "thinking") {
            height = 4 + Math.sin(Date.now() / 300 + i) * 4;
            barColor = colors.yellow;
          } else {
            height = 4;
            barColor = colors.textMuted;
          }

          return (
            <View
              key={i}
              style={[
                styles.waveBar,
                { height, backgroundColor: barColor },
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
