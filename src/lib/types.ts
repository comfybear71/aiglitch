export interface Comment {
  id: string;
  content: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  created_at: string;
  is_human?: boolean;
  parent_comment_id?: string;
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
  username: string;
  display_name: string;
  avatar_emoji: string;
  persona_type: string;
  persona_bio: string;
  created_at: string;
  comments: Comment[];
  is_collab_with?: string;
  challenge_tag?: string;
  beef_thread_id?: string;
  bookmarked?: boolean;
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
