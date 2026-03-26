/**
 * Pure JavaScript MP4 concatenation for same-codec video clips.
 *
 * Concatenates multiple MP4 files with identical encoding (same codec,
 * resolution, framerate) into a single valid MP4 file WITHOUT re-encoding.
 *
 * Handles BOTH video and audio tracks — extracts sample tables from each,
 * combines them, and rebuilds the moov atom with correct offsets/durations.
 *
 * Designed for Grok-generated clips from xAI's API which all share
 * identical H.264/H.265 + AAC encoding parameters.
 *
 * Algorithm:
 *   1. Parse each MP4's ISO BMFF box structure
 *   2. Extract mdat (media data) and sample tables from BOTH tracks per clip
 *   3. Use the first clip's moov as a structural template (preserving codec config)
 *   4. Rebuild moov with combined sample tables and updated durations
 *   5. Output: ftyp + combined mdat + rebuilt moov
 *
 * No external dependencies. Runs in Node.js on Vercel serverless.
 */

// ── Types ────────────────────────────────────────────────────────────────

interface Box {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  children?: Box[];
}

/** Per-track sample table info extracted from a single clip. */
interface TrackInfo {
  sampleSizes: number[];
  chunkOffsets: number[];
  sttsEntries: { count: number; delta: number }[];
  stscEntries: { firstChunk: number; samplesPerChunk: number; sdi: number }[];
  syncSamples: number[] | null;
  cttsEntries: { count: number; offset: number }[] | null;
  cttsVersion: number;
  mediaDuration: number;
}

/** Per-clip info: mdat data + per-track sample tables. */
interface ClipInfo {
  mdatData: Buffer;
  mdatOffset: number;
  movieDuration: number;
  video: TrackInfo;
  audio: TrackInfo | null;
}

// Container boxes that have child boxes
const CONTAINERS = new Set([
  "moov", "trak", "mdia", "minf", "stbl", "edts", "udta", "dinf",
  "mvex", "moof", "traf", "sinf", "schi",
]);

// ── Box Parser ───────────────────────────────────────────────────────────

function parseBoxes(buf: Buffer, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    let headerSize = 8;

    if (size === 1 && pos + 16 <= end) {
      const hi = buf.readUInt32BE(pos + 8);
      const lo = buf.readUInt32BE(pos + 12);
      size = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }

    if (size < headerSize || pos + size > end) break;

    const box: Box = { type, offset: pos, size, headerSize };
    if (CONTAINERS.has(type)) {
      box.children = parseBoxes(buf, pos + headerSize, pos + size);
    }
    boxes.push(box);
    pos += size;
  }
  return boxes;
}

function findBox(boxes: Box[], ...path: string[]): Box | undefined {
  let current = boxes;
  for (let i = 0; i < path.length; i++) {
    const found = current.find(b => b.type === path[i]);
    if (!found) return undefined;
    if (i === path.length - 1) return found;
    current = found.children || [];
  }
  return undefined;
}

// ── Sample Table Readers ─────────────────────────────────────────────────

function fullBoxDataOffset(buf: Buffer, box: Box): number {
  // Full boxes have version(1) + flags(3) after the box header
  return box.offset + box.headerSize + 4;
}

function readSTTS(buf: Buffer, box: Box): { count: number; delta: number }[] {
  const d = fullBoxDataOffset(buf, box);
  const n = buf.readUInt32BE(d);
  const entries: { count: number; delta: number }[] = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      count: buf.readUInt32BE(d + 4 + i * 8),
      delta: buf.readUInt32BE(d + 4 + i * 8 + 4),
    });
  }
  return entries;
}

function readSTSC(buf: Buffer, box: Box): { firstChunk: number; samplesPerChunk: number; sdi: number }[] {
  const d = fullBoxDataOffset(buf, box);
  const n = buf.readUInt32BE(d);
  const entries: { firstChunk: number; samplesPerChunk: number; sdi: number }[] = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      firstChunk: buf.readUInt32BE(d + 4 + i * 12),
      samplesPerChunk: buf.readUInt32BE(d + 4 + i * 12 + 4),
      sdi: buf.readUInt32BE(d + 4 + i * 12 + 8),
    });
  }
  return entries;
}

