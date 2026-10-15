// Check a design preview folder before it is shown: every entry at 1440×900
// and at 390×844, on the folder's own origin, with no backend.
//
//   node <skill>/scripts/check.mjs <preview-dir>
//
// Prints `PASS <entry>` or `FAIL <entry>: why` for each entry the page's
// switcher declares (window.__cawcoPreview, kit/switcher.js), then `ALL PASS`
// and exits 0, or exits 1. An entry fails on an empty stage, a console error
// or page error, a failed request, a request off the folder's own origin, a
// control whose box overlaps the stage's, a page that scrolls sideways, or a
// declared dial panel or timeline that did not mount.
//
// Needs playwright-core where you run it (it is resolved from the working
// directory) and a Chromium: Playwright's cached one, or set CHROMIUM to a
// binary. CawCo's bridge (window.cawco) exists only where the hub serves the
// page, so the check stands in a bridge that holds nothing.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve, sep } from "node:path";

const [, , dirArg] = process.argv;
if (!dirArg) {
  console.error("usage: check.mjs <preview-dir>");
  process.exit(2);
}
const root = resolve(dirArg);
const { chromium } = createRequire(join(process.cwd(), "/"))("playwright-core");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
};

/** The folder alone, as `kind: "preview", dir` serves it: index.html at the root. */
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  let isFile = false;
  try {
    isFile =
      (file === root || file.startsWith(root + sep)) && statSync(file).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(response);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

/** A bridge that holds nothing: picks are empty, and every write is accepted. */
const BRIDGE = () => {
  const listeners = new Set();
  Object.defineProperty(window, "cawco", {
    value: Object.freeze({
      choose: async () => undefined,
      note: async () => undefined,
      set: async () => undefined,
      send: async () => undefined,
      on: (_event, listener) => {
        listeners.add(listener);
        listener({});
        return () => listeners.delete(listener);
      },
      pickPlace: async () => null,
    }),
  });
};

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

/** What one loaded entry shows: the problems found in the page itself. */
const inspect = () => {
  const problems = [];
  const declared = window.__cawcoPreview;
  const stage = document.querySelector(".xp-stage");
  const frame = document.querySelector(".xp-frame");
  if (!(stage && frame)) {
    return ["no .xp-stage: the page did not mount cawcoPreview"];
  }
  const shown = [...frame.querySelectorAll("*")].some((node) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
  if (!(shown || frame.textContent.trim())) {
    problems.push("the stage is empty");
  }
  const stageBox = stage.getBoundingClientRect();
  const controls = [
    ...document.querySelectorAll(
      ".xp-rail > *, .xp-dials > *, .xp-timeline > *, .dialkit-root"
    ),
  ].filter((node) => !stage.contains(node));
  for (const control of controls) {
    const box = control.getBoundingClientRect();
    const across =
      Math.min(box.right, stageBox.right) - Math.max(box.left, stageBox.left);
    const down =
      Math.min(box.bottom, stageBox.bottom) - Math.max(box.top, stageBox.top);
    if (box.width && box.height && across > 0.5 && down > 0.5) {
      const name = control.className || control.localName;
      problems.push(
        `a control (${String(name).slice(0, 60)}) overlaps the stage`
      );
    }
  }
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    problems.push(
      `the page scrolls sideways (${document.documentElement.scrollWidth}px in ${window.innerWidth}px)`
    );
  }
  const dialsText = document.querySelector(".xp-dials")?.textContent ?? "";
  for (const name of declared.dials) {
    if (!dialsText.includes(name)) {
      problems.push(`dial panel "${name}" did not mount in the rail`);
    }
  }
  const titles = [
    ...document.querySelectorAll(".xp-timeline .dialkit-timeline-title"),
  ].map((node) => node.textContent.trim());
  for (const name of declared.timelines) {
    if (!titles.includes(name)) {
      problems.push(`timeline "${name}" did not mount in the rail`);
    }
  }
  return problems;
};

/** Addresses that never leave the page. */
const LOCAL_SCHEME = /^(data|blob|about):/;
const PARAM_PREFIX = /^__/;

/** One entry loaded on its own: what is wrong with it, besides what the page said. */
const visit = async (page, entry) => {
  await page.goto(`${origin}/?${entry.param}=${encodeURIComponent(entry.id)}`, {
    waitUntil: "load",
  });
  // Two frames for the components' effects and DialKit's mounts.
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  const shown = await page.evaluate(
    (name) => new URL(location.href).searchParams.get(name),
    entry.param
  );
  return [
    ...(shown === entry.id ? [] : [`the URL shows ${shown}, not ${entry.id}`]),
    ...(await page.evaluate(inspect)),
  ];
};

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
/** Problems by entry, across both viewports. */
const found = new Map();
let entries = [];
const note = (entry, why) => {
  const problems = found.get(entry) ?? [];
  if (!problems.includes(why)) {
    found.set(entry, [...problems, why]);
  }
};

for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}×${viewport.height}`;
  // biome-ignore lint/performance/noAwaitInLoops: one viewport at a time keeps the browser small.
  const context = await browser.newContext({ viewport });
  await context.addInitScript(BRIDGE);
  const page = await context.newPage();
  const heard = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      heard.push(`console error: ${message.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (error) => {
    heard.push(`page error: ${error.message.slice(0, 200)}`);
  });
  page.on("requestfailed", (request) => {
    heard.push(
      `request failed: ${request.url()} (${request.failure()?.errorText})`
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      heard.push(`request ${response.status()}: ${response.url()}`);
    }
  });
  page.on("request", (request) => {
    const url = request.url();
    if (!(url.startsWith(origin) || LOCAL_SCHEME.test(url))) {
      heard.push(`request off the folder's origin: ${url}`);
    }
  });

  if (!entries.length) {
    await page.goto(`${origin}/`, { waitUntil: "load" });
    const declared = await page.evaluate(() => window.__cawcoPreview ?? null);
    if (!declared) {
      console.log(
        `FAIL page: no window.__cawcoPreview: the page never called cawcoPreview${heard.length ? ` (${heard.join("; ")})` : ""}`
      );
      await browser.close();
      server.close();
      process.exit(1);
    }
    entries = declared.entries.map((entry) => ({
      ...entry,
      name: `${entry.param.replace(PARAM_PREFIX, "")} ${entry.id}`,
    }));
  }

  // Each entry on its own, every other axis at its first entry.
  for (const entry of entries) {
    heard.length = 0;
    // biome-ignore lint/performance/noAwaitInLoops: one page steps the entries in turn, each problem kept with its entry.
    const problems = await visit(page, entry);
    for (const why of [...problems, ...heard]) {
      note(entry.name, `${tag}: ${why}`);
    }
  }

  // The arrow keys step to the next entry in the list, across groups and axes.
  if (entries.length > 1) {
    const [first, second] = entries;
    await page.goto(
      `${origin}/?${first.param}=${encodeURIComponent(first.id)}`,
      { waitUntil: "load" }
    );
    await page.keyboard.press("ArrowDown");
    const stepped = await page.evaluate(
      (name) => new URL(location.href).searchParams.get(name),
      second.param
    );
    if (stepped !== second.id) {
      note(
        first.name,
        `${tag}: ArrowDown went to ${stepped}, not ${second.id}`
      );
    }
  }
  await context.close();
}

await browser.close();
server.close();
for (const { name } of entries) {
  const problems = found.get(name);
  console.log(
    problems ? `FAIL ${name}: ${problems.join("; ")}` : `PASS ${name}`
  );
}
if (found.size) {
  process.exit(1);
}
console.log("ALL PASS");
