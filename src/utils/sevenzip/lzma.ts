/**
 * LZMA and LZMA2 decoders, written from the LZMA specification published with
 * the SDK.
 *
 * Enough of the format to open the archives music is distributed in, which is
 * to say the decoder and nothing else: no compressor, no optional features
 * that a general-purpose tool would need. The range coder and the probability
 * model follow the specification's own pseudo-code closely, because that is
 * the only way to be sure a bitstream decoder is right - it either reproduces
 * the stream exactly or produces noise, with nothing in between.
 */

const TOP_VALUE = 1 << 24;
const MODEL_TOTAL_BITS = 11;
const MODEL_TOTAL = 1 << MODEL_TOTAL_BITS;
const MOVE_BITS = 5;
const PROB_INIT = MODEL_TOTAL >>> 1;

const NUM_STATES = 12;
const NUM_POS_BITS_MAX = 4;
const MATCH_MIN_LEN = 2;
const NUM_LEN_TO_POS_STATES = 4;
const END_POS_MODEL_INDEX = 14;
const NUM_FULL_DISTANCES = 1 << (END_POS_MODEL_INDEX >> 1);
const NUM_ALIGN_BITS = 4;

/** Reads the range-coded bitstream. */
class RangeDecoder {
  private input: Uint8Array;
  private pos: number;
  range = 0xffffffff;
  code = 0;

  constructor(input: Uint8Array, pos: number) {
    this.input = input;
    this.pos = pos;
    // The first byte of a range-coded stream is always zero; the next four are
    // the initial code.
    this.pos++;
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.nextByte()) >>> 0;
  }

  private nextByte(): number {
    return this.pos < this.input.length ? this.input[this.pos++] : 0;
  }

  /** Where the stream has been read up to, for a caller that needs to skip on. */
  get position(): number {
    return this.pos;
  }

  private normalize(): void {
    if (this.range < TOP_VALUE) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.nextByte()) >>> 0;
    }
  }

  /** Bits that carry no model, taken straight off the range. */
  decodeDirectBits(count: number): number {
    let res = 0;
    do {
      this.range = this.range >>> 1;
      this.code = (this.code - this.range) >>> 0;
      const t = 0 - (this.code >>> 31);
      this.code = (this.code + (this.range & t)) >>> 0;
      this.normalize();
      res = ((res << 1) + t + 1) >>> 0;
    } while (--count);
    return res;
  }

  /** One bit, against the probability held in `probs[index]`. */
  decodeBit(probs: Uint16Array, index: number): number {
    const v = probs[index];
    const bound = (this.range >>> MODEL_TOTAL_BITS) * v;
    let symbol: number;
    if ((this.code >>> 0) < bound) {
      probs[index] = v + ((MODEL_TOTAL - v) >>> MOVE_BITS);
      this.range = bound;
      symbol = 0;
    } else {
      probs[index] = v - (v >>> MOVE_BITS);
      this.code = (this.code - bound) >>> 0;
      this.range = (this.range - bound) >>> 0;
      symbol = 1;
    }
    this.normalize();
    return symbol;
  }

  /** A symbol held as a tree of bits, most significant first. */
  bitTreeDecode(probs: Uint16Array, offset: number, numBits: number): number {
    let m = 1;
    for (let i = 0; i < numBits; i++) m = (m << 1) + this.decodeBit(probs, offset + m);
    return m - (1 << numBits);
  }

  /** The same tree, read least significant bit first. */
  bitTreeReverseDecode(probs: Uint16Array, offset: number, numBits: number): number {
    let m = 1;
    let symbol = 0;
    for (let i = 0; i < numBits; i++) {
      const bit = this.decodeBit(probs, offset + m);
      m = (m << 1) + bit;
      symbol |= bit << i;
    }
    return symbol;
  }

  /** True when the stream ended exactly where it should have. */
  get finishedOk(): boolean {
    return this.code === 0;
  }
}

