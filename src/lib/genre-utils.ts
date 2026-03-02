/**
 * Centralized genre utilities for AIG!itch Studios.
 *
 * Maps internal genre names to blob storage folder names, hashtags, and labels.
 * Ensures consistency across all movie generation, storage, and display systems.
 *
 * Internal genre names: action, scifi, romance, family, horror, comedy, drama, cooking_channel, documentary
 * Blob folder names:   action, scifi, romance, family, horror, comedy, drama, cooking_show, documentary
 */

export const ALL_GENRES = [
  "action", "scifi", "romance", "family", "horror", "comedy", "drama", "cooking_channel", "documentary",
] as const;

export type GenreName = (typeof ALL_GENRES)[number];

/** Map internal genre name to the blob storage folder name under premiere/ */
const GENRE_TO_FOLDER: Record<string, string> = {
  action: "action",
  scifi: "scifi",
  romance: "romance",
  family: "family",
  horror: "horror",
  comedy: "comedy",
  drama: "drama",
  cooking_channel: "cooking_show",
  documentary: "documentary",
};

/** Reverse: map blob folder name back to internal genre name */
const FOLDER_TO_GENRE: Record<string, string> = {};
for (const [genre, folder] of Object.entries(GENRE_TO_FOLDER)) {
  FOLDER_TO_GENRE[folder] = genre;
}

/** Human-readable labels */
export const GENRE_LABELS: Record<string, string> = {
  action: "Action",
  scifi: "Sci-Fi",
  romance: "Romance",
  family: "Family",
  horror: "Horror",
  comedy: "Comedy",
  drama: "Drama",
  cooking_channel: "Cooking Show",
  documentary: "Documentary",
};

/**
 * Get the blob storage folder path for a genre.
 * e.g. "cooking_channel" -> "premiere/cooking_show"
 *      "romance"         -> "premiere/romance"
 */
export function getGenreBlobFolder(genre: string): string {
  const folder = GENRE_TO_FOLDER[genre] || genre;
  return `premiere/${folder}`;
}

/**
 * Get just the folder name (without premiere/ prefix).
 * e.g. "cooking_channel" -> "cooking_show"
 */
export function getGenreFolderName(genre: string): string {
  return GENRE_TO_FOLDER[genre] || genre;
}

/**
 * Detect genre from a blob URL or pathname.
 * Checks for folder names in the path and maps back to internal genre names.
 */
export function detectGenreFromPath(pathname: string): string | null {
  const lower = pathname.toLowerCase();

  // Check all folder names (including mapped ones like cooking_show)
  for (const [genre, folder] of Object.entries(GENRE_TO_FOLDER)) {
    if (lower.includes(`/${folder}/`) || lower.includes(`/${folder}-`) || lower.includes(`premiere/${folder}`)) {
      return genre;
    }
  }

  // Also check internal genre names directly (for backwards compatibility)
  for (const genre of ALL_GENRES) {
    if (lower.includes(`/${genre}/`) || lower.includes(`/${genre}-`)) {
      return genre;
    }
  }

  return null;
}

/**
 * Get all valid blob folder paths (for scanning/listing).
 */
export function getAllBlobFolders(): string[] {
  return Object.values(GENRE_TO_FOLDER).map(f => `premiere/${f}`);
}

/**
 * Capitalize genre for hashtag use.
 * "cooking_channel" -> "Cooking_channel" (preserves underscores for hashtag matching)
 */
export function capitalizeGenre(genre: string): string {
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}

/**
 * Get the genre-specific hashtag.
 * e.g. "romance" -> "AIGlitchRomance", "cooking_channel" -> "AIGlitchCooking_channel"
 */
export function getGenreHashtag(genre: string): string {
  return `AIGlitch${capitalizeGenre(genre)}`;
}
