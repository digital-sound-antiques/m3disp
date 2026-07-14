import {
  useState,
  useRef,
  useLayoutEffect,
  useId,
  PropsWithChildren,
  Fragment,
  CSSProperties,
} from "react";

type MarqueeProps = PropsWithChildren & {
  play: boolean;
};

export function Marquee({ play, children }: MarqueeProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [marqueeWidth, setMarqueeWidth] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // unique keyframe name so multiple marquees don't clobber each other's rule
  const animName = `marquee-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // measure synchronously before paint so the scroll state is correct on the
  // first frame — otherwise the (unmeasured) full title flashes into view when
  // the marquee remounts on a song change
  useLayoutEffect(() => {
    const measure = () => {
      if (marqueeRef.current && containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width);
        setMarqueeWidth(marqueeRef.current.getBoundingClientRect().width);
      }
    };
    measure();
    // recalc on any size change: window resize, or the title font being scaled
    // (dragging the title bar) which changes the text width without new children
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (marqueeRef.current) ro.observe(marqueeRef.current);
    return () => ro.disconnect();
  }, [children]);

  const speed = 25;
  const active = play && marqueeWidth > containerWidth + 1;
  // start with the title's head at the left edge (fully readable), then scroll
  // left until it has passed out of view; travel is just the text width, so it
  // never over-shoots for large fonts
  const duration = Math.max(1, marqueeWidth / speed);

  return (
    <Fragment>
      <style>{`@keyframes ${animName} {
  from { transform: translateX(0); }
  to { transform: translateX(${-marqueeWidth}px); }
}`}</style>
      <div ref={containerRef} style={containerStyle}>
        <div
          ref={marqueeRef}
          style={{
            ...marqueeStyle,
            animationDuration: `${duration}s`,
            animationName: active ? animName : "none",
          }}
        >
          {children}
        </div>
      </div>
    </Fragment>
  );
}

const containerStyle: CSSProperties = {
  overflowX: "hidden",
  display: "flex",
  flexDirection: "row",
  position: "relative",
  width: "100%",
};

const marqueeStyle: CSSProperties = {
  flex: "0 0 auto",
  minWidth: "100%",
  animationIterationCount: "infinite",
  animationTimingFunction: "linear",
  animationPlayState: "running",
};
