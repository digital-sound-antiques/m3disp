
export type KSSDeviceName = "psg" | "scc" | "opll" | "opl";

/** Every device a channel can belong to, across all player modes. None of the
 *  SPC S-DSP, the NES sound unit or the PC Engine PSG is a KSS device — the KSS
 *  engines never see their masks — but each owns channels, so the display and
 *  mute types have to admit them. */
export type DeviceName = KSSDeviceName | "spc" | "nsf" | "hes";

export type KSSChannelMask = { [key in DeviceName]: number };
