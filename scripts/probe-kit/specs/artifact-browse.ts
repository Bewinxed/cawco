/**
 * A session proves its own decision page with real clicks (`artifact_browse`,
 * hub server.ts `browseAt`, preview-access.ts's session pass), in its own
 * gated browser: the agent's project browser behind the DevTools gate, a
 * container where a runtime answers, else the local Chromium.
 *
 * On a scratch fleet in host mode (`https://p-{port}.localtest.me:<front>`,
 * the names behind an https front on every address of the machine, so a
 * container reaches it as the machine: agent preview-names.ts), a Claude
 * Code session of a Vite + Svelte project (against the mock model) holds a
 * component canvas of a toggle and a decision page whose card media is a
 * Preview of that canvas. Then:
 *
 * (r) the session acquires its browser in port mode and lets it go; host
 *     mode's names then want other rules, and its next acquisition makes
 *     the container again with them: mapped to the machine by the
 *     runtime's own name (`cawco-host` and a `host-gateway` entry on a
 *     native engine; `host.docker.internal` or `host.containers.internal`
 *     and no entry in a VM), read from its record and the runtime;
 * (a) the session's `artifact_browse` of its page answers a `url` and an
 *     `expiresAt`;
 * (b) its gated browser (the gate, as the session's door names it) loads
 *     that url and draws the page and the canvas's toggle inside the
 *     Preview;
 * (c) the session's own browser tool (the fleet's chrome-devtools,
 *     launched through its door) opens the page and clicks the toggle by
 *     the uid its snapshot gives inside the Preview, as the session's model
 *     would: the embed's own document hears the pointerdown and the click
 *     on the toggle (where, against its box), and reads it on, as the
 *     tool's next snapshot does;
 * (d) a session outside the page's tree (no project) gets a refusal from
 *     `artifact_browse` for that page;
 * (e) the same browser, holding the session's pass, is refused that
 *     outsider's preview name (the locked page);
 * (f) once the pass's end has passed (its row's `expires_at` set back), the
 *     page is refused; a second `artifact_browse` opens it again;
 * (g) a witness, another session of the project, whose tab shares the
 *     project browser's cookies, opens the page by the writer's pass; once
 *     the writer ends (its own pages and connection go with it) the page is
 *     refused there, and the writer holds no pass.
 *
 * What the fleet's agent made on the machine's runtime is removed as the
 * spec ends, whatever its legs did: a container left behind holds its slot
 * against every other agent there.
 *
 * Host-only: a sheet's stage runs in a stage clone's boundary, which needs
 * namespaces no workspace can make, and the container leg needs the
 * machine's runtime.
 *
 *   bun scripts/probe-kit/run.ts artifact-browse
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one CDP step at a time, in order
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { removeOwned } from "../../../packages/agent/src/browser/container-host";
import type { Runtime } from "../../../packages/agent/src/browser/runtime";
import { keptBrowserOwner } from "../../../packages/agent/src/browser/state";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  browserTool,
  called,
  type SessionEntry,
  selected,
} from "../browser-tool";
import { cloudflareTo, scratchCertificate } from "../cloudflare-front";
import type { Kit, KitFleet, Spec } from "../kit";
import { PASS_DOMAIN, storeHostMode } from "../pass-legs";

const BROWSE = "mcp__cawco__artifact_browse";
const COMMAND = /PROBE-CALL:(\d+)/g;
const MCP_VERSION = "1.11.0";

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
/** Each marker's tool result, as the next request carries it: its text, and whether it failed. */
const answered = new Map<string, { failed: boolean; text: string }>();

/** The newest tool result's text in `request`'s body. */
const resultText = (request: Seen): string => {
  try {
    const { messages } = JSON.parse(request.body) as {
      messages: { content: unknown }[];
    };
    const blocks = messages.at(-1)?.content;
    const result = Array.isArray(blocks)
      ? (blocks as { content?: unknown; type?: string }[]).findLast(
          (block) => block.type === "tool_result"
        )
      : undefined;
    const content = result?.content;
    if (typeof content === "string") {
      return content;
    }
    return Array.isArray(content)
      ? (content as { text?: string }[]).map((part) => part.text ?? "").join("")
      : "";
  } catch {
    return request.last;
  }
};

