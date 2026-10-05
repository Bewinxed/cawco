import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assets } from "./assets";

// Refuse discovery, credentials, non-loopback addresses, and default live ports.
const command = Bun.argv[2];
if (!["hub", "up", "sessiond", "status", "--help", "--version", "proof-check", "proof-inspect"].includes(command)) {
  throw new Error("Spike permits only server, status, help and proof verbs; service/update/install are not implemented");
}
if (command === "proof-check") {
  for (const tool of ["bun", "node", "git"]) {
    if (Bun.which(tool)) throw new Error(`${tool} is installed`);
  }
  try {
    await fetch("http://192.168.3.100:3456/health", { signal: AbortSignal.timeout(1500) });
    throw new Error("LIVE HUB REACHABLE: proof must stop");
  } catch (error) {
    if (String(error).includes("LIVE HUB REACHABLE")) throw error;
    console.log(`live hub unreachable: ${String(error)}`);
  }
  console.log("no bun, node or git; standalone runtime " + Bun.version);
  process.exit(0);
}
if (command === "proof-inspect") {
  const base = "http://127.0.0.1:43456";
  async function wait(path: string, predicate: (body: string) => boolean) {
    for (let i = 0; i < 150; i++) {
      try {
        const response = await fetch(path);
        const text = await response.text();
        if (response.ok && predicate(text)) return text;
      } catch {}
      await Bun.sleep(200);
    }
    throw new Error(`proof timed out: ${path}`);
  }
  console.log("health " + await wait(`${base}/health`, s => s.includes("version")));
  const page = await wait("http://127.0.0.1:43458/", s => s.includes("_app/immutable"));
  await Bun.write(join(process.env.HOME!, "dashboard.html"), page);
  console.log(`dashboard served: ${page.length} characters`);
  const script = page.match(/_app\/immutable\/entry\/start\.[\w-]+\.js/)?.[0];
  if (!script) throw new Error("dashboard script not found");
  const js = await wait(`http://127.0.0.1:43458/${script}`, s => s.length > 0);
  console.log(`embedded JS served: ${js.length} characters`);
  console.log("agents " + await wait(`${base}/api/agents`, s => {
    const rows = JSON.parse(s);
    return rows.length === 1 && rows[0].status === "online";
  }));
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:43458/ws/dashboard");
    const timer = setTimeout(() => { ws.close(); reject(new Error("dashboard websocket timeout")); }, 5000);
    ws.onmessage = event => { console.log("dashboard websocket frame: " + String(event.data).slice(0, 180)); clearTimeout(timer); ws.close(); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("dashboard websocket failed")); };
  });
  const { SessiondClient } = await import("../../packages/agent/src/sessiond-client");
  const keeper = await SessiondClient.connect(process.env.CAWCO_SESSIOND_ENDPOINT!);
  console.log(`sessiond welcome: ${keeper.epoch}, ${keeper.procs.length} children`);
  keeper.close();
  process.exit(0);
}
const home = process.env.HOME;
if (!home || !home.includes("binary")) throw new Error("HOME must be an explicit binary scratch directory");
if (!process.env.CAWCO_HUB_URL?.startsWith("http://127.0.0.1:43456")) throw new Error("Only isolated loopback hub accepted");
if (process.env.HOST !== "127.0.0.1" || process.env.CAWCO_HUB_PORT !== "43456") throw new Error("Only spike loopback ports accepted");
if (process.env.CAWCO_DEPLOY_POLL === "1") throw new Error("Deployment poller forbidden");
for (const key of Object.keys(process.env)) {
  if (/TOKEN|API_KEY|SECRET/.test(key)) throw new Error(`Credential environment forbidden: ${key}`);
}
process.env.CAWCO_NO_MDNS = "1";
const migrations = join(home, "embedded-migrations");
for (const [name, path] of assets) {
  if (!name.startsWith("drizzle/")) continue;
  const dest = join(migrations, name.slice(8));
  await mkdir(join(dest, ".."), {recursive: true});
  await writeFile(dest, await Bun.file(path).bytes());
}
process.env.CAWCO_SPIKE_MIGRATIONS = migrations;
if (command === "hub") {
  const { create_server } = await import("../../apps/dashboard/build/server/index.js");
  const { manifest } = await import("../../apps/dashboard/build/server/manifest.js");
  const app = create_server(manifest);
  await app.init({ env: process.env, read: (name: string) => Bun.file(assets.get(`client/${name}`)!).stream() });
  const relays = new WeakMap();
  Bun.serve({
    hostname: "127.0.0.1", port: 43458,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/ws/dashboard" && server.upgrade(request, {data: {}})) return;
      const path = assets.get(`client${url.pathname}`);
      if (path) return new Response(Bun.file(path));
      return app.respond(request, {getClientAddress: () => "127.0.0.1"});
    },
    websocket: {
      open(socket) {
        const upstream = new WebSocket("ws://127.0.0.1:43456/ws/dashboard");
        relays.set(socket, upstream);
        upstream.onmessage = event => socket.send(event.data);
        upstream.onclose = () => socket.close();
      },
      message(socket, message) { const upstream = relays.get(socket); if (upstream?.readyState === 1) upstream.send(message); },
      close(socket) { relays.get(socket)?.close(); },
    },
  });
  console.log("embedded dashboard listening on 127.0.0.1:43458");
}
await import("../../packages/cli/src/cli");
