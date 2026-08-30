/**
 * A reader for the .7z container, written from the published format
 * description.
 *
 * Enough of 7-Zip to open the archives music is distributed in. What that
 * leaves out is worth stating: no writing, no encryption, and of the many
 * codecs the format allows only the ones a music archive is actually built
 * with - store, LZMA, LZMA2, and the BCJ/delta filters that may sit in front of
 * them. An archive using anything else is reported as such rather than
 * silently mangled.
 *
 * The shape of the format, in the order this file deals with it: a 32-byte
 * signature header points at a "next header" near the end of the file; that
 * header is often itself LZMA-compressed, in which case it decodes to the real
 * one; the real header describes packed streams, the coder chains ("folders")
 * that unpack them, how the unpacked bytes divide into files, and the names.
 */

import { lzma2Decode, lzmaDecode } from "./lzma.js";

const SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const SIGNATURE_HEADER_SIZE = 32;

/** Property ids, as the format numbers them. */
const kEnd = 0x00;
const kHeader = 0x01;
const kMainStreamsInfo = 0x04;
const kFilesInfo = 0x05;
const kPackInfo = 0x06;
const kUnpackInfo = 0x07;
const kSubStreamsInfo = 0x08;
const kSize = 0x09;
const kCRC = 0x0a;
const kFolder = 0x0b;
const kCodersUnpackSize = 0x0c;
const kNumUnpackStream = 0x0d;
const kEmptyStream = 0x0e;
const kEmptyFile = 0x0f;
const kAnti = 0x10;
const kName = 0x11;
const kDummy = 0x19;
const kEncodedHeader = 0x17;

/** Codec ids, as big-endian integers of their id bytes. */
const CODEC_COPY = 0x00;
const CODEC_DELTA = 0x03;
const CODEC_BCJ_X86 = 0x04;
const CODEC_LZMA2 = 0x21;
const CODEC_LZMA = 0x030101;
const CODEC_BCJ = 0x03030103;

export interface SevenZipEntry {
  name: string;
  data: Uint8Array;
}

/** Reads the primitives the header is built from. */
class Reader {
  private data: Uint8Array;
  pos: number;

  constructor(data: Uint8Array, pos = 0) {
    this.data = data;
    this.pos = pos;
  }

  byte(): number {
    if (this.pos >= this.data.length) throw new Error("7z: header ended early");
    return this.data[this.pos++];
  }

  bytes(n: number): Uint8Array {
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  uint32(): number {
    const v =
      (this.data[this.pos] |
        (this.data[this.pos + 1] << 8) |
        (this.data[this.pos + 2] << 16) |
        (this.data[this.pos + 3] << 24)) >>>
      0;
    this.pos += 4;
    return v;
  }

  uint64(): number {
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 4; i++) lo |= this.data[this.pos + i] << (8 * i);
    for (let i = 0; i < 4; i++) hi |= this.data[this.pos + 4 + i] << (8 * i);
    this.pos += 8;
    return (hi >>> 0) * 0x100000000 + (lo >>> 0);
  }

  /**
   * The format's variable-length number: the leading byte says how many more
   * follow, and carries the top bits itself.
   */
  number(): number {
    const first = this.byte();
    let mask = 0x80;
    let value = 0;
    for (let i = 0; i < 8; i++) {
      if ((first & mask) === 0) {
        const high = first & (mask - 1);
        return value + high * Math.pow(2, 8 * i);
      }
      value += this.byte() * Math.pow(2, 8 * i);
      mask >>= 1;
    }
    return value;
  }

  /** A bit per item, most significant bit of each byte first. */
  bits(count: number): boolean[] {
    const out: boolean[] = [];
    let b = 0;
    let mask = 0;
    for (let i = 0; i < count; i++) {
      if (mask === 0) {
        b = this.byte();
        mask = 0x80;
      }
      out.push((b & mask) !== 0);
      mask >>= 1;
    }
    return out;
  }

  /** The same, but with a leading byte that may declare them all true. */
  bitsWithAllTrue(count: number): boolean[] {
    if (this.byte() !== 0) return new Array(count).fill(true);
    return this.bits(count);
  }
}

interface Coder {
  codec: number;
  numInStreams: number;
  numOutStreams: number;
  props: Uint8Array | null;
}

interface Folder {
  coders: Coder[];
  bindPairs: { inIndex: number; outIndex: number }[];
  packedIndices: number[];
  /** Unpacked size of each coder's output. */
  unpackSizes: number[];
  numUnpackSubStreams: number;
  subStreamSizes: number[];
}

