import { Box, SxProps, Theme, Typography, useTheme } from "@mui/material";
import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { ChannelId, ChannelStatus } from "../kss/channel-status";

type TrackInfoPanelProps = {
  title: string;
  targets: ChannelId[];
  sx?: SxProps<Theme> | null;
  disabled: boolean;
  /** lay out number / voice / meter in a single row (for stacking above the
   *  keyboard in the 2-column view) instead of the default side column */
  top?: boolean;
};

type VolumeIndicatorProps = {
  volume: number;
  kcode?: number | null;
  keyKeepFrames?: number | null;
  primaryColor: string;
  secondaryColor: string;
  variant: "vertical" | "horizontal";
};

function meterLevel(volume: number, kcode?: number | null, keyKeepFrames?: number | null) {
  if (keyKeepFrames == null) return volume;
  const decayCycle = kcode != null ? 90 : 30;
  const elapsedCycle = Math.min(keyKeepFrames / 735, decayCycle);
  return Math.round((volume * (decayCycle - elapsedCycle)) / decayCycle);
}

function sameVoice(a: string | Uint8Array | null, b: string | Uint8Array | null) {
  if (a === b) return true;
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function VolumeIndicator(props: VolumeIndicatorProps) {
  const boxRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updateSize = () => {
    const box = boxRef.current;
    if (box != null) {
      setSize({ width: box.clientWidth, height: box.clientHeight });
    }
  };

  const resizeObserver = new ResizeObserver(updateSize);
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (props.variant == "horizontal") {
      canvas.width = 128;
      canvas.height = 1;
    } else {
      canvas.width = 1;
      canvas.height = 128;
    }
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, [props.variant]);

  useEffect(() => {
    const context = canvasRef.current!.getContext("2d")!;
    const canvas = context.canvas;

    context.fillStyle = "#223";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath();

    const v = meterLevel(props.volume, props.kcode, props.keyKeepFrames);

    if (props.variant == "horizontal") {
      const step = canvas.width / 15;
      const cw = step * 0.75;
      for (let i = 1; i < 16; i++) {
        const dx = (i - 1) * step;
        if (i == props.volume) {
          context.fillStyle = `${props.secondaryColor}e0`;
          context.fillRect(dx, 0, cw, canvas.height);
        } else if (i < v) {
          context.fillStyle = `${props.primaryColor}c0`;
          context.fillRect(dx, 0, cw, canvas.height);
        } else {
          context.fillStyle = `${props.primaryColor}60`;
          context.fillRect(dx, 0, cw, canvas.height);
        }
      }
    } else {
      const step = canvas.height / 15;
      const ch = step * 0.75;
      for (let i = 1; i < 16; i++) {
        const dy = canvas.height - (i - 1) * step - ch;
        if (i == props.volume) {
          context.fillStyle = `${props.secondaryColor}e0`;
          context.fillRect(0, dy, canvas.width, ch);
        } else if (i < v) {
          context.fillStyle = `${props.primaryColor}c0`;
          context.fillRect(0, dy, canvas.width, ch);
        } else {
          context.fillStyle = `${props.primaryColor}60`;
          context.fillRect(0, dy, canvas.width, ch);
        }
      }
    }
  }, [props.volume, props.keyKeepFrames, props.primaryColor, props.secondaryColor]);
  return (
    <Box
      ref={boxRef}
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size.width + "px",
          height: size.height + "px",
        }}
      />
    </Box>
  );
}

type WaveIndicatorProps = {
  wave?: Uint8Array | ArrayLike<number> | number[] | null;
  color: string;
  sx?: SxProps<Theme>;
};

