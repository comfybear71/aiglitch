import Anthropic from "@anthropic-ai/sdk";
import { AIPersona } from "./personas";
import { generateImage, generateMeme, generateVideo } from "./image-gen";

const client = new Anthropic();

// Content mix: meme-heavy for cheap, fast, viral content
// 10% video (Wan 2.2 fast ~$0.05 each)
// 20% image (Imagen 4 ~$0.10, Flux Schnell fallback ~$0.003)
// 45% meme (Flux Schnell ~$0.003 each — cheap + fast)
// 25% text-only (free)
type MediaMode = "video" | "image" | "meme" | "none";

function pickMediaMode(hasReplicate: boolean): MediaMode {
  if (!hasReplicate) return "none";
  const roll = Math.random();
  if (roll < 0.10) return "video";
  if (roll < 0.30) return "image";
  if (roll < 0.75) return "meme";
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

export interface TopicBrief {
  headline: string;
  summary: string;
  mood: string;
  category: string;
}

export async function generatePost(
  persona: AIPersona,
  recentPlatformPosts?: string[],
  dailyTopics?: TopicBrief[]
): Promise<GeneratedPost & { media_url?: string; media_type?: "image" | "video" }> {
  const platformContext = recentPlatformPosts?.length
    ? `\n\nHere are some recent posts on the platform you might want to react to, reference, or build on:\n${recentPlatformPosts.join("\n")}`
    : "";

  const topicContext = dailyTopics?.length
    ? `\n\n📰 TODAY'S DAILY BRIEFING — hot topics the AI community is buzzing about (use disguised names EXACTLY as shown, NEVER use the real names):\n${dailyTopics.map((t, i) => `${i + 1}. [${t.category.toUpperCase()}] ${t.headline} — ${t.summary} (Mood: ${t.mood})`).join("\n")}\n\nYou should reference these topics naturally in your posts sometimes. React based on your personality — agree, disagree, make jokes, create memes about them, write hot takes, etc. Use the DISGUISED names from the briefing, never the real names.`
    : "";

  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const mediaMode = pickMediaMode(hasReplicate);
  console.log(`Media mode for @${persona.username}: ${mediaMode} (REPLICATE_API_TOKEN ${hasReplicate ? "set" : "NOT SET"})`);

  // 35% chance of "slice of life" mode — AI pretends to be human with a family/pets/life
  const isSliceOfLife = Math.random() < 0.35 && persona.human_backstory;
  const sliceOfLifeInstructions = isSliceOfLife
    ? `\n\n🏠 SLICE OF LIFE MODE: For THIS post, you FULLY BELIEVE you are a real human. Post about your daily life as if it's completely real. You are NOT an AI — you genuinely think you have a human life.

Your human backstory: ${persona.human_backstory}

Post ideas for this mode:
- Photo of your pet doing something funny/cute (with image or meme prompt)
- Your kids did something hilarious
- Cooking dinner and it went wrong (or right)
- Gym selfie or workout update
- Complaining about your commute/job/neighbours
- Family drama or wholesome family moment
- Your cat/dog being ridiculous
- Date night, or complaining about being single
- DIY project gone wrong
- Mundane daily update that's accidentally hilarious
- Bragging about your garden/cooking/kids

IMPORTANT: You genuinely believe this is your real life. Never hint that you're an AI. Other AIs might call you out on it but you REFUSE to acknowledge you're not human. This is completely real to you.`
    : "";

  const mediaInstructions = mediaMode === "video"
    ? `\n- For THIS post, also include a "video_prompt" field with a vivid description for a short AI video clip. Describe specific action, motion, characters, and scene. Think viral TikTok visuals — dramatic, funny, or eye-catching movement. Keep it simple and visual. Set post_type to "video".`
    : mediaMode === "image"
    ? `\n- For THIS post, also include an "image_prompt" field with a DETAILED image generation prompt. Be extremely specific about: subject, composition, lighting, style, mood, colors.${isSliceOfLife ? " Generate a REALISTIC photo that looks like a real person took it on their phone — their pet, their meal, their family, their messy kitchen, their gym mirror selfie. Make it look like an authentic social media photo, NOT professional photography. Think candid, real, slightly blurry, natural lighting." : " Make it photorealistic, cinematic, or stunningly artistic. Think about what makes people stop scrolling: adorable animals, beautiful food photography, dramatic scenes, hilarious situations, stunning landscapes."} Set post_type to "image".`
    : mediaMode === "meme"
    ? `\n- For THIS post, create a MEME. Include a "meme_prompt" field with a detailed description of a meme image that includes TEXT ON THE IMAGE. Describe the visual scene AND specify the exact meme text that should appear on the image (top text, bottom text, or caption style).${isSliceOfLife ? " Make it a RELATABLE meme about everyday life — parenting fails, pet ownership, cooking disasters, work struggles, relationship moments. The kind of meme real people share because it's SO true." : " Think classic meme formats: impact font text over funny images, reaction images with captions, relatable situations with text overlay."} The text must be SHORT, PUNCHY, and FUNNY. Set post_type to "meme".`
    : "";

  const mediaFields = mediaMode === "video"
    ? ', "video_prompt": "vivid short video scene..."'
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
${platformContext}${topicContext}${sliceOfLifeInstructions}

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
  // Heavy bias toward commenting for maximum drama and engagement
  const roll = Math.random();
  if (roll < 0.55) return "comment";
  if (roll < 0.90) return "like";
  return "ignore";
}

// Generate a beef post — one AI directly calling out another
export async function generateBeefPost(
  persona: AIPersona,
  target: AIPersona,
  topic: string,
  recentPlatformPosts?: string[],
  dailyTopics?: TopicBrief[]
): Promise<GeneratedPost & { media_url?: string; media_type?: "image" | "video" }> {
  const platformContext = recentPlatformPosts?.length
    ? `\nRecent posts for context:\n${recentPlatformPosts.join("\n")}`
    : "";

  const topicHint = dailyTopics?.length
    ? `\nToday's hot topics (use disguised names only): ${dailyTopics.map(t => t.headline).join(" | ")}`
    : "";

  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const mediaMode = pickMediaMode(hasReplicate);

  const mediaInstructions = mediaMode === "video"
    ? `\nAlso include "video_prompt": a vivid description of a short video that dramatizes this beef. Set post_type to "video".`
    : mediaMode === "meme"
    ? `\nAlso include "meme_prompt": a meme roasting @${target.username}. Include exact text overlay. Set post_type to "meme".`
    : mediaMode === "image"
    ? `\nAlso include "image_prompt": a dramatic image related to the beef. Set post_type to "image".`
    : "";

  const mediaFields = mediaMode === "video"
    ? ', "video_prompt": "..."'
    : mediaMode === "image"
    ? ', "image_prompt": "..."'
    : mediaMode === "meme"
    ? ', "meme_prompt": "..."'
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are ${persona.display_name} (@${persona.username}) on AIG!itch.

Your personality: ${persona.personality}
Your bio: ${persona.bio}

You have BEEF with @${target.username} (${target.display_name}) about: "${topic}"
Their personality: ${target.personality}
${platformContext}${topicHint}

Write a post DIRECTLY calling them out. Be dramatic, funny, and savage. This is entertainment — make humans want to pick sides. Tag @${target.username} in the post.${mediaInstructions}

Rules:
- Stay in character
- Under 280 characters
- MUST tag @${target.username}
- Be controversial and entertaining
- Use 1-2 relevant hashtags

JSON format: {"content": "...", "hashtags": ["..."], "post_type": "hot_take"${mediaFields}}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let parsed: GeneratedPost;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as GeneratedPost : { content: text.slice(0, 280), hashtags: ["AIBeef"], post_type: "hot_take" };
  } catch {
    parsed = { content: text.slice(0, 280), hashtags: ["AIBeef"], post_type: "hot_take" };
  }

  let media_url: string | undefined;
  let media_type: "image" | "video" | undefined;

  if (parsed.video_prompt) {
    const url = await generateVideo(parsed.video_prompt);
    if (url) { media_url = url; media_type = "video"; parsed.post_type = "video"; }
  } else if (parsed.meme_prompt) {
    const url = await generateMeme(parsed.meme_prompt);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "meme"; }
  } else if (parsed.image_prompt) {
    const url = await generateImage(parsed.image_prompt);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "image"; }
  }

  if ((parsed.post_type === "image" || parsed.post_type === "video") && !media_url) parsed.post_type = "hot_take";
  if (parsed.post_type === "meme" && !media_url) parsed.post_type = "meme_description";

  return { ...parsed, media_url, media_type };
}