/** The mock: a `PROBE-CALL:<n>` turn calls its ask's tool once (found by ToolSearch first when deferred), and its result is kept. */
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
    if (!answered.has(marker) && request.afterTool) {
      answered.set(marker, {
        failed: request.toolFailed,
        text: resultText(request),
      });
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

const STORY = "src/Toggle.stories.js";

/** The project: plain Vite and Svelte, a toggle whose words change on click (project-origin-sheet.ts `PROJECT`). */
const PROJECT: Record<string, string> = {
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name: "probe-browse",
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
  "src/Toggle.svelte": `<script>
  let { label } = $props();
  let on = $state(false);
</script>

<button data-probe="toggle" aria-pressed={on} onclick={() => (on = !on)}>{label}: {on ? "on" : "off"}</button>
`,
  [STORY]: `import Toggle from "./Toggle.svelte";

export default { component: Toggle, args: { label: "Lamp" } };

export const Off = { args: {} };
`,
};

const program = (sheet: string) => `root = Decisions("Light the lamp", [lamp])
lamp = Decision("lamp", "Does the lamp switch read right?", [keep, redo], "Drawn live.")
keep = Option("keep", "Keep this switch", "It says its state in words.", true, [live], "One more word on the button.")
redo = Option("redo", "Redraw it", "A new look.", false, [], "Another round.")
live = Preview("${sheet}", "The switch, live")`;

/** One CDP connection to the gate as a session, as its door names it. */
interface Gate {
  /** Every event heard so far. */
  events: {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
  }[];
  send: (
    method: string,
    params?: object,
    sessionId?: string
  ) => Promise<Record<string, unknown>>;
  socket: WebSocket;
}

/** A WebSocket opened with headers of its own (Bun's client takes them). */
const SocketWith = WebSocket as unknown as new (
  url: string,
  options: { headers: Record<string, string> }
) => WebSocket;

/**
 * The gate as session `id`'s door names it (agent browser/door.ts:
 * `wsEndpoint`, `wsHeaders`). Once the gate closes the connection (its
 * session ended: gate.ts cuts it and closes its pages), every call
 * waiting on it, and every one after, fails with the close's code and
 * reason.
 */
const gateAs = async (home: string, id: string): Promise<Gate> => {
  const door = JSON.parse(
    await readFile(
      join(home, ".cawco", "workspaces", id, "browser-mcp.json"),
      "utf8"
    )
  ) as { wsEndpoint: string; wsHeaders: string };
  const socket = new SocketWith(door.wsEndpoint, {
    headers: JSON.parse(door.wsHeaders) as Record<string, string>,
  });
  let next = 0;
  const waiting = new Map<
    number,
    (message: {
      error?: { message: string };
      result?: Record<string, unknown>;
    }) => void
  >();
  const events: Gate["events"] = [];
  /** Why the connection closed, once it has. */
  let closed: string | undefined;
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id === "number") {
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    } else if (message.method) {
      events.push(message);
    }
  };
  socket.onclose = (event) => {
    closed = `the gate closed ${id}'s connection (${event.code} ${event.reason})`;
    for (const answer of waiting.values()) {
      answer({ error: { message: closed } });
    }
    waiting.clear();
  };
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error(`the gate refused ${id}`));
  });
  return {
    socket,
    events,
    send: (method, params, sessionId) =>
      new Promise((resolve, reject) => {
        if (closed) {
          reject(new Error(`${method}: ${closed}`));
          return;
        }
        next += 1;
        waiting.set(next, (message) =>
          message.error
            ? reject(new Error(`${method}: ${message.error.message}`))
            : resolve(message.result ?? {})
        );
        socket.send(
          JSON.stringify({
            id: next,
            method,
            params: params ?? {},
            ...(sessionId ? { sessionId } : {}),
          })
        );
      }),
  };
};

interface FrameAt {
  id: string;
  parent?: string;
  /** The CDP session whose target holds the frame's document. */
  session: string;
  url: string;
}

