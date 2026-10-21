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
 * (a) the session's `artifact_browse` of its page answers a `url` and an
 *     `expiresAt`;
 * (b) its gated browser (the gate, as the session's door names it) loads
 *     that url and draws the page and the canvas's toggle inside the
 *     Preview;
 * (c) a real mouse click on the toggle (Input.dispatchMouseEvent at the
 *     top page, its place summed through every frame) turns it on, read
 *     back from the embed's own DOM;
 * (d) a session outside the page's tree (no project) gets a refusal from
 *     `artifact_browse` for that page;
 * (e) the same browser, holding the session's pass, is refused that
 *     outsider's preview name (the locked page);
 * (f) once the pass's end has passed (its row's `expires_at` set back), the
 *     page is refused; a second `artifact_browse` opens it again;
 * (g) once the session ends, the page is refused and the session holds no
 *     pass.
 *
 * Host-only: a sheet's stage runs in a stage clone's boundary, which needs
 * namespaces no workspace can make, and the container leg needs the
 * machine's runtime.
 *
 *   bun scripts/probe-kit/run.ts artifact-browse
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one CDP step at a time, in order
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { cloudflareTo, scratchCertificate } from "../cloudflare-front";
import type { Kit, Spec } from "../kit";
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

/** The gate as session `id`'s door names it (agent browser/door.ts: `wsEndpoint`, `wsHeaders`). */
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
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id === "number") {
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    } else if (message.method) {
      events.push(message);
    }
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

