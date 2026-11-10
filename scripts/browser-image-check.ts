/**
 * `bun scripts/browser-image-check.ts` (part of `bun run check`): the
 * project browser's image runs Chromium on ibus's GTK module with no ibus
 * daemon. The view types every character no key of neko's layout has as
 * GTK's Unicode entry, Ctrl+Shift+U, the hex code and Return (dashboard
 * browser-stream.ts `unicodeEntry`), because neko's own way, a keysym put on
 * a spare key and pressed at once, loses the character whenever GTK's keymap
 * catches up after the press. ibus's module with no daemon hands each key to
 * GTK's simple input method and shows Chromium none of its preedit, so the
 * page never sees the entry's keys; GTK's simple input method alone shows
 * its preedit and the page gets a "Process" keydown for U and each digit,
 * and any other input method takes the keys as its own. So, in
 * packages/agent/browser/:
 *
 * - chromium.conf: `[program:chromium]`'s environment holds
 *   `GTK_IM_MODULE="ibus"`;
 * - Dockerfile: its apt-get install holds `ibus-gtk3` and not the daemon's
 *   package `ibus`;
 * - nothing there starts `ibus-daemon` or names `IBUS_ADDRESS`, which would
 *   give the module a daemon to hand the keys to.
 *
 * Prints each that fails; exits 1 on any.
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["packages/agent/browser/"];

const ROOT = resolve(import.meta.dir, "..");
const DIR = "packages/agent/browser";
const CONF = `${DIR}/chromium.conf`;
const DOCKERFILE = `${DIR}/Dockerfile`;
const PIN = 'GTK_IM_MODULE="ibus"';
const WHY =
  "the browser view types characters off neko's layout as GTK's Unicode entry (browser-stream.ts `unicodeEntry`), which only ibus's GTK module with no daemon keeps from the page";

const INSTALL = /apt-get install/u;
const WORDS = /[\s;]+/u;
const DAEMON = /ibus-daemon|IBUS_ADDRESS/u;
const COMMENT = /^\s*[;#]/u;

const read = (path: string) => Bun.file(join(ROOT, path)).text();
const failures: string[] = [];

const lines = (await read(CONF)).split("\n");
const start = lines.findIndex((line) => line.trim() === "[program:chromium]");
const end = lines.findIndex(
  (line, at) => at > start && line.trim().startsWith("[")
);
const environment =
  start === -1
    ? undefined
    : lines
        .slice(start, end === -1 ? undefined : end)
        .find((line) => line.startsWith("environment="));
if (
  !environment
    ?.slice("environment=".length)
    .split(",")
    .some((pair) => pair.trim() === PIN)
) {
  failures.push(
    `${CONF}: [program:chromium]'s environment must hold ${PIN}: ${WHY}. It reads: ${environment ?? "no environment line"}`
  );
}

const installs = (await read(DOCKERFILE))
  .replaceAll("\\\n", " ")
  .split("\n")
  .filter((line) => INSTALL.test(line))
  .flatMap((line) => line.split(WORDS));
if (!installs.includes("ibus-gtk3")) {
  failures.push(
    `${DOCKERFILE}: its apt-get install must hold ibus-gtk3, the module ${PIN} names: ${WHY}.`
  );
}
if (installs.includes("ibus")) {
  failures.push(
    `${DOCKERFILE}: installs the ibus daemon's package \`ibus\`: with a daemon the module hands the Unicode entry's keys to it, not to GTK's simple input method.`
  );
}

for (const name of await readdir(join(ROOT, DIR))) {
  const text = await read(`${DIR}/${name}`);
  for (const [at, line] of text.split("\n").entries()) {
    if (DAEMON.test(line) && !COMMENT.test(line)) {
      failures.push(
        `${DIR}/${name}:${at + 1}: ${line.trim()}: the image runs no ibus daemon; with one the module hands the Unicode entry's keys to it.`
      );
    }
  }
}

if (failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log(
  `browser image: Chromium runs on ibus's GTK module with no daemon (${CONF}, ${DOCKERFILE})`
);