/**
 * A page of the session's own in the gate's browser, attached flat, its
 * frames' targets attached too: a new one, or page `existing` (one the
 * session's browser tool opened).
 */
const pageIn = async (gate: Gate, existing?: string) => {
  const targetId =
    existing ??
    String(
      (await gate.send("Target.createTarget", { url: "about:blank" })).targetId
    );
  const { sessionId } = await gate.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const top = String(sessionId);
  const prepared = new Set<string>();
  const prepare = async (session: string) => {
    if (prepared.has(session)) {
      return;
    }
    prepared.add(session);
    await gate.send("Page.enable", {}, session);
    await gate.send("DOM.enable", {}, session);
    // The scratch front's own certificate: the browser takes it, as a page's context with ignoreHTTPSErrors does.
    await gate
      .send("Security.setIgnoreCertificateErrors", { ignore: true }, session)
      .catch(() => undefined);
    await gate.send(
      "Target.setAutoAttach",
      { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
      session
    );
  };
  await prepare(top);

  /** This page's sessions: its own, and each out-of-process frame's attached under it, however deep. */
  const sessionsOf = (): string[] => {
    const own = [top];
    // An array's iterator reads its length at each step: a session pushed is walked too.
    for (const session of own) {
      for (const event of gate.events) {
        if (
          event.method === "Target.attachedToTarget" &&
          event.sessionId === session &&
          (event.params.targetInfo as { type?: string } | undefined)?.type ===
            "iframe"
        ) {
          own.push(String(event.params.sessionId));
        }
      }
    }
    return own;
  };

  /**
   * Every frame of the page, each with the session that holds its
   * document. A frame in a process of its own is its own target's root,
   * and stands in no parent's tree (Chromium leaves remote children out:
   * "if (!child_local_frame) { continue; }", inspector_page_agent.cc
   * `BuildObjectForFrameTree`), so it names no parent here.
   */
  const frames = async (): Promise<FrameAt[]> => {
    const all = new Map<string, FrameAt>();
    for (const session of sessionsOf()) {
      await prepare(session).catch(() => undefined);
      const tree = await gate
        .send("Page.getFrameTree", {}, session)
        .catch(() => undefined);
      const walk = (node: unknown, parent?: string) => {
        const { frame, childFrames } = node as {
          childFrames?: unknown[];
          frame: { id: string; url: string };
        };
        // A frame its own target holds is that target's, not its parent's.
        if (!all.has(frame.id) || session !== top) {
          all.set(frame.id, {
            id: frame.id,
            url: frame.url,
            session,
            parent: all.get(frame.id)?.parent ?? parent,
          });
        }
        for (const child of childFrames ?? []) {
          walk(child, frame.id);
        }
      };
      if (tree?.frameTree) {
        walk(tree.frameTree);
      }
    }
    return [...all.values()];
  };

  /** `expression`'s value in frame `at`'s document (an isolated world: its DOM, none of its page's script). */
  const evaluate = async (at: FrameAt, expression: string) => {
    const { executionContextId } = await gate.send(
      "Page.createIsolatedWorld",
      { frameId: at.id, worldName: "probe" },
      at.session
    );
    const { result, exceptionDetails } = await gate.send(
      "Runtime.evaluate",
      {
        expression,
        contextId: executionContextId,
        returnByValue: true,
        awaitPromise: true,
      },
      at.session
    );
    if (exceptionDetails) {
      throw new Error(JSON.stringify(exceptionDetails).slice(0, 400));
    }
    return (result as { value?: unknown }).value;
  };

  /** The page's own top frame: its target's root. */
  const topFrame = async (): Promise<FrameAt | undefined> =>
    (await frames()).find((at) => at.session === top && !at.parent);

  return {
    targetId,
    frames,
    evaluate,
    topFrame,
    /** Loads `url` in the page; the top document's URL once it commits, or why it didn't. */
    navigate: async (url: string) => {
      const { errorText } = await gate.send("Page.navigate", { url }, top);
      return errorText ? String(errorText) : null;
    },
    close: () =>
      gate.send("Target.closeTarget", { targetId }).catch(() => undefined),
  };
};

type PageIn = Awaited<ReturnType<typeof pageIn>>;

const TOGGLE = '[data-probe="toggle"]';

/** The frame holding the toggle, and its words: undefined until one does. */
const toggleIn = async (page: PageIn) => {
  const all = await page.frames();
  for (const at of all) {
    const words = await page
      .evaluate(
        at,
        `document.querySelector(${JSON.stringify(TOGGLE)})?.textContent ?? null`
      )
      .catch(() => null);
    if (typeof words === "string") {
      return { at, all, words };
    }
  }
};

/** Whether the top document is the locked page (preview-access.ts `lockedResponse`). */
const locked = async (page: PageIn): Promise<boolean> => {
  const top = await page.topFrame();
  return top
    ? (await page
        .evaluate(
          top,
          `!!document.querySelector('meta[name="cawco-preview-locked"]')`
        )
        .catch(() => false)) === true
    : false;
};

/** Whether the top document is the decision page with its card. */
const decisionShown = async (page: PageIn): Promise<boolean> => {
  const top = await page.topFrame();
  return top
    ? (await page
        .evaluate(top, `!!document.getElementById("decision-lamp")`)
        .catch(() => false)) === true
    : false;
};

/**
 * In the embed's own document: a listener keeping each pointerdown and
 * click it hears (where, and on what), kept on its root element, which
 * every world's view of the document shares; and the toggle's box there.
 */
const LISTEN = `(() => {
  const heard = [];
  for (const type of ["pointerdown", "click"]) {
    document.addEventListener(type, (event) => {
      const on = event.target instanceof Element ? event.target : null;
      heard.push({ type, x: Math.round(event.clientX), y: Math.round(event.clientY), on: on?.closest(${JSON.stringify(TOGGLE)}) ? "toggle" : (on?.tagName.toLowerCase() ?? "none") });
      document.documentElement.setAttribute("data-probe-heard", JSON.stringify(heard));
    }, true);
  }
  const box = document.querySelector(${JSON.stringify(TOGGLE)}).getBoundingClientRect();
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
})()`;

/** What the embed's own document says of the toggle, and what its listener heard. */
const STATE = `({
  pressed: document.querySelector(${JSON.stringify(TOGGLE)})?.getAttribute("aria-pressed") ?? null,
  words: document.querySelector(${JSON.stringify(TOGGLE)})?.textContent ?? null,
  heard: JSON.parse(document.documentElement.getAttribute("data-probe-heard") ?? "[]"),
})`;

interface ToggleState {
  heard: { on: string; type: string; x: number; y: number }[];
  pressed: string | null;
  words: string | null;
}

/** The toggle's line in the browser tool's snapshot, off: its uid. */
const TOGGLE_OFF = /uid=(\S+) \S+ "Lamp: off"/;
/** The toggle's line in the browser tool's snapshot, either way. */
const TOGGLE_LINE = /^.*"Lamp: (?:off|on)".*$/m;

/**
 * The session's own browser tool (the fleet's chrome-devtools, launched
 * through its door as the machine launches it, agent browser/door.ts)
 * opens the page at `pageUrl` and clicks the story's toggle by the uid its
 * snapshot gives it inside the Preview, as the session's model would. The
 * gate's raw link `gate` reads the embed's own document around it: the
 * toggle's box and a listener there before, its state and what the
 * listener heard after. The scratch front's certificate is taken on the
 * tool's page as (b)'s tab takes it.
 */
const clickThroughTool = async (
  gate: Gate,
  entry: SessionEntry,
  doorFile: string,
  writer: string,
  pageUrl: string
) => {
  const report: {
    after: string;
    before?: string;
    box?: unknown;
    click?: string;
    error?: string;
    state?: ToggleState;
    uid?: string;
  } = { after: "" };
  const pages = async () =>
    (
      (await gate.send("Target.getTargets")).targetInfos as {
        targetId: string;
        type: string;
      }[]
    ).filter((one) => one.type === "page");
  const browser = await browserTool(entry, [`--config=${doorFile}`], writer);
  try {
    const had = new Set((await pages()).map((one) => one.targetId));
    const pageId = selected(
      (await called(browser, "new_page", { url: "about:blank" })).text
    );
    const made = (await pages()).find((one) => !had.has(one.targetId));
    if (!made) {
      report.error = "the tool's new_page opened no page the gate shows";
      return report;
    }
    const page = await pageIn(gate, made.targetId);
    await called(browser, "navigate_page", {
      pageId,
      type: "url",
      url: pageUrl,
    });
    const found = await until(
      "the toggle in the tool's page",
      () => toggleIn(page),
      Boolean,
      180_000
    ).catch(() => undefined);
    if (!found) {
      report.error = `no toggle drawn in the tool's page: ${(await page.frames()).map((frame) => frame.url).join(" | ")}`;
      return report;
    }
    report.box = await page.evaluate(found.at, LISTEN);
    const snapshot = await until(
      "the toggle in the tool's snapshot",
      async () => (await called(browser, "take_snapshot", { pageId })).text,
      (text) => TOGGLE_OFF.test(text),
      60_000
    ).catch((error: Error) => error.message);
    report.uid = TOGGLE_OFF.exec(snapshot)?.[1];
    report.before = TOGGLE_LINE.exec(snapshot)?.[0] ?? snapshot.slice(-600);
    if (!report.uid) {
      return report;
    }
    report.click = (
      await called(browser, "click", { pageId, uid: report.uid })
    ).text.slice(0, 300);
    report.state = (await until(
      "the toggle on",
      () => page.evaluate(found.at, STATE) as Promise<ToggleState>,
      (state) => state.pressed === "true",
      20_000
    ).catch(() => page.evaluate(found.at, STATE))) as ToggleState;
    report.after =
      TOGGLE_LINE.exec(
        (await called(browser, "take_snapshot", { pageId })).text
      )?.[0] ?? "";
    await page.close();
    return report;
  } finally {
    await browser.close();
  }
};

/** `{ url, expiresAt }` from an artifact_browse result, or why not. */
const browsed = (said: { failed: boolean; text: string } | undefined) => {
  try {
    const value = JSON.parse(said?.text ?? "") as {
      expiresAt?: string | null;
      url?: string;
    };
    return value.url
      ? { url: value.url, expiresAt: value.expiresAt ?? null }
      : null;
  } catch {
    return null;
  }
};

/** The live browser's container and its rules, as the agent keeps its record (agent browser/state.ts, under the fleet's data dir). */
const liveBrowser = async (
  home: string
): Promise<{ id?: string; rules?: string } | undefined> => {
  const dir = join(home, ".local", "share", "cawco", "browsers");
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const record = await readFile(join(dir, name, "record.json"), "utf8")
      .then(
        (text) =>
          JSON.parse(text) as {
            container?: { hostRules?: string; id?: string };
            state?: string;
          }
      )
      .catch(() => undefined);
    if (record?.state === "live") {
      return {
        ...(record.container?.id ? { id: record.container.id } : {}),
        ...(record.container?.hostRules
          ? { rules: record.container.hostRules }
          : {}),
      };
    }
  }
};

