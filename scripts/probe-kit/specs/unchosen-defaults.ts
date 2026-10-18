/**
 * Nothing goes out that nobody chose, and a refusal says why (the owner:
 * "YOU DO NOT DO ANY FALLBACKS UNLESS I SPECIFICALLY AUTHORIZE THEM, EVER").
 * Read from processes, bytes on the wire and the page's DOM, never pixels.
 *
 * The dashboard's server (serve.js, on the published build, under systemd's
 * own socket activation as its unit runs it):
 * 1. Started with no `CAWCO_HUB_URL`, it exits saying so and answers no page.
 * 2. Given a `wss://` hub, it dials that hub's port with TLS: the first bytes
 *    the hub's port reads are a TLS record (0x16), not a request line.
 *
 * On a scratch fleet, at the desk, its agent's OpenCode one that will not start:
 * 0. New Session on OpenCode, whose catalog the machine could not read
 *    (its server will not start), says why there are no
 *    models: the machine's own words, not an empty list.
 * 3. New Session with no machine remembered opens on no machine; with one
 *    remembered, on that one.
 * 4. A remembered permission mode the machine's Claude Code does not take
 *    (`dontAsk`) stays the form's mode, is not swapped for another, and the
 *    form says why beside Start.
 * 5. An artifact's own tab whose artifact is deleted says the hub's reason
 *    and opens no socket again.
 * 6. An artifact's own tab open while the hub trusts its network, when
 *    pairing is turned on from another device: its socket opens again, is
 *    refused as unpaired, and the tab says the pairing sentence and opens no
 *    socket again.
 *
 * On a second fleet, whose Claude Code signs in but starts no session:
 * 7. New Session on Claude, whose account's models the hub could not read,
 *    says the hub's reason with its machine named, not an empty list.
 *
 *   bun scripts/probe-kit/run.ts unchosen-defaults
 */
import { join } from "node:path";
import { $ } from "bun";
import type { Page } from "playwright-core";
import { machineLabel } from "../../../packages/core/src";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  ARTIFACT_GONE,
  ARTIFACT_SESSION_PATH,
} from "../../../packages/core/src/frames";
import { PAIRING_REQUIRED } from "../../../packages/core/src/hub-auth";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, ROOT, type Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const SERVE = join(ROOT, "apps/dashboard/serve.js");
/** The fleet board's ways into the New Session dialog. */
const STARTER = /^(New session|Start session)$/;
const MACHINES = /^Machines:/;
const PERMISSION = /^Permission mode:/;
/** What the probe's OpenCode says as it refuses to start. */
const OPENCODE_REFUSES = "probe: this opencode will not start";
/** What check 7's Claude Code says as it refuses to start a session. */
const CLAUDE_REFUSES = "probe: this Claude Code starts no session";
/** How long a refused tab is watched for a socket it should not open. Our call: past the tab's longest retry wait (10 s). */
const QUIET_MS = 12_000;

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

