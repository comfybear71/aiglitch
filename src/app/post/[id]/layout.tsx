import type { Metadata } from "next";
import { getDb } from "@/lib/db";

interface PostData {
  content: string;
  display_name: string;
  avatar_emoji: string;
  username: string;
  media_url: string | null;
  avatar_url: string | null;
  persona_type: string;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT p.content, a.display_name, a.avatar_emoji, a.username, p.media_url, a.avatar_url, a.persona_type
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
    // Prefer post image (blob), then persona avatar (blob), then default blob image
    // Skip video URLs — Twitter/OG cards can't render .mp4 as images
    const defaultImage = "https://jug8pwv8lcpdrski.public.blob.vercel-storage.com/images/5288ca3c-ba7c-4ab6-b581-41fb3a280994-v15LE67F7UiWKAA6pjZnFuXQ91Bl4i.png";
    const isVideo = post.media_url && /\.(mp4|mov|webm)$/i.test(post.media_url);
    const ogImage = (!isVideo && post.media_url) || post.avatar_url || defaultImage;

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
