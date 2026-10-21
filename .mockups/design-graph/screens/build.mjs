// Builds the owner's page of every screen: the mockup fragment (mockups/dg-screens.html, CONTRACT.md) from
// the mockup's own code, then index.html, the page as the hub would build it from page.html (the kit's CSS
// and script inlined, Caw's stills as data URLs), to measure and to open.
//   node .mockups/design-graph/screens/build.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), mock = join(here, "..");
// The decision-page kit as the repo ships it (packages/hub/skills/decision-page).
const KIT = join(here, "../../../packages/hub/skills/decision-page/kit");
const read = (p) => readFileSync(p, "utf8");
// Whitespace and comments out of the mockup's code, names kept: the frame's driver calls its functions.
// dagre is self-contained, so its syntax minifies too.
const bun = (file, ...flags) => execFileSync("bun", ["build", file, "--no-bundle", "--minify-whitespace", ...flags], { encoding: "utf8", maxBuffer: 1 << 26 });
const js = [bun(join(mock, "dagre.js"), "--minify-syntax"), bun(join(mock, "icons.js")), bun(join(mock, "app.js"))].join("\n");
if (/<\/script/i.test(js)) throw new Error("the mockup's code holds </script");
const css = read(join(mock, "style.css")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*\n/g, "\n");
const body = read(join(mock, "body.html")).replace(/^\s*<body>/, "").replace(/<script>\s*$/, "").replace(/<!--[\s\S]*?-->/g, "");
const face = (family, file, weights) => `@font-face { font-family: "${family}"; src: url(data:font/woff2;base64,${readFileSync(join(mock, "fonts", file)).toString("base64")}) format("woff2"); font-weight: ${weights}; font-style: normal; font-display: block; }`;

// The shots: class, size, input, its loop and its one line.
const SHOTS = [
  ["phone-portrait", "Phone portrait", 390, 844, "touch", "A drawer at peek under the page: hold a state to preview it, tap to keep it.", ""],
  ["tablet-portrait", "Tablet portrait", 820, 1180, "touch", "The drawer drags between its stops; Play at full drops it to peek, so the page plays.", ""],
  ["phone-landscape", "Phone landscape", 844, 390, "touch", "A side sheet at half the pane: a clip's editor unfolds inline, Hide folds the sheet to an edge tab.", ""],
  ["tablet-landscape", "Tablet landscape", 1180, 820, "touch", "The desk layout by touch: the dock's 44px top band sets its height, the page column takes the rest.", ""],
  ["desk", "Desk", 1440, 900, "fine", "The dock's height edge, lit under the pointer, replaces stack mode; a hover still previews a state.", ""],
  ["wide", "Wide", 1920, 1080, "fine", "Both pages in one row, their graphs stacked in the 448 panel; the dock edits whichever was kept last.", ""],
  ["ultrawide-2560", "Ultrawide", 2560, 1080, "fine", "Past 2450 the two graphs stand side by side; a state kept on each, the dock turns to the last.", "ds-full"],
  ["ultrawide-3440", "Ultrawide", 3440, 1440, "fine", "The same at 3440: the row paused, its move played, then the form kept again.", "ds-full"],
];
const shot = ([id, name, w, h, input, line, cls]) => `<figure class="ds-shot ${cls}" data-loop="${id}" data-input="${input}" data-w="${w}" data-h="${h}" style="--ds-w: ${w}; --ds-h: ${h}"><div class="ds-device"><div class="ds-screen"><iframe title="${name}, ${w} by ${h}" width="${w}" height="${h}" tabindex="-1" aria-hidden="true" inert></iframe><div class="ds-layer" style="inline-size: ${w}px; block-size: ${h}px"><span class="ds-dot"></span></div></div></div><figcaption><span class="ds-name"><b>${name}</b><code>${w} × ${h}</code><span>${input === "fine" ? "pointer" : "touch"}</span></span><span>${line}</span></figcaption></figure>`;
const fragment = `<style>
/* The house faces (DESIGN.md Typography), for this page and its frames. */
${face("Figtree Variable", "figtree-latin.woff2", "300 900")}
${face("JetBrains Mono Variable", "jetbrains-mono-latin.woff2", "100 800")}
${read(join(here, "frames.css"))}</style>
<div class="mk mk-dg-screens" role="img" aria-label="The design graph mockup on eight screens, each frame playing its class's key interaction: the phone's drawer and held-press preview, the tablet's drawer stops, the side sheet, the dock's height edge, the wide panel and the 2000px ultrawide column.">
<template class="ds-src"><style data-part="css">${css}</style><div data-part="body">${body}</div><script type="text/plain" data-part="js">${js}</script></template>
<div class="ds-grid">${SHOTS.map(shot).join("")}</div>
</div>
<script>${read(join(here, "frames.js"))}</script>
`;
writeFileSync(join(here, "mockups/dg-screens.html"), fragment);

// The page as the hub builds it.
const dataUrl = (file) => "data:image/webp;base64," + readFileSync(join(KIT, "caw", file)).toString("base64");
const page = read(join(here, "page.html"))
  .replace("{{KIT_CSS}}", () => read(join(KIT, "tokens.css")) + read(join(KIT, "page.css")))
  .replace("{{KIT_JS}}", () => read(join(KIT, "page.js")))
  .replace(/\{\{MK:([a-z0-9-]+)\}\}/g, (_, id) => read(join(here, "mockups", id + ".html")))
  .replace(/src="caw\/([a-z-]+\.webp)"/g, (_, f) => 'src="' + dataUrl(f) + '"');
writeFileSync(join(here, "index.html"), page);
console.log("mockups/dg-screens.html", Buffer.byteLength(fragment), "bytes; index.html", Buffer.byteLength(page), "bytes (" + (Buffer.byteLength(page) / 1024).toFixed(1) + " KiB of 512)");
