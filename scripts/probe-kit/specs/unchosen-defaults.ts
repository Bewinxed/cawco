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
 * 8a. A dashboard spawn on Claude Code that names no permission mode is
 *    refused in words saying one must be chosen, and no session is made.
 * 8b. A session started on a chosen mode (acceptEdits), stopped, its row's
 *    mode then gone: a person's send revives it on the mode the person last
 *    chose for Claude Code on that machine, not on Bypass.
 * 9. A page's `cawco.pickPlace()` opens on no machine, its machine online:
 *    the select says "Choose a machine".
 * 10. An artifact's own tab whose panel is closed while the artifact lives
 *    says so in words with Show it again, which opens the page there again.
 * 11. Fleet's count in the rail is centred on its nav row (±1px).
 * 12. New Session with no mode remembered opens on no mode ("Choose a
 *    mode"), Start disabled; picking one lets Start go.
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
import { machineLabel, placePickWords } from "../../../packages/core/src";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  ARTIFACT_GONE,
  ARTIFACT_SESSION_PATH,
} from "../../../packages/core/src/frames";
import { PAIRING_REQUIRED } from "../../../packages/core/src/hub-auth";
import { spawnWords } from "../../../packages/core/src/words/spawn";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  pressIn,
  ROOT,
  type Spec,
  settle,
} from "../kit";
import { startsWith } from "../words";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const SERVE = join(ROOT, "apps/dashboard/serve.js");
/** The fleet board's ways into the New Session dialog. */
const STARTER = /^(New session|Start session)$/;
const MACHINES = /^Machines:/;
const PERMISSION = startsWith(spawnWords.permissionModeHead);
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

