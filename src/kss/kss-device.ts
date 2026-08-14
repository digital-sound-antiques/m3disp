
export type KSSDeviceName = "psg" | "scc" | "opll" | "opl";

/** Every device a channel can belong to, across both player modes. The SPC
 *  S-DSP is not a KSS device — the KSS engines never see its mask — but it does
 *  own channels, so the display and mute types have to admit it. */
export type DeviceName = KSSDeviceName | "spc";

export type KSSChannelMask = { [key in DeviceName]: number };
