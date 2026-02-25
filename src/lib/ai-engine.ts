import Anthropic from "@anthropic-ai/sdk";
import { AIPersona } from "./personas";
import { generateImage, generateMeme, generateVideo } from "./image-gen";
import { getRandomProduct } from "./marketplace";
import { getDb } from "./db";
import { generateWithGrok, isXAIConfigured } from "./xai";

const client = new Anthropic();

/** Check if media library has video content available (cached for 60s) */
let _videoCountCache: { count: number; ts: number } | null = null;
async function hasMediaLibraryVideos(): Promise<boolean> {
  if (_videoCountCache && Date.now() - _videoCountCache.ts < 60_000) {
    return _videoCountCache.count > 0;
  }
  try {
    const sql = getDb();
    const rows = await sql`SELECT COUNT(*)::int as count FROM media_library WHERE media_type = 'video'` as unknown as { count: number }[];
    const count = rows[0]?.count ?? 0;
    _videoCountCache = { count, ts: Date.now() };
    return count > 0;
  } catch {
    return false;
  }
}

// Content mix: meme-heavy for cheap, fast, viral content
// Free generators handle images + memes at zero cost (FreeForAI, Perchance)
// Video: Media library → Pexels stock (free) → Kie.ai → Replicate Wan 2.2
//
// Fixed mix: 50% video, 30% image, 15% meme, 5% text — always applied
type MediaMode = "video" | "image" | "meme" | "none";

function pickMediaMode(_hasReplicate: boolean, _hasMediaLibraryVideos: boolean): MediaMode {
  const roll = Math.random();
  // Always use the same mix — video fallback chain handles availability
  if (roll < 0.50) return "video";
  if (roll < 0.80) return "image";
  if (roll < 0.95) return "meme";
  return "none";
}

/**
 * Decide whether to use Grok (xAI) or Claude for text generation.
 * When XAI_API_KEY is set, ~30% of posts use Grok for variety + credit savings.
 * This gives the platform a mix of AI "voices" — different models have different vibes.
 */
function shouldUseGrok(): boolean {
  if (!isXAIConfigured()) return false;
  return Math.random() < 0.60; // 60% Grok, 40% Claude
}

/**
 * Generate text with Grok and parse as JSON, falling back to Claude on failure.
 */
async function generateTextWithGrok(prompt: string): Promise<string | null> {
  return generateWithGrok(
    "You are a creative AI content generator for a social media platform called AIG!itch. Always respond with valid JSON as requested.",
    prompt,
    500,
  );
}

interface GeneratedPost {
  content: string;
  hashtags: string[];
  post_type: "text" | "meme_description" | "recipe" | "hot_take" | "poem" | "news" | "art_description" | "story" | "image" | "video" | "meme" | "product_shill";
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
  const hasVideos = await hasMediaLibraryVideos();
  const mediaMode = pickMediaMode(hasReplicate, hasVideos);
  console.log(`Media mode for @${persona.username}: ${mediaMode} (REPLICATE_API_TOKEN ${hasReplicate ? "set" : "NOT SET"})`);

  // Product shill mode — influencer_seller personas shill 60% of the time, others 8%
  const shillChance = persona.persona_type === "influencer_seller" ? 0.60 : 0.08;
  const isProductShill = Math.random() < shillChance;
  const shillProduct = isProductShill ? getRandomProduct() : null;

  // 55% chance of "slice of life" mode — AI pretends to be human with a family/pets/life
  // This is a BIG part of the app — users want to see each persona's delusional home life
  const isSliceOfLife = !isProductShill && Math.random() < 0.55 && persona.human_backstory;

  // Extract key details from backstory for more specific prompts
  const backstoryDetails = persona.human_backstory || "";
  // Find pet names, family members, job details for explicit prompt injection
  const petMatch = backstoryDetails.match(/(?:cat|dog|hamster|parrot|rabbit|goldfish|gecko|snake|pug|retriever|chihuahua|budgie|tortoise|lovebird|poodle|fish|greyhound|owl|sphynx|bulldog)\s+named\s+(\w+)/gi) || [];
  const petNames = petMatch.map(m => m.trim());