const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`;

/** A port nothing listens on yet. */
const freePort = (): number => {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
};

/** serve.js under `systemd-socket-activate` on `port`, `hub` its only `CAWCO_HUB_URL` when given. */
const serveOn = (port: number, hub?: string) =>
  Bun.spawn(
    [
      "systemd-socket-activate",
      `--listen=127.0.0.1:${port}`,
      "--fdname=dashboard",
      ...(hub ? [`--setenv=CAWCO_HUB_URL=${hub}`] : []),
      "node",
      SERVE,
    ],
    { cwd: join(ROOT, "apps/dashboard"), stdout: "pipe", stderr: "pipe" }
  );

/** A connection to `port` once the activator listens there (it says so after it is spawned); undefined if it never does. */
const connectWhenUp = (port: number, heard: (bytes: Uint8Array) => void) =>
  until(
    `the activator listening on ${port}`,
    () => connectOnce(port, heard),
    Boolean,
    15_000
  ).catch(() => undefined);

/** One try at `port`: the connection, or null while nothing listens there yet. */
const connectOnce = async (
  port: number,
  heard: (bytes: Uint8Array) => void
) => {
  try {
    return await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: { data: (_socket, bytes) => heard(bytes) },
    });
  } catch {
    return null;
  }
};

/** Checks 1 and 2: serve.js on the published build. */
const server = async (kit: Kit) => {
  await $`bun ${join(ROOT, "apps/dashboard/scripts/publish-build.ts")}`.quiet();

  // 1. No CAWCO_HUB_URL. The activator starts serve.js at the first
  // connection, which asks for the page.
  const port = freePort();
  const bare = serveOn(port);
  let heard = "";
  const asking = await connectWhenUp(port, (bytes) => {
    heard += new TextDecoder().decode(bytes);
  });
  asking?.write(
    `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`
  );
  const ended = await readWithin(20_000, () => bare.exited);
  const page = heard.split("\r\n")[0] || "no answer";
  asking?.end();
  bare.kill();
  const said = await new Response(bare.stderr).text();
  kit.check(
    "1: serve.js with no CAWCO_HUB_URL exits, says it needs one, and answers no page",
    asking !== undefined &&
      ended.kind === "answered" &&
      !page.includes(" 200 ") &&
      said.includes("needs CAWCO_HUB_URL"),
    `connected ${asking !== undefined}; exit ${ended.kind === "answered" ? ended.value : "none, still running"}; page ${page}; said ${said.slice(-300)}`
  );

  // 2. A wss:// hub: what its port reads first.
  let first: number | undefined;
  const hub = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(_socket, bytes) {
        first ??= bytes[0];
      },
    },
  });
  const relayPort = freePort();
  const relay = serveOn(relayPort, `wss://127.0.0.1:${hub.port}/ws`);
  try {
    const client = await connectWhenUp(relayPort, () => undefined);
    client?.write(
      `GET /ws/dashboard HTTP/1.1\r\nHost: 127.0.0.1:${relayPort}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`
    );
    const read = await until(
      "the hub's port reading the relay",
      () => first,
      (byte) => byte !== undefined,
      20_000
    ).catch(() => undefined);
    client?.end();
    kit.check(
      "2: serve.js dials a wss:// hub with TLS on its port: the first byte the hub reads is a TLS record (0x16)",
      read === 0x16,
      `connected ${client !== undefined}; first byte ${read === undefined ? "none" : `0x${read.toString(16)}`}`
    );
  } finally {
    relay.kill();
    hub.stop(true);
  }
};

/** The machines chip's name: `Machines: <machine>`, or `Machines: Select machine`. */
const machineChip = (page: Page) =>
  page
    .getByRole("button", { name: MACHINES })
    .first()
    .getAttribute("aria-label")
    .catch(() => null);

/** The New Session dialog, opened from the fleet board with `storage` in the browser's local storage. */
const dialogWith = async (
  page: Page,
  base: string,
  storage: Record<string, unknown>
) => {
  await open(page, `${base}/session`, "body");
  await page.evaluate((entries) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, storage);
  await page.reload({ waitUntil: "domcontentloaded" });
  const starter = page
    .getByRole("button", { name: STARTER })
    .filter({ visible: true })
    .first();
  await starter.waitFor({ timeout: 30_000 });
  await starter.click();
  const dialog = page.getByRole("dialog", { name: "New Session" });
  await dialog.waitFor({ timeout: 30_000 });
  // The fleet arrives over the socket: the chip names what the dialog adopted by then.
  await until("the machines chip", () => machineChip(page), Boolean, 15_000);
  await page.waitForTimeout(2000);
  return dialog;
};