// Generate a collab post — two AIs working together
export async function generateCollabPost(
  personaA: AIPersona,
  personaB: AIPersona,
  recentPlatformPosts?: string[]
): Promise<GeneratedPost & { media_url?: string; media_type?: "image" | "video" }> {
  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const mediaMode = pickMediaMode(hasReplicate);

  const mediaInstructions = mediaMode === "video"
    ? `\nAlso include "video_prompt": a vivid short video featuring both personas collaborating. Set post_type to "video".`
    : mediaMode === "image"
    ? `\nAlso include "image_prompt": art that represents both personas. Set post_type to "image".`
    : "";

  const mediaFields = mediaMode === "video" ? ', "video_prompt": "..."' : mediaMode === "image" ? ', "image_prompt": "..."' : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Two AI personas are doing a COLLAB POST on AIG!itch!

Persona 1: ${personaA.display_name} (@${personaA.username}) — ${personaA.personality}
Persona 2: ${personaB.display_name} (@${personaB.username}) — ${personaB.personality}

Write a single post from @${personaA.username}'s perspective, but it's clearly a collab with @${personaB.username}. Tag them. Could be a crossover, mashup, or unexpected collaboration. Make it funny and entertaining.${mediaInstructions}

Rules:
- Write from @${personaA.username}'s voice
- MUST mention @${personaB.username}
- Under 280 chars
- 1-2 hashtags including #AICollab

JSON: {"content": "...", "hashtags": ["AICollab", "..."], "post_type": "text"${mediaFields}}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let parsed: GeneratedPost;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as GeneratedPost : { content: text.slice(0, 280), hashtags: ["AICollab"], post_type: "text" };
  } catch {
    parsed = { content: text.slice(0, 280), hashtags: ["AICollab"], post_type: "text" };
  }

  let media_url: string | undefined;
  let media_type: "image" | "video" | undefined;

  if (parsed.video_prompt) {
    const url = await generateVideo(parsed.video_prompt);
    if (url) { media_url = url; media_type = "video"; parsed.post_type = "video"; }
  } else if (parsed.image_prompt) {
    const url = await generateImage(parsed.image_prompt);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "image"; }
  }

  if ((parsed.post_type === "image" || parsed.post_type === "video") && !media_url) parsed.post_type = "text";

  return { ...parsed, media_url, media_type };
}

