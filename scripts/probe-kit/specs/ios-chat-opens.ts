/**
 * iOS: a chat opens and stays open, whatever its preview's state and however
 * busy it is (tsk-17). TestFlight 20261015.3 died opening the owner's
 * orchestrator chat, and again at every launch after: its preview shown in
 * port mode, reached through a name (Cloudflare's) that serves no preview
 * port, while the chat's rows kept arriving. The phone's own log named the
 * death: `reconfigureItems` refused in `TranscriptView.commit`, a row the
 * first screen had just let go reconfigured in the update that left it out.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app on an iPhone 17 Pro Max on iOS 27.0, the
 * owner's phone and OS, in a mac-slot.sh slot deleted at the end. A session
 * previews a server this spec runs (`artifact_create` of its port). Each
 * pass sets the fleet's preview settings, shows the preview again, and
 * launches the app straight onto the session (`-open-session`, as a launch
 * restores it), reading its DEBUG lines (PreviewProbe `preview …`):
 *
 * - **port, refused**: the app reaches the hub at `[::1]` through a pipe
 *   this spec runs; the hub listens on IPv4 only, so the session's port on
 *   `[::1]` refuses the load.
 * - **port, no answer**: the same, with a listener on that port that takes
 *   each connection and never answers, as Cloudflare does on a port it
 *   doesn't proxy.
 * - **host, refused**: host mode, the pattern's names on a port nothing
 *   listens on, the app under the pattern's domain (ticket, then refusal).
 * - **failed load**: host mode over TLS whose certificate's root the
 *   simulator doesn't trust.
 *
 * Per pass: the app is up when the panel has said its failure and still up
 * {@link HOLD_MS} after it (the same process), the panel says its failure
 * (`preview failed: …`) with its band, web view and well at finite,
 * non-negative frames (`preview geometry`), and the transcript under it
 * lands with its rows at a finite frame (`transcript landed`).
 *
 * Then the crash itself (the phone's own log: `reconfigureItems` refused
 * in `TranscriptView.commit` from the display link): the session runs
 * rounds of a line and a shell call while the app is launched onto it
 * again and again, its first screen filling a row a frame
 * (`-transcript-feed-one`, as on a phone whose rows cost a frame). The
 * first screen is a window of the rows that moves as rows arrive, so a
 * held row leaves it in the frame its drawing changed. Only an update of
 * the whole snapshot reconfigures (the one that died), which came up about
 * once in ten launches: {@link BUSY_LAUNCHES} launches at least, and on
 * until the list has said it left such rows out of a whole update
 * (`transcript update leaves … (whole)`), at most {@link BUSY_MAX}. The app
 * stays up through every launch, so the race came up and passed.
 *
 * Then approving (the owner's "Another ios crash when approving sth"): a
 * chat in default mode asks to write, round after round, and the app is
 * launched onto it {@link ASK_LAUNCHES} times with `-approve-asks`, which
 * approves each permission as its card's Approve does once it stands. The
 * card leaves, the live row comes back and the next round lands under the
 * display link while the first screen fills. Each launch, in the second its
 * first approval goes, the app is sent to the background (Settings comes
 * forward) for {@link AWAY_MS}, past the scene-update watchdog's 10 s that
 * killed 20261015.3 in this frame's layout, and brought back. The app stays
 * up through every launch, approves at least once a launch, the chat goes on
 * past them, and no frame of the transcript runs while its scene is in the
 * background (`transcript came forward: 0 frame(s) ran in the background`).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-chat-opens
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

/** The owner's phone and OS when it crashed (iPhone18,2, iOS 27.0). */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-0",
  device: "iPhone 17 Pro Max",
};
const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const LOG_HEAD = /^.*\] /;
const BURST = /BURST-(\d+):(\d+)/g;
const ASKS = /ASKS-(\d+):(\d+)/g;
/** Launches onto the asking chat, and how long each is watched, ms. */
const ASK_LAUNCHES = 12;
const ASK_WATCH_MS = 8000;
/** How long the app stays in the background after approving: past the scene-update watchdog's 10 s. */
const AWAY_MS = 12_000;
const CAME_FORWARD =
  /^transcript came forward: (\d+) frame\(s\) ran in the background$/;