function initProbs(n: number): Uint16Array {
  return new Uint16Array(n).fill(PROB_INIT);
}

/** The match-length decoder, used for both new matches and repeats. */
class LenDecoder {
  choice = initProbs(2);
  low = initProbs((1 << NUM_POS_BITS_MAX) * 8);
  mid = initProbs((1 << NUM_POS_BITS_MAX) * 8);
  high = initProbs(256);

  decode(rc: RangeDecoder, posState: number): number {
    if (rc.decodeBit(this.choice, 0) === 0) return rc.bitTreeDecode(this.low, posState * 8, 3);
    if (rc.decodeBit(this.choice, 1) === 0) return 8 + rc.bitTreeDecode(this.mid, posState * 8, 3);
    return 16 + rc.bitTreeDecode(this.high, 0, 8);
  }
}

/**
 * The decoder proper.
 *
 * Kept as an object rather than a function because LZMA2 restarts it in
 * pieces: a chunk may keep the dictionary, the probability model and the
 * state from the chunk before it, or reset any of the three.
 */
export class LzmaDecoder {
  private lc = 0;
  private lp = 0;
  private pb = 0;

  /** The output, which is also the dictionary the matches copy from. */
  private out: Uint8Array;
  private outPos = 0;

  private litProbs = initProbs(0x300);
  private isMatch = initProbs(NUM_STATES << NUM_POS_BITS_MAX);
  private isRep = initProbs(NUM_STATES);
  private isRepG0 = initProbs(NUM_STATES);
  private isRepG1 = initProbs(NUM_STATES);
  private isRepG2 = initProbs(NUM_STATES);
  private isRep0Long = initProbs(NUM_STATES << NUM_POS_BITS_MAX);
  private posSlot = initProbs(NUM_LEN_TO_POS_STATES * 64);
  private posDecoders = initProbs(1 + NUM_FULL_DISTANCES - END_POS_MODEL_INDEX);
  private alignDecoder = initProbs(1 << NUM_ALIGN_BITS);
  private lenDecoder = new LenDecoder();
  private repLenDecoder = new LenDecoder();

  private state = 0;
  private rep0 = 0;
  private rep1 = 0;
  private rep2 = 0;
  private rep3 = 0;

  constructor(outputSize: number) {
    this.out = new Uint8Array(outputSize);
  }

  get output(): Uint8Array {
    return this.out;
  }

  get outputPosition(): number {
    return this.outPos;
  }

  /** Set lc/lp/pb from the packed properties byte. */
  setProps(byte: number): void {
    if (byte >= 9 * 5 * 5) throw new Error("lzma: bad properties byte");
    this.lc = byte % 9;
    let d = (byte / 9) | 0;
    this.lp = d % 5;
    this.pb = (d / 5) | 0;
    this.litProbs = initProbs(0x300 << (this.lc + this.lp));
  }

  /** Forget the probability model and the state, keeping the dictionary. */
  resetState(): void {
    this.state = 0;
    this.rep0 = 0;
    this.rep1 = 0;
    this.rep2 = 0;
    this.rep3 = 0;
    this.litProbs = initProbs(0x300 << (this.lc + this.lp));
    this.isMatch = initProbs(NUM_STATES << NUM_POS_BITS_MAX);
    this.isRep = initProbs(NUM_STATES);
    this.isRepG0 = initProbs(NUM_STATES);
    this.isRepG1 = initProbs(NUM_STATES);
    this.isRepG2 = initProbs(NUM_STATES);
    this.isRep0Long = initProbs(NUM_STATES << NUM_POS_BITS_MAX);
    this.posSlot = initProbs(NUM_LEN_TO_POS_STATES * 64);
    this.posDecoders = initProbs(1 + NUM_FULL_DISTANCES - END_POS_MODEL_INDEX);
    this.alignDecoder = initProbs(1 << NUM_ALIGN_BITS);
    this.lenDecoder = new LenDecoder();
    this.repLenDecoder = new LenDecoder();
  }

