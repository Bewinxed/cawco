import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "CawCo Passkey Bridge",
    version: "1.0.0",
    description:
      "Captures your phone's passkey Bluetooth advert on this PC and hands it to your open CawCo dashboard",
    permissions: ["offscreen", "storage"],
    icons: {
      "16": "icon-16.png",
      "48": "icon-48.png",
      "128": "icon-128.png",
    },
  },
});
