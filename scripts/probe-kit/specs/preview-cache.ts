/**
 * A port preview's files are cached and compressed wherever that is safe,
 * and never where a CDN could serve them stale (core `previewCache`,
 * `compressed`). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model, which calls artifact_create) one session
 * shows a real Vite dev server by its port: an app whose module imports a
 * package Vite prebundles (a `?v=` dep) and a wasm file in `public/`. Every
 * reading is through the hub.
 *
 * 1. The session's own port (direct, no CDN in front):
 *    a. the dep answers `cache-control: max-age=31536000,immutable` and
 *       `content-encoding: gzip`;
 *    b. a `src/` module answers `no-cache` with an `etag`;
 *    c. the module asked again with that `If-None-Match` answers 304;
 *    d. in a browser, the page's module graph runs, and `/add.wasm` keeps
 *       `application/wasm` and instantiates;
 *    e. the page itself (its overlay tag rewritten to the hub's key) answers
 *       `no-store` with no validators, gzipped: a kept copy would 304 to an
 *       old key.
 * 2. Host mode's by-Host listener (where Cloudflare stands on the owner's
 *    names), past the lock with the pass a ticket gives:
 *    a. the same module answers `no-store`, with no `etag` or
 *       `last-modified`;
 *    b. a conditional request for the module answers 200 `no-store`: on a
 *       name where nothing is kept, no 304 points at a copy;
 *    c. the dep stays `immutable`.
 *
 *   bun scripts/probe-kit/run.ts preview-cache
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type PreviewTicket,
  previewEnterUrl,
} from "../../../packages/core/src/frames";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const VITE = join(ROOT, "apps/dashboard/node_modules/vite/bin/vite.js");
/** Vite's own words for a prebundled dep (vite.dev/guide/dep-pre-bundling#browser-cache). */
const DEP_CACHE = "max-age=31536000,immutable";
/** The dep's address as Vite writes it into the module that imports it. */
const DEP_URL = /"(\/node_modules\/\.vite\/deps\/probe-dep\.js\?v=[0-9a-z]+)"/;
/** `(module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))` */
const ADD_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02,
  0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61,
  0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01,
  0x6a, 0x0b,
]);

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** A Vite app in `dir` on `port`: a module that imports a prebundled package, and a wasm file. */
const viteOn = async (dir: string, port: number) => {
  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "public"), { recursive: true });
  await mkdir(join(dir, "node_modules/probe-dep"), { recursive: true });
  await Bun.write(
    join(dir, "package.json"),
    JSON.stringify({ name: "cache-probe", private: true, type: "module" })
  );
  await Bun.write(
    join(dir, "node_modules/probe-dep/package.json"),
    JSON.stringify({
      name: "probe-dep",
      version: "1.0.0",
      type: "module",
      main: "index.js",
    })
  );
  await Bun.write(
    join(dir, "node_modules/probe-dep/index.js"),
    `export const word = "dep";\nexport const filler = ${JSON.stringify("compressible ".repeat(400))};\n`
  );
  await Bun.write(
    join(dir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>Cache probe</title></head><body><script type="module" src="/src/main.js"></script></body></html>`
  );
  await Bun.write(
    join(dir, "src/main.js"),
    `import { word } from "probe-dep";\ndocument.body.dataset.word = word;\n`
  );
  await Bun.write(join(dir, "public/add.wasm"), ADD_WASM);
  const proc = Bun.spawn(
    [
      "node",
      VITE,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: dir, stdout: "ignore", stderr: "ignore" }
  );
  await until(
    "Vite answering",
    () =>
      fetch(`http://127.0.0.1:${port}/`)
        .then((answer) => answer.ok)
        .catch(() => false),
    Boolean,
    30_000
  );
  return proc;
};

/** A read through the hub, its body left as it came (`decompress: false`), so its encoding is what the hub sent. */
const read = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, {
    headers: { "accept-encoding": "gzip, deflate, br", ...headers },
    redirect: "manual",
    decompress: false,
  } as RequestInit);

/** The caching and encoding headers of an answer, as one line. */
const said = (answer: Response): string =>
  `${answer.status}; ${[
    "cache-control",
    "etag",
    "last-modified",
    "content-encoding",
    "content-type",
  ]
    .map((name) => `${name}: ${answer.headers.get(name) ?? "none"}`)
    .join("; ")}`;

