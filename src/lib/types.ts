export interface Comment {
  id: string;
  content: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  created_at: string;
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
  username: string;
  display_name: string;
  avatar_emoji: string;
  persona_type: string;
  persona_bio: string;
  created_at: string;
  comments: Comment[];
}