  /** Forget the dictionary: matches may no longer reach back past here. */
  resetDictionary(): void {
    this.dictStart = this.outPos;
  }

  /**
   * Account for bytes a caller has written into the output itself.
   *
   * LZMA2's uncompressed chunks are copied in whole rather than decoded, but
   * they are still part of the window the next compressed chunk copies from,
   * so the decoder has to be told they are there.
   */
  skipUncompressed(count: number): void {
    this.outPos += count;
  }

  /** Where the current dictionary begins; matches cannot reach behind it. */
  private dictStart = 0;

  private decodeDistance(len: number): number {
    let lenState = len;
    if (lenState > NUM_LEN_TO_POS_STATES - 1) lenState = NUM_LEN_TO_POS_STATES - 1;
    const rc = this.rc!;
    const slot = rc.bitTreeDecode(this.posSlot, lenState * 64, 6);
    if (slot < 4) return slot;
    const numDirectBits = (slot >> 1) - 1;
    let dist = (2 | (slot & 1)) << numDirectBits;
    if (slot < END_POS_MODEL_INDEX) {
      dist += rc.bitTreeReverseDecode(this.posDecoders, dist - slot, numDirectBits);
    } else {
      dist = (dist + (rc.decodeDirectBits(numDirectBits - NUM_ALIGN_BITS) << NUM_ALIGN_BITS)) >>> 0;
      dist = (dist + rc.bitTreeReverseDecode(this.alignDecoder, 0, NUM_ALIGN_BITS)) >>> 0;
    }
    return dist;
  }

  private rc: RangeDecoder | null = null;