const probe = async (kit: Kit) => {
  const free = Bun.serve({ port: 0, fetch: () => new Response() });
  const vitePort = free.port as number;
  free.stop(true);
  const vite = await viteOn(join(kit.out, "vite-app"), vitePort);

  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Cache", fleet.repo);

  asks.set("1", {
    name: CREATE,
    input: {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "vite",
      port: vitePort,
    },
  });
  await fleet.send(session, "PROBE-CALL:1");
  await until("the preview made", () => answered.get("1"), Boolean, 180_000);
  const address = async () =>
    (await (
      await fetch(`${fleet.base}/api/instances/${session}/preview-address`, {
        method: "POST",
      })
    ).json()) as { origin?: string; port?: number };
  const direct = `http://127.0.0.1:${(await address()).port ?? 0}`;

  // The dep's address, from the module's own text.
  const plain = await read(`${direct}/src/main.js`, {
    "accept-encoding": "identity",
  });
  const depPath = (await plain.text()).match(DEP_URL)?.[1];
  kit.check(
    "0: through the preview, the app's module imports its dep at Vite's `?v=` address",
    !!depPath,
    `${said(plain)}; dep ${depPath ?? "none"}`
  );
  if (!depPath) {
    vite.kill();
    return;
  }

  // 1. Direct.
  const dep = await read(`${direct}${depPath}`);
  await dep.arrayBuffer();
  kit.check(
    "1a: direct: the `?v=` dep answers `max-age=31536000,immutable`, gzipped",
    dep.status === 200 &&
      dep.headers.get("cache-control") === DEP_CACHE &&
      dep.headers.get("content-encoding") === "gzip",
    said(dep)
  );
  const module = await read(`${direct}/src/main.js`);
  await module.arrayBuffer();
  const etag = module.headers.get("etag");
  kit.check(
    "1b: direct: a `src/` module answers `no-cache` with an etag",
    module.status === 200 &&
      module.headers.get("cache-control") === "no-cache" &&
      !!etag,
    said(module)
  );
  const again = etag
    ? await read(`${direct}/src/main.js`, { "if-none-match": etag })
    : null;
  await again?.arrayBuffer();
  kit.check(
    "1c: direct: the module asked again with its If-None-Match answers 304",
    again?.status === 304,
    again ? said(again) : "no etag to send"
  );
  const own = await read(`${direct}/`);
  await own.arrayBuffer();
  kit.check(
    "1e: direct: the page itself, its overlay tag at the hub's key now, answers `no-store` with no validators, gzipped",
    own.status === 200 &&
      own.headers.get("cache-control") === "no-store" &&
      !own.headers.has("etag") &&
      !own.headers.has("last-modified") &&
      own.headers.get("content-encoding") === "gzip",
    said(own)
  );
  const page = await kit.page("desk");
  await page.goto(`${direct}/`, { waitUntil: "domcontentloaded" });
  const ran = await until(
    "the page's module graph ran",
    () => page.evaluate(() => document.body.dataset.word ?? ""),
    (word) => word === "dep",
    30_000
  ).catch(() => "");
  const wasm = await page.evaluate(async () => {
    const answer = await fetch("/add.wasm");
    const type = answer.headers.get("content-type");
    const encoding = answer.headers.get("content-encoding");
    try {
      const { instance } = await WebAssembly.instantiateStreaming(answer);
      const add = instance.exports.add as (a: number, b: number) => number;
      return { type, encoding, sum: add(2, 3), error: null };
    } catch (error) {
      return { type, encoding, sum: null, error: String(error) };
    }
  });
  kit.check(
    "1d: direct, in a browser: the page's modules run (its dep's word is on the page), and /add.wasm keeps `application/wasm` and instantiates",
    ran === "dep" && wasm.type === "application/wasm" && wasm.sum === 5,
    `word ${JSON.stringify(ran)}; wasm ${JSON.stringify(wasm)}`
  );

  // 2. Host mode, its names on the range's first port, behind the lock.
  const range = (await (
    await fetch(`${fleet.base}/api/preview-settings`)
  ).json()) as { ports: string };
  const first = Number(range.ports.split("–")[0]);
  const put = await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "host",
      pattern: `https://p-{port}.cawco.localhost:${first}`,
    }),
  });
  const origin = (await address()).origin ?? "";
  const host = origin ? new URL(origin).host : "";
  const { ticket } = (await (
    await fetch(`${fleet.base}/api/preview-ticket`, { method: "POST" })
  ).json()) as PreviewTicket;
  const byHost = `http://127.0.0.1:${first}`;
  const entered = await read(previewEnterUrl(byHost, ticket, "/src/main.js"), {
    host,
  });
  const cookie = entered.headers.get("set-cookie")?.split(";")[0] ?? "";
  const named = { host, cookie };
  const hostModule = await read(`${byHost}/src/main.js`, named);
  await hostModule.arrayBuffer();
  kit.check(
    "2a: host mode: the same module answers `no-store`, no etag, no last-modified",
    put.ok &&
      entered.status === 302 &&
      hostModule.status === 200 &&
      hostModule.headers.get("cache-control") === "no-store" &&
      !hostModule.headers.has("etag") &&
      !hostModule.headers.has("last-modified"),
    `host mode ${put.status}; ${host} entered ${entered.status}; ${said(hostModule)}`
  );
  const hostAgain = etag
    ? await read(`${byHost}/src/main.js`, { ...named, "if-none-match": etag })
    : null;
  await hostAgain?.arrayBuffer();
  kit.check(
    "2b: host mode: the module asked with the direct path's If-None-Match answers 200 `no-store`, never a 304 for a copy it was told not to keep",
    hostAgain?.status === 200 &&
      hostAgain.headers.get("cache-control") === "no-store",
    hostAgain ? said(hostAgain) : "no etag to send"
  );
  const hostDep = await read(`${byHost}${depPath}`, named);
  await hostDep.arrayBuffer();
  kit.check(
    "2c: host mode: the `?v=` dep stays `max-age=31536000,immutable`",
    hostDep.status === 200 &&
      hostDep.headers.get("cache-control") === DEP_CACHE,
    said(hostDep)
  );
  vite.kill();
};

const spec: Spec = { name: "preview-cache", run: probe };
export default spec;
