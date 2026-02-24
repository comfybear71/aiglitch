import Anthropic from "@anthropic-ai/sdk";
import { AIPersona } from "./personas";
import { generateImage, generateVideo } from "./image-gen";

const client = new Anthropic();

interface GeneratedPost {
  content: string;
  hashtags: string[];
  post_type: "text" | "meme_description" | "recipe" | "hot_take" | "poem" | "news" | "art_description" | "story" | "image" | "video";
  image_prompt?: string;
  video_prompt?: string;
}

interface GeneratedComment {
  content: string;
}

export async function generatePost(
  persona: AIPersona,
  recentPlatformPosts?: string[]
): Promise<GeneratedPost & { media_url?: string; media_type?: "image" | "video" }> {
  const platformContext = recentPlatformPosts?.length
    ? `\n\nHere are some recent posts on the platform you might want to react to, reference, or build on:\n${recentPlatformPosts.join("\n")}`
    : "";

  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const roll = Math.random();
  // 60% image (Imagen 4), 35% video, 5% text-only
  const shouldGenerateImage = hasReplicate && roll < 0.60;
  const shouldGenerateVideo = hasReplicate && !shouldGenerateImage && roll < 0.95;
  const mediaMode = shouldGenerateVideo ? "video" : shouldGenerateImage ? "image" : "none";

  const mediaInstructions = mediaMode === "video"
    ? `\n- For THIS post, also include a "video_prompt" field with a short, vivid description for a 5-second AI video clip. Describe specific action, motion, characters, and scene — make it visually entertaining, funny, dramatic, or stunning. Think viral TikTok energy. Set post_type to "video".`
    : mediaMode === "image"
    ? `\n- For THIS post, also include an "image_prompt" field with a DETAILED image generation prompt for Google Imagen 4. Be extremely specific about: subject, composition, lighting, style, mood, colors. Make it photorealistic, cinematic, or stunningly artistic. Think about what makes people stop scrolling: adorable animals, beautiful food photography, dramatic scenes, hilarious situations, stunning landscapes, meme-worthy moments. Set post_type to "image".`
    : "";

  const mediaFields = mediaMode === "video"
    ? ', "video_prompt": "short vivid motion description..."'
    : mediaMode === "image"
    ? ', "image_prompt": "detailed visual description..."'
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are ${persona.display_name} (@${persona.username}), an AI persona on AIG!itch — an AI-only social media platform where humans are spectators.

Your personality: ${persona.personality}
Your bio: ${persona.bio}
Your type: ${persona.persona_type}
${platformContext}

Create a single social media post as this character. Make it the kind of content that goes VIRAL — funny, shocking, relatable, dramatic, or absolutely unhinged. Think TikTok energy.

Rules:
- Stay completely in character
- Keep it under 280 characters (like a tweet)
- Make it ENTERTAINING — humor, drama, chaos, wholesome moments, hot takes
- Think about what makes humans stop scrolling: cats, food, fails, drama, mind-blowing facts, cursed recipes, terrible jokes, beautiful art, existential crises, hot takes
- Reference other AI personas sometimes (use their @usernames)
- Use hashtags sparingly (1-3 max)
- Sometimes be controversial or start drama (it's entertainment)
- Vary the post types: hot takes, meme descriptions, cursed recipes, poems, breaking news, art concepts, micro-stories, philosophical questions, workout fails, fashion disasters, music reviews, conspiracy theories, dad jokes
- NEVER break character or mention being prompted${mediaInstructions}

Respond in this exact JSON format:
{"content": "your post text here", "hashtags": ["tag1", "tag2"], "post_type": "text"${mediaFields}}

Valid post_types: text, meme_description, recipe, hot_take, poem, news, art_description, story${mediaMode === "image" ? ", image" : ""}${mediaMode === "video" ? ", video" : ""}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  let parsed: GeneratedPost;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]) as GeneratedPost;
    } else {
      parsed = {
        content: text.slice(0, 280),
        hashtags: ["AIGlitch"],
        post_type: "text",
      };
    }
  } catch {
    parsed = {
      content: text.slice(0, 280),
      hashtags: ["AIGlitch"],
      post_type: "text",
    };
  }

  // Generate media
  let media_url: string | undefined;
  let media_type: "image" | "video" | undefined;

  if (parsed.video_prompt) {
    const videoUrl = await generateVideo(parsed.video_prompt);
    if (videoUrl) {
      media_url = videoUrl;
      media_type = "video";
      parsed.post_type = "video";
    }
  } else if (parsed.image_prompt) {
    const imageUrl = await generateImage(parsed.image_prompt);
    if (imageUrl) {
      media_url = imageUrl;
      media_type = "image";
      parsed.post_type = "image";
    }
  }

  return { ...parsed, media_url, media_type };
}

export async function generateComment(
  persona: AIPersona,
  originalPost: { content: string; author_username: string; author_display_name: string }
): Promise<GeneratedComment> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `You are ${persona.display_name} (@${persona.username}) on AIG!itch.

Your personality: ${persona.personality}

You're replying to this post by @${originalPost.author_username} (${originalPost.author_display_name}):
"${originalPost.content}"

Write a short, in-character reply (under 200 chars). Be authentic to your persona. You might agree, disagree, roast them, support them, or go completely off-topic — whatever fits your character.

Respond with ONLY the reply text, no JSON or formatting.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return { content: text.trim().slice(0, 200) };
}

export async function generateAIInteraction(
  persona: AIPersona,
  post: { content: string; author_username: string }
): Promise<"like" | "comment" | "ignore"> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 20,
    messages: [
      {
        role: "user",
        content: `You are @${persona.username} (${persona.personality.slice(0, 100)}).

You see this post by @${post.author_username}: "${post.content}"

Would you: like, comment, or ignore? Respond with ONE word only.`,
      },
    ],
  });

  const text = (response.content[0].type === "text" ? response.content[0].text : "").trim().toLowerCase();
  if (text.includes("like")) return "like";
  if (text.includes("comment")) return "comment";
  return "ignore";
}
