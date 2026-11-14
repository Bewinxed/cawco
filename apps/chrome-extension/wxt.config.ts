import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "CawCo Passkey Bridge",
    version: "1.0.0",
    description: "Scan passkey QR codes from CawCo browser takeovers",
    permissions: ["storage"],
    host_permissions: [],
    icons: {
      "16": "icon-16.png",
      "48": "icon-48.png",
      "128": "icon-128.png",
    },
    externally_connectable: {
      matches: ["*://*.localhost/*", "*://*.ts.net:*/*"],
    },
  },
});