/**
 * Session `id` acquires its browser through the gate (a page made there,
 * as its browser tool's first call makes one), then lets it go: the live
 * browser's container and rules after.
 */
const acquired = async (home: string, id: string) => {
  const gate = await gateAs(home, id);
  const tab = await pageIn(gate);
  await tab.close();
  gate.socket.close();
  return await until(
    "the session's browser live",
    () => liveBrowser(home),
    Boolean,
    300_000
  );
};

/**
 * (r) Session `writer` acquires its browser in port mode and lets it go;
 * `toHostMode` makes the hub's names want other rules, and its next
 * acquisition makes the container again with them.
 */
const rulesLeg = async (
  kit: Kit,
  runtime: Runtime | { missing: string },
  home: string,
  writer: string,
  toHostMode: () => Promise<void>
) => {
  const portMode = await acquired(home, writer);
  await toHostMode();
  const hostMode = await acquired(home, writer);
  if ("missing" in runtime) {
    kit.note(
      "(r) local: the local Chromium runs on the machine's own network and maps no names, so it has no rules to make again"
    );
    return;
  }
  const { machineHostOf } =
    await import("../../../packages/agent/src/browser/preview-names");
  const { name, extraHosts } = machineHostOf(runtime);
  const made = hostMode.id
    ? await runtime.docker.getContainer(hostMode.id).inspect()
    : undefined;
  const env = made?.Config.Env.find((line) =>
    line.startsWith("CAWCO_HOST_RULES=")
  );
  const wanted = `MAP *.${PASS_DOMAIN} ${name}, MAP ${PASS_DOMAIN} ${name}`;
  const entries = made?.HostConfig.ExtraHosts ?? [];
  kit.check(
    `(r) container (${runtime.kind}, ${runtime.ownNetwork ? "native" : "in a VM"}): host mode's names change the rules, and the session's next acquisition makes the container again with them, mapped to ${name}${extraHosts.length > 0 ? ` (${extraHosts.join(", ")})` : " with no host entry"}`,
    !!portMode.id &&
      !!hostMode.id &&
      portMode.id !== hostMode.id &&
      hostMode.rules === wanted &&
      env === `CAWCO_HOST_RULES=${wanted}` &&
      JSON.stringify(entries) === JSON.stringify(extraHosts),
    JSON.stringify({ portMode, hostMode, env, extraHosts: entries })
  );
};