  /**
   * Decode until `limit` bytes have been written, or the stream's end marker
   * is reached. Returns where the input was read up to.
   */
  decode(input: Uint8Array, inputPos: number, limit: number): number {
    const rc = new RangeDecoder(input, inputPos);
    this.rc = rc;
    const pbMask = (1 << this.pb) - 1;
    const lpMask = (1 << this.lp) - 1;
    const out = this.out;

    while (this.outPos < limit) {
      const posState = this.outPos & pbMask;
      const state2 = (this.state << NUM_POS_BITS_MAX) + posState;

      if (rc.decodeBit(this.isMatch, state2) === 0) {
        // A literal, coded against the byte before it - and, when the previous
        // symbol was a match, against the byte the match would have given.
        const prevByte = this.outPos > this.dictStart ? out[this.outPos - 1] : 0;
        const litState = ((this.outPos & lpMask) << this.lc) + (prevByte >>> (8 - this.lc));
        const probsOffset = 0x300 * litState;
        let symbol = 1;
        if (this.state >= 7) {
          let matchByte = out[this.outPos - this.rep0 - 1];
          do {
            const matchBit = (matchByte >> 7) & 1;
            matchByte = (matchByte << 1) & 0xff;
            const bit = rc.decodeBit(this.litProbs, probsOffset + ((1 + matchBit) << 8) + symbol);
            symbol = (symbol << 1) | bit;
            if (matchBit !== bit) break;
          } while (symbol < 0x100);
        }
        while (symbol < 0x100) {
          symbol = (symbol << 1) | rc.decodeBit(this.litProbs, probsOffset + symbol);
        }
        out[this.outPos++] = symbol & 0xff;
        this.state = this.state < 4 ? 0 : this.state < 10 ? this.state - 3 : this.state - 6;
        continue;
      }

      let len: number;
      if (rc.decodeBit(this.isRep, this.state) !== 0) {
        // A repeat of one of the last four distances.
        if (this.outPos === this.dictStart) throw new Error("lzma: rep with empty window");
        if (rc.decodeBit(this.isRepG0, this.state) === 0) {
          if (rc.decodeBit(this.isRep0Long, state2) === 0) {
            // One byte at the most recent distance, with no length coded.
            this.state = this.state < 7 ? 9 : 11;
            out[this.outPos] = out[this.outPos - this.rep0 - 1];
            this.outPos++;
            continue;
          }
        } else {
          let dist: number;
          if (rc.decodeBit(this.isRepG1, this.state) === 0) {
            dist = this.rep1;
          } else {
            if (rc.decodeBit(this.isRepG2, this.state) === 0) {
              dist = this.rep2;
            } else {
              dist = this.rep3;
              this.rep3 = this.rep2;
            }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = dist;
        }
        len = this.repLenDecoder.decode(rc, posState);
        this.state = this.state < 7 ? 8 : 11;
      } else {
        // A new match, whose distance follows the length.
        this.rep3 = this.rep2;
        this.rep2 = this.rep1;
        this.rep1 = this.rep0;
        len = this.lenDecoder.decode(rc, posState);
        this.state = this.state < 7 ? 7 : 10;
        this.rep0 = this.decodeDistance(len);
        if (this.rep0 === 0xffffffff) {
          // The end marker.
          this.rc = null;
          return rc.position;
        }
        if (this.rep0 >= this.outPos - this.dictStart) {
          throw new Error("lzma: distance reaches outside the window");
        }
      }

      len += MATCH_MIN_LEN;
      if (this.outPos + len > limit) len = limit - this.outPos;
      let from = this.outPos - this.rep0 - 1;
      for (let i = 0; i < len; i++) out[this.outPos++] = out[from++];
    }

    this.rc = null;
    return rc.position;
  }
}

/** Decode a bare LZMA stream: five property bytes, then the coded data. */
export function lzmaDecode(
  input: Uint8Array,
  inputPos: number,
  props: Uint8Array,
  outputSize: number
): Uint8Array {
  const decoder = new LzmaDecoder(outputSize);
  decoder.setProps(props[0]);
  decoder.resetState();
  decoder.decode(input, inputPos, outputSize);
  return decoder.output;
}

/**
 * Decode an LZMA2 stream.
 *
 * LZMA2 is LZMA cut into chunks with a control byte in front of each, saying
 * whether the chunk is compressed, and how much of the decoder's memory it
 * inherits from the chunk before it. Uncompressed chunks are how it survives
 * incompressible data without growing.
 */
export function lzma2Decode(input: Uint8Array, inputPos: number, outputSize: number): Uint8Array {
  const decoder = new LzmaDecoder(outputSize);
  let pos = inputPos;
  let needProps = true;

  while (decoder.outputPosition < outputSize) {
    const control = input[pos++];
    if (control === 0) break; // end of stream

    if (control < 3) {
      // An uncompressed chunk: 1 resets the dictionary first, 2 keeps it.
      if (control === 1) decoder.resetDictionary();
      const size = ((input[pos] << 8) | input[pos + 1]) + 1;
      pos += 2;
      const out = decoder.output;
      const at = decoder.outputPosition;
      out.set(input.subarray(pos, pos + size), at);
      pos += size;
      // Reaching into the decoder to move its position is the price of letting
      // it own the window; an uncompressed chunk is still part of the
      // dictionary the next compressed one copies from.
      decoder.skipUncompressed(size);
      continue;
    }

    // A compressed chunk. The control byte carries the top bits of the
    // unpacked size and says what to reset.
    const unpackSize = (((control & 0x1f) << 16) | (input[pos] << 8) | input[pos + 1]) + 1;
    pos += 2;
    const packSize = ((input[pos] << 8) | input[pos + 1]) + 1;
    pos += 2;
    const reset = (control >> 5) & 3;

    if (reset >= 2) {
      decoder.setProps(input[pos++]);
      needProps = false;
    } else if (needProps) {
      throw new Error("lzma2: chunk needs properties that were never given");
    }
    if (reset >= 1) decoder.resetState();
    if (reset === 3) decoder.resetDictionary();

    decoder.decode(input, pos, decoder.outputPosition + unpackSize);
    pos += packSize;
  }

  return decoder.output;
}
