/**
 * iOS: the app's preview and composer canvas enter host mode's preview
 * origins with the hub's tickets (hub preview-access.ts; Previews.swift
 * `previewLoad`), with no sign-in, while the app reaches the hub over plain
 * http. Port mode asks for no ticket.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app on an iPhone simulator of its own (a
 * mac-slot.sh slot, deleted at the end), reaching the hub at its
 * `http://127.0.0.1:<port>`. A session previews a server this spec runs
 * (`artifact_create` of its port), whose page opens a WebSocket to its own
 * origin as an HMR client does. Three passes, each with two launches of the
 * app on the session (`-open-session`), read from its DEBUG lines
 * (PreviewProbe `preview …`, CanvasDebug `canvas page …`, CanvasProbe
 * `canvas …`):
 *
 * - **https**: the pattern `https://p-{port}.localhost:<tls>`. TLS in front
 *   of the hub's first preview port is a terminator this spec runs
 *   ({@link tlsFront}: Bun's TLS listener piping bytes to the hub, Host and
 *   all), its certificate (every name of the range) issued by a root made
 *   for the run, which the simulator trusts (`simctl keychain add-root-cert`).
 * - **http**: the pattern `http://p-{port}.localhost:<first port>`. It holds
 *   the app's ATS exception for `localhost` names (project.yml) and the
 *   hub's top-level pass there being `SameSite=Lax` with no `Secure`, which
 *   WebKit refuses over plain http (preview-access.ts `passCookie`).
 * - **port**: port mode.
 *
 * 1. (build-both.sh compiles the app; this spec runs its build.)
 * 2. The preview's first load is `<origin>/__cawco/enter?ticket=…&next=/`,
 *    the page answers 200 on the origin, the overlay says `cawco:ready`, no
 *    failure is shown (ATS's among them), and the page's WebSocket reaches
 *    its server.
 * 3. Draw opens the composer's canvas: its page loads
 *    `<origin>/__cawco/enter?…&next=/__cawco/canvas/<id>/`, answers 200 and
 *    posts `cawco:ready`.
 * 4. Lapse: the web view's cookies deleted and the page reloaded, it answers
 *    401 and exactly one entry follows, with a new ticket, then 200 and
 *    ready; no failure says "Frame load interrupted". The canvas the same.
 * 5. Twice: deleted again with the next ticket spoiled, the entry answers
 *    401 too, and that stands: no third load, no ready (the canvas: its
 *    load fails with "the hub answered 401").
 * 6. Port mode: neither loads an entry nor carries a ticket.
 * 7. The canvas's export names the same page (`origin`), and a web view of
 *    its own enters it the same way and joins.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-preview-enter
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the checks are read in order, one after another.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket, Subprocess, TCPSocketListener } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const LOG_HEAD = /^.*\] /;
const TICKET = /ticket=([^&]+)/;
/** The canvas page an entry sends the web view on to. */
const CANVAS_NEXT = /next=(\/__cawco\/canvas\/[0-9a-f-]{36}\/)/;
const TITLE = "Entered page";
/** How long a refusal that stands is watched for a load after it, ms. */
const STANDS_MS = 15_000;
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title></head><body><h1>${TITLE}</h1><script>new WebSocket(location.origin.replace(/^http/,"ws")+"/hmr").onmessage=function(e){document.title=${JSON.stringify(TITLE)}+" "+e.data}</script></body></html>`;

const pause = (ms: number) => Bun.sleep(ms);

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
    },
  };
};

const respond = (request: Seen): Reply => {
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
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

/**
 * A root for the run and a server certificate it issued for `names`, in
 * `dir`: what iOS takes for TLS (RSA 2048, SHA-256, the names as SANs,
 * serverAuth, a year).
 */
async function certificates(
  dir: string,
  names: string[]
): Promise<{ cert: string; key: string; root: string }> {
  writeFileSync(
    join(dir, "root.cnf"),
    [
      "[req]",
      "distinguished_name=dn",
      "x509_extensions=v3",
      "prompt=no",
      "[dn]",
      "CN=CawCo probe root",
      "[v3]",
      "basicConstraints=critical,CA:TRUE",
      "keyUsage=critical,keyCertSign,cRLSign",
      "subjectKeyIdentifier=hash",
      "",
    ].join("\n")
  );
  writeFileSync(
    join(dir, "leaf.ext"),
    [
      "basicConstraints=CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      `subjectAltName=${names.map((name) => `DNS:${name}`).join(",")}`,
      "",
    ].join("\n")
  );
  await sh(`cd '${dir}'
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout root.key -out root.pem -config root.cnf 2>/dev/null
openssl req -newkey rsa:2048 -nodes -sha256 -keyout leaf.key -out leaf.csr -subj "/CN=${names[0]}" 2>/dev/null
openssl x509 -req -in leaf.csr -CA root.pem -CAkey root.key -CAcreateserial -sha256 -days 365 -extfile leaf.ext -out leaf.pem 2>/dev/null`);
  return {
    cert: readFileSync(join(dir, "leaf.pem"), "utf8"),
    key: readFileSync(join(dir, "leaf.key"), "utf8"),
    root: join(dir, "root.pem"),
  };
}

/** One direction of a pipe: what its socket has not yet taken. */
interface Side {
  ended: boolean;
  pending: Uint8Array[];
  socket?: Socket<unknown>;
}

const flush = (side: Side) => {
  while (side.socket && side.pending.length > 0) {
    const [chunk] = side.pending;
    const wrote = side.socket.write(chunk);
    if (wrote < chunk.length) {
      side.pending[0] = chunk.subarray(Math.max(0, wrote));
      return;
    }
    side.pending.shift();
  }
  if (side.socket && side.ended && side.pending.length === 0) {
    side.socket.end();
  }
};

const push = (side: Side, chunk: ArrayLike<number>) => {
  side.pending.push(new Uint8Array(chunk));
  flush(side);
};

const close = (side: Side) => {
  side.ended = true;
  flush(side);
};

/**
 * TLS in front of the hub's preview port: each connection's bytes, decrypted,
 * piped to `127.0.0.1:<target>` as they are (the Host, the cookies, a
 * WebSocket upgrade and its frames), and the answer back. What a reverse
 * proxy with the names' certificate does in front of a fleet's hub.
 */
const tlsFront = (
  target: number,
  tls: { cert: string; key: string }
): TCPSocketListener<{ hub: Side; client: Side }> =>
  Bun.listen<{ hub: Side; client: Side }>({
    hostname: "127.0.0.1",
    port: 0,
    tls,
    socket: {
      open(client) {
        const pipe = {
          hub: { ended: false, pending: [] } as Side,
          client: { ended: false, pending: [], socket: client } as Side,
        };
        client.data = pipe;
        Bun.connect<undefined>({
          hostname: "127.0.0.1",
          port: target,
          socket: {
            open(hub) {
              pipe.hub.socket = hub as Socket<unknown>;
              flush(pipe.hub);
            },
            data(_hub, chunk) {
              push(pipe.client, chunk);
            },
            drain() {
              flush(pipe.hub);
            },
            close() {
              close(pipe.client);
            },
            error() {
              close(pipe.client);
            },
          },
        }).catch(() => close(pipe.client));
      },
      data(client, chunk) {
        push(client.data.hub, chunk);
      },
      drain(client) {
        flush(client.data.client);
      },
      close(client) {
        close(client.data.hub);
      },
      error(client) {
        close(client.data.hub);
      },
    },
  });

/** The app's lines since `from`, each with its index. */
const since = (heard: string[], from: number) =>
  heard.slice(from).map((line, i) => ({ line, at: from + i }));

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }

  // The previewed server: its page, and every WebSocket its page opens.
  const upgrades: number[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bun) {
      if (new URL(request.url).pathname === "/hmr") {
        upgrades.push(Date.now());
        return bun.upgrade(request)
          ? undefined
          : new Response("no upgrade", { status: 400 });
      }
      return new Response(PAGE, { headers: { "content-type": "text/html" } });
    },
    websocket: {
      open: (ws) => {
        ws.send("socket open");
      },
      message: () => undefined,
    },
  });

  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Enter", fleet.repo);

  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const created = await call(CREATE, {
    kind: "preview",
    name: "entered",
    port: server.port,
  });
  const artifact = created.match(ANSWERED_ID)?.[1];
  if (!kit.check("the preview is made", !!artifact, created.slice(0, 300))) {
    return;
  }

  const range = (await (
    await fetch(`${fleet.base}/api/preview-settings`)
  ).json()) as { ports: string };
  const [first, last] = range.ports.split("–").map(Number);
  const ports = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "enter-"));
  const certs = await certificates(
    dir,
    ports.map((port) => `p-${port}.localhost`)
  );
  const front = tlsFront(first, certs);
  console.log(`  TLS on 127.0.0.1:${front.port} in front of ${first}`);

  const settle = async (settings: object): Promise<string> => {
    const put = await fetch(`${fleet.base}/api/preview-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!put.ok) {
      throw new Error(`preview settings ${put.status}: ${await put.text()}`);
    }
    // Shown again, so its frame names the origin as it stands now.
    await fetch(
      `${fleet.base}/api/instances/${session}/artifacts/${artifact}/show`,
      { method: "POST" }
    );
    const address = (await (
      await fetch(`${fleet.base}/api/instances/${session}/preview-address`, {
        method: "POST",
      })
    ).json()) as { origin?: string; port?: number };
    return address.origin ?? `http://127.0.0.1:${address.port}`;
  };

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  const heardAt: number[] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    await sh(`xcrun simctl keychain ${udid} add-root-cert '${certs.root}'`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Canvas" OR category == "Probe")'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const line of split) {
          if (line.includes("dev.cawco.app")) {
            heard.push(line.replace(LOG_HEAD, ""));
            heardAt.push(Date.now());
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);

    /** Launches the app on the session with `flags`; the index of the first line it says. */
    const launch = async (flags: string): Promise<number> => {
      await sh(`xcrun simctl terminate ${udid} dev.cawco.app || true`);
      await pause(1000);
      const from = heard.length;
      await until(
        "the app launched",
        () =>
          sh(
            `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} ${flags} >/dev/null`
          ).then(() => true),
        Boolean,
        60_000
      );
      return from;
    };
    /** The first line since `from` that `test` passes, waited for up to `ms`. */
    const line = (from: number, test: (line: string) => boolean, ms: number) =>
      until(
        "the app's line",
        () => since(heard, from).find(({ line: one }) => test(one)),
        Boolean,
        ms
      ).catch(() => undefined);
    /** What a failure shows: the app's lines from `from` of these kinds. */
    const story = (from: number, prefix: string) =>
      since(heard, from)
        .map(({ line: one }) => one)
        .filter((one) => one.startsWith(prefix))
        .map((one) => one.slice(0, 160))
        .join(" | ");

    const passes = [
      {
        name: "https",
        settings: {
          mode: "host",
          pattern: `https://p-{port}.localhost:${front.port}`,
        },
      },
      {
        name: "http",
        settings: {
          mode: "host",
          pattern: `http://p-{port}.localhost:${first}`,
        },
      },
      { name: "port", settings: { mode: "port" } },
    ];
    for (const pass of passes) {
      // biome-ignore lint/performance/noAwaitInLoops: one pass after another, on one simulator
      const origin = await settle(pass.settings);
      const byHost = pass.settings.mode === "host";
      console.log(`  ${pass.name}: ${origin}`);

      // The preview.
      const opened = Date.now();
      const from = await launch("-preview-probe -preview-lapse");
      const ready = await line(from, (one) => one === "preview ready", 90_000);
      const before = ready
        ? since(heard, from).filter(({ at }) => at < ready.at)
        : since(heard, from);
      const loads = (rows: { line: string }[]) =>
        rows
          .map(({ line: one }) => one)
          .filter((one) => one.startsWith("preview loads "))
          .map((one) => one.slice("preview loads ".length));
      const answers = (rows: { line: string }[]) =>
        rows
          .map(({ line: one }) => one)
          .filter((one) => one.startsWith("preview answered "));
      const failures = (rows: { line: string }[]) =>
        rows
          .map(({ line: one }) => one)
          .filter((one) => one.startsWith("preview failed: "));
      const firstLoad = loads(before)[0] ?? "";
      const socketed =
        ready !== undefined &&
        upgrades.some(
          (at) => at >= opened && at <= (heardAt[ready.at] ?? 0) + 2000
        );
      if (byHost) {
        kit.check(
          `2 (${pass.name}): the preview loads ${origin}/__cawco/enter?ticket=…&next=/, answers 200 on its origin, is ready, shows no failure, and its page's WebSocket opens`,
          firstLoad.startsWith(`${origin}/__cawco/enter?ticket=`) &&
            firstLoad.includes("&next=/") &&
            answers(before).at(-1) === `preview answered 200 for ${origin}/` &&
            failures(before).length === 0 &&
            socketed,
          `ready ${!!ready}; socket ${socketed}; ${story(from, "preview ")}`
        );
      } else {
        kit.check(
          "6 (port): the preview loads its origin straight, no entry and no ticket, and is ready",
          !!ready &&
            loads(before).length > 0 &&
            loads(before).every(
              (one) => one.startsWith(origin) && !one.includes("ticket=")
            ) &&
            failures(before).length === 0 &&
            socketed,
          `ready ${!!ready}; socket ${socketed}; ${story(from, "preview ")}`
        );
      }

      if (byHost && ready) {
        // 4. The pass lapses: one entry, a new ticket, ready.
        const lapsed = await line(
          from,
          (one) => one.startsWith("preview lapse 1"),
          20_000
        );
        const again = lapsed
          ? await line(lapsed.at, (one) => one === "preview ready", 30_000)
          : undefined;
        const between =
          lapsed && again
            ? since(heard, lapsed.at).filter(({ at }) => at < again.at)
            : since(heard, lapsed?.at ?? from);
        const reentries = loads(between);
        const firstTicket = TICKET.exec(firstLoad)?.[1];
        const newTicket = TICKET.exec(reentries[0] ?? "")?.[1];
        kit.check(
          `4 (${pass.name}): its pass gone, the page answers 401, one entry follows with a new ticket, then 200 and ready, and no failure says Frame load interrupted`,
          !!again &&
            answers(between)[0]?.startsWith("preview answered 401 ") === true &&
            reentries.length === 1 &&
            reentries[0].startsWith(`${origin}/__cawco/enter?ticket=`) &&
            !!newTicket &&
            newTicket !== firstTicket &&
            answers(between).at(-1) === `preview answered 200 for ${origin}/` &&
            failures(between).length === 0,
          `${lapsed?.line ?? "no lapse"}; ${story(lapsed?.at ?? from, "preview ")}`
        );

        // 5. Twice in a row: it stands.
        const twice = await line(
          from,
          (one) => one.startsWith("preview lapse 2"),
          20_000
        );
        await pause(STANDS_MS);
        const after = twice ? since(heard, twice.at) : [];
        kit.check(
          `5 (${pass.name}): a second 401 in a row before ready stands: the spoiled entry answers 401, no third load, no ready`,
          !!twice &&
            answers(after).length === 2 &&
            answers(after).every((one) =>
              one.startsWith("preview answered 401 ")
            ) &&
            loads(after).length === 1 &&
            loads(after)[0].includes("ticket=spoiled") &&
            !after.some(({ line: one }) => one === "preview ready") &&
            !failures(after).some((one) => one.includes("interrupted")),
          `${twice?.line ?? "no second lapse"}; ${story(twice?.at ?? from, "preview ")}`
        );
      }

      // The composer's canvas.
      const drew = await launch("-canvas-probe-enter");
      const done = await line(drew, (one) => one === "canvas done", 180_000);
      const canvasRows = since(heard, drew).filter(
        ({ at }) => !done || at <= done.at
      );
      const canvasLines = canvasRows.map(({ line: one }) => one);
      const passed = (name: string) =>
        canvasLines.some((one) => one.startsWith(`canvas PASS ${name}`));
      const canvasLoads = (rows: { line: string }[]) =>
        rows
          .map(({ line: one }) => one)
          .filter((one) => one.startsWith("canvas page loads "))
          .map((one) => one.slice("canvas page loads ".length));
      const canvasAnswers = (rows: { line: string }[]) =>
        rows
          .map(({ line: one }) => one)
          .filter((one) => one.startsWith("canvas page answered "));
      const firstJoin = canvasRows.find(({ line: one }) =>
        one.startsWith("canvas PASS enter")
      );
      const opening = firstJoin
        ? canvasRows.filter(({ at }) => at < firstJoin.at)
        : canvasRows;
      const canvasFirst = canvasLoads(opening)[0] ?? "";
      const canvasPath = CANVAS_NEXT.exec(canvasFirst)?.[1];
      const canvasStory = () =>
        canvasLines
          .filter(
            (one) =>
              one.startsWith("canvas page loads") ||
              one.startsWith("canvas page answered") ||
              one.startsWith("canvas page failed") ||
              one.startsWith("canvas page posted cawco:ready") ||
              one.startsWith("canvas PASS") ||
              one.startsWith("canvas FAIL") ||
              one.startsWith("canvas lapse")
          )
          .map((one) => one.slice(0, 180))
          .join(" | ");
      if (!byHost) {
        kit.check(
          "6 (port): the canvas page loads its origin straight, no entry and no ticket, and joins",
          passed("enter") &&
            canvasLoads(opening).length > 0 &&
            canvasLoads(opening).every(
              (one) => one.startsWith(origin) && !one.includes("ticket=")
            ),
          canvasStory()
        );
        continue;
      }
      kit.check(
        `3 (${pass.name}): the canvas loads ${origin}/__cawco/enter?…&next=/__cawco/canvas/<id>/, answers 200 there and posts cawco:ready`,
        passed("enter") &&
          canvasFirst.startsWith(`${origin}/__cawco/enter?ticket=`) &&
          !!canvasPath &&
          canvasAnswers(opening).at(-1) ===
            `canvas page answered 200 for ${origin}${canvasPath}` &&
          opening.some(
            ({ line: one }) => one === "canvas page posted cawco:ready"
          ),
        canvasStory()
      );
      const lapse = canvasRows.find(
        ({ line: one }) =>
          one.startsWith("canvas lapse deleted") && one.endsWith("spoil=false")
      );
      const lapsePass = canvasRows.find(({ line: one }) =>
        one.startsWith("canvas PASS lapse")
      );
      const lapseRows =
        lapse && lapsePass
          ? canvasRows.filter(({ at }) => at > lapse.at && at < lapsePass.at)
          : [];
      kit.check(
        `4 (${pass.name}): the canvas's pass gone, its page answers 401, one entry follows with a new ticket, 200 and ready, with no failure`,
        !!lapsePass &&
          canvasAnswers(lapseRows)[0]?.startsWith(
            "canvas page answered 401 "
          ) === true &&
          canvasLoads(lapseRows).length === 1 &&
          canvasLoads(lapseRows)[0].startsWith(
            `${origin}/__cawco/enter?ticket=`
          ) &&
          TICKET.exec(canvasLoads(lapseRows)[0])?.[1] !==
            TICKET.exec(canvasFirst)?.[1] &&
          canvasAnswers(lapseRows)
            .at(-1)
            ?.startsWith("canvas page answered 200 ") === true &&
          !lapseRows.some(({ line: one }) =>
            one.startsWith("canvas page failed")
          ),
        canvasStory()
      );
      kit.check(
        `7 (${pass.name}): the canvas's export names the same page on ${origin}, and a web view of its own enters it and joins`,
        passed("export") &&
          canvasLines.some((one) =>
            one.includes(`export origin ${origin}/ byHost true`)
          ),
        canvasStory()
      );
      const spoiled = canvasRows.find(
        ({ line: one }) =>
          one.startsWith("canvas lapse deleted") && one.endsWith("spoil=true")
      );
      const spoiledRows = spoiled
        ? canvasRows.filter(({ at }) => at > spoiled.at)
        : [];
      kit.check(
        `5 (${pass.name}): a second 401 in a row breaks the canvas's load and stands: the spoiled entry answers 401, no third load`,
        passed("twice") &&
          canvasAnswers(spoiledRows).length === 2 &&
          canvasAnswers(spoiledRows).every((one) =>
            one.startsWith("canvas page answered 401 ")
          ) &&
          canvasLoads(spoiledRows).length === 1 &&
          canvasLoads(spoiledRows)[0].includes("ticket=spoiled") &&
          spoiledRows.some(({ line: one }) =>
            one.includes("the hub answered 401 for its page")
          ) &&
          !spoiledRows.some(({ line: one }) => one.includes("interrupted")),
        canvasStory()
      );
    }
  } finally {
    stream?.kill();
    await sim?.release();
    front.stop(true);
    server.stop(true);
  }
}

const spec: Spec = { name: "ios-preview-enter", run };
export default spec;