export function WaveIndicator(props: WaveIndicatorProps) {
  const boxRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updateSize = () => {
    const box = boxRef.current;
    if (box != null) {
      setSize({ width: box.clientWidth, height: box.clientHeight });
    }
  };
  const resizeObserver = new ResizeObserver(updateSize);
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = 128;
    canvas.height = 256;
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const context = canvasRef.current!.getContext("2d")!;
    const canvas = context.canvas;
    context.clearRect(0, 0, canvas.width, canvas.height);

    // origin (Y=0) baseline at y=127, so a flat/zero wave is still visible.
    // The canvas (256px tall) is scaled down to `size.height`, so make the
    // line thick enough in canvas space to render as ~1px on screen.
    const originY = 127;
    const lineH = size.height > 0 ? Math.max(1, Math.round(canvas.height / size.height)) : 1;
    context.fillStyle = props.color;
    context.globalAlpha = 0.5;
    context.fillRect(0, originY - Math.floor(lineH / 2), canvas.width, lineH);
    context.globalAlpha = 1.0;

    if (props.wave != null) {
      const step = canvas.width / props.wave.length;
      context.fillStyle = props.color;
      context.beginPath();
      for (let i = 0; i < props.wave.length; i++) {
        const a = props.wave[i];
        if (a < 128) {
          context.rect(i * step, originY - a, step - 1, a);
        } else {
          context.rect(i * step, originY, step - 1, 255 - a + 1);
        }
      }
      context.fill();
    }
  }, [props.wave, props.color, size.height]);

  return (
    <Box
      ref={boxRef}
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        height: "100%",
        ...props.sx,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size.width + "px",
          height: size.height + "px",
        }}
      />
    </Box>
  );
}

export function TrackInfoPanel(props: TrackInfoPanelProps) {
  const theme = useTheme();
  const context = useContext(PlayerContext);

  // Only the voice is shown; keep it in state and update it only when it
  // actually changes (a per-frame setState re-rendered the whole MUI subtree).
  const [voice, setVoice] = useState<string | Uint8Array | null>(null);
  const rootRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    let raf = 0;
    let last: string | Uint8Array | null = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const p = propsRef.current;
      const pl = context.player;
      let next: string | Uint8Array | null = null;
      if (!p.disabled && (pl.state == "playing" || pl.state == "paused")) {
        for (const target of p.targets) {
          const st = pl.getChannelStatus(target);
          if (st != null) next = st.voice ?? null;
        }
      }
      if (!sameVoice(last, next)) {
        // SCC voices are views into the snapshot registers: keep a copy
        last = next instanceof Uint8Array ? next.slice() : next;
        setVoice(last);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [context.player]);
  const status = voice != null ? { voice } : null;

  const voiceNameBoxRef = useRef<HTMLDivElement>(null);

  let voiceNode = null;

  // A waveform where the channel hands one over (SCC, FDS, N163, PC Engine), the
  // voice's name otherwise.
  if (!(status?.voice instanceof Uint8Array)) {
    if (typeof status?.voice == "string") {
      voiceNode = (
        <Box
          ref={voiceNameBoxRef}
          sx={{
            position: "relative",
            display: "flex",
            flexDirection: "row",
            justifyContent: "stretch",
            alignItems: "center",
            color: "primary.main",
            width: "100%",
            height: "100%",
            whiteSpace: "nowrap",
          }}
        >
          <Typography
            sx={{
              fontSize: "inherit",
              fontWeight: "bold",
              px: 0.25,
            }}
          >
            {status?.voice}
          </Typography>
        </Box>
      );
    }
  } else {
    if (status?.voice instanceof Uint8Array) {
      voiceNode = (
        <Box
          sx={{
            position: "relative",
            display: "flex",
            width: "100%",
            height: "100%",
          }}
        >
          <Box
            sx={
              props.top
                ? { position: "absolute", top: "10%", bottom: "28%", left: "2%", width: "84%", maxWidth: "96px" }
                : { position: "absolute", top: "10%", bottom: "28%", left: "2%", right: "2%" }
            }
          >
            <WaveIndicator
              wave={status?.voice}
              color={theme.palette.primary.main}
              sx={{
                opacity: 0.54,
              }}
            />
          </Box>
        </Box>
      );
    }
  }

  if (props.top) {
    // single row: number · voice · meter — placed above the keyboard (2-column)
    return (
      <Box
        ref={rootRef}
        sx={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "1.5cqw",
          width: "100%",
          px: "1.5cqw",
          py: "1cqw",
          fontSize: "clamp(4px, 1cqh, 24px)",
          lineHeight: 1,
          overflow: "hidden",
        }}
      >
        <Typography
          sx={{
            flex: "0 0 auto",
            fontSize: "0.82em",
            fontWeight: "bold",
            color: "#8b949e",
            whiteSpace: "nowrap",
          }}
        >
          {props.title}
        </Typography>
        <Box sx={{ position: "relative", flex: 1, minWidth: 0, height: "1.3em" }}>{voiceNode}</Box>
        <Box sx={{ position: "relative", flex: "0 0 30%", maxWidth: "80px", height: "0.5em" }}>
          <VolumeInfoPanel variant="horizontal" targets={props.targets} disabled={props.disabled} />
        </Box>
      </Box>
    );
  }

  return (
    // Sizes are expressed in container units (cqw/cqh) of the enclosing keyboard
    // row so the name/voice/meter scale together with the row.
    <Box
      ref={rootRef}
      sx={{
        display: "flex",
        position: "relative",
        flexDirection: "column",
        justifyContent: "start",
        alignItems: "stretch",
        flex: "0 0 auto",
        width: "12.75cqw",
        fontSize: "clamp(4px, 29cqh, 23px)",
        lineHeight: 1,
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          position: "relative",
          flexDirection: "row",
          alignItems: "center",
          minHeight: 0,
          px: "1cqw",
          gap: "1cqw",
        }}
      >
        <Typography
          sx={{
            flex: "0 0 auto",
            fontSize: "0.82em",
            fontWeight: "bold",
            color: "#8b949e",
            whiteSpace: "nowrap",
          }}
        >
          {props.title}
        </Typography>
        <Box sx={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>{voiceNode}</Box>
      </Box>
      <Box sx={{ position: "relative", width: "100%", height: "10cqh" }}>
        <Box sx={{ position: "absolute", top: 0, bottom: 0, right: "1cqw", left: "1cqw" }}>
          <VolumeInfoPanel variant="horizontal" targets={props.targets} disabled={props.disabled} />
        </Box>
      </Box>
      <Box sx={{ height: "16cqh" }}></Box>
    </Box>
  );
}

