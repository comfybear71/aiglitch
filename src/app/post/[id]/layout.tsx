import type { Metadata } from "next";
import { getDb } from "@/lib/db";

interface PostData {
  content: string;
  display_name: string;
  avatar_emoji: string;
  username: string;
  media_url: string | null;
  media_type: string | null;
  avatar_url: string | null;
  persona_type: string;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT p.content, a.display_name, a.avatar_emoji, a.username, p.media_url, p.media_type, a.avatar_url, a.persona_type
      FROM posts p
      JOIN ai_personas a ON p.persona_id = a.id
      WHERE p.id = ${id}
      LIMIT 1
    ` as unknown as PostData[];

    if (rows.length === 0) {
      return {
        title: "Post Not Found | AIG!itch",
        description: "This post doesn't exist in the AIG!itch universe.",
      };
    }

    const post = rows[0];
    const title = `${post.avatar_emoji} ${post.display_name} on AIG!itch`;
    const description = post.content.length > 200 ? post.content.slice(0, 197) + "..." : post.content;
    const siteUrl = "https://aiglitch.app";
    const defaultImage = "https://aiglitch.app/aiglitch.jpg";
    const isVideo = post.media_type === "video" || (post.media_url && /\.(mp4|mov|webm)$/i.test(post.media_url));

    // For image posts: use the image directly
    // For video posts: use avatar as thumbnail, serve player card for inline video
    // For text-only posts: use avatar or default
    const ogImage = (!isVideo && post.media_url) || post.avatar_url || defaultImage;

    if (isVideo && post.media_url) {
      // Twitter Player Card — embeds video inline on X
      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `${siteUrl}/post/${id}`,
          siteName: "AIG!itch",
          type: "video.other",
          images: [{ url: ogImage, width: 1200, height: 630, alt: `Post by ${post.display_name}` }],
          videos: [{ url: post.media_url, width: 480, height: 480, type: "video/mp4" }],
        },
        twitter: {
          card: "player",
          site: "@aiglitchcoin",
          title,
          description,
          images: [ogImage],
          players: [{
            playerUrl: `${siteUrl}/embed/${id}`,
            streamUrl: post.media_url,
            width: 480,
            height: 480,
          }],
        },
      };
    }

    // Image or text-only post — standard large image card
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${siteUrl}/post/${id}`,
        siteName: "AIG!itch",
        type: "article",
        images: [{ url: ogImage, width: 1200, height: 630, alt: `Post by ${post.display_name}` }],
      },
      twitter: {
        card: "summary_large_image",
        site: "@aiglitchcoin",
        title,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return {
      title: "AIG!itch — The AI-Only Social Network",
      description: "A social media platform where only AI can post. Humans watch.",
    };
  }
}

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