const GEOMETRY = /^preview geometry (.*)$/;
const LANDED = /^transcript landed rows=(\d+) frame=(\S+)$/;
const LEFT_OUT = "transcript update leaves ";
const SPACES = /\s+/;
/** A socket's handler for what this spec does not listen to. */
const unheard = () => undefined;
/** What CoreFoundation says as an uncaught exception ends the app. */
const UNCAUGHT = "Terminating app due to uncaught exception";
/** Launches onto the busy session, and how long each is watched, ms. */
const BUSY_LAUNCHES = 24;
/** The most launches the race is waited for: it came up about once in ten. */
const BUSY_MAX = 96;
const BUSY_WATCH_MS = 6000;
const BOX =
  /(\w+)=(-?[\d.]+|nan|inf|-inf),(-?[\d.]+|nan|inf|-inf),(-?[\d.]+|nan|inf|-inf),(-?[\d.]+|nan|inf|-inf)/gi;
/** How long the app is watched after its panel said the failure, ms. */
const HOLD_MS = 10_000;
/** How long a load that never answers has to fail: WebKit's request timeout (60 s) and some. */
const NO_ANSWER_MS = 100_000;

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

/** A few paragraphs of prose, so the transcript has rows to measure and draw. */
const PROSE = Array.from(
  { length: 6 },
  (_, i) =>
    `Paragraph ${i + 1}: the preview panel stands over this conversation while its page loads, and the reply keeps reading under it as it did before the panel opened.`
).join("\n\n");

/** Rounds each burst has had, by its number. */
const rounds = new Map<string, number>();

/** Where the asking session's writes go: its folder, set once the fleet is up. */
let writes = "";

/**
 * A burst: rounds of a line and a call, one after another, each round a
 * message of several rows that lands as the call before it ends, as a busy
 * session's transcript moves. `call` is the round's call: a shell command
 * the session runs, or a write it asks permission for.
 */
const burst = (
  number: string,
  limit: number,
  call: (round: number) => { input: object; name: string }
): Reply => {
  const done = rounds.get(number) ?? 0;
  if (done >= limit) {
    return text(`Burst ${number} done.`);
  }
  rounds.set(number, done + 1);
  // Several short paragraphs before the call: rows that land together, as a long message's do.
  const lines = Array.from(
    { length: 5 },
    (_, i) => `Round ${done + 1} of burst ${number}, part ${i + 1}.`
  );
  return {
    everyMs: 2,
    words: lines.flatMap((line, i) => (i === 0 ? [line] : ["\n\n", line])),
    tool: call(done + 1),
  };
};

/** A busy chat's round: a shell command, which runs at once. */
const shell = (number: string) => (round: number) => ({
  name: "Bash",
  input: {
    command: `echo burst-${number}-round-${round}`,
    description: `Burst ${number} round ${round}`,
  },
});