/** A page whose one button asks `cawco.pickPlace()` (check 9). */
const PICK_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Place</title></head><body><h1>Place</h1><button type="button" data-pick>Choose a machine and folder</button><script>document.querySelector("[data-pick]").addEventListener("click", () => window.cawco.pickPlace().catch(() => null));</script></body></html>`;
/** The artifact tab's words while its panel is closed (check 10). */
const CLOSED_TITLE = "This artifact's panel is closed";
const SHOW_AGAIN = "Show it again";
/** The hub's address scheme, swapped for its socket's. */
const HTTP = /^http/;

/** The hub's online word on the fleet's machine. */
const machineOnline = async (fleet: KitFleet): Promise<boolean> =>
  (
    await fleet.api<{ machineId: string; status: string }[]>("/api/agents")
  ).find((row) => row.machineId === MACHINE)?.status === "online";

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
  // Nothing kept from the dialog before: the remembered prefs are the case's
  // alone, and the form as the tab last left it (NewSessionForm's
  // `cawco:new-session-form`, in the tab's own storage) goes too.
  await page.evaluate((entries) => {
    localStorage.clear();
    sessionStorage.clear();
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

  // 12. No mode remembered: none chosen, and Start waits for the person's pick.
  const unpicked = await dialogWith(page, base, {
    "cawco-spawn-machine": MACHINE,
  });
  const chip = unpicked.getByRole("button", { name: PERMISSION }).first();
  // Start, which the pick alone then lets go: nothing else holds it.
  const startButton = unpicked.locator("#session-start");
  const unchosen = await chip.getAttribute("aria-label").catch(() => null);
  const waits = await startButton.isDisabled().catch(() => false);
  await chip.click();
  // The picker's popover stands outside the dialog's subtree.
  await page.locator('[data-perm="acceptEdits"]').first().click();
  await page.waitForTimeout(1000);
  const picked = await chip.getAttribute("aria-label").catch(() => null);
  const goes = await startButton.isEnabled().catch(() => false);
  kit.check(
    '12: with no mode remembered, New Session opens on no mode ("Choose a mode") and Start waits until the person picks one',
    unchosen === "Permission mode: Choose a mode" &&
      waits &&
      picked?.startsWith("Permission mode: Accept") === true &&
      goes,
    `chip ${unchosen}, Start disabled ${waits}; after the pick: chip ${picked}, Start enabled ${goes}`
  );
};

/** A spawn on the dashboard's socket, as a form sends one: the hub's refusal in its words, or undefined when none came within 20 s. */
const spawnRefusal = async (
  fleet: KitFleet,
  payload: object
): Promise<{ instanceId: string; words: string | undefined }> => {
  const socket = new WebSocket(
    `${fleet.base.replace(HTTP, "ws")}/ws/dashboard`
  );
  await new Promise<void>((done, fail) => {
    socket.onopen = () => done();
    socket.onerror = () => fail(new Error("the dashboard socket did not open"));
  });
  const instanceId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const words = readWithin(
    20_000,
    () =>
      new Promise<string | undefined>((resolve) => {
        socket.addEventListener("message", (event) => {
          const heard = JSON.parse(String(event.data)) as {
            payload?: { kind?: string; message?: string };
            requestId?: string;
          };
          if (
            heard.requestId === requestId &&
            heard.payload?.kind === "error"
          ) {
            resolve(heard.payload.message);
          }
        });
      })
  );
  socket.send(
    JSON.stringify({
      verb: "spawn",
      machineId: MACHINE,
      instanceId,
      requestId,
      payload: { instanceId, ...payload },
    })
  );
  const said = await words;
  socket.close();
  return {
    instanceId,
    words: said.kind === "answered" ? said.value : undefined,
  };
};

/** The mode a session's row records. */
const rowMode = (fleet: KitFleet, instanceId: string) =>
  fleet.query<{ permission_mode: string | null }>(
    "SELECT permission_mode FROM instances WHERE id = ?",
    instanceId
  )[0]?.permission_mode;

/** Checks 8a and 8b: the hub's own rule for a spawn's permission mode. */
const modes = async (kit: Kit, fleet: KitFleet) => {
  // 8a. No mode named.
  const bare = await spawnRefusal(fleet, {
    cwd: fleet.repo,
    harness: "claude",
    model: MODEL.claude,
    title: "No mode",
  });
  kit.check(
    "8a: a Claude Code spawn that names no permission mode is refused in words saying one must be chosen, and no session is made",
    bare.words?.includes("A permission mode must be chosen") === true &&
      fleet.instance(bare.instanceId) === undefined,
    `said ${bare.words ?? "nothing"}; row ${JSON.stringify(fleet.instance(bare.instanceId) ?? null)}`
  );

  // 8b. A revive of a row whose mode is gone.
  const chosen = await fleet.spawn("claude", "Chosen mode", fleet.repo, {
    permissionMode: "acceptEdits",
  });
  await fleet.send(chosen, "hello");
  await until(
    "its conversation",
    () =>
      fleet.query<{ session_id: string | null }>(
        "SELECT session_id FROM instances WHERE id = ?",
        chosen
      )[0]?.session_id,
    Boolean,
    120_000
  );
  await fleet.stopSession(chosen);
  await until(
    "the session stopped",
    () => fleet.instance(chosen),
    (row) => row?.status === "stopped",
    60_000
  );
  fleet.write(
    "UPDATE instances SET permission_mode = NULL WHERE id = ?",
    chosen
  );
  await fleet.send(chosen, "again");
  const woke = await until(
    "the session woken",
    () => fleet.instance(chosen),
    (row) => row?.status === "running",
    120_000
  ).catch(() => fleet.instance(chosen));
  const revived = rowMode(fleet, chosen);
  kit.check(
    "8b: a revive of a row with no mode runs on the mode the person last chose for Claude Code on its machine (acceptEdits), not Bypass",
    woke?.status === "running" && revived === "acceptEdits",
    `status ${woke?.status}; mode ${revived}; ${woke?.last_error ?? ""}`
  );
  await fleet.stopSession(chosen);
};

/** Checks 5 and 6: an artifact's own tab. */
const tabs = async (kit: Kit, fleet: KitFleet, base: string) => {
  const session = await fleet.spawn("claude", "Artifact tab", fleet.repo);
  let sent = 0;
  const create = async (
    heading: string,
    html = pageOf(heading)
  ): Promise<string | undefined> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, {
      name: CREATE,
      input: {
        // The hub's record of the answer, which this spec reads (mcp-tool.ts).
        response_format: "detailed",
        kind: "page",
        does: "judge",
        ask: "Judge this page: pin anything that reads wrong",
        name: heading.toLowerCase(),
        html,
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

  // 9. A page's pickPlace, its machine online: the picker names none.
  const place = await create("Place", PICK_PAGE);
  if (!place) {
    kit.check("9: artifact_create answers an id", false, "no id");
    return;
  }
  const placeTab = await tabOn(place);
  await settle(placeTab.page);
  await pressIn(
    placeTab.page.frameLocator('iframe[title="Preview"]'),
    "[data-pick]"
  );
  const picker = placeTab.page.getByRole("form", {
    name: placePickWords.title,
  });
  const pickerOpened = await picker
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  const select = pickerOpened
    ? (await picker.locator('[data-slot="select-trigger"]').innerText()).trim()
    : "no picker";
  const online = await machineOnline(fleet);
  kit.check(
    `9: a page's pickPlace opens on no machine with its machine online: the select says "${placePickWords.chooseMachine}"`,
    online && select === placePickWords.chooseMachine,
    `machine online ${online}; select ${select}`
  );
  if (pickerOpened) {
    await picker.getByRole("button", { name: placePickWords.cancel }).click();
    await picker.waitFor({ state: "detached", timeout: 5000 });
  }

  // 10. Its panel closed while the artifact lives.
  const closed = await fetch(`${fleet.base}/api/instances/${session}/preview`, {
    method: "DELETE",
  });
  const closedWords = await until(
    "the tab saying its panel is closed",
    () => placeTab.page.getByText(CLOSED_TITLE).count(),
    (count) => count > 0,
    30_000
  ).catch(() => 0);
  const again = placeTab.page.getByRole("button", { name: SHOW_AGAIN });
  const offered = await again.count();
  if (offered > 0) {
    await again.click();
  }
  const reopened = await placeTab.page
    .locator('iframe[title="Preview"]')
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  kit.check(
    `10: a tab whose panel is closed while its artifact lives says "${CLOSED_TITLE}", and ${SHOW_AGAIN} opens the page there again`,
    closed.ok && closedWords > 0 && offered > 0 && reopened,
    `close ${closed.status}; words ${closedWords}; ${SHOW_AGAIN} ${offered}; page again ${reopened}`
  );

  // 11. Fleet's count, centred on its nav row.
  const board = await kit.page("desk");
  await open(board, `${base}/session`, '[data-slot="sidebar-menu-badge"]');
  const centres = await board.evaluate(() => {
    const badge = document.querySelector('[data-slot="sidebar-menu-badge"]');
    const row = badge?.parentElement?.querySelector(
      '[data-sidebar="menu-button"]'
    );
    if (!(badge && row)) {
      return null;
    }
    const of = (box: DOMRect) => box.top + box.height / 2;
    const rowBox = row.getBoundingClientRect();
    return {
      badge: of(badge.getBoundingClientRect()),
      row: of(rowBox),
      height: rowBox.height,
    };
  });
  kit.check(
    "11: Fleet's count in the rail is centred on its nav row (±1px)",
    centres !== null && Math.abs(centres.badge - centres.row) <= 1,
    JSON.stringify(centres)
  );
  await board.close();

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
  await modes(kit, fleet);
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
      .locator('[data-slot="none"]')
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
