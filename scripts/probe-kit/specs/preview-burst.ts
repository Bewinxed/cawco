/**
 * A component canvas opened cold through the preview proxy loads every
 * module it asks for and draws on its first open, its burst of module
 * requests answered by the dev server, never 502 by a hop between.
 *
 * On 2026-10-22, 4 of 8 cold opens of the owner's chip canvases drew
 * nothing ("didn't load, so none of its stories are drawn"): 1 to 26 of the
 * icon barrel's per-icon modules (`~icons/solar/*.svelte`, about 150 of a
 * burst of about 200) answered 502. The agent's bridge into the workspace
 * (preview-bridge.ts) is a socat listening on a unix socket with socat's
 * own backlog of 5; past it, a nonblocking connect fails at once with
 * EAGAIN, and the agent's listener answers 502 for the fetch that failed.
 *
 * The chain, every hop the real one but the bridge's join into a
 * workspace's network (which needs a user namespace, refused inside a
 * workspace): Chromium over HTTP/2, as the owner's browser reaches
 * Cloudflare, to a Cloudflare-like front (100 streams at once, RFC 9113's
 * least advised), on to the hub's preview listener (hub preview.ts, a
 * session's own port), the agent's listener (agent preview.ts
 * `startPreview`, a port in a workspace), a socat on the bridge's own listen
 * address (preview-bridge.ts `bridgeListen`) carrying each connection to
 * the stage's port, and the stage host's Vite serving a Svelte canvas whose
 * states file imports a barrel of 150 icon components, a module each.
 *
 * 1. The burst is one socat's own backlog refuses: more requests at once
 *    reach the front than 5.
 * 2. Each of 20 cold opens (a fresh browser context, so no cache) draws
 *    its every frame, its page reports no error, and no response is 502.
 *
 *   bun scripts/probe-kit/run.ts preview-burst
 */
import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import http2 from "node:http2";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PREVIEW_WHY_META } from "../../../packages/core/src/index";
import type { RenderReport } from "../../../packages/core/src/stage";
import { until } from "../../scratch-fleet";
import { CLOUDFLARE, scratchCertificate } from "../cloudflare-front";
import { type Kit, ROOT, type Spec } from "../kit";

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
const BRIDGE_MODULE = /packages\/agent\/src\/preview-bridge\.ts$/;
const STORIES = "src/Icons.stories.js";
const WHY = new RegExp(`<meta name="${PREVIEW_WHY_META}" content="([^"]*)">`);

/** Headers no HTTP/2 answer carries (RFC 9113 §8.2.2). */
const CONNECTION_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);

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

/** The stage host on `port`, started as the daemon starts it (component-canvas `stageOf`). */
async function stage(dir: string, port: number): Promise<ChildProcess> {
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
      CAWCO_STAGE_KIT: "0",
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
    "the stage's ready",
    () => words,
    (text) => text.includes('"cawco":"ready"'),
    60_000
  );
  return child;
}

/**
 * The bridge as preview-bridge.ts runs it, but for its join into a
 * workspace's network: a socat on the module's own listen address
 * (`bridgeListen`, read from the module itself at `?real`, which Bun loads
 * past this swap), each connection carried to the stage's port on this
 * loopback.
 */
function standInBridge(stagePort: number): void {
  const real = `${BRIDGE_FILE}?real`;
  const contents = `import { existsSync } from "node:fs";
import { bridgeListen } from ${JSON.stringify(real)};
export class WorkspaceDown extends Error {}
const bridges = new Map();
export const reachWorkspace = async (instanceId) => {
  const held = bridges.get(instanceId);
  if (held) return held.socket;
  const socket = ${JSON.stringify(SCRATCH)} + "/" + instanceId + ".sock";
  const proc = Bun.spawn(["socat", bridgeListen(socket), "TCP:127.0.0.1:${stagePort}"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
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
  const listeners = createPreviewListeners(
    "127.0.0.1",
    deps,
    db,
    {} as Listeners[3],
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
  modules: number;
  ms: number;
  protocols: Set<string>;
  refused: string[];
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
  let modules = 0;
  page.on("response", (response) => {
    modules += 1;
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

const run = async (kit: Kit) => {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = project();
  const stagePort = await freePort();
  // Before any agent module loads: the stage host's build imports them.
  standInBridge(stagePort);
  const stageHost = await stage(dir, stagePort);
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
  const edge = await front(
    await scratchCertificate(SCRATCH, ["localhost"]),
    hub.port
  );
  const url = `https://localhost:${edge.port}/@cawco/canvas?file=${encodeURIComponent(STORIES)}&spec=${encodeURIComponent(JSON.stringify({ name: "Burst" }))}`;
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
  } finally {
    edge.stop();
    hub.stop();
    await stopPreview({ instanceId });
    stageHost.kill("SIGTERM");
  }
};

const spec: Spec = { name: "preview-burst", run };
export default spec;