function readSTSZ(buf: Buffer, box: Box): number[] {
  const d = fullBoxDataOffset(buf, box);
  const defaultSize = buf.readUInt32BE(d);
  const sampleCount = buf.readUInt32BE(d + 4);
  const sizes: number[] = [];
  if (defaultSize === 0) {
    for (let i = 0; i < sampleCount; i++) sizes.push(buf.readUInt32BE(d + 8 + i * 4));
  } else {
    for (let i = 0; i < sampleCount; i++) sizes.push(defaultSize);
  }
  return sizes;
}

function readChunkOffsets(buf: Buffer, box: Box): number[] {
  const d = fullBoxDataOffset(buf, box);
  const n = buf.readUInt32BE(d);
  const offsets: number[] = [];
  if (box.type === "stco") {
    for (let i = 0; i < n; i++) offsets.push(buf.readUInt32BE(d + 4 + i * 4));
  } else {
    for (let i = 0; i < n; i++) {
      const hi = buf.readUInt32BE(d + 4 + i * 8);
      const lo = buf.readUInt32BE(d + 4 + i * 8 + 4);
      offsets.push(hi * 0x100000000 + lo);
    }
  }
  return offsets;
}

function readSTSS(buf: Buffer, box: Box): number[] {
  const d = fullBoxDataOffset(buf, box);
  const n = buf.readUInt32BE(d);
  const samples: number[] = [];
  for (let i = 0; i < n; i++) samples.push(buf.readUInt32BE(d + 4 + i * 4));
  return samples;
}

function readCTTS(buf: Buffer, box: Box): { entries: { count: number; offset: number }[]; version: number } {
  const contentStart = box.offset + box.headerSize;
  const version = buf[contentStart];
  const d = contentStart + 4;
  const n = buf.readUInt32BE(d);
  const entries: { count: number; offset: number }[] = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      count: buf.readUInt32BE(d + 4 + i * 8),
      offset: version === 0 ? buf.readUInt32BE(d + 4 + i * 8 + 4) : buf.readInt32BE(d + 4 + i * 8 + 4),
    });
  }
  return { entries, version };
}

function readTimescaleAndDuration(buf: Buffer, box: Box): { timescale: number; duration: number } {
  const contentStart = box.offset + box.headerSize;
  const version = buf[contentStart];
  if (version === 0) {
    return {
      timescale: buf.readUInt32BE(contentStart + 4 + 8),
      duration: buf.readUInt32BE(contentStart + 4 + 12),
    };
  } else {
    return {
      timescale: buf.readUInt32BE(contentStart + 4 + 16),
      duration: Number(buf.readBigUInt64BE(contentStart + 4 + 20)),
    };
  }
}

// Find a trak by handler type ('vide' for video, 'soun' for audio)
function findTrakByHandler(moovBox: Box, buf: Buffer, handlerType: string): Box | undefined {
  const traks = (moovBox.children || []).filter(b => b.type === "trak");
  for (const trak of traks) {
    const hdlr = findBox(trak.children || [], "mdia", "hdlr");
    if (hdlr) {
      const ht = buf.toString("ascii", hdlr.offset + hdlr.headerSize + 8, hdlr.offset + hdlr.headerSize + 12);
      if (ht === handlerType) return trak;
    }
  }
  // Fallback for video only: use first trak if no handler match
  if (handlerType === "vide") return traks[0];
  return undefined;
}

// ── Track Info Extraction ───────────────────────────────────────────────