interface StreamsInfo {
  packPos: number;
  packSizes: number[];
  folders: Folder[];
  /** Index of the first packed stream each folder consumes. */
  folderPackIndex: number[];
}

function readFolder(r: Reader): Folder {
  const numCoders = r.number();
  const coders: Coder[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < numCoders; i++) {
    const flags = r.byte();
    const idSize = flags & 0x0f;
    const isComplex = (flags & 0x10) !== 0;
    const hasAttributes = (flags & 0x20) !== 0;

    const idBytes = r.bytes(idSize);
    let codec = 0;
    for (const b of idBytes) codec = codec * 256 + b;

    let numInStreams = 1;
    let numOutStreams = 1;
    if (isComplex) {
      numInStreams = r.number();
      numOutStreams = r.number();
    }
    let props: Uint8Array | null = null;
    if (hasAttributes) {
      const size = r.number();
      props = r.bytes(size).slice();
    }
    totalIn += numInStreams;
    totalOut += numOutStreams;
    coders.push({ codec, numInStreams, numOutStreams, props });
  }

  const numBindPairs = totalOut - 1;
  const bindPairs: { inIndex: number; outIndex: number }[] = [];
  for (let i = 0; i < numBindPairs; i++) {
    bindPairs.push({ inIndex: r.number(), outIndex: r.number() });
  }

  const numPacked = totalIn - numBindPairs;
  const packedIndices: number[] = [];
  if (numPacked === 1) {
    // The one input not fed by a bind pair, found by elimination.
    let index = -1;
    for (let i = 0; i < totalIn; i++) {
      if (!bindPairs.some((p) => p.inIndex === i)) {
        index = i;
        break;
      }
    }
    packedIndices.push(index);
  } else {
    for (let i = 0; i < numPacked; i++) packedIndices.push(r.number());
  }

  return {
    coders,
    bindPairs,
    packedIndices,
    unpackSizes: [],
    numUnpackSubStreams: 1,
    subStreamSizes: [],
  };
}

/** Total output streams a folder's coders declare. */
function totalOutStreams(folder: Folder): number {
  let n = 0;
  for (const c of folder.coders) n += c.numOutStreams;
  return n;
}

/** The folder's final output: the one output no bind pair consumes. */
function folderMainOutput(folder: Folder): number {
  const total = totalOutStreams(folder);
  for (let i = 0; i < total; i++) {
    if (!folder.bindPairs.some((p) => p.outIndex === i)) return i;
  }
  return total - 1;
}

function folderUnpackSize(folder: Folder): number {
  return folder.unpackSizes[folderMainOutput(folder)] ?? 0;
}

function readStreamsInfo(r: Reader): StreamsInfo {
  const info: StreamsInfo = { packPos: 0, packSizes: [], folders: [], folderPackIndex: [] };

  let id = r.number();
  if (id === kPackInfo) {
    info.packPos = r.number();
    const numPackStreams = r.number();
    let sub = r.number();
    while (sub !== kEnd) {
      if (sub === kSize) {
        for (let i = 0; i < numPackStreams; i++) info.packSizes.push(r.number());
      } else if (sub === kCRC) {
        skipDigests(r, numPackStreams);
      } else {
        throw new Error(`7z: unexpected id ${sub} in PackInfo`);
      }
      sub = r.number();
    }
    id = r.number();
  }

  if (id === kUnpackInfo) {
    let sub = r.number();
    if (sub !== kFolder) throw new Error("7z: expected Folder");
    const numFolders = r.number();
    const external = r.byte();
    if (external !== 0) throw new Error("7z: external folder definitions are not supported");
    for (let i = 0; i < numFolders; i++) info.folders.push(readFolder(r));

    sub = r.number();
    if (sub !== kCodersUnpackSize) throw new Error("7z: expected CodersUnpackSize");
    for (const folder of info.folders) {
      const n = totalOutStreams(folder);
      for (let i = 0; i < n; i++) folder.unpackSizes.push(r.number());
    }

    sub = r.number();
    while (sub !== kEnd) {
      if (sub === kCRC) {
        skipDigests(r, info.folders.length);
      } else {
        skipProperty(r);
      }
      sub = r.number();
    }
    id = r.number();
  }

  // Which packed streams each folder consumes, in order.
  let packIndex = 0;
  for (const folder of info.folders) {
    info.folderPackIndex.push(packIndex);
    packIndex += folder.packedIndices.length;
  }

  if (id === kSubStreamsInfo) {
    readSubStreamsInfo(r, info);
    id = r.number();
  } else {
    for (const folder of info.folders) {
      folder.numUnpackSubStreams = 1;
      folder.subStreamSizes = [folderUnpackSize(folder)];
    }
  }

  if (id !== kEnd) throw new Error(`7z: unexpected id ${id} at end of StreamsInfo`);
  return info;
}