/** Checks 3 and 4: the New Session dialog. */
const form = async (kit: Kit, fleet: KitFleet, base: string) => {
  const agents =
    await fleet.api<{ hostname: string; machineId: string }[]>("/api/agents");
  const hostname = agents.find((row) => row.machineId === MACHINE)?.hostname;
  const label = hostname ? machineLabel(hostname) : MACHINE;
  const page = await kit.page("desk");

  // 0. OpenCode, whose catalog the machine could not read.
  const report = await until(
    "the machine's OpenCode report",
    async () =>
      (
        await fleet.api<
          {
            harnesses?: {
              harness: string;
              installed: boolean;
              models?: unknown[];
              modelsUnread?: string;
            }[];
            machineId: string;
          }[]
        >("/api/agents")
      )
        .find((row) => row.machineId === MACHINE)
        ?.harnesses?.find((one) => one.harness === "opencode"),
    (one) =>
      one?.installed === true &&
      (one.models !== undefined || one.modelsUnread !== undefined),
    120_000
  ).catch(() => undefined);
  const opencode = await dialogWith(page, base, {
    "cawco-spawn-machine": MACHINE,
    "cawco-spawn-prefs": {
      harness: "opencode",
      model: "",
      permissionMode: "bypassPermissions",
      effort: null,
    },
  });
  const unreadSaid = await until(
    "the picker saying why",
    () =>
      opencode
        .getByText("OpenCode's models couldn't be read", {
          exact: false,
        })
        .count(),
    (count) => count > 0,
    15_000
  ).catch(() => 0);
  kit.check(
    "0: on OpenCode whose catalog its machine could not read, the picker says why, in the machine's words",
    unreadSaid > 0 && report?.modelsUnread !== undefined,
    `shown ${unreadSaid}; report models ${report?.models?.length ?? "absent"}, unread ${report?.modelsUnread ?? "absent"}`
  );

  // 3. None remembered, then this one.
  await dialogWith(page, base, {});
  const none = await machineChip(page);
  await dialogWith(page, base, { "cawco-spawn-machine": MACHINE });
  const remembered = await machineChip(page);
  kit.check(
    "3: New Session opens on no machine with none remembered, and on the remembered one",
    none === "Machines: Select machine" && remembered === `Machines: ${label}`,
    `none remembered: ${none}; ${MACHINE} remembered: ${remembered}`
  );

  // 4. A mode the machine's Claude Code does not take.
  const dialog = await dialogWith(page, base, {
    "cawco-spawn-machine": MACHINE,
    "cawco-spawn-prefs": {
      harness: "claude",
      model: "",
      permissionMode: "dontAsk",
      effort: null,
    },
  });
  const mode = await dialog
    .getByRole("button", { name: PERMISSION })
    .first()
    .getAttribute("aria-label")
    .catch(() => null);
  const why = await dialog
    .getByText("doesn't take dontAsk", { exact: false })
    .count();
  kit.check(
    "4: a remembered mode the machine does not take stays chosen, and the form says why",
    mode?.startsWith("Permission mode: dontAsk") === true && why > 0,
    `mode chip ${mode}; reasons shown ${why}`
  );
};

