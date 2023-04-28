import { KSSPlay } from "libkss-js";
import { MGSC } from "mgsc-js";

let initialized = false;

const AppGlobal = {
  initialize: async () => {
    if (!initialized) {
      initialized = true;
      await KSSPlay.initialize();
      await MGSC.initialize();
    }
  },
  url: new URL(window.location.href),
  getQueryParamsOnce: () => {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    window.history.replaceState('', '', url.pathname);
    return params;
  }
};

export default AppGlobal;
