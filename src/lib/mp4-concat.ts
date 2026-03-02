/**
 * Pure JavaScript MP4 concatenation for same-codec video clips.
 *
 * Concatenates multiple MP4 files with identical encoding (same codec,
 * resolution, framerate) into a single valid MP4 file WITHOUT re-encoding.
 *
 * Designed for Grok-generated clips from xAI's API which all share
 * identical H.264/H.265 encoding parameters.
 *
 * Algorithm:
 *   1. Parse each MP4's ISO BMFF box structure
 *   2. Extract mdat (media data) and sample tables from each clip
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

interface ClipInfo {
  mdatData: Buffer;
  mdatOffset: number;
  sampleSizes: number[];
  chunkOffsets: number[];
  sttsEntries: { count: number; delta: number }[];
  stscEntries: { firstChunk: number; samplesPerChunk: number; sdi: number }[];
  syncSamples: number[] | null;
  cttsEntries: { count: number; offset: number }[] | null;
  cttsVersion: number;
  mediaDuration: number;
  movieDuration: number;
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

// Find the video trak (checks hdlr handler_type for 'vide')
function findVideoTrak(moovBox: Box, buf: Buffer): Box | undefined {
  const traks = (moovBox.children || []).filter(b => b.type === "trak");
  for (const trak of traks) {
    const hdlr = findBox(trak.children || [], "mdia", "hdlr");
    if (hdlr) {
      const handlerType = buf.toString("ascii", hdlr.offset + hdlr.headerSize + 8, hdlr.offset + hdlr.headerSize + 12);
      if (handlerType === "vide") return trak;
    }
  }
  return traks[0]; // Fallback to first trak
}

// ── Clip Info Extraction ────────────────────────────────────────────────

function extractClipInfo(buf: Buffer, boxes: Box[]): ClipInfo {
  // Find and combine all mdat boxes
  const mdatBoxes = boxes.filter(b => b.type === "mdat");
  if (mdatBoxes.length === 0) throw new Error("No mdat box found");

  // For clips with a single mdat (the common case)
  const mdatBox = mdatBoxes[0];
  const mdatDataStart = mdatBox.offset + mdatBox.headerSize;
  const mdatData = buf.subarray(mdatDataStart, mdatBox.offset + mdatBox.size);

  const moovBox = boxes.find(b => b.type === "moov");
  if (!moovBox?.children) throw new Error("No moov box found");

  const trak = findVideoTrak(moovBox, buf);
  if (!trak?.children) throw new Error("No video trak found");

  const stbl = findBox(trak.children, "mdia", "minf", "stbl");
  if (!stbl?.children) throw new Error("No stbl box found");

  const sttsBox = stbl.children.find(b => b.type === "stts");
  const stscBox = stbl.children.find(b => b.type === "stsc");
  const stszBox = stbl.children.find(b => b.type === "stsz");
  const stcoBox = stbl.children.find(b => b.type === "stco") || stbl.children.find(b => b.type === "co64");
  const stssBox = stbl.children.find(b => b.type === "stss");
  const cttsBox = stbl.children.find(b => b.type === "ctts");

  if (!sttsBox || !stscBox || !stszBox || !stcoBox) {
    throw new Error("Missing required sample table boxes (stts/stsc/stsz/stco)");
  }

  const mdhdBox = findBox(trak.children, "mdia", "mdhd");
  if (!mdhdBox) throw new Error("No mdhd box found");
  const mdhd = readTimescaleAndDuration(buf, mdhdBox);

  const mvhdBox = moovBox.children.find(b => b.type === "mvhd");
  if (!mvhdBox) throw new Error("No mvhd box found");
  const mvhd = readTimescaleAndDuration(buf, mvhdBox);

  let cttsEntries: { count: number; offset: number }[] | null = null;
  let cttsVersion = 0;
  if (cttsBox) {
    const ctts = readCTTS(buf, cttsBox);
    cttsEntries = ctts.entries;
    cttsVersion = ctts.version;
  }

  return {
    mdatData,
    mdatOffset: mdatDataStart,
    sampleSizes: readSTSZ(buf, stszBox),
    chunkOffsets: readChunkOffsets(buf, stcoBox),
    sttsEntries: readSTTS(buf, sttsBox),
    stscEntries: readSTSC(buf, stscBox),
    syncSamples: stssBox ? readSTSS(buf, stssBox) : null,
    cttsEntries,
    cttsVersion,
    mediaDuration: mdhd.duration,
    movieDuration: mvhd.duration,
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

function rebuildMoov(
  buf: Buffer,
  moovBox: Box,
  videoTrak: Box,
  newStbl: Buffer,
  totalMediaDuration: number,
  totalMovieDuration: number,
): Buffer {
  function rebuild(children: Box[]): Buffer {
    const parts: Buffer[] = [];
    for (const child of children) {
      if (child === videoTrak) {
        // Rebuild this trak with new stbl and durations
        parts.push(rebuildTrak(child));
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

  function rebuildTrak(trak: Box): Buffer {
    function rebuildChildren(children: Box[]): Buffer {
      const parts: Buffer[] = [];
      for (const child of children) {
        if (child.type === "stbl") {
          parts.push(newStbl);
        } else if (child.type === "tkhd") {
          parts.push(patchDuration(buf, child, totalMovieDuration, "tkhd"));
        } else if (child.type === "mdhd") {
          parts.push(patchDuration(buf, child, totalMediaDuration, "mdhd"));
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

  const moovContent = rebuild(moovBox.children || []);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + moovContent.length, 0);
  header.write("moov", 4, "ascii");
  return Buffer.concat([header, moovContent]);
}

// ── Main Concatenation ──────────────────────────────────────────────────

/**
 * Concatenate multiple MP4 buffers into a single valid MP4 file.
 *
 * All input clips must have identical video encoding parameters
 * (same codec, resolution, framerate). This is the case for Grok API clips.
 *
 * Falls back to returning the first buffer if concatenation fails.
 */