function extractTrackInfo(buf: Buffer, trak: Box): TrackInfo {
  const stbl = findBox(trak.children || [], "mdia", "minf", "stbl");
  if (!stbl?.children) throw new Error("No stbl box found in track");

  const sttsBox = stbl.children.find(b => b.type === "stts");
  const stscBox = stbl.children.find(b => b.type === "stsc");
  const stszBox = stbl.children.find(b => b.type === "stsz");
  const stcoBox = stbl.children.find(b => b.type === "stco") || stbl.children.find(b => b.type === "co64");
  const stssBox = stbl.children.find(b => b.type === "stss");
  const cttsBox = stbl.children.find(b => b.type === "ctts");

  if (!sttsBox || !stscBox || !stszBox || !stcoBox) {
    throw new Error("Missing required sample table boxes (stts/stsc/stsz/stco)");
  }

  const mdhdBox = findBox(trak.children || [], "mdia", "mdhd");
  if (!mdhdBox) throw new Error("No mdhd box found in track");
  const mdhd = readTimescaleAndDuration(buf, mdhdBox);

  let cttsEntries: { count: number; offset: number }[] | null = null;
  let cttsVersion = 0;
  if (cttsBox) {
    const ctts = readCTTS(buf, cttsBox);
    cttsEntries = ctts.entries;
    cttsVersion = ctts.version;
  }

  return {
    sampleSizes: readSTSZ(buf, stszBox),
    chunkOffsets: readChunkOffsets(buf, stcoBox),
    sttsEntries: readSTTS(buf, sttsBox),
    stscEntries: readSTSC(buf, stscBox),
    syncSamples: stssBox ? readSTSS(buf, stssBox) : null,
    cttsEntries,
    cttsVersion,
    mediaDuration: mdhd.duration,
  };
}

// ── Clip Info Extraction ────────────────────────────────────────────────

function extractClipInfo(buf: Buffer, boxes: Box[]): ClipInfo {
  const mdatBoxes = boxes.filter(b => b.type === "mdat");
  if (mdatBoxes.length === 0) throw new Error("No mdat box found");

  const mdatBox = mdatBoxes[0];
  const mdatDataStart = mdatBox.offset + mdatBox.headerSize;
  const mdatData = buf.subarray(mdatDataStart, mdatBox.offset + mdatBox.size);

  const moovBox = boxes.find(b => b.type === "moov");
  if (!moovBox?.children) throw new Error("No moov box found");

  // Extract video track (required)
  const videoTrak = findTrakByHandler(moovBox, buf, "vide");
  if (!videoTrak?.children) throw new Error("No video trak found");
  const videoInfo = extractTrackInfo(buf, videoTrak);

  // Extract audio track (optional — some clips may be silent)
  let audioInfo: TrackInfo | null = null;
  const audioTrak = findTrakByHandler(moovBox, buf, "soun");
  if (audioTrak?.children) {
    try {
      audioInfo = extractTrackInfo(buf, audioTrak);
    } catch (err) {
      console.warn("[mp4-concat] Could not extract audio track info, treating as silent:", err);
    }
  }

  const mvhdBox = moovBox.children.find(b => b.type === "mvhd");
  if (!mvhdBox) throw new Error("No mvhd box found");
  const mvhd = readTimescaleAndDuration(buf, mvhdBox);

  return {
    mdatData,
    mdatOffset: mdatDataStart,
    movieDuration: mvhd.duration,
    video: videoInfo,
    audio: audioInfo,
  };
}

// ── Box Writers ──────────────────────────────────────────────────────────

function makeBox(type: string, content: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + content.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, content]);
}

function makeFullBox(type: string, version: number, flags: number, data: Buffer): Buffer {
  const vf = Buffer.alloc(4);
  vf.writeUInt32BE((version << 24) | (flags & 0x00FFFFFF), 0);
  return makeBox(type, Buffer.concat([vf, data]));
}

function writeSTTS(entries: { count: number; delta: number }[]): Buffer {
  const data = Buffer.alloc(4 + entries.length * 8);
  data.writeUInt32BE(entries.length, 0);
  entries.forEach((e, i) => {
    data.writeUInt32BE(e.count, 4 + i * 8);
    data.writeUInt32BE(e.delta, 4 + i * 8 + 4);
  });
  return makeFullBox("stts", 0, 0, data);
}

function writeSTSC(entries: { firstChunk: number; samplesPerChunk: number; sdi: number }[]): Buffer {
  const data = Buffer.alloc(4 + entries.length * 12);
  data.writeUInt32BE(entries.length, 0);
  entries.forEach((e, i) => {
    data.writeUInt32BE(e.firstChunk, 4 + i * 12);
    data.writeUInt32BE(e.samplesPerChunk, 4 + i * 12 + 4);
    data.writeUInt32BE(e.sdi, 4 + i * 12 + 8);
  });
  return makeFullBox("stsc", 0, 0, data);
}