const run = async (kit: Kit) => {
  // The runtime as this process finds it (browser-gate.ts): the fleet's
  // HOME hides one kept under the home dir. None: the local Chromium.
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const runtime = await findRuntime();
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch(
    "agent",
    [],
    "missing" in runtime ? {} : { DOCKER_HOST: `unix://${runtime.endpoint}` }
  );
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;

  // Every session's browser tool, as a person adds it: the door it is
  // launched through is the session's way into the gate.
  const put = await fetch(`${fleet.base}/api/fleet/mcp/chrome-devtools`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: {
        command: "npx",
        args: [
          "-y",
          `chrome-devtools-mcp@${MCP_VERSION}`,
          "--no-usage-statistics",
        ],
      },
      enabled: true,
    }),
  });
  kit.check("the fleet runs chrome-devtools-mcp", put.ok, String(put.status));
  const tool = (await until(
    "the machine's sync set the fleet's chrome-devtools",
    async () =>
      (
        JSON.parse(
          await readFile(
            join(home, ".local", "share", "cawco", "fleet-mcp-set.json"),
            "utf8"
          ).catch(() => "{}")
        ) as { servers?: Record<string, SessionEntry> }
      ).servers?.["chrome-devtools"],
    (found) => found?.command !== undefined,
    180_000
  )) as SessionEntry;

  // Host mode, its names behind an https front on every address.
  const range = await fleet.api<{ ports: string }>("/api/preview-settings");
  const first = Number(range.ports.split("–")[0]);
  const front = cloudflareTo(
    `127.0.0.1:${first}`,
    await scratchCertificate(kit.out, [`*.${PASS_DOMAIN}`, PASS_DOMAIN]),
    false,
    "0.0.0.0"
  );
  try {
    await legs(kit, fleet, runtime, home, tool, front.port as number);
  } finally {
    front.stop(true);
    await removeOwnBrowsers(runtime, home);
  }
};