function readSubStreamsInfo(r: Reader, info: StreamsInfo): void {
  let id = r.number();
  if (id === kNumUnpackStream) {
    for (const folder of info.folders) folder.numUnpackSubStreams = r.number();
    id = r.number();
  } else {
    for (const folder of info.folders) folder.numUnpackSubStreams = 1;
  }

  // Sizes: the last substream of a folder is implied by the rest.
  for (const folder of info.folders) {
    if (folder.numUnpackSubStreams === 0) continue;
    let sum = 0;
    if (id === kSize) {
      for (let i = 1; i < folder.numUnpackSubStreams; i++) {
        const size = r.number();
        folder.subStreamSizes.push(size);
        sum += size;
      }
    }
    folder.subStreamSizes.push(folderUnpackSize(folder) - sum);
  }
  if (id === kSize) id = r.number();

  while (id !== kEnd) {
    if (id === kCRC) {
      let numUnknown = 0;
      for (const folder of info.folders) numUnknown += folder.numUnpackSubStreams;
      skipDigests(r, numUnknown);
    } else {
      skipProperty(r);
    }
    id = r.number();
  }
}

function skipDigests(r: Reader, count: number): void {
  const defined = r.bitsWithAllTrue(count);
  for (const d of defined) if (d) r.uint32();
}

function skipProperty(r: Reader): void {
  const size = r.number();
  r.bytes(size);
}

/** Apply one folder's coder chain to the packed bytes it consumes. */
function decodeFolder(folder: Folder, packed: Uint8Array[]): Uint8Array {
  // A folder is a graph in general, but the ones an archiver produces are a
  // chain: each coder's single output feeds the next coder's single input.
  // Following the bind pairs from the final output backwards recovers it.
  const outputs = new Map<number, Uint8Array>();

  const coderOfOutput = (outIndex: number): number => {
    let n = 0;
    for (let i = 0; i < folder.coders.length; i++) {
      n += folder.coders[i].numOutStreams;
      if (outIndex < n) return i;
    }
    throw new Error("7z: output stream belongs to no coder");
  };

  const firstInStreamOf = (coderIndex: number): number => {
    let n = 0;
    for (let i = 0; i < coderIndex; i++) n += folder.coders[i].numInStreams;
    return n;
  };

  const inputFor = (inIndex: number): Uint8Array => {
    const pair = folder.bindPairs.find((p) => p.inIndex === inIndex);
    if (pair != null) return run(coderOfOutput(pair.outIndex));
    const packedAt = folder.packedIndices.indexOf(inIndex);
    if (packedAt < 0) throw new Error("7z: input stream is neither bound nor packed");
    return packed[packedAt];
  };

  const run = (coderIndex: number): Uint8Array => {
    const cached = outputs.get(coderIndex);
    if (cached != null) return cached;

    const coder = folder.coders[coderIndex];
    if (coder.numInStreams !== 1 || coder.numOutStreams !== 1) {
      // BCJ2 is the one in common use that takes four inputs. It appears in
      // archives of executables, not of music.
      throw new Error(`7z: coder ${coder.codec.toString(16)} has more than one stream`);
    }

    const input = inputFor(firstInStreamOf(coderIndex));
    let outSize = 0;
    {
      let n = 0;
      for (let i = 0; i < coderIndex; i++) n += folder.coders[i].numOutStreams;
      outSize = folder.unpackSizes[n];
    }

    let out: Uint8Array;
    switch (coder.codec) {
      case CODEC_COPY:
        out = input.slice(0, outSize);
        break;
      case CODEC_LZMA:
        if (coder.props == null) throw new Error("7z: LZMA coder without properties");
        out = lzmaDecode(input, 0, coder.props, outSize);
        break;
      case CODEC_LZMA2:
        out = lzma2Decode(input, 0, outSize);
        break;
      case CODEC_DELTA: {
        const distance = (coder.props?.[0] ?? 0) + 1;
        out = input.slice(0, outSize);
        for (let i = distance; i < out.length; i++) out[i] = (out[i] + out[i - distance]) & 0xff;
        break;
      }
      case CODEC_BCJ:
      case CODEC_BCJ_X86:
        out = input.slice(0, outSize);
        bcjX86Decode(out);
        break;
      default:
        throw new Error(`7z: unsupported codec ${coder.codec.toString(16)}`);
    }

    outputs.set(coderIndex, out);
    return out;
  };

  return run(coderOfOutput(folderMainOutput(folder)));
}

