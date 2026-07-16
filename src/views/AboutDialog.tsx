import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";
import { FloatingDialog } from "./FloatingDialog";

import logo from "../assets/m3disp.svg";
import packageJson from "../../package.json";

const acknowledgements = [
  "MGSDRV by GIGAMIX/Ain",
  "KINROU5 by Keiichi Kuroda",
  "OPLLDriver by Ring",
  "MPK by K-KAZ",
  "MoonBlaster by Moonsoft",
];

export function AboutDialog() {
  const app = useContext(AppContext);
  return (
    <FloatingDialog id="about-dialog" title="About" className="fdlg-about">
      <div className="crd-body abt-body">
        <img className="abt-logo" src={logo} width={128} alt="m3disp" />
        <div className="abt-line">A realtime MSX sound player for the Web</div>
        <div className="abt-line">v{packageJson.version}</div>
        <div className="abt-line abt-drivers">This software uses the following drivers.</div>
        {acknowledgements.map((e) => (
          <div key={e} className="abt-line">
            {e}
          </div>
        ))}
      </div>
      <div className="fdlg-foot">
        <button className="fdlg-txtbtn" onClick={() => app.closeDialog("about-dialog")}>
          OK
        </button>
      </div>
    </FloatingDialog>
  );
}
