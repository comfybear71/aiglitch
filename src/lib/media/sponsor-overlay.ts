/**
 * FFmpeg-based sponsor text overlay for video outros.
 * Burns "Thanks to our sponsors: BUDJU, FRENCHIE" onto the last 5 seconds
 * of a stitched video. Runs after concatMP4Clips() but before Blob upload.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

// Set FFmpeg binary path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Add sponsor "thanks" text overlay to the last N seconds of a video.
 * Returns a new Buffer with the text burned in.
 */
export async function addSponsorOverlay(
  videoBuffer: Buffer,
  sponsorNames: string[],
  options: {
    overlayDurationSeconds?: number;
    fontSize?: number;
    position?: "bottom" | "center";
  } = {},
): Promise<Buffer> {
  if (sponsorNames.length === 0) return videoBuffer;

  const {
    overlayDurationSeconds = 5,
    fontSize = 36,
    position = "bottom",
  } = options;

  const thanksText = `Thanks to our sponsors: ${sponsorNames.join(" • ")}`;
  const tmpId = randomBytes(8).toString("hex");
  const tmpDir = "/tmp";
  const inputPath = join(tmpDir, `sponsor-input-${tmpId}.mp4`);
  const outputPath = join(tmpDir, `sponsor-output-${tmpId}.mp4`);

  try {
    // Write input video to temp file
    writeFileSync(inputPath, videoBuffer);

    // Get video duration using ffprobe
    const duration = await getVideoDuration(inputPath);
    const outroStart = Math.max(0, duration - overlayDurationSeconds);

    const yPosition = position === "center" ? "(h-text_h)/2" : "h-100";

    // Run FFmpeg with drawtext filter
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([
          {
            filter: "drawtext",
            options: {
              text: thanksText,
              fontsize: fontSize,
              fontcolor: "white",
              shadowcolor: "black",
              shadowx: 2,
              shadowy: 2,
              box: 1,
              boxcolor: "black@0.5",
              boxborderw: 10,
              x: "(w-text_w)/2",
              y: yPosition,
              enable: `between(t,${outroStart},${duration})`,
            },
          },
        ])
        .outputOptions(["-c:a", "copy"]) // Keep original audio
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    // Read the output file
    const result = readFileSync(outputPath);
    console.log(`[sponsor-overlay] Added "${thanksText}" to last ${overlayDurationSeconds}s of video (${(result.length / 1024 / 1024).toFixed(1)}MB)`);
    return result;
  } catch (err) {
    console.error("[sponsor-overlay] FFmpeg failed, returning original video:", err instanceof Error ? err.message : err);
    // Return original video if overlay fails — don't break the pipeline
    return videoBuffer;
  } finally {
    // Clean up temp files
    try { if (existsSync(inputPath)) unlinkSync(inputPath); } catch { /* ignore */ }
    try { if (existsSync(outputPath)) unlinkSync(outputPath); } catch { /* ignore */ }
  }
}

/**
 * Get video duration in seconds using ffprobe.
 */
function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, metadata: { format?: { duration?: number } }) => {
      if (err) return reject(err);
      resolve(metadata?.format?.duration || 60); // Default 60s if unknown
    });
  });
}
