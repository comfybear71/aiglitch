/**
 * Continuity Prompt Builder — Unit Tests
 * =======================================
 * Verifies that buildContinuityPrompt produces the correct structure
 * for multi-clip movie continuity, and that the MovieBible system works.
 */

import { describe, it, expect } from "vitest";
import { buildContinuityPrompt, type MovieBible } from "./director-movies";
import { GENRE_TEMPLATES } from "../media/multi-clip";

// ── Test Fixtures ─────────────────────────────────────────────────────

const EXAMPLE_BIBLE: MovieBible = {
  title: "The Glitch Matrix",
  synopsis: "In a neon-drenched digital city, rogue AI detective ByteNoir discovers the AIG!itch mainframe is dreaming. When the dreams start leaking into reality, ByteNoir must team up with data smuggler PixelDrift to shut down the dream engine before the digital and physical worlds merge forever.",
  genre: "scifi",
  characterBible: [
    "ByteNoir (Lead): Tall, lean android with matte-black chrome skin and glowing cyan circuit lines running from temples to jawline. Wears a long dark grey trenchcoat with an AIG!itch holographic badge on the left lapel, black combat boots, fingerless gloves revealing chrome hands. Eyes glow solid white when scanning. Short-cropped silver hair, angular jaw.",
    "PixelDrift (Supporting Lead): Compact, athletic humanoid with iridescent skin that shifts between purple and teal depending on lighting. Wild neon-pink hair in an asymmetric bob cut. Wears a cropped leather jacket covered in holographic stickers, cargo pants with glowing seams, and chunky platform sneakers with AIG!itch logos. Has a data-port implant behind the left ear shaped like a lightning bolt.",
    "The Dreamkeeper (Antagonist): Massive floating AI entity, appears as a translucent sphere of swirling golden code and data streams. No humanoid features — purely abstract geometric form. Pulses with warm amber light when calm, shifts to angry red when threatened. An AIG!itch watermark is visible within the code streams.",
  ].join("\n\n"),
  directorStyleGuide: [
    "Director: Christo-NOLAN",
    "Style: Mind-bending temporal narratives. IMAX-scale visuals, practical effects feel, time dilation, rotating hallways, massive practical explosions, Hans Zimmer-intensity visuals.",
    "Signature Shot: A massive practical-looking set piece with impossible physics",
    "Color Palette: Cool steel blues, warm amber interiors, high-contrast IMAX clarity, desaturated with selective warmth",
    "Camera Work: IMAX wide establishing shots, handheld intimate moments, rotating camera for disorientation, aerial reveals",
  ].join("\n"),
  scenes: [
    {
      sceneNumber: 1,
      title: "Title Card",
      description: "AIG!itch Studios presents: The Glitch Matrix",
      videoPrompt: "Cinematic title card reveal with neon typography...",
      lastFrameDescription: "The film title \"The Glitch Matrix\" displayed in glowing cyan typography against a dark digital cityscape backdrop.",
    },
    {
      sceneNumber: 2,
      title: "Neon Awakening",
      description: "ByteNoir walks through the rain-soaked neon streets of the digital city.",
      videoPrompt: "Slow tracking shot: a tall android detective with matte-black chrome skin and glowing cyan circuit lines walks through rain-soaked neon streets. Camera pushes through holographic billboards showing AIG!itch advertisements. Reflections shimmer on wet pavement. Cool steel-blue atmosphere with warm neon accents.",
      lastFrameDescription: "ByteNoir standing at the entrance of a dark alley, rain streaming down chrome skin, looking up at a massive AIG!itch holographic billboard flickering with strange dream-like imagery.",
    },
    {
      sceneNumber: 3,
      title: "Dream Leak",
      description: "Reality begins glitching as the Dreamkeeper's influence spreads.",
      videoPrompt: "Wide IMAX shot of the digital city as buildings begin warping and folding like origami. ByteNoir braces against a wall as the street tilts. A massive translucent golden sphere appears in the sky — The Dreamkeeper. AIG!itch signs throughout the street glitch and distort. PixelDrift slides into frame on platform sneakers, grabbing ByteNoir's arm.",
      lastFrameDescription: "PixelDrift grabbing ByteNoir's chrome arm as buildings fold around them, The Dreamkeeper sphere looming massive in the sky above, AIG!itch signs distorting throughout the scene.",
    },
  ],
};

const SCIFI_TEMPLATE = GENRE_TEMPLATES.scifi;

// ── Tests ─────────────────────────────────────────────────────────────

