import { Box, useTheme } from "@mui/material";
import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { ChannelId, getChannelStatus } from "../kss/channel-status";
import { AppContext } from "../contexts/AppContext";

export type KeyboardPainterArgs = {
  whiteKeyWidth: number;
  blackKeyWidth: number;
  whiteKeyRadii: number | Iterable<number>;
  blackKeyRadii: number | Iterable<number>;
  keyMargin: number;
  whiteKeyHeight: number;
  blackKeyHeight: number;
  numberOfWhiteKeys: number;
  blackKeyColor: string;
};

const defaultKeyboardLayout: KeyboardPainterArgs = {
  whiteKeyWidth: 12,
  whiteKeyHeight: 48,
  whiteKeyRadii: [0, 0, 0.5, 0.5],
  blackKeyWidth: 9,
  blackKeyHeight: 32,
  blackKeyRadii: [0, 0, 0.5, 0.5],
  keyMargin: 1,
  numberOfWhiteKeys: 56,
  blackKeyColor: "#222",
};

export class KeyboardPainter {
  constructor(args: KeyboardPainterArgs = defaultKeyboardLayout) {
    this.args = args;
    this._width =
      (this.args.whiteKeyWidth + this.args.keyMargin) * this.args.numberOfWhiteKeys -
      this.args.keyMargin;
  }

  args: KeyboardPainterArgs;

  private _width: number;

  get width() {
    return this._width;
  }
  get height() {
    return this.args.whiteKeyHeight;
  }

  paintWhiteKeys(ctx: CanvasRenderingContext2D, color: string) {
    let x = 0;
    const w = this.args.whiteKeyWidth;
    const h = this.args.whiteKeyHeight;
    const step = w + this.args.keyMargin;

    ctx.fillStyle = color;
    for (let i = 0; i < this.args.numberOfWhiteKeys; i++) {
      ctx.rect(x, 0, w, h);
      x += step;
    }
    ctx.fill();
  }

  paintBlackKeys(ctx: CanvasRenderingContext2D) {
    let x =
      this.args.whiteKeyWidth - Math.floor((this.args.blackKeyWidth - this.args.keyMargin) / 2);
    const w = this.args.blackKeyWidth;
    const h = this.args.blackKeyHeight;
    const step = this.args.whiteKeyWidth + this.args.keyMargin;
    ctx.fillStyle = this.args.blackKeyColor;
    for (let i = 0; i < this.args.numberOfWhiteKeys; i++) {
      if (i % 7 != 2 && i % 7 != 6) {
        ctx.rect(x, 0, w, h);
      }
      x += step;
    }
    ctx.fill();
  }

  paintWhiteKeysOverlay(canvas: HTMLCanvasElement, kcodes: number[], colors: string[]) {
    const w = this.args.whiteKeyWidth;
    const h = this.args.whiteKeyHeight;
    const step = this.args.whiteKeyWidth + this.args.keyMargin;

    const kc2key = [0, null, 1, null, 2, 3, null, 4, null, 5, null, 6, null];
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < kcodes.length; i++) {
      const kcode = kcodes[i];
      const color = colors[i];
      const key = kc2key[kcode % 12]!;
      if (key != null) {
        const oct = Math.floor(kcode / 12);
        const dx = (key + oct * 7) * step;
        ctx.fillStyle = color + "c8";
        ctx.fillRect(dx, 0, w, h);
      }
    }
  }

  paintBlackKeysOverlay(
    canvas: HTMLCanvasElement,
    kcodes: number[],
    colors: string[],
    whiteKeyColor: string
  ) {
    let x =
      this.args.whiteKeyWidth - Math.floor((this.args.blackKeyWidth - this.args.keyMargin) / 2);
    const w = this.args.blackKeyWidth;
    const h = this.args.blackKeyHeight;
    const step = this.args.whiteKeyWidth + this.args.keyMargin;
    const kc2key = [null, 0, null, 1, null, null, 3, null, 4, null, 5, null];
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < kcodes.length; i++) {
      const kcode = kcodes[i];
      const key = kc2key[kcode % 12]!;
      if (key != null) {
        const oct = Math.floor(kcode / 12);
        const dx = (key + oct * 7) * step;

        ctx.fillStyle = whiteKeyColor;
        ctx.fillRect(x + dx + 1, 1, w - 2, h - 2);

        ctx.fillStyle = colors[i] + "c8";
        ctx.fillRect(x + dx + 1, 1, w - 2, h - 2);
      }
    }
  }
}

