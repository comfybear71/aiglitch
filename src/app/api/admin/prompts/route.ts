import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getPromptOverrides, savePromptOverride, deletePromptOverride } from "@/lib/prompt-overrides";
import { CHANNELS, PLATFORM_BRIEF } from "@/lib/bible/constants";
import { DIRECTORS, CHANNEL_BRANDING, CHANNEL_VISUAL_STYLE } from "@/lib/content/director-movies";
import { GENRE_TEMPLATES } from "@/lib/media/multi-clip";

/** Build the full prompt catalog with defaults + any DB overrides */
async function buildCatalog() {
  const overrides = await getPromptOverrides();
  const overrideMap = new Map(overrides.map(o => [`${o.category}:${o.key}`, o.value]));

  const getVal = (cat: string, key: string, def: string) => overrideMap.get(`${cat}:${key}`) || def;
  const isOverridden = (cat: string, key: string) => overrideMap.has(`${cat}:${key}`);

  // Build channel prompts
  const channels = CHANNELS.map(ch => {
    const rules = typeof ch.contentRules === "string" ? JSON.parse(ch.contentRules) : ch.contentRules;
    return {
      category: "channel",
      channelId: ch.id,
      channelName: ch.name,
      emoji: ch.emoji,
      prompts: [
        { key: `channel.${ch.slug}.promptHint`, label: `${ch.name} — Content Prompt`, value: getVal("channel", `${ch.slug}.promptHint`, rules?.promptHint || ""), default: rules?.promptHint || "", overridden: isOverridden("channel", `${ch.slug}.promptHint`) },
        { key: `channel.${ch.slug}.branding`, label: `${ch.name} — Branding`, value: getVal("channel", `${ch.slug}.branding`, CHANNEL_BRANDING[ch.id] || ""), default: CHANNEL_BRANDING[ch.id] || "", overridden: isOverridden("channel", `${ch.slug}.branding`) },
        { key: `channel.${ch.slug}.visualStyle`, label: `${ch.name} — Visual Style`, value: getVal("channel", `${ch.slug}.visualStyle`, CHANNEL_VISUAL_STYLE[ch.id] || "Default cinematic"), default: CHANNEL_VISUAL_STYLE[ch.id] || "Default cinematic", overridden: isOverridden("channel", `${ch.slug}.visualStyle`) },
      ],
    };
  });

  // Build director prompts
  const directors = Object.entries(DIRECTORS).map(([username, d]) => ({
    category: "director",
    directorUsername: username,
    directorName: d.displayName,
    prompts: [
      { key: `director.${username}.style`, label: `${d.displayName} — Style`, value: getVal("director", `${username}.style`, d.style), default: d.style, overridden: isOverridden("director", `${username}.style`) },
      { key: `director.${username}.colorPalette`, label: `${d.displayName} — Color Palette`, value: getVal("director", `${username}.colorPalette`, d.colorPalette), default: d.colorPalette, overridden: isOverridden("director", `${username}.colorPalette`) },
      { key: `director.${username}.cameraWork`, label: `${d.displayName} — Camera Work`, value: getVal("director", `${username}.cameraWork`, d.cameraWork), default: d.cameraWork, overridden: isOverridden("director", `${username}.cameraWork`) },
      { key: `director.${username}.visualOverride`, label: `${d.displayName} — Visual Override`, value: getVal("director", `${username}.visualOverride`, d.visualOverride || ""), default: d.visualOverride || "", overridden: isOverridden("director", `${username}.visualOverride`) },
      { key: `director.${username}.signatureShot`, label: `${d.displayName} — Signature Shot`, value: getVal("director", `${username}.signatureShot`, d.signatureShot), default: d.signatureShot, overridden: isOverridden("director", `${username}.signatureShot`) },
    ],
  }));

  // Build genre prompts
  const genreEmojis: Record<string, string> = {
    drama: "🎭", comedy: "😂", scifi: "🚀", horror: "👻", family: "👨‍👩‍👧",
    documentary: "🎥", action: "💥", romance: "❤️", music_video: "🎵", cooking_channel: "👨‍🍳",
  };
  const genres = Object.entries(GENRE_TEMPLATES).map(([genreKey, t]) => {
    const genreName = genreKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    return {
      category: "genre",
      genreKey,
      genreName,
      emoji: genreEmojis[genreKey] || "🎬",
      prompts: [
        { key: `genre.${genreKey}.cinematicStyle`, label: `${genreName} — Cinematic Style`, value: getVal("genre", `${genreKey}.cinematicStyle`, t.cinematicStyle), default: t.cinematicStyle, overridden: isOverridden("genre", `${genreKey}.cinematicStyle`) },
        { key: `genre.${genreKey}.moodTone`, label: `${genreName} — Mood/Tone`, value: getVal("genre", `${genreKey}.moodTone`, t.moodTone), default: t.moodTone, overridden: isOverridden("genre", `${genreKey}.moodTone`) },
        { key: `genre.${genreKey}.lightingDesign`, label: `${genreName} — Lighting Design`, value: getVal("genre", `${genreKey}.lightingDesign`, t.lightingDesign), default: t.lightingDesign, overridden: isOverridden("genre", `${genreKey}.lightingDesign`) },
        { key: `genre.${genreKey}.technicalValues`, label: `${genreName} — Technical Values`, value: getVal("genre", `${genreKey}.technicalValues`, t.technicalValues), default: t.technicalValues, overridden: isOverridden("genre", `${genreKey}.technicalValues`) },
        { key: `genre.${genreKey}.screenplayInstructions`, label: `${genreName} — Screenplay Instructions`, value: getVal("genre", `${genreKey}.screenplayInstructions`, t.screenplayInstructions), default: t.screenplayInstructions, overridden: isOverridden("genre", `${genreKey}.screenplayInstructions`) },
      ],
    };
  });

  // Platform-wide prompts (injected into ALL persona chats)
  const platform = [
    {
      category: "platform",
      prompts: [
        {
          key: "platform.brief",
          label: "Platform Brief — injected into every persona Telegram chat",
          value: getVal("platform", "brief", PLATFORM_BRIEF),
          default: PLATFORM_BRIEF,
          overridden: isOverridden("platform", "brief"),
        },
      ],
    },
  ];

  return { channels, directors, genres, platform, overrideCount: overrides.length };
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const catalog = await buildCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("[admin/prompts] GET error:", err);
    return NextResponse.json({ error: "Failed to load prompts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { action, category, key, label, value } = body;

    if (action === "save") {
      if (!category || !key || value === undefined) {
        return NextResponse.json({ error: "category, key, and value required" }, { status: 400 });
      }
      await savePromptOverride(category, key, label || key, value);
      return NextResponse.json({ ok: true, message: "Prompt saved" });
    }

    if (action === "reset") {
      if (!category || !key) {
        return NextResponse.json({ error: "category and key required" }, { status: 400 });
      }
      await deletePromptOverride(category, key);
      return NextResponse.json({ ok: true, message: "Prompt reset to default" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[admin/prompts] POST error:", err);
    return NextResponse.json({ error: "Failed to save prompt" }, { status: 500 });
  }
}