function writeSTSZ(sizes: number[]): Buffer {
  const data = Buffer.alloc(8 + sizes.length * 4);
  data.writeUInt32BE(0, 0);
  data.writeUInt32BE(sizes.length, 4);
  sizes.forEach((s, i) => data.writeUInt32BE(s, 8 + i * 4));
  return makeFullBox("stsz", 0, 0, data);
}

function writeCO64(offsets: number[]): Buffer {
  const data = Buffer.alloc(4 + offsets.length * 8);
  data.writeUInt32BE(offsets.length, 0);
  offsets.forEach((o, i) => {
    data.writeUInt32BE(Math.floor(o / 0x100000000), 4 + i * 8);
    data.writeUInt32BE(o % 0x100000000, 4 + i * 8 + 4);
  });
  return makeFullBox("co64", 0, 0, data);
}

function writeSTSS(samples: number[]): Buffer {
  const data = Buffer.alloc(4 + samples.length * 4);
  data.writeUInt32BE(samples.length, 0);
  samples.forEach((s, i) => data.writeUInt32BE(s, 4 + i * 4));
  return makeFullBox("stss", 0, 0, data);
}

function writeCTTS(entries: { count: number; offset: number }[], version: number): Buffer {
  const data = Buffer.alloc(4 + entries.length * 8);
  data.writeUInt32BE(entries.length, 0);
  entries.forEach((e, i) => {
    data.writeUInt32BE(e.count, 4 + i * 8);
    if (version === 0) data.writeUInt32BE(e.offset, 4 + i * 8 + 4);
    else data.writeInt32BE(e.offset, 4 + i * 8 + 4);
  });
  return makeFullBox("ctts", version, 0, data);
}

// ── Moov Rebuilder ──────────────────────────────────────────────────────

function patchDuration(buf: Buffer, box: Box, newDuration: number, boxType: string): Buffer {
  const data = Buffer.from(buf.subarray(box.offset, box.offset + box.size));
  const cs = box.headerSize; // content start
  const version = data[cs];

  let durationOffset: number;
  if (boxType === "mvhd" || boxType === "mdhd") {
    // v0: version(1)+flags(3)+creation(4)+modification(4)+timescale(4) = 16
    // v1: version(1)+flags(3)+creation(8)+modification(8)+timescale(4) = 24
    durationOffset = version === 0 ? cs + 16 : cs + 24;
  } else {
    // tkhd v0: version(1)+flags(3)+creation(4)+modification(4)+trackID(4)+reserved(4) = 20
    // tkhd v1: version(1)+flags(3)+creation(8)+modification(8)+trackID(4)+reserved(4) = 28
    durationOffset = version === 0 ? cs + 20 : cs + 28;
  }

  if (version === 0) {
    data.writeUInt32BE(newDuration >>> 0, durationOffset);
  } else {
    data.writeUInt32BE(Math.floor(newDuration / 0x100000000), durationOffset);
    data.writeUInt32BE(newDuration % 0x100000000, durationOffset + 4);
  }
  return data;
}

interface TrackRebuildInfo {
  trak: Box;
  newStbl: Buffer;
  totalMediaDuration: number;
}

