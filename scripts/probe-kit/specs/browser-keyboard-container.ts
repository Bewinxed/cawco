/**
 * browser-keyboard on the container host: the same leg, every step and
 * check of it (browser-keyboard.ts {@link typeIntoTakeover}), with the
 * project's browser in neko's container. The phone's typing goes as neko's
 * X keysyms on its data channel: a capital pressed with Shift, and a
 * character no key of the layout has ("é", "ж€", "🙂") as GTK's Unicode
 * entry, Ctrl+Shift+U, its hex code and Return, which the image's Chromium
 * takes through ibus's GTK module with no daemon (browser-stream.ts
 * `unicodeEntry`), never as its own keysym, which neko put on a spare key
 * and pressed at once, losing it whenever GTK's keymap caught up after the
 * press. The view plays neko's VP8 over WebRTC in WebKit.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket and the browser's ports), on a checkout of this commit:
 *
 *   bun scripts/probe-kit/run.ts browser-keyboard-container
 */
import type { Spec } from "../spec";
import { typeIntoTakeover } from "./browser-keyboard";

const spec: Spec = {
  group: "iPhone Safari",
  host: "it runs the project's browser in a container, whose runtime socket and ports no workspace boundary reaches",
  name: "browser-keyboard-container",
  run: (kit) =>
    typeIntoTakeover(kit, "container", "browser-keyboard-container"),
};

export default spec;