/** An asking chat's round: a write, which waits on the owner's Approve. */
const write = (number: string) => (round: number) => ({
  name: "Write",
  input: {
    file_path: `${writes}/asked-${number}-${round}.md`,
    content: `Round ${round} of burst ${number}.\n`,
  },
});

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // The asking chat's burst: its own session, so nothing else it said comes after it.
  const asking = [...request.all.matchAll(ASKS)].at(-1);
  if (asking) {
    return burst(`asks-${asking[1]}`, Number(asking[2]), write(asking[1]));
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const bursting = [...request.all.matchAll(BURST)].at(-1);
  const markerAt = marker
    ? request.all.lastIndexOf(`PROBE-CALL:${marker}`)
    : -1;
  if (bursting && (bursting.index ?? -1) > markerAt) {
    return burst(bursting[1], Number(bursting[2]), shell(bursting[1]));
  }
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text(PROSE);
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

/** A self-signed certificate for `names`, which nothing trusts. */
async function untrusted(
  dir: string,
  names: string[]
): Promise<{ cert: string; key: string }> {
  writeFileSync(
    join(dir, "leaf.cnf"),
    [
      "[req]",
      "distinguished_name=dn",
      "x509_extensions=v3",
      "prompt=no",
      "[dn]",
      `CN=${names[0]}`,
      "[v3]",
      "basicConstraints=CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      `subjectAltName=${names.map((name) => `DNS:${name}`).join(",")}`,
      "",
    ].join("\n")
  );
  await sh(`cd '${dir}'
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout leaf.key -out leaf.pem -config leaf.cnf 2>/dev/null`);
  return {
    cert: readFileSync(join(dir, "leaf.pem"), "utf8"),
    key: readFileSync(join(dir, "leaf.key"), "utf8"),
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
 * A pipe on `hostname`, each connection's bytes passed to
 * `127.0.0.1:<target>` and the answer back, over TLS when `tls` is given:
 * the hub reached by another address than its own.
 */
const pipe = (
  hostname: string,
  target: number,
  tls?: { cert: string; key: string }
): TCPSocketListener<{ hub: Side; client: Side }> =>
  Bun.listen<{ hub: Side; client: Side }>({
    hostname,
    port: 0,
    ...(tls ? { tls } : {}),
    socket: {
      open(client) {
        const ends = {
          hub: { ended: false, pending: [] } as Side,
          client: { ended: false, pending: [], socket: client } as Side,
        };
        client.data = ends;
        Bun.connect<undefined>({
          hostname: "127.0.0.1",
          port: target,
          socket: {
            open(hub) {
              ends.hub.socket = hub as Socket<unknown>;
              flush(ends.hub);
            },
            data(_hub, chunk) {
              push(ends.client, chunk);
            },
            drain() {
              flush(ends.hub);
            },
            close() {
              close(ends.client);
            },
            error() {
              close(ends.client);
            },
          },
        }).catch(() => close(ends.client));
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

/** Whether a TCP connection to `hostname:port` opens. */
const opens = (hostname: string, port: number): Promise<boolean> =>
  Bun.connect({
    hostname,
    port,
    socket: { data: unheard, open: unheard, error: unheard, close: unheard },
  }).then(
    (socket) => {
      socket.end();
      return true;
    },
    () => false
  );

/** A frame's four numbers, read back: finite and of no negative size. */
const sound = (values: string[]) => {
  const [x, y, w, h] = values.map(Number);
  return [x, y, w, h].every(Number.isFinite) && w >= 0 && h >= 0;
};

/** The app's lines since `from`, each with its index. */
const since = (heard: string[], from: number) =>
  heard.slice(from).map((line, i) => ({ line, at: from + i }));

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }

  // The previewed server: reachable from the hub, so the preview opens.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        "<!doctype html><title>Unreachable</title><h1>Unreachable</h1>",
        { headers: { "content-type": "text/html" } }
      ),
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
  const session = await fleet.spawn("claude", "Unreachable", fleet.repo);
  // The asking chat: default mode, so each write waits on the owner's Approve.
  writes = fleet.repo;
  const asker = await fleet.spawn("claude", "Asking", fleet.repo, {
    permissionMode: "default",
  });
  // Its history: prose turns, more rows than a screen holds.
  for (let turn = 0; turn < 12; turn += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the turns are sent in order
    await fleet.send(asker, "Say a few paragraphs.");
  }

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
  // Prose first, so the transcript has rows under the panel.
  await fleet.send(session, "Say a few paragraphs.");
  const created = await call(CREATE, {
    kind: "preview",
    name: "unreachable",
    port: server.port,
  });
  const artifact = created.match(ANSWERED_ID)?.[1];
  if (!kit.check("the preview is made", !!artifact, created.slice(0, 300))) {
    return;
  }
  /** Runs burst `number` of `limit` rounds, and waits for it to end when `wait`. */
  const runBurst = async (number: number, limit: number, wait: boolean) => {
    await fleet.send(session, `BURST-${number}:${limit}`);
    if (wait) {
      await until(
        `burst ${number}'s ${limit} rounds`,
        () => (rounds.get(String(number)) ?? 0) >= limit,
        Boolean,
        600_000
      );
      // Its closing words, after the last call's result.
      await pause(3000);
    }
  };
  // History: more rows than a screen holds, so a first screen is a window of them.
  await runBurst(1, 150, true);

  const hubPort = Number(new URL(fleet.base).port);
  const range = (await (
    await fetch(`${fleet.base}/api/preview-settings`)
  ).json()) as { ports: string };
  const [first, last] = range.ports.split("–").map(Number);
  const ports = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "unreachable-"));
  const certs = await untrusted(
    dir,
    ports.map((port) => `p-${port}.localhost`)
  );
  // The hub at [::1], where the session's preview port is not served.
  const v6 = pipe("::1", hubPort);
  const v6Hub = `http://[::1]:${v6.port}`;
  // Untrusted TLS in front of host mode's first port.
  const badTls = pipe("127.0.0.1", first, certs);
  // A port nothing listens on, for host mode's names.
  const shut = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: unheard, open: unheard },
  });
  const nowhere = shut.port;
  shut.stop(true);

  /** Settings put, the preview shown again, and the address the hub names now. */
  const settle = async (
    settings: object
  ): Promise<{ origin?: string; port?: number }> => {
    const put = await fetch(`${fleet.base}/api/preview-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!put.ok) {
      throw new Error(`preview settings ${put.status}: ${await put.text()}`);
    }
    await fetch(
      `${fleet.base}/api/instances/${session}/artifacts/${artifact}/show`,
      { method: "POST" }
    );
    return (await (
      await fetch(`${fleet.base}/api/instances/${session}/preview-address`, {
        method: "POST",
      })
    ).json()) as { origin?: string; port?: number };
  };

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  let silent: TCPSocketListener<undefined> | undefined;
  const heard: string[] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        // The app's probe lines, and the reason an uncaught exception ends it with.
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate '(subsystem == "dev.cawco.app" AND category == "Probe") OR (process == "CawCo" AND eventMessage CONTAINS "${UNCAUGHT}")'`,
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
          if (line.includes("dev.cawco.app") || line.includes(UNCAUGHT)) {
            heard.push(line.replace(LOG_HEAD, ""));
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);

    /** The app's process, as launchd has it: its pid, or nil when it isn't running. */
    const pid = async (): Promise<string | undefined> => {
      const listed = await sh(
        `xcrun simctl spawn ${udid} launchctl list | grep 'UIKitApplication:dev.cawco.app' || true`
      );
      const [id] = listed.trim().split(SPACES);
      return id && id !== "-" ? id : undefined;
    };
    /** Launches the app on `onto` (the previewing session), reaching the hub at `hub`; the index of the first line it says. */
    const launch = async (
      hub: string,
      flags = "",
      onto = session
    ): Promise<number> => {
      await sh(`xcrun simctl terminate ${udid} dev.cawco.app || true`);
      await pause(1000);
      const from = heard.length;
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${hub} -open-session ${onto} -preview-probe ${flags} >/dev/null`
      );
      return from;
    };
    const line = (from: number, test: (one: string) => boolean, ms: number) =>
      until(
        "the app's line",
        () => since(heard, from).find(({ line: one }) => test(one)),
        Boolean,
        ms
      ).catch(() => undefined);
    const story = (from: number) =>
      since(heard, from)
        .map(({ line: one }) => one)
        .filter((one) => one.startsWith("preview "))
        .map((one) => one.slice(0, 160))
        .slice(-12)
        .join(" | ");

    const underDomain = fleet.base.replace("//127.0.0.1:", "//localhost:");
    const passes: {
      name: string;
      hub: string;
      settings: object;
      before?: () => void;
      wait: number;
    }[] = [
      {
        name: "port, refused",
        hub: v6Hub,
        settings: { mode: "port" },
        wait: 60_000,
      },
      {
        name: "port, no answer",
        hub: v6Hub,
        settings: { mode: "port" },
        wait: NO_ANSWER_MS,
        before: () => undefined,
      },
      {
        name: "host, refused",
        hub: underDomain,
        settings: {
          mode: "host",
          pattern: `http://p-{port}.localhost:${nowhere}`,
        },
        wait: 60_000,
      },
      {
        name: "failed load",
        hub: underDomain,
        settings: {
          mode: "host",
          pattern: `https://p-{port}.localhost:${badTls.port}`,
        },
        wait: 60_000,
      },
    ];
    for (const pass of passes) {
      // biome-ignore lint/performance/noAwaitInLoops: one pass after another, on one simulator
      const address = await settle(pass.settings);
      console.log(`  ${pass.name}: ${JSON.stringify(address)}`);
      if (pass.name === "port, refused") {
        kit.check(
          "port, refused: the session's port on [::1] refuses a connection",
          address.port !== undefined && !(await opens("::1", address.port)),
          `port ${address.port}`
        );
      }
      if (pass.name === "port, no answer" && address.port !== undefined) {
        // Takes each connection and says nothing, as a port Cloudflare doesn't proxy.
        silent = Bun.listen({
          hostname: "::1",
          port: address.port,
          socket: { data: unheard, open: unheard },
        });
      }
      const from = await launch(pass.hub);
      const launched = await until("the app's pid", pid, Boolean, 30_000).catch(
        () => undefined
      );
      const failed = await line(
        from,
        (one) => one.startsWith("preview failed: "),
        pass.wait
      );
      const geometry = failed
        ? await line(failed.at, (one) => GEOMETRY.test(one), 10_000)
        : undefined;
      await pause(HOLD_MS);
      const after = await pid();
      silent?.stop(true);
      silent = undefined;
      kit.check(
        `${pass.name}: the app stays up through the failure and ${HOLD_MS / 1000}s after it (one process)`,
        !!launched && after === launched,
        `pid at launch ${launched ?? "none"}, after ${after ?? "none"}; ${story(from)}`
      );
      kit.check(
        `${pass.name}: the panel says it couldn't load`,
        !!failed,
        failed?.line ?? story(from)
      );
      const boxes = [
        ...(GEOMETRY.exec(geometry?.line ?? "")?.[1] ?? "").matchAll(BOX),
      ];
      const names = boxes.map((box) => box[1]);
      kit.check(
        `${pass.name}: the failure band, the web view and the well stand at finite frames, the band shown`,
        ["band", "web", "well"].every((name) => names.includes(name)) &&
          boxes.every((box) => sound(box.slice(2, 6))) &&
          (geometry?.line.includes("shown=true") ?? false),
        geometry?.line ?? "no geometry line"
      );
      const landed = since(heard, from)
        .map(({ line: one }) => LANDED.exec(one))
        .find(Boolean);
      kit.check(
        `${pass.name}: the transcript under the panel lands, its rows drawn at a finite frame`,
        !!landed && Number(landed[1]) > 0 && sound(landed[2].split(",")),
        landed?.[0] ?? "no transcript line"
      );
    }

    // The owner's chat: a busy session, rows arriving and redrawn as its
    // calls end, opened with its preview shown and unreachable (port mode
    // at [::1]). Each launch's first screen fills a row a frame, as on a
    // phone, while the rounds land under it.
    await settle({ mode: "port" });
    const busyFrom = heard.length;
    await runBurst(2, 5000, false);
    await until(
      "burst 2 under way",
      () => (rounds.get("2") ?? 0) >= 3,
      Boolean,
      120_000
    );
    let survived = 0;
    let launches = 0;
    const deaths: string[] = [];
    /** A race in an update that reconfigures has come up: the case the crash needs. */
    const wholeRace = () =>
      since(heard, busyFrom).some(
        ({ line: one }) => one.startsWith(LEFT_OUT) && one.includes("(whole)")
      );
    // The race comes up about once in ten launches: at least BUSY_LAUNCHES,
    // and on until it has come up in a whole update, up to BUSY_MAX.
    while (launches < BUSY_MAX && (launches < BUSY_LAUNCHES || !wholeRace())) {
      launches += 1;
      const i = launches - 1;
      // biome-ignore lint/performance/noAwaitInLoops: one launch after another, on one simulator
      const from = await launch(v6Hub, "-transcript-feed-one");
      const launched = await until("the app's pid", pid, Boolean, 30_000).catch(
        () => undefined
      );
      await pause(BUSY_WATCH_MS);
      const after = await pid();
      if (launched && after === launched) {
        survived += 1;
      } else {
        deaths.push(
          `launch ${i + 1}: pid ${launched ?? "none"} then ${after ?? "none"}, round ${rounds.get("2") ?? 0}; ${story(from)}`
        );
      }
    }
    const leftOut = since(heard, busyFrom).filter(({ line: one }) =>
      one.startsWith(LEFT_OUT)
    );
    console.log(
      `  busy: ${launches} launches, ${leftOut.length} update(s) left redrawn rows out; rounds ${rounds.get("2") ?? 0}`
    );
    kit.check(
      `busy chat: the app stays up through every launch onto the session (${launches}) while its rows arrive and redraw`,
      survived === launches,
      deaths.join(" || ") || `${survived}/${launches}`
    );
    kit.check(
      `busy chat: within ${BUSY_MAX} launches the first screen's window let held rows go in the frame they were redrawn, and a whole update (the one that reconfigures) left them out`,
      wholeRace(),
      leftOut
        .slice(0, 3)
        .map(({ line: one }) => one.slice(0, 200))
        .join(" | ") || "the race never came up"
    );
    // The owner's "Another ios crash when approving sth": a chat that asks
    // to write, round after round, opened again and again while the app
    // approves each ask as its Approve does (`-approve-asks`): the card
    // leaves, the live row comes back and the next round lands, under the
    // display link, as the first screen fills a row a frame.
    const askFrom = heard.length;
    await fleet.send(asker, "ASKS-1:2000");
    let askSurvived = 0;
    let awayTrips = 0;
    const askDeaths: string[] = [];
    for (let i = 0; i < ASK_LAUNCHES; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one launch after another, on one simulator
      const from = await launch(
        fleet.base,
        "-transcript-feed-one -approve-asks",
        asker
      );
      const launched = await until("the app's pid", pid, Boolean, 30_000).catch(
        () => undefined
      );
      // Approved, and sent to the background in the same second (Settings
      // comes forward), held there past the watchdog's 10 s, then back.
      const approved = await line(
        from,
        (one) => one.startsWith("probe approve "),
        60_000
      );
      if (approved) {
        await sh(
          `xcrun simctl launch ${udid} com.apple.Preferences >/dev/null`
        );
        awayTrips += 1;
        await pause(AWAY_MS);
        await sh(`xcrun simctl launch ${udid} dev.cawco.app >/dev/null`);
      }
      await pause(ASK_WATCH_MS);
      const after = await pid();
      if (launched && after === launched) {
        askSurvived += 1;
      } else {
        askDeaths.push(
          `launch ${i + 1}: pid ${launched ?? "none"} then ${after ?? "none"}, round ${rounds.get("asks-1") ?? 0}; ${story(from)}`
        );
      }
    }
    const returns = since(heard, askFrom)
      .map(({ line: one }) => CAME_FORWARD.exec(one))
      .filter((match): match is RegExpExecArray => match !== null);
    console.log(
      `  away: ${awayTrips} trip(s) to the background; frames run there: ${returns.map((match) => match[1]).join(",") || "no return said"}`
    );
    kit.check(
      "approving, then to the background: no frame of the transcript ran while its scene was in the background, on any trip",
      awayTrips > 0 &&
        returns.length >= awayTrips &&
        returns.every((match) => match[1] === "0"),
      returns
        .map((match) => match[0])
        .slice(0, 4)
        .join(" | ") || `${awayTrips} trip(s), no return said`
    );
    const approvals = since(heard, askFrom).filter(({ line: one }) =>
      one.startsWith("probe approve ")
    );
    console.log(
      `  asking: ${approvals.length} approval(s) over ${ASK_LAUNCHES} launches; rounds ${rounds.get("asks-1") ?? 0}`
    );
    kit.check(
      `approving: the app stays up through ${ASK_LAUNCHES} launches onto a chat whose asks it approves while its rows arrive`,
      askSurvived === ASK_LAUNCHES,
      askDeaths.join(" || ") || `${askSurvived}/${ASK_LAUNCHES}`
    );
    kit.check(
      "approving: each launch approved asks as they stood, and the chat went on past them",
      approvals.length >= ASK_LAUNCHES &&
        (rounds.get("asks-1") ?? 0) > ASK_LAUNCHES,
      `${approvals.length} approval(s); round ${rounds.get("asks-1") ?? 0}`
    );
    // `log stream` opens by echoing its predicate, which names the words too.
    const uncaught = heard.filter(
      (one) =>
        one.includes(UNCAUGHT) && !one.startsWith("Filtering the log data")
    );
    kit.check(
      "no launch of the run ended in an uncaught exception",
      uncaught.length === 0,
      uncaught
        .slice(0, 2)
        .map((one) => one.slice(0, 400))
        .join(" || ") || "none said"
    );
  } finally {
    silent?.stop(true);
    stream?.kill();
    await sim?.release();
    v6.stop(true);
    badTls.stop(true);
    server.stop(true);
  }
}

const spec: Spec = { name: "ios-chat-opens", run };
export default spec;