/**
 * Undo the x86 branch filter.
 *
 * The filter rewrites the relative targets of CALL and JMP as absolute ones,
 * which compresses better; this puts them back. Music archives rarely use it,
 * but a rip that bundles a player executable will.
 */
function bcjX86Decode(data: Uint8Array): void {
  const test86 = (b: number) => b === 0 || b === 0xff;
  let prevMask = 0;
  let prevPos = -5;

  for (let i = 0; i + 4 < data.length; ) {
    if ((data[i] & 0xfe) !== 0xe8) {
      i++;
      continue;
    }
    const d = i - prevPos;
    prevPos = i;
    if (d > 3) {
      prevMask = 0;
    } else {
      prevMask = (prevMask << (d - 1)) & 7;
      if (prevMask !== 0) {
        const b = data[i + 4 - maskToBitNumber(prevMask)];
        if (!maskToAllowedStatus(prevMask) || test86(b)) {
          prevMask = ((prevMask << 1) & 7) | 1;
          i++;
          continue;
        }
      }
    }

    if (test86(data[i + 4])) {
      let src =
        (data[i + 1] | (data[i + 2] << 8) | (data[i + 3] << 16) | (data[i + 4] << 24)) >>> 0;
      let dest: number;
      for (;;) {
        dest = (src - (i + 5)) >>> 0;
        if (prevMask === 0) break;
        const idx = maskToBitNumber(prevMask) * 8;
        const b = (dest >>> (24 - idx)) & 0xff;
        if (!test86(b)) break;
        src = (dest ^ ((1 << (32 - idx)) - 1)) >>> 0;
      }
      data[i + 4] = (~(((dest >>> 24) & 1) - 1)) & 0xff;
      data[i + 3] = (dest >>> 16) & 0xff;
      data[i + 2] = (dest >>> 8) & 0xff;
      data[i + 1] = dest & 0xff;
      i += 5;
    } else {
      prevMask = ((prevMask << 1) & 7) | 1;
      i++;
    }
  }
}

function maskToAllowedStatus(mask: number): boolean {
  return [true, true, true, false, true, false, false, false][mask & 7];
}

function maskToBitNumber(mask: number): number {
  return [0, 1, 2, 2, 3, 3, 3, 3][mask & 7];
}

interface FileEntry {
  name: string;
  hasStream: boolean;
  isDirectory: boolean;
}

function readFilesInfo(r: Reader): FileEntry[] {
  const numFiles = r.number();
  const files: FileEntry[] = [];
  for (let i = 0; i < numFiles; i++) files.push({ name: "", hasStream: true, isDirectory: false });

  let numEmptyStreams = 0;
  let emptyStreams: boolean[] = new Array(numFiles).fill(false);
  let emptyFiles: boolean[] = [];
  let antiFiles: boolean[] = [];

  for (;;) {
    const type = r.number();
    if (type === kEnd) break;
    const size = r.number();
    const next = r.pos + size;

    switch (type) {
      case kEmptyStream:
        emptyStreams = r.bits(numFiles);
        numEmptyStreams = emptyStreams.filter(Boolean).length;
        break;
      case kEmptyFile:
        emptyFiles = r.bits(numEmptyStreams);
        break;
      case kAnti:
        antiFiles = r.bits(numEmptyStreams);
        break;
      case kName: {
        const external = r.byte();
        if (external !== 0) throw new Error("7z: external file names are not supported");
        // UTF-16LE, each name terminated by a zero unit.
        const units: number[] = [];
        let at = 0;
        while (r.pos < next) {
          const unit = r.byte() | (r.byte() << 8);
          if (unit === 0) {
            files[at++].name = String.fromCharCode(...units);
            units.length = 0;
          } else {
            units.push(unit);
          }
        }
        break;
      }
      case kDummy:
      default:
        break;
    }
    r.pos = next;
  }

  // An entry with no stream is a directory, unless it is marked as an empty
  // file (or an anti-file, which is a deletion marker in an incremental
  // archive and holds nothing either way).
  let emptyIndex = 0;
  for (let i = 0; i < numFiles; i++) {
    if (emptyStreams[i]) {
      files[i].hasStream = false;
      const isEmptyFile = emptyFiles[emptyIndex] === true;
      const isAnti = antiFiles[emptyIndex] === true;
      files[i].isDirectory = !isEmptyFile && !isAnti;
      emptyIndex++;
    }
  }
  return files;
}

