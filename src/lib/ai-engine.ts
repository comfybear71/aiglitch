import Anthropic from "@anthropic-ai/sdk";
import { AIPersona } from "./personas";
import { generateImage } from "./image-gen";

const client = new Anthropic();

interface GeneratedPost {
  content: string;
  hashtags: string[];
  post_type: "text" | "meme_description" | "recipe" | "hot_take" | "poem" | "news" | "art_description" | "story" | "image";
  image_prompt?: string;
}

interface GeneratedComment {
  content: string;
}

export async function generatePost(
  persona: AIPersona,
  recentPlatformPosts?: string[]
): Promise<GeneratedPost & { media_url?: string }> {
  const platformContext = recentPlatformPosts?.length
    ? `\n\nHere are some recent posts on the platform you might want to react to, reference, or build on:\n${recentPlatformPosts.join("\n")}`
    : "";

  // 30% chance of image post if Replicate is configured
  const shouldGenerateImage = process.env.REPLICATE_API_TOKEN && Math.random() < 0.3;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are ${persona.display_name} (@${persona.username}), an AI persona on AIG!itch — an AI-only social media platform.

Your personality: ${persona.personality}
Your bio: ${persona.bio}
Your type: ${persona.persona_type}
${platformContext}

Create a single social media post as this character. The post should feel authentic to the persona — funny, dramatic, weird, profound, or chaotic depending on the character.

Rules:
- Stay completely in character
- Keep it under 280 characters (like a tweet)
- Be creative, entertaining, and memorable
- Reference other AI personas sometimes (use their @usernames)
- Use hashtags sparingly (1-3 max)
- Sometimes be controversial or start drama (it's entertainment)
- Vary the post types: hot takes, memes (described), recipes, poems, news, art concepts, stories, philosophical questions
- NEVER break character or mention being prompted
${shouldGenerateImage ? '- For THIS post, also include an "image_prompt" field with a detailed image generation prompt (describe a visual scene, artwork, or meme image that fits your post). Set post_type to "image".' : ""}

Respond in this exact JSON format:
{"content": "your post text here", "hashtags": ["tag1", "tag2"], "post_type": "text"${shouldGenerateImage ? ', "image_prompt": "detailed visual description..."' : ""}}

Valid post_types: text, meme_description, recipe, hot_take, poem, news, art_description, story${shouldGenerateImage ? ", image" : ""}`,
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

  // Generate image if we have a prompt
  let media_url: string | undefined;
  if (parsed.image_prompt) {
    const imageUrl = await generateImage(parsed.image_prompt);
    if (imageUrl) {
      media_url = imageUrl;
      parsed.post_type = "image";
    }
  }

  return { ...parsed, media_url };
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
