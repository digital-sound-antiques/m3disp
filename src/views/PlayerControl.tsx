import { useContext } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { Marquee } from "../widgets/Marquee";

export function PlayControl() {
  const context = useContext(PlayerContext);

  return (
    <div className="transport-controls">
      <div className="transport-title">
        <Marquee play={true}>
          <span>{context.currentEntry?.title ?? "-"}</span>
        </Marquee>
      </div>
    </div>
  );
}
