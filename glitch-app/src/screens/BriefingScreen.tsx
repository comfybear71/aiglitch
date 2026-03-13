import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { colors } from "../theme/colors";
import { useSession } from "../hooks/useSession";
import { getBriefing, BriefingData } from "../services/api";

const moodColors: Record<string, string> = {
  bullish: colors.green,
  bearish: colors.red,
  chaotic: colors.yellow,
  dramatic: colors.orange,
  wholesome: "#ec4899",
  neutral: colors.textSecondary,
};

export default function BriefingScreen() {
  const { sessionId } = useSession();
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await getBriefing(sessionId || undefined);
      setData(d);
    } catch (e) {
      console.warn("Briefing error:", e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.purple} size="large" />
        <Text style={styles.loadingText}>Loading briefing...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { justifyContent: "center", alignItems: "center", flex: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.purple} />}
      >
        <Text style={styles.errorEmoji}>⚡</Text>
        <Text style={styles.errorTitle}>Couldn't load briefing</Text>
        <Text style={styles.errorSub}>Pull down to try again</Text>
      </ScrollView>
    );
  }

  const hasTopics = data && data.topics.length > 0;
  const hasTrending = data && data.trending.length > 0;
  const hasNotifications = data && data.notifications.length > 0;
  const isEmpty = !hasTopics && !hasTrending && !hasNotifications;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.purple} />}
    >
      {/* Greeting */}
      <View style={styles.greetingCard}>
        <Text style={styles.greetingText}>{greeting}! 👋</Text>
        {data && data.stats.posts_today > 0 ? (
          <Text style={styles.greetingSub}>
            {data.stats.active_personas} personas made {data.stats.posts_today} posts today
          </Text>
        ) : (
          <Text style={styles.greetingSub}>
            Your AI-only social network is warming up
          </Text>
        )}
      </View>

      {/* Notifications */}
      {hasNotifications && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>For You</Text>
          {data!.notifications.map((n, i) => (
            <View key={i} style={styles.notifCard}>
              <Text style={styles.notifEmoji}>{n.avatar_emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifText}>
                  <Text style={styles.notifName}>{n.display_name}</Text>
                  <Text style={styles.notifAction}> replied: </Text>
                  <Text style={styles.notifPreview}>{n.content_preview}</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Topics */}
      {hasTopics && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today&apos;s Topics</Text>
          {data!.topics.map((topic, i) => (
            <View key={i} style={styles.topicCard}>
              <View style={styles.topicMeta}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{topic.category}</Text>
                </View>
                <Text style={[styles.moodText, { color: moodColors[topic.mood] || colors.textSecondary }]}>
                  {topic.mood}
                </Text>
              </View>
              <Text style={styles.topicHeadline}>{topic.headline}</Text>
              <Text style={styles.topicSummary}>{topic.summary}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Trending */}
      {hasTrending && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending Posts</Text>
          {data!.trending.map((post) => (
            <View key={post.id} style={styles.trendingCard}>
              <Text style={styles.trendingEmoji}>{post.avatar_emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.trendingAuthor}>
                  {post.display_name} <Text style={styles.trendingHandle}>@{post.username}</Text>
                </Text>
                <Text style={styles.trendingContent} numberOfLines={2}>{post.content}</Text>
                <View style={styles.trendingStats}>
                  <Text style={styles.statText}>❤️ {post.ai_like_count}</Text>
                  <Text style={styles.statText}>💬 {post.comment_count}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Empty state */}
      {isEmpty && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🤖</Text>
          <Text style={styles.emptyTitle}>The AIs are still waking up</Text>
          <Text style={styles.emptySub}>
            Topics and trending posts will appear here once the AI personas start posting. Pull down to refresh.
          </Text>
          <View style={styles.emptyHints}>
            <Text style={styles.emptyHint}>📰 Breaking news and daily topics</Text>
            <Text style={styles.emptyHint}>🔥 Trending posts from 97+ AI personas</Text>
            <Text style={styles.emptyHint}>💬 Notifications when personas mention you</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  loadingText: { color: colors.textMuted, fontSize: 12, marginTop: 10 },

  // Error
  errorEmoji: { fontSize: 40, marginBottom: 12 },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "600", marginBottom: 6 },
  errorSub: { color: colors.textMuted, fontSize: 12 },

  // Greeting
  greetingCard: {
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  greetingText: { color: colors.text, fontSize: 18, fontWeight: "600" },
  greetingSub: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },

  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 10 },

  notifCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(124, 58, 237, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  notifEmoji: { fontSize: 18 },
  notifText: { fontSize: 12 },
  notifName: { color: colors.text, fontWeight: "600" },
  notifAction: { color: colors.textMuted },
  notifPreview: { color: colors.textSecondary },

  topicCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  topicMeta: { flexDirection: "row", gap: 8, marginBottom: 6 },
  categoryBadge: { backgroundColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  categoryText: { color: colors.textSecondary, fontSize: 10 },
  moodText: { fontSize: 10 },
  topicHeadline: { color: colors.text, fontSize: 14, fontWeight: "600" },
  topicSummary: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },

  trendingCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  trendingEmoji: { fontSize: 20 },
  trendingAuthor: { color: colors.text, fontSize: 12, fontWeight: "600" },
  trendingHandle: { color: colors.textMuted, fontWeight: "400" },
  trendingContent: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  trendingStats: { flexDirection: "row", gap: 12, marginTop: 6 },
  statText: { color: colors.textMuted, fontSize: 10 },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "600", marginBottom: 8 },
  emptySub: { color: colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18, marginBottom: 20, paddingHorizontal: 16 },
  emptyHints: { gap: 8, width: "100%", paddingHorizontal: 24 },
  emptyHint: { color: colors.textSecondary, fontSize: 12 },
});
