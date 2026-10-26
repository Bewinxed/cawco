/**
 * A component canvas opened cold through the preview proxy loads every
 * module it asks for and draws on its first open, its burst of module
 * requests answered by the dev server, never 502 by a hop between.
 *
 * On 2026-10-22, 4 of 8 cold opens of the owner's chip canvases drew
 * nothing ("didn't load, so none of its stories are drawn"): 1 to 26 of the
 * icon barrel's per-icon modules (`~icons/solar/*.svelte`, about 150 of a
 * burst of about 200) answered 502. The agent's bridge into the workspace
 * (preview-bridge.ts) was a socat listening on a unix socket with socat's
 * own backlog of 5; past it, a nonblocking connect fails at once with
 * EAGAIN, and the agent's listener answers 502 for the fetch that failed.
 * The bridge is now the agent's own relay (preview-bridge.ts `bridgeRelay`),
 * one bun process carrying every connection.
 *
 * The chain, every hop the real one but the bridge's join into a
 * workspace's network (which needs a user namespace, refused inside a
 * workspace): Chromium over HTTP/2, as the owner's browser reaches
 * Cloudflare, to a Cloudflare-like front (100 streams at once, RFC 9113's
 * least advised), on to the hub's preview listener (hub preview.ts, a
 * session's own port), the agent's listener (agent preview.ts
 * `startPreview`, a port in a workspace), the bridge's own relay
 * (preview-bridge.ts `bridgeRelay`) carrying each connection to the stage's
 * port, and the stage host's Vite serving a Svelte canvas whose states file
 * imports a barrel of 150 icon components, a module each.
 *
 * 1. The burst is one socat's own backlog refused: more requests at once
 *    reach the front than 5.
 * 2. Each of 20 cold opens (a fresh browser context, so no cache) draws
 *    its every frame, its page reports no error, and no response is 502.
 * 3. On the dashboard's own stage (its vite.config.ts, sheet-weight's
 *    stage), a canvas of 40 icons from its barrel (`#lib/icons.js`), opened
 *    cold through the same chain: every frame drawn, no failed module, and
 *    the icons come as the one module Vite pre-bundles of `@cawco/icons`,
 *    no `~icons/…` module asked for (each was a request of its own).
 * 5. On the host, the real join: a scratch fleet (real hub, agent and
 *    sessiond; Claude Code against the mock model) whose session in a Vite
 *    + Svelte folder makes a component canvas. Its stage runs in a place's
 *    boundary, reached by the agent's bridge through `nsenter` into that
 *    boundary's network (preview-bridge.ts, every line its own). The canvas
 *    opened through the session's preview origin draws; then
 *    {@link COST_GETS} GETs of one of its keyed modules, {@link COST_AT_ONCE}
 *    at a time, through the hub's and the agent's listeners and that
 *    bridge: every answer 200, and `pgrep -P <the relay>` empty
 *    throughout (sampled every 5 ms). Inside a workspace, where a boundary
 *    cannot start, it says so in one line and the legs above stand.
 * 4. 300 GETs of one immutable module (the largest prebundled dependency
 *    the canvas loads, at its `?v=`) through the hub's and the agent's listeners and the bridge,
 *    gzip taken, 50 at a time: the bridge opens no process of its own for
 *    them, and the CPU this process (both listeners) spent on them, the
 *    hub gzipping such an answer once for its address.
 *
 *   bun scripts/probe-kit/run.ts preview-burst
 */
import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http2 from "node:http2";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { HopByHopHeader } from "../../../packages/core/src/hop-headers";
import { PREVIEW_WHY_META } from "../../../packages/core/src/index";
import {
  processArgs,
  processLineage,
} from "../../../packages/core/src/process-identity";
import type { RenderReport } from "../../../packages/core/src/stage";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { CLOUDFLARE, scratchCertificate } from "../cloudflare-front";
import { BOUNDARY_INSIDE, type Kit, ROOT, type Spec } from "../kit";
import { passInto } from "../preview-pass";

const OPENS = 20;
const ICONS = 150;
const SOCAT_BACKLOG = 5;
/** The front's streams at once: RFC 9113 §6.5.2, "It is recommended that this value be no smaller than 100". */
const STREAMS = 100;
const SCRATCH = join(process.env.TMPDIR ?? "/tmp", "preview-burst");
const FIXTURE = join(
  ROOT,
  "scripts/probe-kit/fixtures/component-canvas/svelte"
);
const BRIDGE_FILE = join(ROOT, "packages/agent/src/preview-bridge.ts");
const BRIDGE_MODULE = /packages\/agent\/src\/preview-bridge\.ts$/u;
const STORIES = "src/Icons.stories.js";
const WHY = new RegExp(
  `<meta name="${PREVIEW_WHY_META}" content="([^"]*)">`,
  "u"
);

