/**
 * A browser tool connected through the gate as the person takes the browser
 * over ends up with the owner's words whole (agent gate.ts `closeAll`, core
 * `SHIELD_WORDS`, `SHIELD_CLOSE_WORDS`). The words are 139 bytes and a
 * WebSocket close carries 123 at most: cut there, the tool read "… when the
 * person pre…".
 *
 * The agent's gate as the daemon serves it (`serveGate`, `listenGates` on a
 * free port of its own), in front of a headless Chromium of this spec's own,
 * with a workspace's gate token minted under this spec's HOME. A raw CDP
 * connection with that token, as chrome-devtools-mcp makes it, opens a page
 * through the gate; then the shield closes the gate as a take-over does.
 *
 * - (c1) The connection is cut with 4423 and "The person took over this
 *   browser." whole.
 * - (c2) The tool connecting again is refused 423 with the owner's three
 *   sentences whole.
 * - (c3) Once the gate opens (the hand-back), the tool connects again.
 *
 * Runs inside a workspace: no boundary, no fleet.
 *
 *   bun scripts/probe-kit/run.ts shield-close-words
 */
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import {
  ensureGateToken,
  keyOfWorkspace,
  listenGates,
  SHIELD_CLOSE,
  serveGate,
  stopGate,
} from "../../../packages/agent/src/browser/gate";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  SHIELD_CLOSE_WORDS,
  SHIELD_WORDS,
} from "../../../packages/core/src/browser";
import { CAWCO_ENV } from "../../../packages/core/src/cawco-env";
import { machineId } from "../../../packages/core/src/machine-id";
import { until } from "../../scratch-fleet";
import { launchEnv } from "../browser-leftovers";
import type { Kit, Spec } from "../kit";

/** The workspace whose token the tool connects with. */
const WORKSPACE = "shield-close-probe";

/** A port nobody holds now. */
const freePort = (): number => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const { port } = lease;
  lease.stop(true);
  return port as number;
};

interface Raw {
  closed: Promise<{ code: number; reason: string }>;
  send: (
    method: string,
    params?: object
  ) => Promise<{
    error?: { message: string };
    result?: Record<string, unknown>;
  }>;
  socket: WebSocket;
}

/** A raw CDP connection through the gate, as the tool makes one. */
const connect = (url: string, token: string): Promise<Raw> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${token}` },
    } as unknown as string[]);
    let next = 0;
    const waiting = new Map<number, (message: never) => void>();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number };
      if (typeof message.id === "number") {
        waiting.get(message.id)?.(message as never);
      }
    };
    const closed = new Promise<{ code: number; reason: string }>((done) => {
      socket.onclose = (event) =>
        done({ code: event.code, reason: event.reason });
    });
    socket.onerror = () => reject(new Error(`the gate refused ${url}`));
    socket.onopen = () =>
      resolve({
        socket,
        closed,
        send: (method, params) =>
          new Promise((answer) => {
            next += 1;
            waiting.set(next, answer);
            socket.send(
              JSON.stringify({ id: next, method, params: params ?? {} })
            );
          }),
      });
  });

/** What an upgrade through the gate answers before any WebSocket opens. */
const upgradeAnswer = async (url: string, token: string) => {
  const response = await fetch(url.replace("ws://", "http://"), {
    headers: {
      Authorization: `Bearer ${token}`,
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
  return { status: response.status, text: await response.text() };
};

async function run(kit: Kit): Promise<void> {
  const gatePort = freePort();
  process.env[CAWCO_ENV.browserGatePort] = String(gatePort);
  const profile = join(kit.out, "shield-profile");
  await rm(profile, { recursive: true, force: true });
  const browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    env: launchEnv(),
    args: ["--no-sandbox", "--remote-debugging-port=0"],
  });
  const key = await keyOfWorkspace(WORKSPACE, await machineId());
  try {
    const devtools = await until(
      "the browser's DevTools port",
      async () =>
        (
          await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(
            () => ""
          )
        )
          .split("\n")[0]
          ?.trim(),
      Boolean,
      30_000
    );
    const gate = serveGate({
      key,
      devtools: () => Promise.resolve(`http://127.0.0.1:${devtools}`),
      used: () => undefined,
    });
    listenGates();
    const token = await ensureGateToken(WORKSPACE);
    const url = `ws://127.0.0.1:${gatePort}/${WORKSPACE}`;

    const tool = await connect(url, token);
    const page = await tool.send("Target.createTarget", {
      url: "about:blank",
    });
    kit.note(
      `the tool's page through the gate: ${JSON.stringify(page.result ?? page.error)}`
    );

    // The take-over, as shield.ts closes the gate.
    gate.closeAll();
    const closed = await readWithin(10_000, () => tool.closed);
    const cut = closed.kind === "answered" ? closed.value : undefined;
    kit.check(
      `c1: the tool's connection is cut with ${SHIELD_CLOSE} and "${SHIELD_CLOSE_WORDS}" whole (${Buffer.byteLength(SHIELD_CLOSE_WORDS)} of a close's 123 bytes)`,
      !!page.result &&
        cut?.code === SHIELD_CLOSE &&
        cut.reason === SHIELD_CLOSE_WORDS,
      JSON.stringify({ page, cut })
    );

    const again = await upgradeAnswer(url, token);
    kit.check(
      `c2: the tool connecting again is refused 423 with the owner's words whole (${Buffer.byteLength(SHIELD_WORDS)} bytes)`,
      again.status === 423 && again.text === SHIELD_WORDS,
      JSON.stringify(again)
    );

    // The hand-back.
    gate.open();
    const back = await connect(url, token).then(
      (raw) => {
        raw.socket.close();
        return true;
      },
      () => false
    );
    kit.check("c3: once the gate opens, the tool connects again", back);
  } finally {
    stopGate(key);
    await browser.close();
  }
}

export default {
  name: "shield-close-words",
  ownHome:
    "it mints a workspace's gate token and keeps the gate's records under HOME (agent gate.ts), never the machine's own",
  run,
} satisfies Spec;