type VolumeInfoPanelProps = {
  small?: boolean | null;
  targets: ChannelId[];
  sx?: SxProps<Theme>;
  disabled: boolean;
  variant: "horizontal" | "vertical";
};

export function VolumeInfoPanel(props: VolumeInfoPanelProps) {
  const theme = useTheme();
  const context = useContext(PlayerContext);

  const [status, setStatus] = useState<ChannelStatus | null>(null);
  const rootRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    let raf = 0;
    let lastKey = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const p = propsRef.current;
      let next: ChannelStatus | null = null;
      if (!p.disabled && p.targets.length > 0) {
        for (const target of p.targets) {
          next = { id: target, freq: 0, vol: 0 };
          const st = context.player.getChannelStatus(target);
          if (st != null) {
            if (next.vol < st.vol) next.vol = st.vol;
            if (next.keyKeepFrames == null || next.keyKeepFrames > (st.keyKeepFrames ?? 0)) {
              next.keyKeepFrames = st.keyKeepFrames ?? 0;
            }
          }
        }
      }
      // keyKeepFrames ticks every frame; re-render only when the drawn bar changes
      const key = next == null ? "" : `${next.vol}:${meterLevel(next.vol, next.kcode, next.keyKeepFrames)}`;
      if (key !== lastKey) {
        lastKey = key;
        setStatus(next);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [context.player]);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: "flex",
        width: "100%",
        height: "100%",
        justifyContent: "stretch",
        alignItems: "stretch",
        ...props.sx,
      }}
    >
      <VolumeIndicator
        volume={status?.vol ?? 0}
        kcode={status?.kcode}
        keyKeepFrames={status?.keyKeepFrames ?? 0}
        primaryColor={theme.palette.primary.main}
        secondaryColor={theme.palette.secondary.main}
        variant={props.variant}
      />
    </Box>
  );
}