/** The dashboard, staged as its own canvases are (sheet-weight's stage). */
const APP = join(ROOT, "apps/dashboard");
/** Leg 3's scratch states file, under `src/` (SvelteKit serves only that); gone when the spec ends. */
const APP_SCRATCH = "src/lib/cawco/probe-preview-burst";
const APP_STORIES = `${APP_SCRATCH}/Forty.stories.ts`;
/** Leg 3's cold opens. */
const APP_OPENS = 3;
/** How many of the barrel's icons leg 3's canvas draws. */
const APP_ICONS = 40;
/** A module unplugin-icons makes on request, one per icon. */
const ICON_MODULE = "/~icons/";
/** The icon package as Vite's optimizer serves it, pre-bundled (`@cawco/icons` flattened), under the stage's cache dir (stage-host `CACHE_DIR`). */
const ICONS_DEP = "/deps/@cawco_icons.js";

/** Leg 3's component: {@link APP_ICONS} icons from the dashboard's barrel, as a product component imports them. */
const FORTY = `<script lang="ts">
  import * as icons from "#lib/icons.js";

  const shown = Object.entries(icons)
    .filter(([name]) => name.startsWith("Icon"))
    .slice(0, ${APP_ICONS})
    .map(([, icon]) => icon);
</script>

<div class="forty">
  {#each shown as Icon, at (at)}<Icon />{/each}
</div>

<style>
  .forty { display: grid; grid-template-columns: repeat(10, 16px); gap: 4px; width: 196px; }
</style>
`;

const FORTY_STORIES = `import Forty from "./Forty.svelte";

export default { title: "Probe/Forty", component: Forty, args: {} };

/** Forty of the barrel's icons. */
export const All = { args: {} };
`;

/** Of the hop-by-hop headers, those no HTTP/2 answer carries (RFC 9113 §8.2.2). */
const CONNECTION_HEADERS: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
] satisfies readonly HopByHopHeader[]);

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** The Svelte fixture with a barrel of {@link ICONS} icon components and a states file that draws them all, installed once. */
function project(): string {
  const dir = join(SCRATCH, "svelte");
  mkdirSync(join(dir, "src/icons"), { recursive: true });
  cpSync(FIXTURE, dir, { recursive: true });
  const names = Array.from({ length: ICONS }, (_, i) => `Icon${i}`);
  for (const [i, name] of names.entries()) {
    writeFileSync(
      join(dir, `src/icons/${name}.svelte`),
      `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M${i % 24} 0h1v24h-1z" fill="currentColor"/></svg>\n`
    );
  }
  writeFileSync(
    join(dir, "src/icons/index.js"),
    names
      .map((name) => `export { default as ${name} } from "./${name}.svelte";`)
      .join("\n")
  );
  writeFileSync(
    join(dir, "src/Icons.svelte"),
    `<script>
  import * as icons from "./icons/index.js";
  const all = Object.values(icons);
</script>

<div class="grid">{#each all as Icon}<Icon />{/each}</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(15, 16px); gap: 4px; width: 316px; }
</style>
`
  );
  writeFileSync(
    join(dir, STORIES),
    `import Icons from "./Icons.svelte";

export default { title: "Burst/Icons", component: Icons };

/** Every icon of the barrel, a module each. */
export const All = {};
`
  );
  if (!existsSync(join(dir, "node_modules"))) {
    const install = Bun.spawnSync(["bun", "install"], { cwd: dir });
    if (install.exitCode !== 0) {
      throw new Error(
        `bun install in ${dir} failed: ${install.stderr.toString().slice(0, 400)}`
      );
    }
  }
  return dir;
}

