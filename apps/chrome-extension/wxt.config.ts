import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "CawCo Passkey Bridge",
    version: "1.0.0",
    description:
      "Captures your phone's passkey Bluetooth advert on this PC and relays it to CawCo",
    permissions: ["storage", "offscreen"],
    host_permissions: ["https://*/*", "http://*/*"],
    icons: {
      "16": "icon-16.png",
      "48": "icon-48.png",
      "128": "icon-128.png",
    },
  },
});
