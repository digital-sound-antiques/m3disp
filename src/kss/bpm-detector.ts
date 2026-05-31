import type { KSSPlayer } from "./kss-player";
import type { ChannelId } from "./channel-status";
import { getKcodeAt } from "./channel-status";

export type BPMInfo = {
  bpm: number;
  framesPerBeat: number;
  phaseOffset: number;
  firstOnset: number;
  /** 実際の拍頭位置列（スナップショット配列インデックス）*/
  beatFrames: number[];
};

const PROBE_CHANNELS: ChannelId[] = [
  { device: "opll", index: 0 },
  { device: "opll", index: 1 },
  { device: "opll", index: 2 },
  { device: "psg",  index: 0 },
  { device: "psg",  index: 1 },
  { device: "scc",  index: 0 },
  { device: "scc",  index: 1 },
];

/**
 * 理論的な拍位置を起点に、実際のオンセット信号に±snapWindow フレームでスナップし
 * 誤差拡散由来のジッタを補正した拍頭列を返す。
 * 近くにオンセットがなければ理論値（四捨五入）をそのまま使う。
 */
function trackBeats(
  onsets: Uint8Array,
  start: number,
  end: number,
  firstOnset: number,
  fpb: number
): number[] {
  const beats: number[] = [];
  let pos = firstOnset;
  const snapWindow = 2; // 誤差拡散の最大ジッタ ≈ ±1 フレームに余裕を持たせる

  while (pos <= end) {
    beats.push(Math.round(pos));
    const nextNominal = pos + fpb;

    // 次の理論拍位置の近傍にオンセットがあればそこにスナップ
    let bestPos = nextNominal;
    let bestDist = Infinity;
    const lo = Math.round(nextNominal - snapWindow);
    const hi = Math.round(nextNominal + snapWindow);
    for (let f = lo; f <= hi; f++) {
      const fi = f - start;
      if (fi >= 0 && fi < onsets.length && onsets[fi] === 1) {
        const dist = Math.abs(f - nextNominal);
        if (dist < bestDist) { bestDist = dist; bestPos = f; }
      }
    }
    pos = bestPos;
  }
  return beats;
}

export function detectBPM(player: KSSPlayer): BPMInfo | null {
  const snapshots = player._snapshots;
  const total = snapshots.length;
  if (total < 120) return null;

  // ---- 先頭無音をスキップして最初のノートオン位置を探す ----
  let firstOnset = -1;
  outer:
  for (let i = 0; i < total; i++) {
    for (const id of PROBE_CHANNELS) {
      if (getKcodeAt(snapshots[i], id) !== null) { firstOnset = i; break outer; }
    }
  }
  if (firstOnset < 0) return null;

  // ---- 解析ウィンドウ（first onset 以降、直近30秒）----
  const end   = Math.min(total, player._lastIndex + 1);
  const start = Math.max(firstOnset, end - 30 * 60);
  const len   = end - start;
  if (len < 60) return null;

  // ---- オンセット信号を構築 ----
  const onsets = new Uint8Array(len);
  for (const id of PROBE_CHANNELS) {
    let prev: number | null = null;
    for (let i = 0; i < len; i++) {
      const kcode = getKcodeAt(snapshots[start + i], id);
      if (kcode !== null && kcode !== prev) onsets[i] = 1;
      prev = kcode ?? null;
    }
  }

  // ---- オートコリレーション（相関値を配列に保持）----
  // BPM 60〜200 → lag 18〜60 フレーム
  const minLag = 18;
  const maxLag = 60;
  const corrArr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < len - lag; i++) c += onsets[i] & onsets[i + lag];
    corrArr[lag] = c;
  }

  let bestLag = minLag;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (corrArr[lag] > corrArr[bestLag]) bestLag = lag;
  }
  if (corrArr[bestLag] < 4) return null;

  // ---- 放物線補間でサブフレーム精度のlag推定 ----
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const c0 = corrArr[bestLag - 1];
    const c1 = corrArr[bestLag];
    const c2 = corrArr[bestLag + 1];
    const denom = c0 - 2 * c1 + c2;
    if (denom < 0) refinedLag = bestLag - 0.5 * (c2 - c0) / denom;
  }

  // ---- BPM算出（60〜200の範囲に収める）----
  let bpm = 3600 / refinedLag;
  while (bpm < 75)  bpm *= 2;
  while (bpm > 180) bpm /= 2;

  const framesPerBeat = Math.round(3600 / bpm);
  const fpbExact = 3600.0 / bpm;

  // ---- 位相は firstOnset を起点に浮動小数点で固定 ----
  const phaseOffset = firstOnset % fpbExact;

  // ---- 実際の拍頭列をオンセットスナップで追跡 ----
  const beatFrames = trackBeats(onsets, start, end, firstOnset, fpbExact);

  return { bpm, framesPerBeat, phaseOffset, firstOnset, beatFrames };
}