/** The stage host of the project at `dir` on `port`, started as the daemon starts it (component-canvas `stageOf`); `kit` for a SvelteKit project. */
async function stage(
  dir: string,
  port: number,
  kit: boolean
): Promise<ChildProcess> {
  const { buildStageHost } =
    await import("../../../packages/agent/src/stage-host/build");
  mkdirSync(join(dir, ".cawco/stage"), { recursive: true });
  writeFileSync(join(dir, ".cawco/stage/host.mjs"), await buildStageHost());
  const child = spawn("bun", [join(dir, ".cawco/stage/host.mjs")], {
    cwd: dir,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: kit ? "1" : "0",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  child.stdout?.on("data", hear);
  child.stderr?.on("data", hear);
  await until(
    `the stage's ready in ${dir}`,
    () => words,
    (text) => text.includes('"cawco":"ready"'),
    120_000
  );
  return child;
}

/**
 * The bridge as preview-bridge.ts runs it, but for its join into a
 * workspace's network: the module's own relay (`bridgeRelay`, read from the
 * module itself at `?real`, which Bun loads past this swap), each connection
 * carried to the port the preview names on this loopback. Each bridge's pid
 * goes on `globalThis.__probeBridges` for leg 4.
 */
function standInBridge(): void {
  const real = `${BRIDGE_FILE}?real`;
  const contents = `import { existsSync } from "node:fs";
import { bridgeRelay } from ${JSON.stringify(real)};
export class WorkspaceDown extends Error {}
const bridges = new Map();
export const reachWorkspace = async (instanceId, _workspace, port) => {
  const held = bridges.get(instanceId);
  if (held) return held.socket;
  const socket = ${JSON.stringify(SCRATCH)} + "/" + instanceId + ".sock";
  const relay = bridgeRelay(socket, port);
  const proc = Bun.spawn(relay.command, { env: { ...process.env, ...relay.env }, stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  (globalThis.__probeBridges ??= []).push(proc.pid);
  const deadline = Date.now() + 3000;
  while (!existsSync(socket) && Date.now() < deadline) await Bun.sleep(10);
  bridges.set(instanceId, { proc, socket });
  return socket;
};
export const closeBridge = async (instanceId) => {
  bridges.get(instanceId)?.proc.kill("SIGKILL");
  bridges.delete(instanceId);
};
export const workspaceGone = async () => false;
`;
  Bun.plugin({
    name: "probe-bridge",
    setup(build) {
      build.onLoad({ filter: BRIDGE_MODULE }, () => ({
        contents,
        loader: "ts",
      }));
    },
  });
}

/** The pass the probe's own hub listener takes (its passes open any token): the browser's cookie on a port over plain http. */
const PROBE_PASS = "cawco-preview-pass=probe";

/** The hub's preview listener for one session showing a component canvas, its machine's listener at `agentPort`. */
async function hubListener(
  instanceId: string,
  source: { port: number; workspace: string },
  upstream: { address: string; port: number; token: string }
): Promise<{ port: number; stop: () => void }> {
  const { createPreviewListeners, previewTargets } =
    await import("../../../packages/hub/src/preview");
  previewTargets.set(instanceId, {
    artifact: { id: crypto.randomUUID(), kind: "component", name: "Icons" },
    machineId: "probe-machine",
    revision: "1",
    source,
    upstream,
  });
  const ports = new Map<string, number>();
  const unused = () => {
    throw new Error("preview-burst's hub serves a canvas's relay alone");
  };
  type Listeners = Parameters<typeof createPreviewListeners>;
  const deps = {
    reach: () => Promise.resolve({ ok: true as const, upstream }),
    stageAnswered: () => undefined,
    unreachable: () => undefined,
    servedOn: () => false,
    kindOf: () => "component" as const,
    originOf: () => undefined,
    ownerOf: () => undefined,
    state: () => "",
    program: () => null,
    canvasFrom: unused,
    showFrom: unused,
    send: unused,
    picture: unused,
    pictures: unused,
    socket: { open: unused, message: unused, close: unused },
    sessionLive: () => true,
  } as unknown as Listeners[1];
  const db = {
    settings: () => ({ mode: "port", pattern: null }),
    setSettings: () => undefined,
    ports: () => [...ports].map(([key, held]) => ({ key, port: held })),
    ownerHeld: () => true,
    keepPort: (key: string, kept: number) => {
      ports.set(key, kept);
      return true;
    },
    dropPort: (key: string) => ports.delete(key),
  } as unknown as Listeners[2];
  const tailnet = {
    beside: () => ({ close: () => undefined }),
    origin: () => undefined,
  } as unknown as Listeners[4];
  // Its port is behind the lock: one pass ({@link PROBE_PASS}) opens it,
  // the front's and the cost's requests carry it.
  const passes = {
    live: () => ({ id: "probe", scope: null }),
    touch: () => undefined,
  } as unknown as Listeners[3];
  const listeners = createPreviewListeners(
    "127.0.0.1",
    deps,
    db,
    passes,
    tailnet
  );
  const { port } = listeners.address(instanceId);
  return { port, stop: () => listeners.release(instanceId) };
}

/**
 * A Cloudflare-like front over HTTP/2 to the hub's listener at `hubPort`:
 * every stream relayed at once, Cloudflare's headers added, the answer's
 * bytes as they came. What it can't relay it answers 502 itself, named
 * `x-probe-hop: front`. `peak`: the most streams in flight at one time.
 */
function front(
  tls: { cert: string; key: string },
  hubPort: number
): Promise<{
  peak: () => number;
  port: number;
  reset: () => void;
  stop: () => void;
}> {
  let inFlight = 0;
  let peak = 0;
  const server = http2.createSecureServer({
    ...tls,
    settings: { maxConcurrentStreams: STREAMS },
  });
  server.on("stream", (stream: http2.ServerHttp2Stream, asked) => {
    const method = String(asked[":method"] ?? "GET");
    const headers = new Headers();
    for (const [name, value] of Object.entries(asked)) {
      if (!name.startsWith(":") && value !== undefined) {
        headers.set(
          name,
          Array.isArray(value) ? value.join(", ") : String(value)
        );
      }
    }
    headers.set("host", String(asked[":authority"] ?? ""));
    headers.set(
      "cookie",
      [headers.get("cookie"), PROBE_PASS].filter(Boolean).join("; ")
    );
    for (const [name, value] of Object.entries(CLOUDFLARE)) {
      headers.set(name, value);
    }
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      fetch(`http://127.0.0.1:${hubPort}${asked[":path"] ?? "/"}`, {
        method,
        headers,
        body:
          method === "GET" || method === "HEAD"
            ? undefined
            : Buffer.concat(chunks),
        redirect: "manual",
        decompress: false,
      } as RequestInit)
        .then(async (answer) => {
          const out: Record<string, string | number> = {
            ":status": answer.status,
          };
          for (const [name, value] of answer.headers) {
            if (!CONNECTION_HEADERS.has(name)) {
              out[name] = value;
            }
          }
          const body = new Uint8Array(await answer.arrayBuffer());
          if (!stream.destroyed) {
            stream.respond(out);
            stream.end(body);
          }
        })
        .catch((error: Error) => {
          if (!stream.destroyed) {
            stream.respond({ ":status": 502, "x-probe-hop": "front" });
            stream.end(`front: ${error.message}`);
          }
        })
        .finally(() => {
          inFlight -= 1;
        });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : 0,
        peak: () => peak,
        reset: () => {
          peak = 0;
        },
        stop: () => server.close(),
      });
    });
  });
}