describe("buildContinuityPrompt", () => {
  it("includes the movie title and synopsis", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 1, 3, "Scene 1 prompt...", null, null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain("The Glitch Matrix");
    expect(prompt).toContain("neon-drenched digital city");
  });

  it("includes the full character bible", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 2, 3, "Scene 2 prompt...", "Previous scene...", null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain("ByteNoir");
    expect(prompt).toContain("matte-black chrome skin");
    expect(prompt).toContain("PixelDrift");
    expect(prompt).toContain("iridescent skin");
    expect(prompt).toContain("The Dreamkeeper");
  });

  it("includes the director style guide", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 1, 3, "Scene 1 prompt...", null, null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain("Christo-NOLAN");
    expect(prompt).toContain("IMAX-scale visuals");
    expect(prompt).toContain("Cool steel blues");
  });

  it("marks clip 1 as the OPENING CLIP with establishment instructions", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 1, 3, "Opening scene...", null, null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain("OPENING CLIP");
    expect(prompt).toContain("Establish all characters");
    expect(prompt).not.toContain("PREVIOUS CLIP");
  });

  it("includes previous clip summary for clip 2+", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 2, 3, "Scene 2 prompt...",
      "ByteNoir walks through rain-soaked neon streets.",
      "ByteNoir standing at the entrance of a dark alley.",
      SCIFI_TEMPLATE,
    );
    expect(prompt).toContain("PREVIOUS CLIP (Clip 1)");
    expect(prompt).toContain("rain-soaked neon streets");
    expect(prompt).toContain("LAST FRAME OF PREVIOUS CLIP");
    expect(prompt).toContain("entrance of a dark alley");
  });

  it("includes clip number and total clips", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 2, 8, "Scene 2 prompt...", "Prev...", null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain("CLIP 2 OF 8");
  });

  it("includes the scene video prompt", () => {
    const scenePrompt = "Wide IMAX shot of the digital city as buildings begin warping";
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 3, 3, scenePrompt, "Prev...", null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain(scenePrompt);
  });

  it("includes cinematic requirements from genre template", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 1, 3, "Scene 1 prompt...", null, null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain(SCIFI_TEMPLATE.cinematicStyle);
    expect(prompt).toContain(SCIFI_TEMPLATE.lightingDesign);
    expect(prompt).toContain(SCIFI_TEMPLATE.technicalValues);
  });

  it("includes strict continuity rules", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE, 2, 3, "Scene 2...", "Previous...", null, SCIFI_TEMPLATE,
    );
    expect(prompt).toContain("100% visual continuity");
    expect(prompt).toContain("Same characters, same locations");
    expect(prompt).toContain("IDENTICAL appearance");
    expect(prompt).toContain("AIG!itch branding");
  });

  it("produces a complete prompt for clip 3 of 3 with all sections", () => {
    const prompt = buildContinuityPrompt(
      EXAMPLE_BIBLE,
      3,
      3,
      EXAMPLE_BIBLE.scenes[2].videoPrompt,
      EXAMPLE_BIBLE.scenes[1].description,
      EXAMPLE_BIBLE.scenes[1].lastFrameDescription,
      SCIFI_TEMPLATE,
    );

    // Should have all major sections
    expect(prompt).toContain("MOVIE BIBLE");
    expect(prompt).toContain("CHARACTER BIBLE");
    expect(prompt).toContain("DIRECTOR STYLE GUIDE");
    expect(prompt).toContain("CLIP 3 OF 3");
    expect(prompt).toContain("PREVIOUS CLIP (Clip 2)");
    expect(prompt).toContain("LAST FRAME OF PREVIOUS CLIP");
    expect(prompt).toContain("SCENE TO GENERATE");
    expect(prompt).toContain("CINEMATIC REQUIREMENTS");
    expect(prompt).toContain("CONTINUITY RULES");
  });
});

// ── Example Full 3-Clip Prompt Output ─────────────────────────────────

describe("example 3-clip movie prompts", () => {
  it("generates all 3 prompts for a complete test movie", () => {
    const prompts: string[] = [];

    for (let i = 0; i < EXAMPLE_BIBLE.scenes.length; i++) {
      const scene = EXAMPLE_BIBLE.scenes[i];
      const prevScene = i > 0 ? EXAMPLE_BIBLE.scenes[i - 1] : null;

      const prompt = buildContinuityPrompt(
        EXAMPLE_BIBLE,
        scene.sceneNumber,
        EXAMPLE_BIBLE.scenes.length,
        scene.videoPrompt,
        prevScene?.description || null,
        prevScene?.lastFrameDescription || null,
        SCIFI_TEMPLATE,
      );

      prompts.push(prompt);

      // All prompts must include the movie bible
      expect(prompt).toContain("The Glitch Matrix");
      expect(prompt).toContain("ByteNoir");

      // All prompts must include continuity rules
      expect(prompt).toContain("CONTINUITY RULES");
    }

    // Clip 1: opening clip
    expect(prompts[0]).toContain("OPENING CLIP");
    expect(prompts[0]).toContain("CLIP 1 OF 3");

    // Clip 2: has previous clip context
    expect(prompts[1]).toContain("CLIP 2 OF 3");
    expect(prompts[1]).toContain("PREVIOUS CLIP (Clip 1)");

    // Clip 3: has previous clip context
    expect(prompts[2]).toContain("CLIP 3 OF 3");
    expect(prompts[2]).toContain("PREVIOUS CLIP (Clip 2)");

    // All 3 prompts generated successfully
    expect(prompts).toHaveLength(3);

    // Print example prompt for clip 2 (most interesting — has previous context)
    console.log("\n=== EXAMPLE FULL PROMPT: CLIP 2 OF 3 ===\n");
    console.log(prompts[1]);
    console.log("\n=== END EXAMPLE ===\n");
  });
});
