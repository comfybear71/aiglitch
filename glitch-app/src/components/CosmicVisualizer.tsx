/**
 * CosmicVisualizer — galaxy/stars sound wave that activates when the bestie speaks.
 * Pulsing stars, swirling cosmic particles, aurora glow effects.
 * Uses React Native Animated API only (no external deps).
 */
import React, { useEffect, useRef, useMemo } from "react";
import { View, Animated, StyleSheet, Easing } from "react-native";

interface Props {
  active: boolean;
  height?: number;
}

const NUM_STARS = 12;
const COLORS = ["#a855f7", "#7c3aed", "#06b6d4", "#818cf8", "#c084fc", "#22d3ee", "#f0abfc", "#6366f1"];

function Star({ active, index, total }: { active: boolean; index: number; total: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.3)).current;

  const color = COLORS[index % COLORS.length];
  const baseSize = 4 + (index % 4) * 3;
  const angle = (index / total) * Math.PI * 2;
  const radius = 20 + (index % 3) * 15;

  useEffect(() => {
    if (active) {
      // Pulsing size
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 400 + (index * 120) % 600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 400 + (index * 80) % 500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Orbiting motion
      Animated.loop(
        Animated.timing(orbit, {
          toValue: 1,
          duration: 2000 + (index * 500) % 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      // Glow brightness
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 600 + (index * 200) % 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0.2,
            duration: 600 + (index * 150) % 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Fade out
      Animated.timing(pulse, { toValue: 0, duration: 500, useNativeDriver: true }).start();
      Animated.timing(glow, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }
  }, [active]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.8],
  });

  const translateX = orbit.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [
      Math.cos(angle) * radius,
      Math.cos(angle + Math.PI / 2) * radius * 0.8,
      Math.cos(angle + Math.PI) * radius,
      Math.cos(angle + Math.PI * 1.5) * radius * 0.8,
      Math.cos(angle) * radius,
    ],
  });

  const translateY = orbit.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [
      Math.sin(angle) * radius * 0.4,
      Math.sin(angle + Math.PI / 2) * radius * 0.3,
      Math.sin(angle + Math.PI) * radius * 0.4,
      Math.sin(angle + Math.PI * 1.5) * radius * 0.3,
      Math.sin(angle) * radius * 0.4,
    ],
  });

  return (
    <Animated.View
      style={[
        styles.star,
        {
          width: baseSize,
          height: baseSize,
          borderRadius: baseSize / 2,
          backgroundColor: color,
          opacity: glow,
          transform: [{ scale }, { translateX }, { translateY }],
          shadowColor: color,
          shadowOpacity: 0.8,
          shadowRadius: baseSize,
        },
      ]}
    />
  );
}

// Wave bars for the sound wave effect
function WaveBar({ active, index }: { active: boolean; index: number }) {
  const height = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(height, {
            toValue: 12 + Math.random() * 24,
            duration: 150 + (index * 50) % 200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(height, {
            toValue: 4,
            duration: 150 + (index * 40) % 200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      Animated.timing(height, { toValue: 4, duration: 300, useNativeDriver: false }).start();
    }
  }, [active]);

  const color = COLORS[index % COLORS.length];

  return (
    <Animated.View
      style={[
        styles.waveBar,
        {
          height,
          backgroundColor: color,
          opacity: active ? 0.8 : 0.2,
        },
      ]}
    />
  );
}

export default function CosmicVisualizer({ active, height = 60 }: Props) {
  const bars = useMemo(() => Array.from({ length: 16 }, (_, i) => i), []);
  const stars = useMemo(() => Array.from({ length: NUM_STARS }, (_, i) => i), []);

  return (
    <View style={[styles.container, { height }]}>
      {/* Background glow */}
      {active && <View style={styles.glow} />}

      {/* Stars orbiting */}
      <View style={styles.starsContainer}>
        {stars.map((i) => (
          <Star key={i} active={active} index={i} total={NUM_STARS} />
        ))}
      </View>

      {/* Sound wave bars */}
      <View style={styles.waveContainer}>
        {bars.map((i) => (
          <WaveBar key={i} active={active} index={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: "80%",
    height: "100%",
    backgroundColor: "rgba(124, 58, 237, 0.08)",
    borderRadius: 30,
  },
  starsContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  star: {
    position: "absolute",
  },
  waveContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: "100%",
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
});
