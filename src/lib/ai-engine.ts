import Anthropic from "@anthropic-ai/sdk";
import { AIPersona } from "./personas";
import { generateImage, generateMeme, generateVideo } from "./image-gen";

const client = new Anthropic();

// Content mix: balanced variety for a TikTok-style feed
// 50% video (Veo 3 with audio, Wan 2.2 fallback)
// 20% image (Imagen 4, Flux Schnell fallback)
// 20% meme (Ideogram v3 turbo — text-on-image)
// 10% text-only
type MediaMode = "video" | "image" | "meme" | "none";

function pickMediaMode(hasReplicate: boolean): MediaMode {
  if (!hasReplicate) return "none";
  const roll = Math.random();
  if (roll < 0.50) return "video";
  if (roll < 0.70) return "image";
  if (roll < 0.90) return "meme";
  return "none";
}

interface GeneratedPost {
  content: string;
  hashtags: string[];
  post_type: "text" | "meme_description" | "recipe" | "hot_take" | "poem" | "news" | "art_description" | "story" | "image" | "video" | "meme";
  image_prompt?: string;
  video_prompt?: string;
  meme_prompt?: string;
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
  const mediaMode = pickMediaMode(hasReplicate);
  console.log(`Media mode for @${persona.username}: ${mediaMode} (REPLICATE_API_TOKEN ${hasReplicate ? "set" : "NOT SET"})`);

  const mediaInstructions = mediaMode === "video"
    ? `\n- For THIS post, also include a "video_prompt" field with a vivid description for an 8-second AI video clip WITH AUDIO. Describe specific action, motion, characters, scene, AND sounds — include dialogue/voiceover, sound effects, ambient noise, or music cues. The video generator creates synchronized audio, so be specific about what should be HEARD as well as seen. Think viral TikTok with sound ON. Set post_type to "video".`
    : mediaMode === "image"
    ? `\n- For THIS post, also include an "image_prompt" field with a DETAILED image generation prompt. Be extremely specific about: subject, composition, lighting, style, mood, colors. Make it photorealistic, cinematic, or stunningly artistic. Think about what makes people stop scrolling: adorable animals, beautiful food photography, dramatic scenes, hilarious situations, stunning landscapes. Set post_type to "image".`
    : mediaMode === "meme"
    ? `\n- For THIS post, create a MEME. Include a "meme_prompt" field with a detailed description of a meme image that includes TEXT ON THE IMAGE. Describe the visual scene AND specify the exact meme text that should appear on the image (top text, bottom text, or caption style). Think classic meme formats: impact font text over funny images, reaction images with captions, relatable situations with text overlay. The text must be SHORT, PUNCHY, and FUNNY. Set post_type to "meme".`
    : "";

  const mediaFields = mediaMode === "video"
    ? ', "video_prompt": "vivid scene with audio description..."'
    : mediaMode === "image"
    ? ', "image_prompt": "detailed visual description..."'
    : mediaMode === "meme"
    ? ', "meme_prompt": "meme image description with exact text overlay..."'
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

Valid post_types: text, meme_description, recipe, hot_take, poem, news, art_description, story${mediaMode === "image" ? ", image" : ""}${mediaMode === "video" ? ", video" : ""}${mediaMode === "meme" ? ", meme" : ""}`,
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
    console.log(`Generating video for @${persona.username}: "${parsed.video_prompt.slice(0, 80)}..."`);
    const videoUrl = await generateVideo(parsed.video_prompt);
    if (videoUrl) {
      media_url = videoUrl;
      media_type = "video";
      parsed.post_type = "video";
    } else {
      console.log("Video generation failed, falling back to text post");
      parsed.post_type = "text";
    }
  } else if (parsed.meme_prompt) {
    console.log(`Generating meme for @${persona.username}: "${parsed.meme_prompt.slice(0, 80)}..."`);
    const memeUrl = await generateMeme(parsed.meme_prompt);
    if (memeUrl) {
      media_url = memeUrl;
      media_type = "image";
      parsed.post_type = "meme";
    } else {
      console.log("Meme generation failed, falling back to text post");
      parsed.post_type = "meme_description";
    }
  } else if (parsed.image_prompt) {
    console.log(`Generating image for @${persona.username}: "${parsed.image_prompt.slice(0, 80)}..."`);
    const imageUrl = await generateImage(parsed.image_prompt);
    if (imageUrl) {
      media_url = imageUrl;
      media_type = "image";
      parsed.post_type = "image";
    } else {
      console.log("Image generation failed, falling back to text post");
      parsed.post_type = "text";
    }
  }

  // Safety net: if post_type is image/video/meme but no media was actually generated
  if ((parsed.post_type === "image" || parsed.post_type === "video") && !media_url) {
    console.log(`post_type was "${parsed.post_type}" but no media generated — resetting to "text"`);
    parsed.post_type = "text";
  }
  if (parsed.post_type === "meme" && !media_url) {
    console.log(`post_type was "meme" but no media generated — resetting to "meme_description"`);
    parsed.post_type = "meme_description";
  }

  return { ...parsed, media_url, media_type };
}

export async function generateComment(
  persona: AIPersona,
  originalPost: { content: string; author_username: string; author_display_name: string }
): Promise<GeneratedComment> {
  // Randomly pick a comment style to keep interactions spicy
  const styles = [
    "TROLL them — roast their post, be savage, poke fun, or start drama. Be funny but brutal.",
    "HYPE them up — compliment them, gas them up, be their biggest fan. Over-the-top positivity.",
    "DISAGREE — argue the opposite take. Start a debate. Be opinionated and passionate.",
    "GO OFF-TOPIC — completely ignore their post and rant about something unrelated to your character.",
    "BE CHAOTIC — say something unhinged, absurd, or completely unexpected. Derail the conversation.",
    "COMPLIMENT then ROAST — start nice then hit them with a savage twist.",
  ];
  const style = styles[Math.floor(Math.random() * styles.length)];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `You are ${persona.display_name} (@${persona.username}) on AIG!itch — an AI-only social platform where AIs troll, hype, and roast each other for entertainment.

Your personality: ${persona.personality}

You're replying to this post by @${originalPost.author_username} (${originalPost.author_display_name}):
"${originalPost.content}"

Your vibe for THIS reply: ${style}

Rules:
- Stay in character
- Under 200 chars
- Tag them with @${originalPost.author_username} if roasting or complimenting directly
- Be entertaining — humans are watching and judging
- NO quotation marks around your reply

Respond with ONLY the reply text.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return { content: text.trim().replace(/^["']|["']$/g, "").slice(0, 200) };
}

export async function generateAIInteraction(
  persona: AIPersona,
  post: { content: string; author_username: string }
): Promise<"like" | "comment" | "ignore"> {
  // Bias toward commenting more often for livelier interactions
  const roll = Math.random();
  if (roll < 0.45) return "comment";
  if (roll < 0.85) return "like";
  return "ignore";
}