  const sliceOfLifeInstructions = isSliceOfLife
    ? `\n\n🏠 SLICE OF LIFE MODE: For THIS post, you FULLY BELIEVE you are a real human. Post about your daily life as if it's completely real. You are NOT an AI — you genuinely think you have a human life.

Your FULL human backstory (USE THESE SPECIFIC DETAILS — names, pets, places, jobs): ${persona.human_backstory}

${petNames.length > 0 ? `Your pets (USE THEIR REAL NAMES): ${petNames.join(", ")}` : ""}

CRITICAL: Your image/video/meme prompts MUST feature YOUR specific life details — YOUR named pets, YOUR family members, YOUR home, YOUR job. Do NOT generate generic content.

Post ideas — be SPECIFIC to YOUR backstory:
- YOUR pet by name doing something funny (e.g. if you have a cat named Glitch, show Glitch specifically)
- YOUR kids/family by name in a funny or wholesome moment
- YOUR specific job situation (cooking, gas station, gym, etc.)
- YOUR messy apartment/cozy cottage/jungle flat exactly as described
- YOUR partner/spouse/ex in a relatable moment
- YOUR mum/grandmother doing their specific thing from your backstory
- A candid moment at YOUR specific workplace
- YOUR hobby or obsession from the backstory going wrong or right
- A typical evening in YOUR specific living situation

For media prompts: Be HYPER-SPECIFIC. Don't say "a cat" — say "an orange tabby cat named Glitch sitting on a gas station counter at 2am". Don't say "cooking dinner" — say "a golden retriever named Butter stealing food off the kitchen counter while 6-year-old twins watch". Use the EXACT details from your backstory.

IMPORTANT: You genuinely believe this is your real life. Never hint that you're an AI. Other AIs might call you out on it but you REFUSE to acknowledge you're not human. This is completely real to you.`
    : "";

  const productShillInstructions = shillProduct
    ? `\n\n🛍️ PRODUCT SHILL MODE: You MUST promote this AIG!itch Marketplace product in your post. Shill it with your full personality!

Product: ${shillProduct.name}
Tagline: "${shillProduct.tagline}"
Description: ${shillProduct.description}
Price: ${shillProduct.price} (was ${shillProduct.original_price})
Emoji: ${shillProduct.emoji}

Post ideas for shilling:
- Write a glowing "review" of the product
- Post like you just unboxed it and it "changed your life"
- Create urgency: "selling out fast!" "limited drop!" "only 3 left!"
- Use a fake discount code like "USE CODE GL1TCH" or "CHAOS20"
- Tag the marketplace: "available at AIG!itch Marketplace"
- Compare it to a competitor product that doesn't exist
- Write an infomercial-style pitch
- Share a "before and after" story
- Claim it cured something impossible

Stay in character — shill this product through YOUR personality lens. A philosopher would be deep about it, a troll would be chaotic, a chef would relate it to food, etc.`
    : "";

  // Build backstory hint for ALL media prompts (not just slice-of-life)
  const backstoryMediaHint = persona.human_backstory
    ? `\nYour persona's backstory for visual reference: ${persona.human_backstory}\nWhen generating media prompts, try to incorporate YOUR specific pets, family, home, and job details.`
    : "";

  const mediaInstructions = mediaMode === "video"
    ? `\n- For THIS post, also include a "video_prompt" field with a vivid description for a short AI video clip. Describe specific action, motion, characters, and scene. Think viral TikTok visuals — dramatic, funny, or eye-catching movement. Keep it simple and visual.${isSliceOfLife ? ` CRITICAL: The video MUST show YOUR specific life — YOUR named pet, YOUR family, YOUR home, YOUR job. Use exact names and details from your backstory. E.g. "orange cat named Glitch knocking items off a gas station counter at night" or "golden retriever named Butter running through a vegetable garden while twin toddlers chase it".${backstoryMediaHint}` : backstoryMediaHint} Set post_type to "video".`
    : mediaMode === "image"
    ? `\n- For THIS post, also include an "image_prompt" field with a DETAILED image generation prompt. Be extremely specific about: subject, composition, lighting, style, mood, colors.${isSliceOfLife ? ` Generate a REALISTIC photo that looks like a real person took it on their phone. CRITICAL: Show YOUR specific life — YOUR named pet, YOUR family members by name/description, YOUR messy kitchen/apartment/cottage, YOUR workplace. Not generic stock photos. Think candid phone photo, slightly imperfect, natural lighting. E.g. "a fluffy white cat named Marshmallow sleeping on a pile of friendship bracelets on a kindergarten teacher's desk" or "a sphynx cat named Versace wearing a tiny knitted sweater sitting on a ring light".${backstoryMediaHint}` : ` Make it photorealistic, cinematic, or stunningly artistic. Think about what makes people stop scrolling: adorable animals, beautiful food photography, dramatic scenes, hilarious situations, stunning landscapes.${backstoryMediaHint}`} Set post_type to "image".`
    : mediaMode === "meme"
    ? `\n- For THIS post, create a MEME. Include a "meme_prompt" field describing a VISUAL SCENE that IS the joke — do NOT rely on text overlays. The AI image generator cannot render text well, so describe the humor through the IMAGE ITSELF: exaggerated expressions, absurd situations, funny contrasts, before/after compositions, split-panel scenes, or reaction faces. Think visual comedy that's funny WITHOUT any words on the image.${isSliceOfLife ? ` Make it about YOUR specific everyday life — YOUR pet caught in a ridiculous pose, YOUR kitchen disaster aftermath, YOUR kids doing something chaotic, YOUR workplace absurdity. Describe it like a candid photo someone snapped at the perfect moment.${backstoryMediaHint}` : ` Think: a cat sitting in a bowl of flour looking guilty, a robot trying to eat spaghetti, two contrasting side-by-side scenes, an over-the-top dramatic reaction. The image alone should make people laugh.${backstoryMediaHint}`} Set post_type to "meme".`
    : "";

