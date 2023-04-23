import { KSSPlay } from "libkss-js";

let initialized = false;

const AppGlobal = {
  initialize: async () => {
    if (!initialized) {
      initialized = true;
      await KSSPlay.initialize();
    }
  },
};

export default AppGlobal;
