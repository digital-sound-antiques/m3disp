import { KSSPlayer, KSSDeviceName } from "./kss-player";

export type ChannelStatus = {
  freq: number;
  kcode?: number | null;
  vol: number;
  mode?: string | null;
  keyKeepFrames?: number | null;
  voice?: string | Uint8Array | null;
};

function createPSGVoiceName(ton: boolean, non: boolean) {
  if (ton && non) {
    return 'Tone+Noise';
  } else if (ton) {
    return 'Tone';
  } else if (non) {
    return 'Noise';
  } else {
    return 'Muted';
  }
}

/// ch 0,1,2: tone
/// ch 3,4,5: noise
function createPSGStatus(regs: Uint8Array, ch: number): ChannelStatus {
  if (ch < 3) {
    const fdiv = ((regs[ch * 2 + 1] & 0xff) << 8) | regs[ch * 2];
    const vol = Math.min(15, regs[8 + ch]);    
    const A4 = 440.0;
    const ton = (regs[7] & (1 << ch)) == 0;
    const non = (regs[7] & (8 << ch)) == 0;
    const voice = createPSGVoiceName(ton, non);
    const freq = fdiv > 0 ? 3579545 / 2 / 16 / 2 / fdiv : 0;
    if (ton && vol > 0 && freq != 0) {
      const kcode = 57 + Math.round(Math.log2(freq / A4) * 12);
      return { freq, kcode, vol, voice };
    } else {
      return { freq, vol, voice };
    }
  } else {
    const freq = regs[6];
    const vol = Math.min(15, regs[8 + (ch - 3)]);
    const ton = (regs[7] & (1 << (ch - 3))) == 0;
    const non = (regs[7] & (8 << (ch - 3))) == 0;
    const voice = createPSGVoiceName(ton, non);
    if (non && vol > 0) {
      return { freq, kcode: freq, vol, mode: "noise", voice };
    } else {
      return { freq, vol, mode: "noise", voice };
    }
  }
}

function createSCCStatus(regs: Uint8Array, ch: number): ChannelStatus {
  const fdiv = ((regs[0xc0 + ch * 2 + 1] & 0xff) << 8) | regs[0xc0 + ch * 2];
  const freq = 3579545 / 2 / 16 / 2 / fdiv;
  const vol = regs[0xd0 + ch] & 0x0f;
  const A4 = 440.0;

  const vch = ch < 5 ? ch : 4;
  const voice = new Uint8Array(regs.buffer, regs.byteOffset + vch * 32, 32);

  if (vol > 0 && freq > 0) {
    const kcode = 57 + Math.round(Math.log2(freq / A4) * 12);
    return { freq, kcode, vol, voice };
  } else {
    return { freq, vol, voice };
  }
}

function createOPLLStatus(
  regs: Uint8Array,
  /// ch: logical channel
  /// 0-8: FM1-9, 9:BD, 10:SD, 11:TOM, 12:CYM, 13:HH
  ch: number,
  keyKeepFrames: ArrayLike<number> | Array<number>
): ChannelStatus {
  const rflag = (regs[0x0e] & 32) != 0;

  let mode: string | null = null;
  let pch; // physical channel

  if (ch == 9) {
    pch = 6;
  } else if (ch == 10 || ch == 13) {
    // SD, HH
    pch = 7;
  } else if (ch == 11 || ch == 12) {
    // TOM, CYM
    pch = 8;
  } else {
    pch = ch;
  }

  let fnum = ((regs[0x20 + pch] & 0x1) << 8) | regs[0x10 + pch];
  let blk = (regs[0x20 + pch] & 0xe) >> 1;
  let fmul = 1;

  let kon = false;
  let vol: number = 0;

  if (ch < 9) {
    kon = (regs[0x20 + pch] & 0x10) != 0;
    vol = 0x0f - (regs[0x30 + pch] & 0xf);
  } else {
    mode = "rch";
    if (rflag) {
      const ron = (regs[0x0e] & (0x10 >> (ch - 9))) != 0;
      if (ron && 0 < keyKeepFrames[ch] && keyKeepFrames[ch] <= 735 * 8) {
        kon = true;
      }

      if (ch == 9) {
        vol = 0x0f - (regs[0x38] & 0xf);
      }
      if (ch == 10) {
        vol = 0x0f - (regs[0x37] & 0xf);
      }
      if (ch == 11) {
        // TOM
        vol = 0x0f - ((regs[0x38] >> 4) & 0xf);
      }
      if (ch == 12) {
        // CYM
        vol = 0x0f - (regs[0x38] & 0xf);
        blk = Math.max(regs[0x27] & 0xe, regs[0x28] & 0xe) >> 1;
        fnum = ((regs[0x27] & 0x1) << 8) | regs[0x17];
      }
      if (ch == 13) {
        // HH
        vol = 0x0f - ((regs[0x37] >> 4) & 0xf);
        blk = Math.max(regs[0x27] & 0xe, regs[0x28] & 0xe) >> 1;
        fnum = ((regs[0x28] & 0x1) << 8) | regs[0x18];
      }
    } else {
      kon = false;
      vol = 0;
    }
  }

  let voice;
  if (pch >= 6 && rflag) {
    if (pch == 6) {
      voice = "B.D";
    } else if (pch == 7) {
      voice = "S.D/H.H";
    } else if (pch == 8) {
      voice = "TOM/CYM";
    }
  } else {
    voice = toOpllVoiceName((regs[0x30 + pch] >> 4) & 0x0f);
  }

  const fsam = 3579545 / 72;
  const freq = (fsam * fnum) / (2 << (18 - blk));
  const A4 = 440.0;

  if (kon) {
    const kcode = 57 + Math.round(Math.log2((freq * fmul) / A4) * 12);
    return { freq, kcode, vol, mode, keyKeepFrames: keyKeepFrames[ch], voice };
  } else {
    return { freq, vol, mode, keyKeepFrames: keyKeepFrames[ch], voice };
  }
}

export function getChannelStatus(player: KSSPlayer, id: ChannelId): ChannelStatus {
  const currentFrame = player.progress?.renderer?.currentFrame ?? 0;
  const snapshot = player.findSnapshotAt(currentFrame);
  if (snapshot == null || player.state == "stopped") {
    return { freq: 0, vol: 0 };
  }

  switch (id.device) {
    case "psg":
      return createPSGStatus(snapshot.psg!, id.index);
    case "scc":
      return createSCCStatus(snapshot.scc!, id.index);
    case "opll":
      return createOPLLStatus(snapshot.opll!, id.index, snapshot.opllkeyKeepFrames!);
    default:
      throw new Error(`Uknown device: ${id.device}`);
  }
}

export type ChannelId = {
  device: KSSDeviceName;
  index: number;
};

function toOpllVoiceName(n: number): string {
  switch (n) {
    case 0:
      return "User";
    case 1:
      return "Violin";
    case 2:
      return "Guitar";
    case 3:
      return "Piano";
    case 4:
      return "Flute";
    case 5:
      return "Clarinet";
    case 6:
      return "Oboe";
    case 7:
      return "Trumpet";
    case 8:
      return "Organ";
    case 9:
      return "Horn";
    case 10:
      return "Synth";
    case 11:
      return "Harpsicode";
    case 12:
      return "Vibraphone";
    case 13:
      return "S.Bass";
    case 14:
      return "W.Bass";
    case 15:
      return "E.Bass";
    default:
      throw new Error();
  }
}
