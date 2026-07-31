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

    let v;
    if (props.keyKeepFrames != null) {
      const decayCycle = props.kcode != null ? 90 : 30;
      const elapsedCycle = Math.min(props.keyKeepFrames / 735, decayCycle);
      const att = (decayCycle - elapsedCycle) / decayCycle;
      v = Math.round(props.volume * att);
    } else {
      v = props.volume;
    }

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

  const [status, setStatus] = useState<ChannelStatus | null>(null);

  const rootRef = useRef(null);
  const disabledRef = useRef(props.disabled);

  const renderFrame = () => {
    if (rootRef.current != null) {
      requestAnimationFrame(renderFrame);
      if (
        !disabledRef.current &&
        (context.player.state == "playing" || context.player.state == "paused")
      ) {
        for (const target of props.targets) {
          const newStatus = context.player.getChannelStatus(target);
          if (newStatus != null) {
            setStatus(newStatus);
          }
        }
      } else {
        setStatus(null);
      }
    }
  };

  useEffect(() => {
    requestAnimationFrame(renderFrame);
    disabledRef.current = props.disabled;
  }, [props.disabled]);

  const voiceNameBoxRef = useRef<HTMLDivElement>(null);

  let voiceNode = null;

  if (props.targets[0].device != "scc") {
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
        fontSize: "clamp(4px, 34cqh, 27px)",
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
  const disabledRef = useRef(props.disabled);

  const renderFrame = () => {
    if (rootRef.current != null) {
      requestAnimationFrame(renderFrame);
      if (!disabledRef.current) {
        if (props.targets.length > 0) {
          let nextStatus: ChannelStatus;
          for (const target of props.targets) {
            nextStatus = { id: target, freq: 0, vol: 0 };
            const newStatus = context.player.getChannelStatus(target);
            if (newStatus != null) {
              if (nextStatus.vol < newStatus.vol) {
                nextStatus.vol = newStatus.vol;
              }
              if (
                nextStatus.keyKeepFrames == null ||
                nextStatus.keyKeepFrames > (newStatus.keyKeepFrames ?? 0)
              ) {
                nextStatus.keyKeepFrames = newStatus.keyKeepFrames ?? 0;
              }
            }
          }
          setStatus(nextStatus!);
        }
      } else {
        setStatus(null);
      }
    }
  };

  useEffect(() => {
    requestAnimationFrame(renderFrame);
    disabledRef.current = props.disabled;
  }, [props.disabled]);

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