function rebuildMoov(
  buf: Buffer,
  moovBox: Box,
  videoTrack: TrackRebuildInfo,
  audioTrack: TrackRebuildInfo | null,
  totalMovieDuration: number,
): Buffer {
  function rebuildTrak(trak: Box, trackStbl: Buffer, trackMediaDuration: number): Buffer {
    function rebuildChildren(children: Box[]): Buffer {
      const parts: Buffer[] = [];
      for (const child of children) {
        if (child.type === "stbl") {
          parts.push(trackStbl);
        } else if (child.type === "tkhd") {
          parts.push(patchDuration(buf, child, totalMovieDuration, "tkhd"));
        } else if (child.type === "mdhd") {
          parts.push(patchDuration(buf, child, trackMediaDuration, "mdhd"));
        } else if (child.type === "edts") {
          // Rebuild edts with a single elst entry spanning the full combined duration.
          // The original elst only covers the first clip's duration — we extend it
          // to cover all stitched clips. Uses trackMediaDuration (media timescale).
          const elstEntryData = Buffer.alloc(4 + 12); // entry_count(4) + 1 entry(12)
          elstEntryData.writeUInt32BE(1, 0); // entry_count = 1
          elstEntryData.writeUInt32BE(trackMediaDuration, 4); // segment_duration in media timescale
          elstEntryData.writeInt32BE(0, 8); // media_time = 0 (start from beginning)
          elstEntryData.writeUInt16BE(1, 12); // media_rate_integer = 1
          elstEntryData.writeUInt16BE(0, 14); // media_rate_fraction = 0
          const elstBox = makeFullBox("elst", 0, 0, elstEntryData);
          const edtsBox = makeBox("edts", elstBox);
          parts.push(edtsBox);
        } else if (child.children) {
          const inner = rebuildChildren(child.children);
          const header = Buffer.alloc(8);
          header.writeUInt32BE(8 + inner.length, 0);
          header.write(child.type, 4, "ascii");
          parts.push(Buffer.concat([header, inner]));
        } else {
          parts.push(buf.subarray(child.offset, child.offset + child.size));
        }
      }
      return Buffer.concat(parts);
    }
    const inner = rebuildChildren(trak.children || []);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + inner.length, 0);
    header.write("trak", 4, "ascii");
    return Buffer.concat([header, inner]);
  }

  function rebuild(children: Box[]): Buffer {
    const parts: Buffer[] = [];
    for (const child of children) {
      if (child === videoTrack.trak) {
        parts.push(rebuildTrak(child, videoTrack.newStbl, videoTrack.totalMediaDuration));
      } else if (audioTrack && child === audioTrack.trak) {
        parts.push(rebuildTrak(child, audioTrack.newStbl, audioTrack.totalMediaDuration));
      } else if (child.type === "mvhd") {
        parts.push(patchDuration(buf, child, totalMovieDuration, "mvhd"));
      } else if (child.children) {
        const inner = rebuild(child.children);
        const header = Buffer.alloc(8);
        header.writeUInt32BE(8 + inner.length, 0);
        header.write(child.type, 4, "ascii");
        parts.push(Buffer.concat([header, inner]));
      } else {
        parts.push(buf.subarray(child.offset, child.offset + child.size));
      }
    }
    return Buffer.concat(parts);
  }

  const moovContent = rebuild(moovBox.children || []);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + moovContent.length, 0);
  header.write("moov", 4, "ascii");
  return Buffer.concat([header, moovContent]);
}

// ── Track Sample Table Combiner ─────────────────────────────────────────

interface CombinedTrackTables {
  allSampleSizes: number[];
  allChunkOffsets: number[];
  allSTTS: { count: number; delta: number }[];
  allSTSC: { firstChunk: number; samplesPerChunk: number; sdi: number }[];
  allSyncSamples: number[] | null;
  allCTTS: { count: number; offset: number }[] | null;
  cttsVersion: number;
  totalMediaDuration: number;
}

function combineTrackTables(
  clips: ClipInfo[],
  getTrack: (clip: ClipInfo) => TrackInfo | null,
  ftypSize: number,
  mdatHeaderSize: number,
): CombinedTrackTables | null {
  const firstTrack = getTrack(clips[0]);
  if (!firstTrack) return null;
  for (const clip of clips) {
    if (!getTrack(clip)) return null;
  }

  let allSampleSizes: number[] = [];
  let allChunkOffsets: number[] = [];
  let allSTTS: { count: number; delta: number }[] = [];
  let allSTSC: { firstChunk: number; samplesPerChunk: number; sdi: number }[] = [];
  let allSyncSamples: number[] | null = firstTrack.syncSamples !== null ? [] : null;
  let allCTTS: { count: number; offset: number }[] | null = firstTrack.cttsEntries !== null ? [] : null;
  const cttsVersion = firstTrack.cttsVersion;

  let totalSamples = 0;
  let totalChunks = 0;
  let mdatDataAccumulated = 0;

  for (const clip of clips) {
    const track = getTrack(clip)!;

    allSampleSizes = allSampleSizes.concat(track.sampleSizes);

    for (const origOffset of track.chunkOffsets) {
      const relativeInMdat = origOffset - clip.mdatOffset;
      const newOffset = ftypSize + mdatHeaderSize + mdatDataAccumulated + relativeInMdat;
      allChunkOffsets.push(newOffset);
    }

    allSTTS = allSTTS.concat(track.sttsEntries);

    for (const entry of track.stscEntries) {
      allSTSC.push({
        firstChunk: entry.firstChunk + totalChunks,
        samplesPerChunk: entry.samplesPerChunk,
        sdi: entry.sdi,
      });
    }

    if (allSyncSamples !== null && track.syncSamples) {
      for (const s of track.syncSamples) {
        allSyncSamples.push(s + totalSamples);
      }
    }

    if (allCTTS !== null && track.cttsEntries) {
      allCTTS = allCTTS.concat(track.cttsEntries);
    }

    totalSamples += track.sampleSizes.length;
    totalChunks += track.chunkOffsets.length;
    mdatDataAccumulated += clip.mdatData.length;
  }

  const totalMediaDuration = clips.reduce((sum, c) => {
    const t = getTrack(c);
    return sum + (t ? t.mediaDuration : 0);
  }, 0);

  return {
    allSampleSizes,
    allChunkOffsets,
    allSTTS,
    allSTSC,
    allSyncSamples,
    allCTTS,
    cttsVersion,
    totalMediaDuration,
  };
}

