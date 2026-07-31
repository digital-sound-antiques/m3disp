import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { ChannelId, getChannelStatus } from "../kss/channel-status";

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

// a rect with only its bottom corners rounded (piano keys are square-topped)
function bottomRoundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.closePath();
}

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
    const w = this.args.whiteKeyWidth;
    const h = this.args.whiteKeyHeight;
    const step = w + this.args.keyMargin;
    const r = Math.max(1, Math.min(w * 0.15, h * 0.07));

    // top sheen → bottom shading, independent of the base key color so it works
    // for any theme text colour
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(255,255,255,0.14)");
    shade.addColorStop(0.05, "rgba(255,255,255,0)");
    shade.addColorStop(0.82, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.22)");
    // a slim shadow in the crevice down the left side of each key (skip the first)
    const seam = Math.max(1, Math.round(w * 0.06));
    const front = Math.max(1, Math.round(h * 0.05)); // dark front lip along the bottom

    let x = 0;
    for (let i = 0; i < this.args.numberOfWhiteKeys; i++) {
      bottomRoundedPath(ctx, x, 0, w, h, r);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = shade;
      ctx.fill();
      // front lip (a touch darker) reads as the key's lit front edge
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(x + r, h - front, w - 2 * r, front);
      if (i > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.fillRect(x, 0, seam, h);
      }
      x += step;
    }
  }

  paintBlackKeys(ctx: CanvasRenderingContext2D) {
    const w = this.args.blackKeyWidth;
    const h = this.args.blackKeyHeight;
    const step = this.args.whiteKeyWidth + this.args.keyMargin;
    const r = Math.max(1, Math.min(w * 0.2, h * 0.06));
    let x = this.args.whiteKeyWidth - Math.floor((w - this.args.keyMargin) / 2);

    // glossy top → near-black body
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, "#585858");
    body.addColorStop(0.1, "#303030");
    body.addColorStop(0.55, "#161616");
    body.addColorStop(1, "#000000");
    const bevel = Math.max(1, Math.round(h * 0.16)); // lit front face near the bottom

    for (let i = 0; i < this.args.numberOfWhiteKeys; i++) {
      if (i % 7 != 2 && i % 7 != 6) {
        // soft drop shadow onto the white keys below (this layer is transparent)
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.28)";
        ctx.shadowBlur = Math.max(1, w * 0.22);
        ctx.shadowOffsetY = Math.max(1, Math.round(h * 0.04));
        bottomRoundedPath(ctx, x, 0, w, h, r);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.restore();
        // beveled front: a lighter rounded lip at the very bottom
        bottomRoundedPath(ctx, x, h - bevel, w, bevel, r);
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fill();
      }
      x += step;
    }
  }

  paintWhiteKeysOverlay(canvas: HTMLCanvasElement, kcodes: number[], colors: string[]) {
    const w = this.args.whiteKeyWidth;
    const h = this.args.whiteKeyHeight;
    const step = this.args.whiteKeyWidth + this.args.keyMargin;
    const r = Math.max(1, Math.min(w * 0.15, h * 0.07)); // same as the base white keys

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
        bottomRoundedPath(ctx, dx, 0, w, h, r);
        ctx.fillStyle = color + "cc";
        ctx.fill();
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
    const iw = w - 2;
    const ih = h - 2;
    const r = Math.max(1, Math.min(iw * 0.2, ih * 0.06)); // same as the base black keys
    const kc2key = [null, 0, null, 1, null, null, 3, null, 4, null, 5, null];
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < kcodes.length; i++) {
      const kcode = kcodes[i];
      const key = kc2key[kcode % 12]!;
      if (key != null) {
        const oct = Math.floor(kcode / 12);
        const dx = (key + oct * 7) * step;

        bottomRoundedPath(ctx, x + dx + 1, 1, iw, ih, r);
        ctx.fillStyle = whiteKeyColor;
        ctx.fill();
        ctx.fillStyle = colors[i] + "cc";
        ctx.fill();
      }
    }
  }
}

function WhiteKeys(props: {
  width?: number | null;
  height?: number | null;
  painter: KeyboardPainter;
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.painter.width;
    canvas.height = props.painter.height;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
    props.painter.paintWhiteKeys(canvas.getContext("2d")!, props.color);
  }, [props.width, props.height, props.color]);

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
        for (const target of propsRef.current.targets) {
          const channel = getChannelStatus(playerContext.player, target);
          if (channel != null && channel.kcode != null) {
            kcodes.push(channel.kcode);
            colors.push(propsRef.current.color);
          }
        }
        propsRef.current.painter.paintWhiteKeysOverlay(canvas, kcodes, colors);
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
        for (const target of propsRef.current.targets) {
          const channel = playerContext.player.getChannelStatus(target);
          if (channel != null && channel.kcode != null) {
            kcodes.push(channel.kcode);
            colors.push(propsRef.current.color);
          }
        }
        propsRef.current.painter.paintBlackKeysOverlay(
          canvas,
          kcodes,
          colors,
          propsRef.current.whiteKeyColor
        );
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Build a painter sized to the actual display box (in device pixels) so the
  // canvas renders ~1:1 instead of being CSS-downscaled from a fixed 728px
  // canvas — that downscaling is what crushed the 1px key separators at narrow
  // widths. Key separators are kept at >=1 device pixel.
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const painter = useMemo(() => {
    if (props.painter != null) return props.painter;
    if (size.width <= 0 || size.height <= 0) return defaultPainter;
    const N = 56;
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    // gap between white keys scales with the key slot so it keeps its
    // proportion as the keyboard grows (min 1 device px)
    const slot = w / N;
    const margin = Math.max(1, Math.round(slot * 0.08));
    const wkw = Math.max(1, Math.floor((w - margin * (N - 1)) / N));
    return new KeyboardPainter({
      whiteKeyWidth: wkw,
      whiteKeyHeight: h,
      whiteKeyRadii: [0, 0, 0.5, 0.5],
      blackKeyWidth: Math.max(1, Math.round(wkw * 0.72)),
      blackKeyHeight: Math.max(1, Math.round(h * 0.6)),
      blackKeyRadii: [0, 0, 0.5, 0.5],
      keyMargin: margin,
      numberOfWhiteKeys: N,
      blackKeyColor: "#222",
    });
  }, [props.painter, size.width, size.height, dpr]);

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
    <div ref={boxRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      <WhiteKeys
        painter={painter}
        width={size.width}
        height={size.height}
        color={props.whiteKeyColor}
      />
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
    </div>
  );
}