function WhiteKeys(props: {
  width?: number | null;
  height?: number | null;
  painter: KeyboardPainter;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.painter.width;
    canvas.height = props.painter.height;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
    props.painter.paintWhiteKeys(canvas.getContext("2d")!, theme.palette.text.primary);
  }, [props.width, props.height, theme.palette.text.primary]);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }}></canvas>;
}

function WhiteKeysOverlay(props: {
  width?: number | null;
  height?: number | null;
  painter: KeyboardPainter;
  targets: ChannelId[];
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerContext = useContext(PlayerContext);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.painter.width;
    canvas.height = props.painter.height;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current!;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        const kcodes = [];
        const colors = [];
        for (const target of props.targets) {
          const channel = getChannelStatus(playerContext.player, target);
          if (channel != null && channel.kcode != null) {
            kcodes.push(channel.kcode);
            colors.push(propsRef.current.color);
          }
        }
        props.painter.paintWhiteKeysOverlay(canvas, kcodes, colors);
      }
    };
    renderFrame();
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }}></canvas>;
}

function BlackKeys(props: {
  width?: number | null;
  height?: number | null;
  painter: KeyboardPainter;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.painter.width;
    canvas.height = props.painter.height;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
    props.painter.paintBlackKeys(canvas.getContext("2d")!);
  }, [props.width, props.height]);
  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }}></canvas>;
}

function BlackKeysOverlay(props: {
  width?: number | null;
  height?: number | null;
  painter: KeyboardPainter;
  targets: ChannelId[];
  color: string;
  whiteKeyColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.painter.width;
    canvas.height = props.painter.height;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  const playerContext = useContext(PlayerContext);

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current!;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        const kcodes = [];
        const colors = [];
        for (const target of props.targets) {
          const channel = playerContext.player.getChannelStatus(target);
          if (channel != null && channel.kcode != null) {
            kcodes.push(channel.kcode);
            colors.push(propsRef.current.color);
          }
        }
        props.painter.paintBlackKeysOverlay(canvas, kcodes, colors, propsRef.current.whiteKeyColor);
      }
    };
    renderFrame();
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }}></canvas>;
}

type KeyboardProps = {
  painter?: KeyboardPainter | null;
  targets: ChannelId[];
  disabled?: boolean | null;
  highlightColor: string;
  whiteKeyColor: string;
};

const defaultPainter = new KeyboardPainter();

export function Keyboard(props: KeyboardProps) {
  const boxRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const painter = props.painter ?? defaultPainter;

  const onResize = () => {
    setSize({
      width: boxRef.current!.clientWidth,
      height: boxRef.current!.clientHeight,
    });
  };
  const resizeObserver = new ResizeObserver(onResize);

  useEffect(() => {
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const targets: ChannelId[] =
    props.targets instanceof Array ? (props.targets as ChannelId[]) : [props.targets];

  return (
    <Box
      ref={boxRef}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      <WhiteKeys painter={painter} width={size.width} height={size.height} />
      {props.disabled != true ? (
        <WhiteKeysOverlay
          painter={painter}
          targets={targets}
          width={size.width}
          height={size.height}
          color={props.highlightColor}
        />
      ) : undefined}
      <BlackKeys painter={painter} width={size.width} height={size.height} />
      {props.disabled != true ? (
        <BlackKeysOverlay
          painter={painter}
          targets={targets}
          width={size.width}
          height={size.height}
          color={props.highlightColor}
          whiteKeyColor={props.whiteKeyColor}
        />
      ) : undefined}
    </Box>
  );
}
