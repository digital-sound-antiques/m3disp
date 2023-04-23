import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./views/App";
import "./index.css";
import { PlayerContextProvider } from "./contexts/PlayerContext";
import { AppContextProvider } from "./contexts/AppContext";
import { AppProgressContextProvider } from "./contexts/AppProgressContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppContextProvider>
      <AppProgressContextProvider>
        <PlayerContextProvider>
          <App />
        </PlayerContextProvider>
      </AppProgressContextProvider>
    </AppContextProvider>
  </React.StrictMode>
);
