import { useContext } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { Marquee } from "../widgets/Marquee";

export function PlayControl() {
  const context = useContext(PlayerContext);

  return (
    <div className="transport-controls">
      <div className="transport-title">
        {/* key by the current track so a song change remounts the marquee,
            resetting its scroll position to the start */}
        <Marquee
          key={`${context.currentEntry?.dataId ?? ""}:${context.currentEntry?.song ?? ""}`}
          play={true}
        >
          <span>{context.currentEntry?.title ?? "-"}</span>
        </Marquee>
      </div>
    </div>
  );
}