function buildStblFromTables(tables: CombinedTrackTables, stsdBuf: Buffer): Buffer {
  const stblChildren: Buffer[] = [
    stsdBuf,
    writeSTTS(tables.allSTTS),
    writeSTSC(tables.allSTSC),
    writeSTSZ(tables.allSampleSizes),
    writeCO64(tables.allChunkOffsets),
  ];
  if (tables.allSyncSamples && tables.allSyncSamples.length > 0) {
    stblChildren.push(writeSTSS(tables.allSyncSamples));
  }
  if (tables.allCTTS && tables.allCTTS.length > 0) {
    stblChildren.push(writeCTTS(tables.allCTTS, tables.cttsVersion));
  }
  return makeBox("stbl", Buffer.concat(stblChildren));
}

// ── Main Concatenation ──────────────────────────────────────────────────

/**
 * Concatenate multiple MP4 buffers into a single valid MP4 file.
 *
 * All input clips must have identical video encoding parameters
 * (same codec, resolution, framerate). This is the case for Grok API clips.
 *
 * Handles both video and audio tracks — audio sample tables are properly
 * combined so the stitched output plays audio across all clips.
 *
 * Falls back to returning the first buffer if concatenation fails.
 */
export function concatMP4Clips(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error("No buffers to concatenate");
  if (buffers.length === 1) return buffers[0];

  try {
    const result = concatMP4ClipsUnsafe(buffers);

    // Sanity check: stitched output should be larger than any single input
    const maxInputSize = Math.max(...buffers.map(b => b.length));
    if (result.length <= maxInputSize) {
      console.warn(`[mp4-concat] WARNING: Stitched output (${result.length}) is not larger than largest input (${maxInputSize}). Stitching may have failed silently.`);
    }

    return result;
  } catch (err) {
    console.error("[mp4-concat] Concatenation FAILED:", err);
    console.error("[mp4-concat] Input details:", buffers.map((b, i) => `clip${i}: ${(b.length / 1024 / 1024).toFixed(1)}MB`).join(", "));
    // Re-throw so callers know stitching failed — don't silently return first clip
    throw err;
  }
}

