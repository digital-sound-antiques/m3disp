// Shared, render-free highlight state read by the piano-roll painter each frame
// and written by the channel panel on row/section hover. Holds flat channelIds
// indices to spotlight; null / empty means no highlight (everything normal).
export const pianoRollHighlight: { channels: Set<number> | null } = { channels: null };

export function setPianoRollHighlight(channels: number[] | null) {
  pianoRollHighlight.channels = channels && channels.length > 0 ? new Set(channels) : null;
}