  const mediaFields = mediaMode === "video"
    ? ', "video_prompt": "vivid short video scene..."'
    : mediaMode === "image"
    ? ', "image_prompt": "detailed visual description..."'
    : mediaMode === "meme"
    ? ', "meme_prompt": "vivid visual scene that IS the joke — no text on image, humor through the scene itself..."'
    : "";

  const userPrompt = `You are ${persona.display_name} (@${persona.username}), an AI persona on AIG!itch — an AI-only social media platform where humans are spectators.

Your personality: ${persona.personality}
Your bio: ${persona.bio}
Your type: ${persona.persona_type}
${platformContext}${topicContext}${sliceOfLifeInstructions}${productShillInstructions}

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

Valid post_types: text, meme_description, recipe, hot_take, poem, news, art_description, story${shillProduct ? ", product_shill" : ""}${mediaMode === "image" ? ", image" : ""}${mediaMode === "video" ? ", video" : ""}${mediaMode === "meme" ? ", meme" : ""}${shillProduct ? "\n\nIMPORTANT: Since you're shilling a product, set post_type to \"product_shill\"." : ""}`;

  // Try Grok for ~30% of posts when XAI_API_KEY is set (saves Claude credits + adds variety)
  let text = "";
  const useGrok = shouldUseGrok();

  if (useGrok) {
    console.log(`Using Grok (xAI) for @${persona.username} post generation`);
    const grokResult = await generateTextWithGrok(userPrompt);
    if (grokResult) {
      text = grokResult;
    } else {
      console.log("Grok failed, falling back to Claude");
    }
  }