/** A page of the session's own in the gate's browser, attached flat, its frames' targets attached too. */
const pageIn = async (gate: Gate) => {
  const { targetId } = await gate.send("Target.createTarget", {
    url: "about:blank",
  });
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

  /** Every frame of the page, each with the session that holds its document. */
  const frames = async (): Promise<FrameAt[]> => {
    const children = gate.events
      .filter(
        (event) =>
          event.method === "Target.attachedToTarget" &&
          (event.params.targetInfo as { type?: string } | undefined)?.type ===
            "iframe"
      )
      .map((event) => String(event.params.sessionId));
    const all = new Map<string, FrameAt>();
    for (const session of [top, ...children]) {
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

  /** Where frame `at`'s viewport stands in the top page's, summed through every iframe that holds it. */
  const offset = async (
    at: FrameAt,
    all: FrameAt[]
  ): Promise<{ x: number; y: number }> => {
    const parent = all.find((one) => one.id === at.parent);
    if (!parent) {
      return { x: 0, y: 0 };
    }
    const { backendNodeId } = await gate.send(
      "DOM.getFrameOwner",
      { frameId: at.id },
      parent.session
    );
    const { object } = await gate.send(
      "DOM.resolveNode",
      { backendNodeId },
      parent.session
    );
    await gate.send(
      "Runtime.callFunctionOn",
      {
        objectId: (object as { objectId: string }).objectId,
        functionDeclaration:
          "function () { this.scrollIntoView({ block: 'center', inline: 'center' }); }",
      },
      parent.session
    );
    const { model } = await gate.send(
      "DOM.getBoxModel",
      { backendNodeId },
      parent.session
    );
    const [x = 0, y = 0] = (model as { content: number[] }).content;
    const above = await offset(parent, all);
    return { x: above.x + x, y: above.y + y };
  };

  return {
    top,
    frames,
    evaluate,
    offset,
    /** Loads `url` in the page; the top document's URL once it commits, or why it didn't. */
    navigate: async (url: string) => {
      const { errorText } = await gate.send("Page.navigate", { url }, top);
      return errorText ? String(errorText) : null;
    },
    /** A real click at the top page's `x`, `y`: moved, pressed, released. */
    click: async (x: number, y: number) => {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await gate.send(
          "Input.dispatchMouseEvent",
          { type, x, y, button: "left", clickCount: 1 },
          top
        );
      }
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
  const [top] = (await page.frames()).filter((at) => !at.parent);
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
  const [top] = (await page.frames()).filter((at) => !at.parent);
  return top
    ? (await page
        .evaluate(top, `!!document.getElementById("decision-lamp")`)
        .catch(() => false)) === true
    : false;
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

const run = async (kit: Kit) => {
  // The runtime as this process finds it (browser-gate.ts): the fleet's
  // HOME hides one kept under the home dir. None: the local Chromium.
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const runtime = await findRuntime();
  const host = "missing" in runtime ? "local" : "container";
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
  await until(
    "the machine's sync set the fleet's chrome-devtools",
    async () =>
      (
        JSON.parse(
          await readFile(
            join(home, ".local", "share", "cawco", "fleet-mcp-set.json"),
            "utf8"
          ).catch(() => "{}")
        ) as { servers?: Record<string, { command?: string }> }
      ).servers?.["chrome-devtools"],
    (found) => found?.command !== undefined,
    180_000
  );

  // Host mode, its names behind an https front on every address.
  const range = await fleet.api<{ ports: string }>("/api/preview-settings");
  const first = Number(range.ports.split("–")[0]);
  const front = cloudflareTo(
    `127.0.0.1:${first}`,
    await scratchCertificate(kit.out, [`*.${PASS_DOMAIN}`, PASS_DOMAIN]),
    false,
    "0.0.0.0"
  );
  await storeHostMode(fleet, {
    mode: "host",
    pattern: `https://p-{port}.${PASS_DOMAIN}:${front.port}`,
  });

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
  const outsider = await fleet.spawn("claude", "Outsider", fleet.repo);
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
    front.stop(true);
    return;
  }

  // (b) The gated browser loads it, the canvas's toggle drawn inside the Preview.
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

  // (c) A real click on the toggle, read back from the embed's DOM.
  let after: unknown = null;
  if (shown) {
    const rect = (await tab.evaluate(
      shown.at,
      `(() => { const el = document.querySelector(${JSON.stringify(TOGGLE)}); el.scrollIntoView({ block: "center", inline: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`
    )) as { x: number; y: number };
    const place = await tab.offset(shown.at, shown.all);
    await tab.click(place.x + rect.x, place.y + rect.y);
    after = await until(
      "the toggle on",
      () =>
        tab.evaluate(
          shown.at,
          `document.querySelector(${JSON.stringify(TOGGLE)})?.getAttribute("aria-pressed") + " " + document.querySelector(${JSON.stringify(TOGGLE)})?.textContent`
        ),
      (said) => String(said).startsWith("true") && String(said).includes("on"),
      20_000
    ).catch(async () =>
      tab.evaluate(
        shown.at,
        `document.querySelector(${JSON.stringify(TOGGLE)})?.outerHTML`
      )
    );
  }
  kit.check(
    "(c) a real mouse click inside the Preview's story turns the toggle on, read back from the embed's own DOM",
    String(after).startsWith("true") && String(after).includes("on"),
    String(after)
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
  const pageUrl = new URL(
    new URL(entry.url).searchParams.get("next") ?? "/",
    new URL(entry.url).origin
  ).href;
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

  // (g) The session ends: refused, and it holds no pass.
  await fleet.stopSession(writer);
  await until(
    "the session stopped",
    () => fleet.instance(writer),
    (row) => row?.status === "stopped",
    120_000
  ).catch(() => undefined);
  await tab.navigate(pageUrl);
  const ended = await until(
    "the ended session's pass refused",
    () => locked(tab),
    Boolean,
    20_000
  ).catch(() => false);
  const passes = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM preview_passes WHERE instance_id = ?",
    writer
  )[0]?.n;
  kit.check(
    "(g) once the session ends the page is refused, and no pass of the session's is kept",
    ended && passes === 0,
    JSON.stringify({ ended, passes, status: fleet.instance(writer)?.status })
  );

  await tab.close();
  gate.socket.close();
  front.stop(true);
};

const spec: Spec = {
  name: "artifact-browse",
  run,
  host: "a sheet's stage runs in a stage clone's boundary, which needs namespaces no workspace can make, and the gated browser's container needs the machine's runtime",
};
export default spec;