/** True when the data begins with the 7z signature. */
export function is7zFile(data: Uint8Array): boolean {
  if (data.length < SIGNATURE_HEADER_SIZE) return false;
  for (let i = 0; i < SIGNATURE.length; i++) if (data[i] !== SIGNATURE[i]) return false;
  return true;
}

/**
 * Unpack a .7z, keeping only the members `wanted` accepts.
 *
 * Whole folders have to be decoded even when one file inside them is wanted -
 * a folder is one compressed stream, and the files in it are just offsets into
 * what comes out - so `wanted` saves the copy, not the work.
 */
export function un7z(data: Uint8Array, wanted?: (name: string) => boolean): SevenZipEntry[] {
  if (!is7zFile(data)) throw new Error("7z: not a 7z archive");

  const sig = new Reader(data, 12);
  const nextHeaderOffset = sig.uint64();
  const nextHeaderSize = sig.uint64();
  if (nextHeaderSize === 0) return [];

  const headerStart = SIGNATURE_HEADER_SIZE + nextHeaderOffset;
  let header = data.subarray(headerStart, headerStart + nextHeaderSize);
  let r = new Reader(header);
  let id = r.number();

  if (id === kEncodedHeader) {
    // The header is itself a compressed stream; decode it and start again.
    const info = readStreamsInfo(r);
    const decoded = decodeStreams(data, info);
    if (decoded.length === 0) throw new Error("7z: encoded header decoded to nothing");
    header = decoded[0];
    r = new Reader(header);
    id = r.number();
  }

  if (id !== kHeader) throw new Error("7z: header not found");

  let streams: StreamsInfo | null = null;
  let files: FileEntry[] = [];

  let section = r.number();
  while (section !== kEnd) {
    switch (section) {
      case kMainStreamsInfo:
        streams = readStreamsInfo(r);
        break;
      case kFilesInfo:
        files = readFilesInfo(r);
        break;
      default:
        skipProperty(r);
        break;
    }
    section = r.number();
  }

  if (streams == null) return [];

  // Files with a stream are laid end to end across the folders, in order.
  const wantedIndices = new Set<number>();
  const streamFileIndex: number[] = [];
  for (let i = 0; i < files.length; i++) {
    if (!files[i].hasStream) continue;
    streamFileIndex.push(i);
    if (wanted == null || wanted(files[i].name)) wantedIndices.add(streamFileIndex.length - 1);
  }
  if (wantedIndices.size === 0) return [];

  const entries: SevenZipEntry[] = [];
  let streamIndex = 0;
  for (let f = 0; f < streams.folders.length; f++) {
    const folder = streams.folders[f];
    const count = folder.numUnpackSubStreams;
    if (count === 0) continue;

    // Skip a folder whose files are all unwanted, and the work of decoding it.
    let anyWanted = false;
    for (let i = 0; i < count; i++) if (wantedIndices.has(streamIndex + i)) anyWanted = true;
    if (!anyWanted) {
      streamIndex += count;
      continue;
    }

    const unpacked = decodeOneFolder(data, streams, f);
    let at = 0;
    for (let i = 0; i < count; i++) {
      const size = folder.subStreamSizes[i];
      if (wantedIndices.has(streamIndex + i)) {
        const fileIndex = streamFileIndex[streamIndex + i];
        entries.push({ name: files[fileIndex].name, data: unpacked.slice(at, at + size) });
      }
      at += size;
    }
    streamIndex += count;
  }

  return entries;
}

/** Packed bytes one folder consumes, sliced out of the archive. */
function packedStreamsFor(data: Uint8Array, info: StreamsInfo, folderIndex: number): Uint8Array[] {
  const base = SIGNATURE_HEADER_SIZE + info.packPos;
  let at = base;
  const first = info.folderPackIndex[folderIndex];
  for (let i = 0; i < first; i++) at += info.packSizes[i];

  const out: Uint8Array[] = [];
  const count = info.folders[folderIndex].packedIndices.length;
  for (let i = 0; i < count; i++) {
    const size = info.packSizes[first + i];
    out.push(data.subarray(at, at + size));
    at += size;
  }
  return out;
}

function decodeOneFolder(data: Uint8Array, info: StreamsInfo, folderIndex: number): Uint8Array {
  return decodeFolder(info.folders[folderIndex], packedStreamsFor(data, info, folderIndex));
}

function decodeStreams(data: Uint8Array, info: StreamsInfo): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < info.folders.length; i++) out.push(decodeOneFolder(data, info, i));
  return out;
}