export function concatMP4Clips(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error("No buffers to concatenate");
  if (buffers.length === 1) return buffers[0];

  try {
    return concatMP4ClipsUnsafe(buffers);
  } catch (err) {
    console.error("[mp4-concat] Concatenation failed, falling back to first clip:", err);
    return buffers[0];
  }
}

function concatMP4ClipsUnsafe(buffers: Buffer[]): Buffer {
  // Parse all clips
  const clips: ClipInfo[] = [];
  for (const buf of buffers) {
    const boxes = parseBoxes(buf, 0, buf.length);
    clips.push(extractClipInfo(buf, boxes));
  }

  // Template from first clip
  const templateBuf = buffers[0];
  const templateBoxes = parseBoxes(templateBuf, 0, templateBuf.length);
  const templateMoov = templateBoxes.find(b => b.type === "moov")!;
  const templateVideoTrak = findVideoTrak(templateMoov, templateBuf)!;

  // Get ftyp from first clip
  const ftypBox = templateBoxes.find(b => b.type === "ftyp");
  const ftyp = ftypBox ? templateBuf.subarray(ftypBox.offset, ftypBox.offset + ftypBox.size) : Buffer.alloc(0);
  const ftypSize = ftyp.length;

  // Combine mdat data from all clips
  const combinedMdatData = Buffer.concat(clips.map(c => c.mdatData));
  const mdatHeaderSize = 8;

  // Combine sample tables
  let allSampleSizes: number[] = [];
  let allChunkOffsets: number[] = [];
  let allSTTS: { count: number; delta: number }[] = [];
  let allSTSC: { firstChunk: number; samplesPerChunk: number; sdi: number }[] = [];
  let allSyncSamples: number[] | null = clips[0].syncSamples !== null ? [] : null;
  let allCTTS: { count: number; offset: number }[] | null = clips[0].cttsEntries !== null ? [] : null;
  const cttsVersion = clips[0].cttsVersion;

  let totalSamples = 0;
  let totalChunks = 0;
  let mdatDataAccumulated = 0;

  for (const clip of clips) {
    // Sample sizes — just concatenate
    allSampleSizes = allSampleSizes.concat(clip.sampleSizes);

    // Chunk offsets — recalculate for new file layout
    // Original offset pointed into the clip's mdat; now points into combined mdat
    for (const origOffset of clip.chunkOffsets) {
      const relativeInMdat = origOffset - clip.mdatOffset;
      const newOffset = ftypSize + mdatHeaderSize + mdatDataAccumulated + relativeInMdat;
      allChunkOffsets.push(newOffset);
    }

    // STTS — concatenate entries
    allSTTS = allSTTS.concat(clip.sttsEntries);

    // STSC — offset chunk numbers for subsequent clips
    for (const entry of clip.stscEntries) {
      allSTSC.push({
        firstChunk: entry.firstChunk + totalChunks,
        samplesPerChunk: entry.samplesPerChunk,
        sdi: entry.sdi,
      });
    }

    // Sync samples — offset sample numbers
    if (allSyncSamples !== null && clip.syncSamples) {
      for (const s of clip.syncSamples) {
        allSyncSamples.push(s + totalSamples);
      }
    }

    // CTTS — concatenate
    if (allCTTS !== null && clip.cttsEntries) {
      allCTTS = allCTTS.concat(clip.cttsEntries);
    }

    totalSamples += clip.sampleSizes.length;
    totalChunks += clip.chunkOffsets.length;
    mdatDataAccumulated += clip.mdatData.length;
  }

  // Calculate total durations (sum of all clips)
  const totalMediaDuration = clips.reduce((sum, c) => sum + c.mediaDuration, 0);
  const totalMovieDuration = clips.reduce((sum, c) => sum + c.movieDuration, 0);

  // Build new stbl box
  const stsdBox = findStsdBox(templateBuf, templateVideoTrak);
  const stblChildren: Buffer[] = [
    stsdBox,
    writeSTTS(allSTTS),
    writeSTSC(allSTSC),
    writeSTSZ(allSampleSizes),
    writeCO64(allChunkOffsets),
  ];
  if (allSyncSamples && allSyncSamples.length > 0) stblChildren.push(writeSTSS(allSyncSamples));
  if (allCTTS && allCTTS.length > 0) stblChildren.push(writeCTTS(allCTTS, cttsVersion));

  const newStbl = makeBox("stbl", Buffer.concat(stblChildren));

  // Rebuild moov with new stbl and updated durations
  const newMoov = rebuildMoov(
    templateBuf,
    templateMoov,
    templateVideoTrak,
    newStbl,
    totalMediaDuration,
    totalMovieDuration,
  );

  // Output: ftyp + mdat (combined) + moov (rebuilt)
  const mdatHeader = Buffer.alloc(8);
  mdatHeader.writeUInt32BE(mdatHeaderSize + combinedMdatData.length, 0);
  mdatHeader.write("mdat", 4, "ascii");

  console.log(`[mp4-concat] Stitched ${buffers.length} clips: ${totalSamples} samples, ${totalChunks} chunks, ${(combinedMdatData.length / 1024 / 1024).toFixed(1)}MB`);

  return Buffer.concat([ftyp, mdatHeader, combinedMdatData, newMoov]);
}

function findStsdBox(buf: Buffer, trak: Box): Buffer {
  const stbl = findBox(trak.children || [], "mdia", "minf", "stbl");
  const stsd = stbl?.children?.find(b => b.type === "stsd");
  if (!stsd) throw new Error("No stsd box found in video track");
  return buf.subarray(stsd.offset, stsd.offset + stsd.size);
}