/** What a panel's overlay gives a page (`window.cawco`): the canvas posts its sets to it. */
const BRIDGE = () => {
  (window as unknown as { cawco: object }).cawco = {
    set: () => Promise.resolve(),
    on: () => () => undefined,
  };
};

interface Open {
  drawn: number;
  errors: string[];
  failed: string[];
  frames: number;
  /** Requests for a `~icons/…` module of its own. */
  iconModules: number;
  /** Requests for the pre-bundled icon package's module ({@link ICONS_DEP}). */
  iconsDep: number;
  modules: number;
  ms: number;
  protocols: Set<string>;
  refused: string[];
  /** Answers of 400 or over, by path and status. */
  unanswered: string[];
}

/** One cold open of the canvas at `url`: its report, and every answer its page was given. */
async function openCold(kit: Kit, url: string): Promise<Open> {
  const page: Page = await kit.page("desk", {
    ignoreHTTPSErrors: true,
    init: [BRIDGE],
  });
  const refused: string[] = [];
  const failed: string[] = [];
  const protocols = new Set<string>();
  const reading: Promise<void>[] = [];
  const unanswered: string[] = [];
  let modules = 0;
  let iconModules = 0;
  let iconsDep = 0;
  page.on("response", (response) => {
    modules += 1;
    const path = decodeURIComponent(new URL(response.url()).pathname);
    iconModules += path.includes(ICON_MODULE) ? 1 : 0;
    iconsDep += path.endsWith(ICONS_DEP) ? 1 : 0;
    if (response.status() >= 400) {
      unanswered.push(`${path} ${response.status()}`);
    }
    if (response.status() === 502) {
      reading.push(
        response
          .text()
          .catch(() => "")
          .then((text) => {
            const hop = response.headers()["x-probe-hop"];
            refused.push(
              `${new URL(response.url()).pathname} (${hop ? `${hop}: ${text}` : (WHY.exec(text)?.[1] ?? "its body not kept by the browser")})`
            );
          })
      );
    }
  });
  page.on("requestfailed", (request) =>
    failed.push(
      `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`
    )
  );
  const started = performance.now();
  await page.goto(url);
  const report = await page
    .waitForFunction(
      () => {
        const posted = (
          window as unknown as {
            __cawcoCanvas?: { report: RenderReport | null };
          }
        ).__cawcoCanvas?.report;
        // Drawn, or its section failed: the page's error says which.
        return posted &&
          (posted.sections.length > 0 || posted.page.errors.length > 0)
          ? posted
          : null;
      },
      null,
      { timeout: 60_000 }
    )
    .then((handle) => handle.jsonValue() as Promise<RenderReport>)
    .catch(() => null);
  const ms = Math.round(performance.now() - started);
  protocols.add(
    await page.evaluate(
      () =>
        (
          performance.getEntriesByType(
            "navigation"
          )[0] as PerformanceNavigationTiming
        )?.nextHopProtocol ?? "?"
    )
  );
  await Promise.all(reading);
  await page.close();
  const frames = report?.sections.flatMap((one) => one.frames) ?? [];
  return {
    ms,
    modules,
    iconModules,
    iconsDep,
    unanswered,
    frames: frames.length,
    drawn: frames.filter((one) => one.state === "drawn").length,
    errors: report
      ? report.page.errors.map((one) => one.message)
      : ["no report within 60 s"],
    refused,
    failed,
    protocols,
  };
}

