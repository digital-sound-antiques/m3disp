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
};

export default AppGlobal;
