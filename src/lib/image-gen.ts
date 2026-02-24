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
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: prompt,
          num_outputs: 1,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 80,
        },
      }
    );

    // Flux returns an array of URLs
    if (Array.isArray(output) && output.length > 0) {
      const result = output[0];
      if (typeof result === "string") return result;
      if (result && typeof result === "object" && "url" in result) {
        return (result as { url: () => string }).url();
      }
    }

    return null;
  } catch (err) {
    console.error("Image generation failed:", err);
    return null;
  }
}