/**
 * The proxy chain in front of the stage on `stagePort`: the agent's
 * listener for a preview of that port in a workspace, the hub's listener
 * relaying to it, and the front over HTTP/2. `canvas`: a states file's
 * canvas at the front.
 */
async function chain(
  stagePort: number,
  tls: { cert: string; key: string }
): Promise<{
  canvas: (file: string) => string;
  edge: Awaited<ReturnType<typeof front>>;
  hubPort: number;
  stop: () => Promise<void>;
}> {
  const { startPreview, stopPreview } =
    await import("../../../packages/agent/src/preview");
  const instanceId = crypto.randomUUID();
  const workspace = crypto.randomUUID();
  const token = crypto.randomUUID();
  const agent = await startPreview({
    instanceId,
    port: stagePort,
    workspace,
    token,
  });
  const hub = await hubListener(
    instanceId,
    { port: stagePort, workspace },
    { address: "127.0.0.1", port: agent.port, token }
  );
  const edge = await front(tls, hub.port);
  return {
    edge,
    hubPort: hub.port,
    canvas: (file) =>
      `https://localhost:${edge.port}/@cawco/canvas?file=${encodeURIComponent(file)}&spec=${encodeURIComponent(JSON.stringify({ name: "Burst" }))}`,
    stop: async () => {
      edge.stop();
      hub.stop();
      await stopPreview({ instanceId });
    },
  };
}

/**
 * 3. The dashboard's own canvas of {@link APP_ICONS} icons from its barrel,
 * on its stage (its vite.config.ts, as every canvas of its components
 * loads), opened cold through the same chain: every frame drawn, nothing
 * failed, and the icons come as the one pre-bundled module (`@cawco/icons`,
 * the config's `optimizeDeps.include`), no `~icons/…` module asked for.
 */
