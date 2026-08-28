
export type KSSDeviceName = "psg" | "scc" | "opll" | "opl";

/** Every device a channel can belong to, across all player modes. Neither the
 *  SPC S-DSP nor the NES sound unit is a KSS device — the KSS engines never see
 *  their masks — but both own channels, so the display and mute types have to
 *  admit them. */
export type DeviceName = KSSDeviceName | "spc" | "nsf";

export type KSSChannelMask = { [key in DeviceName]: number };