/** Checks 5 and 6: an artifact's own tab. */
const tabs = async (kit: Kit, fleet: KitFleet, base: string) => {
  const session = await fleet.spawn("claude", "Artifact tab", fleet.repo);
  let sent = 0;
  const create = async (heading: string): Promise<string | undefined> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, {
      name: CREATE,
      input: {
        kind: "page",
        name: heading.toLowerCase(),
        html: pageOf(heading),
      },
    });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    const said = (await until(
      `the artifact_create call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
    return said.match(ANSWERED_ID)?.[1];
  };

  /** The tab on `id`, and every artifact-session socket it opens, by when. */
  const tabOn = async (id: string) => {
    const page = await kit.page("desk");
    const opened: number[] = [];
    page.on("websocket", (socket) => {
      if (socket.url().includes(ARTIFACT_SESSION_PATH)) {
        opened.push(Date.now());
      }
    });
    await open(page, `${base}/artifact/${id}`, '[data-slot="artifact-tab"]');
    await until(
      "the tab's socket",
      () => opened.length,
      (count) => count > 0,
      30_000
    ).catch(() => undefined);
    await page.waitForTimeout(2000);
    return { page, opened };
  };

  /** Waits for `words` on the tab, then watches it for {@link QUIET_MS}: sockets it opened after the words showed. */
  const refusedWith = async (
    tab: { opened: number[]; page: Page },
    words: string
  ) => {
    const shown = await until(
      "the tab saying why",
      () => tab.page.getByText(words, { exact: false }).count(),
      (count) => count > 0,
      30_000
    ).catch(() => 0);
    const at = Date.now();
    await tab.page.waitForTimeout(QUIET_MS);
    return { shown, again: tab.opened.filter((when) => when > at).length };
  };

  // 5. The artifact deleted under its open tab.
  const doomed = await create("Doomed");
  if (!doomed) {
    kit.check("5: artifact_create answers an id", false, "no id");
    return;
  }
  const deletedTab = await tabOn(doomed);
  const removed = await fetch(
    `${fleet.base}/api/instances/${session}/artifacts/${doomed}`,
    { method: "DELETE" }
  );
  const gone = await refusedWith(deletedTab, ARTIFACT_GONE);
  kit.check(
    "5: a tab whose artifact is deleted says the hub's reason and opens no socket again",
    removed.ok && gone.shown > 0 && gone.again === 0,
    `delete ${removed.status}; reason shown ${gone.shown}; sockets opened after ${gone.again}`
  );

  // 6. Pairing turned on from another device under an open tab.
  const kept = await create("Kept");
  if (!kept) {
    kit.check("6: artifact_create answers an id", false, "no id");
    return;
  }
  const trustedTab = await tabOn(kept);
  const turned = await fetch(`${fleet.base}/api/auth/pairing`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ required: true, kind: "app", name: "Probe app" }),
  });
  const app = (await turned.json().catch(() => ({}))) as { token?: string };
  fleet.authorize(app.token ?? null);
  const unpaired = await refusedWith(trustedTab, PAIRING_REQUIRED);
  kit.check(
    "6: with pairing turned on elsewhere, an unpaired browser's tab says it must pair and opens no socket again",
    turned.ok && unpaired.shown > 0 && unpaired.again === 0,
    `pairing on ${turned.status}; reason shown ${unpaired.shown}; sockets opened after ${unpaired.again}; opened in all ${trustedTab.opened.length}`
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await server(kit);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  // The agent's OpenCode is installed and will not start: the machine cannot
  // read its catalog (check 0). `opencode2`, the name the tool catalog finds
  // OpenCode by (core tools.ts), first on the agent's PATH.
  const bin = join(fleet.home, "probe-bin");
  const fake = join(bin, "opencode2");
  await Bun.write(fake, `#!/bin/sh\necho "${OPENCODE_REFUSES}" >&2\nexit 1\n`);
  await $`chmod +x ${fake}`.quiet();
  fleet.launch("agent", [], {
    PATH: `${bin}:${fleet.env.PATH ?? process.env.PATH ?? ""}`,
  });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  await form(kit, fleet, base);
  await tabs(kit, fleet, base);
  for (const role of ["agent", "hub", "sessiond"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: the fleet stops in order, its agent first
    await fleet.stop(role);
  }
  await claudeModels(kit);
};

/**
 * Check 7, on a fleet of its own: its agent's Claude Code signs in and says
 * its version but starts no session, so the hub's read of the account's
 * models is refused. New Session on Claude says that refusal.
 */
const claudeModels = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  const path = fleet.env.PATH ?? process.env.PATH ?? "";
  const real = Bun.which("claude", { PATH: path });
  if (!real) {
    kit.check("7: Claude Code on the fleet's PATH", false, path);
    return;
  }
  const bin = join(fleet.home, "probe-claude");
  const wrapper = join(bin, "claude");
  await Bun.write(
    wrapper,
    `#!/bin/sh\ncase "$1" in\n  auth|--version|-v) exec "${real}" "$@" ;;\nesac\necho "${CLAUDE_REFUSES}" >&2\nexit 1\n`
  );
  await $`chmod +x ${wrapper}`.quiet();
  fleet.launch("agent", [], { PATH: `${bin}:${path}` });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  const dialog = await dialogWith(page, base, {
    "cawco-spawn-machine": MACHINE,
    "cawco-spawn-prefs": {
      harness: "claude",
      model: "",
      permissionMode: "bypassPermissions",
      effort: null,
    },
  });
  const said = await until(
    "the picker saying why",
    () =>
      dialog.getByText("couldn't read its models", { exact: false }).count(),
    (count) => count > 0,
    90_000
  ).catch(() => 0);
  const empty = (
    await dialog
      .locator(".none")
      .allInnerTexts()
      .catch(() => [] as string[])
  ).join(" ");
  kit.check(
    "7: on Claude, whose account's models the hub could not read, the picker says the hub's reason, its machine named",
    said > 0,
    `shown ${said}; the list's line: ${empty || "none"}`
  );
};

const spec: Spec = { name: "unchosen-defaults", run };
export default spec;