async function dashboardIcons(
  kit: Kit,
  tls: { cert: string; key: string }
): Promise<void> {
  const dir = join(APP, APP_SCRATCH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Forty.svelte"), FORTY);
  writeFileSync(join(APP, APP_STORIES), FORTY_STORIES);
  const port = await freePort();
  let stageHost: ChildProcess | undefined;
  let proxied: Awaited<ReturnType<typeof chain>> | undefined;
  try {
    stageHost = await stage(APP, port, true);
    proxied = await chain(port, tls);
    const opens: Open[] = [];
    for (let open = 0; open < APP_OPENS; open += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each open cold and alone
      opens.push(await openCold(kit, proxied.canvas(APP_STORIES)));
    }
    const said = opens
      .map(
        (one, at) =>
          `open ${at + 1}: ${one.modules} responses, ${one.iconModules} of them ~icons modules, the icon package's module ${one.iconsDep}×; ${one.drawn}/${one.frames} drawn in ${one.ms} ms; failed ${[...one.unanswered, ...one.failed].slice(0, 3).join("; ") || "none"}; errors ${JSON.stringify(one.errors.slice(0, 2))}`
      )
      .join(" | ");
    kit.check(
      `3: the dashboard's canvas of ${APP_ICONS} barrel icons, opened cold ${APP_OPENS} times through the proxy: every frame drawn, no failed module, and the icons come as one pre-bundled module, no ~icons module of its own`,
      opens.every(
        (one) =>
          one.frames > 0 &&
          one.drawn === one.frames &&
          one.errors.length === 0 &&
          one.failed.length === 0 &&
          one.unanswered.length === 0 &&
          one.iconModules === 0 &&
          one.iconsDep === 1
      ),
      said
    );
  } finally {
    await proxied?.stop();
    stageHost?.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A stage module's keyed address's prefix (stage-host `MODULES_PATH`). */
const KEYED_AT = /^\/@cawco\/m\/[^/]+/u;
/** How many GETs leg 4 sends, and how many at once. */
const COST_GETS = 300;
const COST_AT_ONCE = 50;

/** The child processes of `pid` now (`pgrep -P`: BSD ps, macOS's, has no `--ppid`, and its refusal read as no children). */
const childrenOf = (pid: number): number[] =>
  Bun.spawnSync(["pgrep", "-P", String(pid)])
    .stdout.toString()
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((one) => one > 0);

/**
 * 4. {@link COST_GETS} GETs of one immutable module (the largest of Vite's
 * prebundled dependencies the canvas loads, at its `?v=`) at the hub's listener on `hubPort`, gzip
 * taken, {@link COST_AT_ONCE} at a time: every bridge's processes seen
 * meanwhile (sampled every 5 ms), and this process's CPU over them.
 */
async function relayCost(
  kit: Kit,
  canvas: string,
  hubPort: number
): Promise<void> {
  // The largest prebundled dependency a page of the canvas asks for, at the address it asks (its `?v=` the optimizer's now).
  const page: Page = await kit.page("desk", {
    ignoreHTTPSErrors: true,
    init: [BRIDGE],
  });
  const deps: Promise<{ at: string; bytes: number }>[] = [];
  page.on("response", (response) => {
    const at = new URL(response.url());
    if (at.pathname.includes("/.cawco/stage/cache/deps/")) {
      deps.push(
        response
          .body()
          .then((body) => ({
            at: `${at.pathname.replace(KEYED_AT, "")}${at.search}`,
            bytes: body.byteLength,
          }))
          .catch(() => ({ at: "", bytes: 0 }))
      );
    }
  });
  await page.goto(canvas);
  await page.waitForFunction(
    () =>
      (window as unknown as { __cawcoCanvas?: { report: RenderReport | null } })
        .__cawcoCanvas?.report?.sections.length,
    null,
    { timeout: 60_000 }
  );
  const [largest] = (await Promise.all(deps)).sort((a, b) => b.bytes - a.bytes);
  await page.close();
  const asked = largest?.at ?? "";
  const url = `http://127.0.0.1:${hubPort}${asked}`;
  const bridges =
    (globalThis as { __probeBridges?: number[] }).__probeBridges ?? [];
  const seen = new Set<number>();
  /** Aborted once the GETs are done. */
  const sampling = new AbortController();
  const sample = (async () => {
    while (!sampling.signal.aborted) {
      for (const pid of bridges) {
        for (const child of childrenOf(pid)) {
          seen.add(child);
        }
      }
      // biome-ignore lint/performance/noAwaitInLoops: samples until the GETs are done
      await Bun.sleep(5);
    }
  })();
  const sizes: number[] = [];
  const statuses = new Set<number>();
  const cpu = process.cpuUsage();
  const started = performance.now();
  for (let sent = 0; sent < COST_GETS; sent += COST_AT_ONCE) {
    // biome-ignore lint/performance/noAwaitInLoops: a batch at a time
    const batch = await Promise.all(
      Array.from({ length: COST_AT_ONCE }, async () => {
        const answer = await fetch(url, {
          headers: { "accept-encoding": "gzip", cookie: PROBE_PASS },
          decompress: false,
        } as RequestInit);
        statuses.add(answer.status);
        return (await answer.arrayBuffer()).byteLength;
      })
    );
    sizes.push(...batch);
  }
  const spent = process.cpuUsage(cpu);
  const ms = Math.round(performance.now() - started);
  sampling.abort();
  await sample;
  kit.check(
    `4: ${COST_GETS} GETs of an immutable module (${asked.split("?")[0]?.split("/").at(-1)}, ${largest?.bytes} bytes) through the hub's and the agent's listeners and the bridge, gzip taken, ${COST_AT_ONCE} at a time: ${seen.size} processes of the bridge's own seen; this process spent ${((spent.user + spent.system) / 1000).toFixed(0)} ms of CPU over ${ms} ms (${sizes[0]} bytes on the wire each)`,
    seen.size === 0 && [...statuses].join() === "200",
    `statuses ${[...statuses].join(",")}; bridges ${bridges.join(",")}`
  );
}

/** Leg 5's project in the session's folder: plain Vite and Svelte, installed only in its stage clone (as session-sheet's). */
const PLACE_PROJECT: Record<string, string> = {
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name: "probe-burst-cards",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { plugins: [svelte()], server: { fs: { strict: false } } };
`,
  "index.html": "<!doctype html><html><head></head><body></body></html>\n",
  "src/Card.svelte": `<script>
  let { title } = $props();
</script>

<h2 data-probe="title">{title}</h2>
`,
  "src/Card.stories.js": `import Card from "./Card.svelte";

export default { component: Card, args: { title: "Hello" } };

export const One = { args: {}, parameters: { viewport: 400 } };
`,
};
const PLACE_STORY = "src/Card.stories.js";

/** What each numbered message asks leg 5's session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const COMMAND = /PROBE-CALL:(\w+)/gu;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/u;

/** Leg 5's mock model: the call a `PROBE-CALL:<n>` names, then "done"; every other turn a word. */
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

/** The relay of preview `instanceId`'s bridge: the process whose arguments end in its socket. */
const relayOf = async (instanceId: string): Promise<number | null> => {
  const ending = `/${instanceId}.sock`;
  const pids = (await processLineage())
    .map((row) => row.pid)
    .sort((a, b) => a - b);
  for (const pid of pids) {
    // biome-ignore lint/performance/noAwaitInLoops: lowest pid first, stopping at the first match
    const args = await processArgs(pid);
    if (args?.argv.some((one) => one.endsWith(ending))) {
      return pid;
    }
  }
  return null;
};

/** 5. The real join: a session's component canvas in a place, through the agent's bridge into its boundary's network. */
async function realJoin(kit: Kit): Promise<void> {
  if (process.env.CAWCO_WORKSPACE) {
    kit.note(
      `5 (the relay's join into a real boundary) runs on the host: ${BOUNDARY_INSIDE}; bun scripts/probe-kit/run.ts preview-burst`
    );
    return;
  }
  const fleet = await kit.fleet(respond);
  for (const [file, body] of Object.entries(PLACE_PROJECT)) {
    mkdirSync(join(fleet.repo, file, ".."), { recursive: true });
    writeFileSync(join(fleet.repo, file), body);
  }
  await Bun.$`bun install --lockfile-only --no-progress`
    .cwd(fleet.repo)
    .quiet();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Cards", fleet.repo);
  asks.set("5", {
    name: "mcp__cawco__artifact_create",
    input: {
      response_format: "detailed",
      kind: "component",
      name: "cards",
      file: PLACE_STORY,
      does: "judge",
      ask: "Judge the card in each of its states",
    },
  });
  await fleet.send(session, "PROBE-CALL:5");
  const created = (await until(
    "artifact_create's answer",
    () => answered.get("5"),
    Boolean,
    300_000
  ).catch(() => "no answer")) as string;
  // The sheet's own origin (hub server.ts `frameAddress`).
  const id = ANSWERED_ID.exec(created)?.[1] ?? "";
  const { port } = (await (
    await fetch(`${fleet.base}/api/artifacts/${id}/preview-address`, {
      method: "POST",
    })
  ).json()) as { port?: number };
  const origin = `http://127.0.0.1:${port ?? 0}`;
  const page: Page = await kit.page("desk");
  // Its port is behind the lock: the person's pass, as the dashboard's frame holds it.
  await passInto(page.context(), fleet, origin);
  const modules: string[] = [];
  page.on("request", (request) => {
    const at = new URL(request.url());
    if (KEYED_AT.test(at.pathname)) {
      modules.push(`${at.pathname}${at.search}`);
    }
  });
  await page.goto(
    `${origin}/@cawco/canvas?file=${encodeURIComponent(PLACE_STORY)}`
  );
  const drawn = await page
    .waitForFunction(
      () =>
        !!document.querySelector(
          '[data-cawco-story="One"] [data-probe="title"]'
        ),
      null,
      { timeout: 120_000 }
    )
    .then(() => true)
    .catch(() => false);
  await page.close();
  const relay = await relayOf(session);
  const target =
    modules.find((one) => one.includes("Card.svelte")) ?? modules[0];
  const seen = new Set<number>();
  const sampling = new AbortController();
  const sample = (async () => {
    while (!sampling.signal.aborted) {
      for (const child of relay ? childrenOf(relay) : []) {
        seen.add(child);
      }
      // biome-ignore lint/performance/noAwaitInLoops: samples until the GETs are done
      await Bun.sleep(5);
    }
  })();
  const statuses = new Map<number, number>();
  for (let sent = 0; target && sent < COST_GETS; sent += COST_AT_ONCE) {
    // biome-ignore lint/performance/noAwaitInLoops: a batch at a time
    await Promise.all(
      Array.from({ length: COST_AT_ONCE }, async () => {
        const status = await fetch(`${origin}${target}`)
          .then(async (answer) => {
            await answer.arrayBuffer();
            return answer.status;
          })
          .catch(() => 0);
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
      })
    );
  }
  sampling.abort();
  await sample;
  kit.check(
    `5: on the host, a session's canvas in a place draws through the agent's bridge into its boundary (its relay ${relay ?? "not found"}), and ${COST_GETS} GETs of ${target ?? "no module"} through it, ${COST_AT_ONCE} at a time, answer ${[...statuses].map(([status, n]) => `${n}×${status}`).join(", ") || "nothing"} with ${seen.size} processes of the relay's own seen`,
    drawn &&
      relay !== null &&
      !!target &&
      statuses.get(200) === COST_GETS &&
      seen.size === 0,
    `artifact_create: ${created.replaceAll(/\s+/gu, " ").slice(0, 300)}`
  );
}

const run = async (kit: Kit) => {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = project();
  const stagePort = await freePort();
  // Before any agent module loads: the stage host's build imports them.
  standInBridge();
  const stageHost = await stage(dir, stagePort, false);
  const tls = await scratchCertificate(SCRATCH, ["localhost"]);
  const proxied = await chain(stagePort, tls);
  const { edge } = proxied;
  const url = proxied.canvas(STORIES);
  try {
    const opens: Open[] = [];
    let peak = 0;
    for (let open = 0; open < OPENS; open += 1) {
      edge.reset();
      // biome-ignore lint/performance/noAwaitInLoops: each open cold and alone, as the owner's are
      opens.push(await openCold(kit, url));
      peak = Math.max(peak, edge.peak());
    }
    const protocols = [...new Set(opens.flatMap((one) => [...one.protocols]))];
    kit.check(
      `1: the burst is more requests at once than socat's own backlog of ${SOCAT_BACKLOG}, over HTTP/2`,
      peak > SOCAT_BACKLOG && protocols.join() === "h2",
      `at most ${peak} streams in flight at the front; ${protocols.join(",")}; ${Math.min(...opens.map((one) => one.modules))} to ${Math.max(...opens.map((one) => one.modules))} responses an open`
    );
    const bad = opens.flatMap((one, at) =>
      one.drawn === one.frames &&
      one.frames > 0 &&
      one.errors.length === 0 &&
      one.refused.length === 0
        ? []
        : [
            `open ${at + 1}: ${one.drawn}/${one.frames} drawn; ${one.refused.length} answered 502${one.refused.length ? ` (${one.refused.slice(0, 3).join("; ")})` : ""}; errors ${JSON.stringify(one.errors.slice(0, 2))}; failed ${one.failed.slice(0, 2).join("; ") || "none"}`,
          ]
    );
    kit.check(
      `2: each of ${OPENS} cold opens through the proxy draws every frame, reports no error, and no response is 502`,
      bad.length === 0,
      bad.length
        ? `${OPENS - bad.length} of ${OPENS} drew: ${bad.join(" | ")}`
        : `${OPENS} of ${OPENS} drew, ${opens.map((one) => `${one.drawn}/${one.frames} in ${one.ms} ms`).join(", ")}`
    );
    await relayCost(kit, url, proxied.hubPort);
  } finally {
    await proxied.stop();
    stageHost.kill("SIGTERM");
  }
  await dashboardIcons(kit, tls);
  await realJoin(kit);
};

const spec: Spec = {
  group: "Speed",
  name: "preview-burst",
  run,
};
export default spec;
