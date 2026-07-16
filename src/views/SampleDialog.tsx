import { LibraryMusic } from "@mui/icons-material";
import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { AppProgressContext } from "../contexts/AppProgressContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { loadFilesFromUrls } from "../utils/loader";

const dialogId = "sample-dialog";

function getUrls(id: string) {
  const res: string[] = [];
  if (id == "ys") {
    for (let i = 1; i < 30; i++) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/ys2413/main/fm_psg/mgs/ys1ex_${
          i < 10 ? "0" + i : i
        }.mgs`
      );
    }
  } else if (id == "ys2") {
    for (let i = 0; i <= 30; i++) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/ys2413/main/fm_psg/mgs/ys2ex_${
          i < 10 ? "0" + i : i
        }.mgs`
      );
    }
  } else if (id == "ys3") {
    for (let i of [2, 17, 21, 29]) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/ys2413/main/fm_psg/mgs/ys368_${
          i < 10 ? "0" + i : i
        }.mgs`
      );
    }
  } else if (id == "sor") {
    for (let i = 0; i <= 60; i++) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/sor2413/main/fm_psg/mgs/en/soe${
          i < 10 ? "00" + i : "0" + i
        }.mgs`
      );
    }
  } else if (id == "bwv816") {
    for (let i = 1; i <= 7; i++) {
      res.push(`https://raw.githubusercontent.com/mmlbox/bwv816/main/bwv816_${i}.mgs`);
    }
  } else if (id == "ntt") {
    res.push(...["./mgs/captain.mgs", "./mgs/captain2.mgs"]);
  }
  return res;
}

type SampleEntry = { id: string; title: string; desc: string };

const vanillaEntries: SampleEntry[] = [
  { id: "ntt", title: "80's CAPTAIN SYSTEM MUSIC", desc: "Author Unknown" },
  { id: "bwv816", title: "Französische Suiten Nr.5 BWV816", desc: "J.S. Bach" },
];

const falcomEntries: SampleEntry[] = [
  { id: "ys", title: "YS", desc: "Music from YS / (C) Nihon Falcom Corporation" },
  { id: "ys2", title: "YS II", desc: "Music from YSII / (C) Nihon Falcom Corporation" },
  { id: "sor", title: "SORCERIAN", desc: "Music from SORCERIAN / (C) Nihon Falcom Corporation" },
];

export function SampleDialog() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const p = useContext(AppProgressContext);
  const open = app.isOpen(dialogId);

  // null = not yet dragged → render centered; once dragged, explicit position.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPos(null); // always re-center when the dialog opens
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeDialog(dialogId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onClickItem = async (id: string) => {
    await context.unmute();
    app.closeDialog(dialogId);
    const entries = await loadFilesFromUrls(getUrls(id), context.storage, p.setProgress);
    context.reducer.stop();
    context.reducer.setEntries(entries);
    context.reducer.play(0);
  };

  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".fdlg-close")) return;
    const rect = (e.currentTarget.closest(".fdlg") as HTMLElement).getBoundingClientRect();
    const start = pos ?? { x: rect.left, y: rect.top };
    if (!pos) setPos(start);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: start.x, y: start.y };
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 60, d.x + (e.clientX - d.px))),
      y: Math.max(0, Math.min(window.innerHeight - 40, d.y + (e.clientY - d.py))),
    });
  };
  const onHeadUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  const group = (label: string, entries: SampleEntry[]) => (
    <>
      <div className="crd-section-label">{label}</div>
      {entries.map((e) => (
        <button key={e.id} className="smp-item" onClick={() => onClickItem(e.id)}>
          <LibraryMusic className="smp-icon" sx={{ fontSize: 20 }} />
          <span className="smp-text">
            <span className="smp-title">{e.title}</span>
            <span className="smp-desc">{e.desc}</span>
          </span>
        </button>
      ))}
    </>
  );

  return (
    <div className="fdlg fdlg-sample" style={style}>
      <div className="fdlg-head" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp}>
        <span>Samples</span>
        <button className="fdlg-close" onClick={() => app.closeDialog(dialogId)} title="Close">
          ✕
        </button>
      </div>
      <div className="crd-body">
        {group("Vanilla YM2413", vanillaEntries)}
        {group("VGMs, YM2413+PSG", falcomEntries)}
        <div className="crd-hint">
          These songs are published in accordance with Falcom's Free Music Use Declaration.
        </div>
      </div>
    </div>
  );
}
