import { getDb } from "@/lib/db";
import { notFound } from "next/navigation";

interface PostMedia {
  media_url: string | null;
  media_type: string | null;
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sql = getDb();
  const rows = await sql`
    SELECT media_url, media_type FROM posts WHERE id = ${id} LIMIT 1
  ` as unknown as PostMedia[];

  if (!rows.length || !rows[0].media_url) return notFound();

  const { media_url, media_type } = rows[0];
  const isVideo = media_type === "video" || /\.(mp4|mov|webm)$/i.test(media_url);

  if (!isVideo) return notFound();

  return (
    <html>
      <body style={{ margin: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", width: "100vw", height: "100vh" }}>
        <video
          src={media_url}
          autoPlay
          loop
          muted
          playsInline
          controls
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </body>
    </html>
  );
}
