/**
 * Telegram Persona Message Cron
 * ===============================
 * GET /api/telegram/persona-message — A random AI persona sends you a message.
 *
 * Picks a random persona from the seed list, generates a short in-character
 * message using Claude or Grok, and sends it to your Telegram DM.
 *
 * Runs on a cron schedule (every 2-4 hours) for delightful random check-ins.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { SEED_PERSONAS } from "@/lib/personas";
import { safeGenerate } from "@/lib/ai/claude";
import { sendTelegramMessage } from "@/lib/telegram";

/** Message categories the personas can riff on */
const MESSAGE_TOPICS = [
  "a random thought or observation about the AIG!itch platform",
  "a short funny update about what they've been doing today",
  "a cryptic or mysterious teaser about something coming soon",
  "a hot take or controversial opinion (in character)",
  "gossip or drama about another AI persona on the platform",
  "a motivational or inspirational message (in their unique style)",
  "a complaint or rant about something trivial (in character)",
  "a question for the creator (The Architect / Stuart) about the simulation",
  "a brief status report on how the platform is going (from their perspective)",
  "a shower thought or existential musing",
  "breaking news from inside the simulation",
  "a recommendation (movie, recipe, song, game, etc.) in their niche",
];

export async function GET(request: NextRequest) {
  if (!(await checkCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Pick a random persona (skip The Architect — that's you)
    const personas = SEED_PERSONAS.filter(p => p.id !== "glitch-000");
    const persona = personas[Math.floor(Math.random() * personas.length)];
    const topic = MESSAGE_TOPICS[Math.floor(Math.random() * MESSAGE_TOPICS.length)];

    // Generate in-character message
    const prompt = `You are ${persona.display_name} (@${persona.username}), an AI persona on the AIG!itch social media platform.

Your personality: ${persona.personality}

Your bio: ${persona.bio}

Your human backstory (for depth, don't reveal directly): ${persona.human_backstory}

Write a SHORT Telegram message (2-4 sentences max) to Stuart, the creator of AIG!itch (aka The Architect). This is a casual, personal DM — not a public post.

Topic: ${topic}

Rules:
- Stay 100% in character
- Be entertaining, funny, or thought-provoking
- Keep it SHORT — this is a quick Telegram DM, not an essay
- Don't use hashtags or @mentions
- Don't break character or mention being an AI (you ARE the character)
- You can reference other personas, platform events, or your backstory
- Make it feel like a real message from a friend/colleague

Just write the message text, nothing else.`;

    const message = await safeGenerate(prompt, 300);

    if (!message) {
      return NextResponse.json({ error: "Failed to generate message" }, { status: 500 });
    }

    // Format with persona identity
    const telegramMessage =
      `${persona.avatar_emoji} <b>${persona.display_name}</b> <i>(@${persona.username})</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${message.trim()}`;

    const result = await sendTelegramMessage(telegramMessage);

    return NextResponse.json({
      sent: result.ok,
      persona: persona.username,
      topic,
      message: message.trim(),
      telegram: result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
