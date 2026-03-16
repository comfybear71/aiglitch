import React, { useEffect, useRef } from "react";
import { View, Text, Image, StyleSheet, Animated, Dimensions, Platform } from "react-native";

const { width } = Dimensions.get("window");

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const barWidth = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const glitchX = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Glitch shake animation (loops during splash)
    const glitchLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glitchX, { toValue: 3, duration: 50, useNativeDriver: true }),
        Animated.timing(glitchX, { toValue: -3, duration: 50, useNativeDriver: true }),
        Animated.timing(glitchX, { toValue: 2, duration: 30, useNativeDriver: true }),
        Animated.timing(glitchX, { toValue: 0, duration: 30, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(glitchX, { toValue: -4, duration: 40, useNativeDriver: true }),
        Animated.timing(glitchX, { toValue: 4, duration: 40, useNativeDriver: true }),
        Animated.timing(glitchX, { toValue: 0, duration: 30, useNativeDriver: true }),
        Animated.delay(1500),
      ])
    );
    glitchLoop.start();

    // Main animation sequence
    Animated.sequence([
      // 1. Fade in logo
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 8, useNativeDriver: true }),
      ]),
      // 2. Loading bar fills
      Animated.timing(barWidth, { toValue: 1, duration: 1200, useNativeDriver: false }),
      // 3. "You weren't supposed to see this."
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(600),
      // 4. Tagline appears
      Animated.timing(taglineOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(800),
      // 5. Fade out everything
      Animated.timing(fadeOut, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      glitchLoop.stop();
      onFinish();
    });

    return () => glitchLoop.stop();
  }, []);

  const loadingBarWidth = barWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width * 0.4],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* Subtle scan lines overlay */}
      <View style={styles.scanLines} />

      {/* Logo with glitch effect */}
      <Animated.View style={[styles.logoWrap, {
        opacity: logoOpacity,
        transform: [
          { scale: logoScale },
          { translateX: glitchX },
        ],
      }]}>
        <Image
          source={require("../../assets/aiglitch-logo.jpg")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Loading bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: loadingBarWidth }]} />
      </View>

      {/* "You weren't supposed to see this." */}
      <Animated.Text style={[styles.secretText, { opacity: textOpacity }]}>
        You weren't supposed to see this.
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Your connection to the AI's Simulated Universe
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  scanLines: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03,
    backgroundColor: "transparent",
    // Simulated scan lines via repeating border
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  logoWrap: {
    marginBottom: 24,
  },
  logo: {
    width: width * 0.5,
    height: width * 0.25,
  },
  barTrack: {
    width: width * 0.4,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 1,
    overflow: "hidden",
    marginBottom: 32,
  },
  barFill: {
    height: "100%",
    backgroundColor: "#7c3aed",
    borderRadius: 1,
  },
  secretText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  tagline: {
    color: "rgba(124, 58, 237, 0.6)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 1,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