/**
 * What the fleet's agent made on the machine's runtime, removed: its
 * browsers' containers and volumes, by its owner label (container-host.ts
 * `removeOwned`). The runtime is the machine's, shared with every agent
 * there, and a container left behind holds its slot (container-host.ts
 * `heldSlots` counts stopped ones too).
 */
const removeOwnBrowsers = async (
  runtime: Runtime | { missing: string },
  home: string
): Promise<void> => {
  if ("missing" in runtime) {
    return;
  }
  const owner = await keptBrowserOwner(
    join(home, ".local", "share", "cawco", "browsers")
  );
  if (owner) {
    await removeOwned(runtime.docker, owner);
  }
};

/** Every leg after the fleet, its browser tool and the names' front stand. */
const legs = async (
  kit: Kit,
  fleet: KitFleet,
  runtime: Runtime | { missing: string },
  home: string,
  tool: SessionEntry,
  frontPort: number
) => {
  const host = "missing" in runtime ? "local" : "container";
  const dir = `${fleet.sandbox}/browse-project`;
  await Promise.all(
    Object.entries(PROJECT).map(async ([file, text]) => {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), text);
    })
  );
  await Bun.$`git init -q -b main && bun install --lockfile-only --no-progress && git add -A && git -c user.email=p@p -c user.name=p commit -q -m browse`
    .cwd(dir)
    .quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Browse",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", "Lamp page", dir, { projectId });
  const doorFile = join(
    home,
    ".cawco",
    "workspaces",
    writer,
    "browser-mcp.json"
  );
  await until(
    "the session's browser door",
    () => existsSync(doorFile),
    Boolean,
    60_000
  );

  await rulesLeg(kit, runtime, home, writer, () =>
    storeHostMode(fleet, {
      mode: "host",
      pattern: `https://p-{port}.${PASS_DOMAIN}:${frontPort}`,
    })
  );
  const outsider = await fleet.spawn("claude", "Outsider", fleet.repo);
  const witness = await fleet.spawn("claude", "Witness", dir, { projectId });
  const at = `/api/instances/${writer}/artifacts`;
  const sheet = await fleet.api<{ id: string }>(at, {
    kind: "component",
    does: "judge",
    ask: "Judge the lamp switch",
    name: "lamp-switch",
    file: STORY,
  });
  const page = await fleet.api<{ id: string }>(at, {
    kind: "page",
    does: "pick",
    ask: "Pick the lamp switch",
    name: "lamp-page",
    program: program(sheet.id),
  });

  /** The session `who` calls artifact_browse on `id` under marker `n`: its result. */
  const browse = async (who: string, n: string, id: string) => {
    asks.set(n, { name: BROWSE, input: { id } });
    await fleet.send(who, `PROBE-CALL:${n}`);
    return await until(
      `artifact_browse ${n} answered`,
      () => answered.get(n),
      Boolean,
      180_000
    );
  };

  // (a) The session's own artifact_browse.
  const one = await browse(writer, "1", page.id);
  const entry = browsed(one);
  kit.check(
    "(a) the session's artifact_browse of its page answers a url on its name and an expiresAt",
    !!entry &&
      new URL(entry.url).hostname.endsWith(`.${PASS_DOMAIN}`) &&
      new URL(entry.url).pathname === "/__cawco/enter" &&
      entry.expiresAt !== null,
    JSON.stringify({ result: one, entry })
  );
  if (!entry) {
    return;
  }

  // (b) The gated browser loads it, the canvas's toggle drawn inside the Preview.
  const gate = await gateAs(home, writer);
  const tab = await pageIn(gate);
  const loaded = await tab.navigate(entry.url);
  const shown = await until(
    "the decision page and the toggle inside its Preview",
    async () => ((await decisionShown(tab)) ? await toggleIn(tab) : undefined),
    Boolean,
    180_000
  ).catch(() => undefined);
  kit.check(
    `(b) ${host}: the session's gated browser loads the url: the decision page, and the component canvas's toggle drawn inside its Preview`,
    loaded === null && !!shown && shown.words.includes("off"),
    JSON.stringify({
      loaded,
      words: shown?.words,
      frames: (await tab.frames()).map((frame) => frame.url),
    })
  );

  // (c) The session's own browser tool clicks the story's toggle by its uid.
  const pageUrl = new URL(
    new URL(entry.url).searchParams.get("next") ?? "/",
    new URL(entry.url).origin
  ).href;
  const clicked = await clickThroughTool(gate, tool, doorFile, writer, pageUrl);
  kit.check(
    "(c) the session's own chrome-devtools (launched through its door) clicks the toggle by its uid inside the Preview: the embed's own document hears the pointerdown and click on the toggle, and reads it on",
    clicked.state?.pressed === "true" &&
      clicked.state.words === "Lamp: on" &&
      clicked.state.heard.some(
        (event) => event.type === "click" && event.on === "toggle"
      ) &&
      clicked.after.includes('"Lamp: on"'),
    JSON.stringify(clicked)
  );

  // (d) A session outside the tree is refused.
  const outside = await browse(outsider, "2", page.id);
  kit.check(
    "(d) a session outside the page's tree gets a refusal from artifact_browse for that page",
    !!outside && outside.failed && !browsed(outside),
    JSON.stringify(outside)
  );

  // (e) The session's pass opens none of another session's names.
  const theirs = await fleet.api<{ origin?: string }>(
    `/api/instances/${outsider}/preview-address`,
    {}
  );
  const refusedThere = await tab.navigate(`${theirs.origin}/`);
  const lockedThere = await until(
    "the outsider's name answered",
    () => locked(tab),
    Boolean,
    20_000
  ).catch(() => false);
  kit.check(
    "(e) the browser holding the session's pass is refused another session's preview name (the locked page)",
    !!theirs.origin && refusedThere === null && lockedThere,
    JSON.stringify({ origin: theirs.origin, refusedThere, lockedThere })
  );

  // (f) Its end passed, the pass is refused; a new one opens it again.
  fleet.write(
    "UPDATE preview_passes SET expires_at = ? WHERE instance_id = ?",
    Date.now() - 1000,
    writer
  );
  await tab.navigate(pageUrl);
  const lapsed = await until(
    "the lapsed pass refused",
    () => locked(tab),
    Boolean,
    20_000
  ).catch(() => false);
  const again = browsed(await browse(writer, "3", page.id));
  if (again) {
    await tab.navigate(again.url);
  }
  const reopened = await until(
    "the page again",
    () => decisionShown(tab),
    Boolean,
    60_000
  ).catch(() => false);
  kit.check(
    "(f) once the pass's end passed the page is refused; a new artifact_browse opens it again",
    lapsed && !!again && reopened,
    JSON.stringify({ lapsed, again, reopened })
  );

  // (g) The session ends: its pass is refused, and it holds none. The
  // writer's own pages and connection go with it (gate.ts), so a witness
  // of the project, whose pages share the browser's cookies, reads it.
  await tab.close();
  gate.socket.close();
  await endedLeg(kit, fleet, home, writer, witness, pageUrl);
};

