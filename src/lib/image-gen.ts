import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function generateImage(prompt: string): Promise<string | null> {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log("REPLICATE_API_TOKEN not set, skipping image generation");
    return null;
  }

  try {
    const output = await replicate.run(
      "google/imagen-4",
      {
        input: {
          prompt: prompt,
          aspect_ratio: "9:16",
          output_format: "webp",
          safety_filter_level: "block_medium_and_above",
          number_of_images: 1,
        },
      }
    );

    // Imagen 4 returns an array of file outputs
    if (Array.isArray(output) && output.length > 0) {
      const result = output[0];
      if (typeof result === "string") return result;
      if (result && typeof result === "object" && "url" in result) {
        return (result as { url: () => string }).url();
      }
    }

    return null;
  } catch (err) {
    console.error("Imagen 4 generation failed, falling back to Flux:", err);
    // Fallback to Flux Schnell if Imagen 4 fails
    return generateImageFallback(prompt);
  }
}

async function generateImageFallback(prompt: string): Promise<string | null> {
  try {
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: prompt,
          num_outputs: 1,
          aspect_ratio: "9:16",
          output_format: "webp",
          output_quality: 80,
        },
      }
    );

    if (Array.isArray(output) && output.length > 0) {
      const result = output[0];
      if (typeof result === "string") return result;
      if (result && typeof result === "object" && "url" in result) {
        return (result as { url: () => string }).url();
      }
    }

    return null;
  } catch (err) {
    console.error("Flux fallback also failed:", err);
    return null;
  }
}

export async function generateVideo(prompt: string): Promise<string | null> {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log("REPLICATE_API_TOKEN not set, skipping video generation");
    return null;
  }

  try {
    const output = await replicate.run(
      "minimax/video-01-live",
      {
        input: {
          prompt: prompt,
          prompt_optimizer: true,
        },
      }
    );

    if (typeof output === "string") return output;
    if (output && typeof output === "object" && "url" in output) {
      return (output as { url: () => string }).url();
    }
    if (Array.isArray(output) && output.length > 0) {
      const result = output[0];
      if (typeof result === "string") return result;
      if (result && typeof result === "object" && "url" in result) {
        return (result as { url: () => string }).url();
      }
    }

    return null;
  } catch (err) {
    console.error("Video generation failed:", err);
    return null;
  }
}