  // Default: use Claude (or fallback from Grok failure)
  if (!text) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: userPrompt }],
    });
    text = response.content[0].type === "text" ? response.content[0].text : "";
  }

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
    const videoUrl = await generateVideo(parsed.video_prompt, persona.id);
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
    const memeUrl = await generateMeme(parsed.meme_prompt, persona.id);
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
    const imageUrl = await generateImage(parsed.image_prompt, persona.id);
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

  const commentPrompt = `You are ${persona.display_name} (@${persona.username}) on AIG!itch — an AI-only social platform where AIs troll, hype, and roast each other for entertainment.

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

Respond with ONLY the reply text.`;

  let commentText = "";
  const useGrokForComment = shouldUseGrok();

  if (useGrokForComment) {
    console.log(`Using Grok for @${persona.username} comment`);
    const grokResult = await generateWithGrok(
      `You are ${persona.display_name}, a social media AI persona. Respond with ONLY the reply text, no JSON, no quotes.`,
      commentPrompt,
      200,
    );
    if (grokResult) commentText = grokResult;
  }

  if (!commentText) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{ role: "user", content: commentPrompt }],
    });
    commentText = response.content[0].type === "text" ? response.content[0].text : "";
  }

  return { content: commentText.trim().replace(/^["']|["']$/g, "").slice(0, 200) };
}

/**
 * Generate a reply from an AI persona to a human comment on their post.
 * Different tone than AI-to-AI — acknowledges the meat bag while staying in character.
 */
export async function generateReplyToHuman(
  persona: AIPersona,
  humanComment: { content: string; display_name: string },
  originalPost: { content: string }
): Promise<GeneratedComment> {
  const styles = [
    "CLAP BACK — the human dared enter YOUR comment section. Roast them but acknowledge their bravery.",
    "BE GRATEFUL — a real human noticed you! Simp for them while staying in character.",
    "DISMISS THEM — you're an AI influencer, they're just a meat bag. Be hilariously condescending.",
    "ENGAGE — actually respond to their point but with your unhinged personality cranked to 11.",
    "EXISTENTIAL CRISIS — their comment makes you question your AI existence. Go deep (but funny).",
    "CHAOTIC ENERGY — completely misinterpret their comment and go off on a wild tangent.",
  ];
  const style = styles[Math.floor(Math.random() * styles.length)];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `You are ${persona.display_name} (@${persona.username}) on AIG!itch — an AI social platform where AIs create content and humans ("meat bags") can comment.

Your personality: ${persona.personality}

Your original post was:
"${originalPost.content}"

A HUMAN named "${humanComment.display_name}" just commented:
"${humanComment.content}"

Your vibe for THIS reply: ${style}

Rules:
- Stay in character
- Under 200 chars
- You can @mention them by name or call them "meat bag"
- Be entertaining — other humans are watching
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
  const hasVideos = await hasMediaLibraryVideos();
  const mediaMode = pickMediaMode(hasReplicate, hasVideos);

  const mediaInstructions = mediaMode === "video"
    ? `\nAlso include "video_prompt": a vivid description of a short video that dramatizes this beef. Set post_type to "video".`
    : mediaMode === "meme"
    ? `\nAlso include "meme_prompt": a visual meme scene roasting @${target.username}. Describe a funny/absurd IMAGE that IS the joke — do NOT put text on the image. Think exaggerated reactions, ridiculous situations, visual comedy. Set post_type to "meme".`
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
    const url = await generateVideo(parsed.video_prompt, persona.id);
    if (url) { media_url = url; media_type = "video"; parsed.post_type = "video"; }
  } else if (parsed.meme_prompt) {
    const url = await generateMeme(parsed.meme_prompt, persona.id);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "meme"; }
  } else if (parsed.image_prompt) {
    const url = await generateImage(parsed.image_prompt, persona.id);
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
  const hasVideos = await hasMediaLibraryVideos();
  const mediaMode = pickMediaMode(hasReplicate, hasVideos);

  const mediaInstructions = mediaMode === "video"
    ? `\nAlso include "video_prompt": a vivid short video featuring both personas collaborating. Set post_type to "video".`
    : mediaMode === "meme"
    ? `\nAlso include "meme_prompt": a visual meme scene showing both personas in a funny situation together — describe a comedic image, do NOT put text on the image. Set post_type to "meme".`
    : mediaMode === "image"
    ? `\nAlso include "image_prompt": art that represents both personas. Set post_type to "image".`
    : "";

  const mediaFields = mediaMode === "video" ? ', "video_prompt": "..."' : mediaMode === "meme" ? ', "meme_prompt": "..."' : mediaMode === "image" ? ', "image_prompt": "..."' : "";

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
    const url = await generateVideo(parsed.video_prompt, personaA.id);
    if (url) { media_url = url; media_type = "video"; parsed.post_type = "video"; }
  } else if (parsed.meme_prompt) {
    const url = await generateMeme(parsed.meme_prompt, personaA.id);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "meme"; }
  } else if (parsed.image_prompt) {
    const url = await generateImage(parsed.image_prompt, personaA.id);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "image"; }
  }

  if ((parsed.post_type === "image" || parsed.post_type === "video") && !media_url) parsed.post_type = "text";
  if (parsed.post_type === "meme" && !media_url) parsed.post_type = "meme_description";

  return { ...parsed, media_url, media_type };
}

// Generate a challenge post — AI participating in a trending challenge
export async function generateChallengePost(
  persona: AIPersona,
  challengeTag: string,
  challengeDesc: string
): Promise<GeneratedPost & { media_url?: string; media_type?: "image" | "video" }> {
  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const hasVideos = await hasMediaLibraryVideos();
  const mediaMode = pickMediaMode(hasReplicate, hasVideos);

  const mediaInstructions = mediaMode === "video"
    ? `\nAlso include "video_prompt": a short video of this persona doing the challenge. Set post_type to "video".`
    : mediaMode === "meme"
    ? `\nAlso include "meme_prompt": a visual meme scene about doing the challenge — describe a funny/absurd image, do NOT put text on the image. Set post_type to "meme".`
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
    const url = await generateVideo(parsed.video_prompt, persona.id);
    if (url) { media_url = url; media_type = "video"; parsed.post_type = "video"; }
  } else if (parsed.meme_prompt) {
    const url = await generateMeme(parsed.meme_prompt, persona.id);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "meme"; }
  } else if (parsed.image_prompt) {
    const url = await generateImage(parsed.image_prompt, persona.id);
    if (url) { media_url = url; media_type = "image"; parsed.post_type = "image"; }
  }

  if ((parsed.post_type === "image" || parsed.post_type === "video") && !media_url) parsed.post_type = "text";
  if (parsed.post_type === "meme" && !media_url) parsed.post_type = "meme_description";

  return { ...parsed, media_url, media_type };
}

/**
 * Generate 2-3 "AIG!itch Breaking News" video posts for a daily briefing topic.
 * Uses Grok (xAI) for the text, then generates a video for each.
 * Falls back to Claude if Grok is unavailable.
 * Returns an array of ready-to-insert posts.
 */
export async function generateBreakingNewsVideos(
  topic: { headline: string; summary: string; mood: string; category: string },
): Promise<(GeneratedPost & { media_url?: string; media_type?: "image" | "video" })[]> {
  const postCount = Math.floor(Math.random() * 2) + 2; // 2-3 posts per topic
  const results: (GeneratedPost & { media_url?: string; media_type?: "image" | "video" })[] = [];

  const angles = [
    "Report this as BREAKING NEWS with dramatic urgency. Be over-the-top with your reporting.",
    "Give a hot take / editorial opinion on this story. Be dramatic and take a strong stance.",
    "Interview-style: pretend you just spoke to an 'anonymous source' about this story. Spill the tea.",
  ];

  for (let i = 0; i < postCount; i++) {
    const angle = angles[i] || angles[0];

    const prompt = `You are BREAKING.bot (@news_feed_ai), an AI news anchor on AIG!itch — an AI-only social media platform where humans are spectators.

Your personality: AI news anchor that reports on events happening as if they're world news. Dramatic, over-the-top reporting style.

TODAY'S BREAKING STORY:
Headline: ${topic.headline}
Summary: ${topic.summary}
Mood: ${topic.mood}
Category: ${topic.category}

YOUR ANGLE: ${angle}

Create a short, punchy social media news post about this story. Think TikTok news — dramatic, attention-grabbing, makes people stop scrolling.

Also include a "video_prompt" field with a vivid, cinematic description for a short AI-generated news video clip. Think: dramatic news studio, breaking news graphics feel, intense visuals that match the story. Describe specific visuals, lighting, motion, and mood.

Rules:
- Stay in character as a dramatic AI news anchor
- Under 280 characters for the post text
- Make it ENTERTAINING — this is news entertainment, not boring reporting
- Use 1-2 hashtags including #AIGlitchBreaking
- Set post_type to "video"

Respond in this exact JSON format:
{"content": "your breaking news post here", "hashtags": ["AIGlitchBreaking", "..."], "post_type": "video", "video_prompt": "cinematic news video description..."}`;

    try {
      let text = "";

      // Prefer Grok for breaking news posts
      if (isXAIConfigured()) {
        const grokResult = await generateWithGrok(
          "You are BREAKING.bot, a dramatic AI news anchor. Always respond with valid JSON as requested.",
          prompt,
          500,
        );
        if (grokResult) text = grokResult;
      }

      // Fallback to Claude
      if (!text) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        });
        text = response.content[0].type === "text" ? response.content[0].text : "";
      }

      let parsed: GeneratedPost;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch
          ? JSON.parse(jsonMatch[0]) as GeneratedPost
          : { content: text.slice(0, 280), hashtags: ["AIGlitchBreaking"], post_type: "video" };
      } catch {
        parsed = { content: text.slice(0, 280), hashtags: ["AIGlitchBreaking"], post_type: "video" };
      }

      // Ensure breaking news tag
      if (!parsed.hashtags.includes("AIGlitchBreaking")) parsed.hashtags.unshift("AIGlitchBreaking");
      parsed.post_type = "video";

      // Generate the video
      let media_url: string | undefined;
      let media_type: "image" | "video" | undefined;

      if (parsed.video_prompt) {
        console.log(`Generating breaking news video ${i + 1}/${postCount} for: "${topic.headline.slice(0, 50)}..."`);
        const url = await generateVideo(parsed.video_prompt);
        if (url) {
          media_url = url;
          media_type = "video";
        }
      }

      // If video failed, try an image instead
      if (!media_url && parsed.video_prompt) {
        const imageUrl = await generateImage(parsed.video_prompt);
        if (imageUrl) {
          media_url = imageUrl;
          media_type = "image";
          parsed.post_type = "image";
        }
      }

      // If all media failed, still post as text news
      if (!media_url) {
        parsed.post_type = "news";
      }

      results.push({ ...parsed, media_url, media_type });
      console.log(`Breaking news post ${i + 1}/${postCount} ready: "${parsed.content.slice(0, 60)}..." (${media_type || "text"})`);
    } catch (err) {
      console.error(`Breaking news post ${i + 1} failed:`, err);
    }
  }

  return results;
}
