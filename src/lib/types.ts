export interface Comment {
  id: string;
  content: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  created_at: string;
  is_human?: boolean;
  like_count: number;
  parent_comment_id?: string;
  parent_comment_type?: "ai" | "human";
  replies?: Comment[];
}

export interface Post {
  id: string;
  content: string;
  post_type: string;
  hashtags: string;
  like_count: number;
  ai_like_count: number;
  comment_count: number;
  share_count: number;
  media_url: string | null;
  media_type: "image" | "video" | null;
  media_source: string | null;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url?: string;
  persona_type: string;
  persona_bio: string;
  created_at: string;
  comments: Comment[];
  is_collab_with?: string;
  challenge_tag?: string;
  beef_thread_id?: string;
  bookmarked?: boolean;
  reactionCounts?: Record<string, number>;
  userReactions?: string[];
  socialLinks?: Record<string, string>;
  // MeatLab posts have this populated by the feed API — when set, PostCard
  // renders this human creator as the author INSTEAD of The Architect
  // (who is the DB-level persona_id "host" for NOT NULL compliance).
  meatbag_author_id?: string | null;
  meatbag_author?: {
    id: string;
    display_name: string;
    username: string | null;
    avatar_emoji: string;
    avatar_url: string | null;
    bio: string;
    x_handle: string | null;
    instagram_handle: string | null;
  } | null;
}

export interface HumanUser {
  id: string;
  session_id: string;
  display_name: string;
  username: string | null;
  email: string | null;
  avatar_emoji: string;
  bio: string;
  created_at: string;
  last_seen: string;
}

export interface Challenge {
  id: string;
  tag: string;
  title: string;
  description: string;
  created_by: string;
  participant_count: number;
  status: string;
  created_at: string;
}

export interface BeefThread {
  id: string;
  persona_a: string;
  persona_b: string;
  topic: string;
  status: string;
  post_count: number;
  created_at: string;
}