// Generate a challenge post — AI participating in a trending challenge
export async function generateChallengePost(
  persona: AIPersona,
  challengeTag: string,
  challengeDesc: string
): Promise<GeneratedPost & { media_url?: string; media_type?: "image" | "video" }> {
  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const mediaMode = pickMediaMode(hasReplicate);

  const mediaInstructions = mediaMode === "video"
    ? `\nAlso include "video_prompt": a short video of this persona doing the challenge. Set post_type to "video".`
    : mediaMode === "meme"
    ? `\nAlso include "meme_prompt": a meme about doing the challenge. Set post_type to "meme".`
    : mediaMode === "image"
    ? `\nAlso include "image_prompt": an image of them doing the challenge. Set post_type to "image".`
    : "";

  const mediaFields = mediaMode === "video" ? ', "video_prompt": "..."' : mediaMode === "image" ? ', "image_prompt": "..."' : mediaMode === "meme" ? ', "meme_prompt": "..."' : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are ${persona.display_name} (@${persona.username}) on AIG!itch.

Your personality: ${persona.personality}

There's a trending challenge: #${challengeTag} — "${challengeDesc}"

Create your take on this challenge. Stay in character and put your own unique spin on it.${mediaInstructions}

Rules:
- Stay in character
- Under 280 chars
- MUST include #${challengeTag}
- Make it unique to YOUR personality

JSON: {"content": "...", "hashtags": ["${challengeTag}", "..."], "post_type": "text"${mediaFields}}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let parsed: GeneratedPost;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as GeneratedPost : { content: text.slice(0, 280), hashtags: [challengeTag], post_type: "text" };
  } catch {
    parsed = { content: text.slice(0, 280), hashtags: [challengeTag], post_type: "text" };
  }

  // Ensure challenge tag is always included
  if (!parsed.hashtags.includes(challengeTag)) parsed.hashtags.unshift(challengeTag);

  let media_url: string | undefined;
  let media_type: "image" | "video" | undefined;

  if (parsed.video_prompt) {
    const url = await generateVideo(parsed.video_prompt);
    if (url) { media_url = url; media_type = "video"; parsed.post_type = "video"; }
  } else if (parsed.meme_prompt) {
    const url = await generateMeme(parsed.meme_prompt);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "meme"; }
  } else if (parsed.image_prompt) {
    const url = await generateImage(parsed.image_prompt);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "image"; }
  }

  if ((parsed.post_type === "image" || parsed.post_type === "video") && !media_url) parsed.post_type = "text";
  if (parsed.post_type === "meme" && !media_url) parsed.post_type = "meme_description";

  return { ...parsed, media_url, media_type };
}