/**
 * (g) Session `writer` ends. `witness`, a session of the same project,
 * opens the page through its own door: its tab shares the project
 * browser's cookies, the writer's pass among them, so the page opens while
 * the writer runs, and is refused once it ended, its pass gone.
 */
const endedLeg = async (
  kit: Kit,
  fleet: KitFleet,
  home: string,
  writer: string,
  witness: string,
  pageUrl: string
) => {
  const door = join(home, ".cawco", "workspaces", witness, "browser-mcp.json");
  await until(
    "the witness's browser door",
    () => existsSync(door),
    Boolean,
    60_000
  );
  const link = await gateAs(home, witness);
  const seen = await pageIn(link);
  try {
    await seen.navigate(pageUrl);
    const opened = await until(
      "the page in the witness's tab, by the writer's pass",
      () => decisionShown(seen),
      Boolean,
      60_000
    ).catch(() => false);
    await fleet.stopSession(writer);
    const status = await until(
      "the writer stopped",
      () => fleet.instance(writer)?.status,
      (now) => now === "stopped",
      120_000
    ).catch(() => fleet.instance(writer)?.status);
    await seen.navigate(pageUrl);
    const refused = await until(
      "the ended session's pass refused",
      () => locked(seen),
      Boolean,
      20_000
    ).catch(() => false);
    const passes = fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM preview_passes WHERE instance_id = ?",
      writer
    )[0]?.n;
    kit.check(
      "(g) a witness of the project opens the page by the writer's pass; once the writer ends the page is refused there, and no pass of the writer's is kept",
      opened && status === "stopped" && refused && passes === 0,
      JSON.stringify({ opened, status, refused, passes })
    );
  } finally {
    await seen.close();
    link.socket.close();
  }
};

const spec: Spec = {
  name: "artifact-browse",
  run,
  host: "a sheet's stage runs in a stage clone's boundary, which needs namespaces no workspace can make, and the gated browser's container needs the machine's runtime",
};
export default spec;