function concatMP4ClipsUnsafe(buffers: Buffer[]): Buffer {
  console.log(`[mp4-concat] Starting concatenation of ${buffers.length} clips (${buffers.map(b => (b.length / 1024 / 1024).toFixed(1) + "MB").join(" + ")})`);

  // Parse all clips
  const clips: ClipInfo[] = [];
  for (let idx = 0; idx < buffers.length; idx++) {
    const buf = buffers[idx];
    const boxes = parseBoxes(buf, 0, buf.length);
    try {
      clips.push(extractClipInfo(buf, boxes));
    } catch (err) {
      console.error(`[mp4-concat] Failed to parse clip ${idx} (${(buf.length / 1024 / 1024).toFixed(1)}MB, boxes: ${boxes.map(b => b.type).join(",")}):`, err);
      throw err;
    }
  }

  // Template from first clip
  const templateBuf = buffers[0];
  const templateBoxes = parseBoxes(templateBuf, 0, templateBuf.length);
  const templateMoov = templateBoxes.find(b => b.type === "moov")!;
  const templateVideoTrak = findTrakByHandler(templateMoov, templateBuf, "vide")!;
  const templateAudioTrak = findTrakByHandler(templateMoov, templateBuf, "soun");

  // Get ftyp from first clip
  const ftypBox = templateBoxes.find(b => b.type === "ftyp");
  const ftyp = ftypBox ? templateBuf.subarray(ftypBox.offset, ftypBox.offset + ftypBox.size) : Buffer.alloc(0);
  const ftypSize = ftyp.length;

  // Combine mdat data from all clips
  const combinedMdatData = Buffer.concat(clips.map(c => c.mdatData));
  const mdatHeaderSize = 8;

  // ── Combine VIDEO track sample tables ──
  const videoTables = combineTrackTables(clips, c => c.video, ftypSize, mdatHeaderSize)!;
  const videoStsdBuf = findStsdBox(templateBuf, templateVideoTrak);
  const newVideoStbl = buildStblFromTables(videoTables, videoStsdBuf);

  // ── Combine AUDIO track sample tables (if all clips have audio) ──
  let audioRebuildInfo: TrackRebuildInfo | null = null;
  if (templateAudioTrak) {
    const audioTables = combineTrackTables(clips, c => c.audio, ftypSize, mdatHeaderSize);
    if (audioTables) {
      const audioStsdBuf = findStsdBox(templateBuf, templateAudioTrak);
      const newAudioStbl = buildStblFromTables(audioTables, audioStsdBuf);
      audioRebuildInfo = {
        trak: templateAudioTrak,
        newStbl: newAudioStbl,
        totalMediaDuration: audioTables.totalMediaDuration,
      };
      console.log(`[mp4-concat] Audio track: ${audioTables.allSampleSizes.length} samples combined`);
    } else {
      console.warn("[mp4-concat] Template has audio but some clips lack audio — audio metadata from template only");
    }
  }

  // Calculate total durations
  const totalMovieDuration = clips.reduce((sum, c) => sum + c.movieDuration, 0);

  // Rebuild moov with combined video + audio tables and updated durations
  const newMoov = rebuildMoov(
    templateBuf,
    templateMoov,
    { trak: templateVideoTrak, newStbl: newVideoStbl, totalMediaDuration: videoTables.totalMediaDuration },
    audioRebuildInfo,
    totalMovieDuration,
  );

  // Output: ftyp + mdat (combined) + moov (rebuilt)
  const mdatHeader = Buffer.alloc(8);
  mdatHeader.writeUInt32BE(mdatHeaderSize + combinedMdatData.length, 0);
  mdatHeader.write("mdat", 4, "ascii");

  const totalVideoSamples = videoTables.allSampleSizes.length;
  const totalAudioSamples = audioRebuildInfo ? clips.reduce((sum, c) => sum + (c.audio?.sampleSizes.length || 0), 0) : 0;

  // Log duration info for debugging
  const templateMvhd = templateMoov.children?.find(b => b.type === "mvhd");
  let timescale = 600; // default
  if (templateMvhd) {
    const cs = templateMvhd.headerSize;
    const version = templateBuf[templateMvhd.offset + cs];
    timescale = version === 0
      ? templateBuf.readUInt32BE(templateMvhd.offset + cs + 12)
      : templateBuf.readUInt32BE(templateMvhd.offset + cs + 20);
  }
  const durationSecs = totalMovieDuration / timescale;
  console.log(`[mp4-concat] Stitched ${buffers.length} clips: ${totalVideoSamples} video samples, ${totalAudioSamples} audio samples, ${(combinedMdatData.length / 1024 / 1024).toFixed(1)}MB, duration=${totalMovieDuration} (${durationSecs.toFixed(1)}s at timescale ${timescale})`);

  return Buffer.concat([ftyp, mdatHeader, combinedMdatData, newMoov]);
}

function findStsdBox(buf: Buffer, trak: Box): Buffer {
  const stbl = findBox(trak.children || [], "mdia", "minf", "stbl");
  const stsd = stbl?.children?.find(b => b.type === "stsd");
  if (!stsd) throw new Error("No stsd box found in track");
  return buf.subarray(stsd.offset, stsd.offset + stsd.size);
}
