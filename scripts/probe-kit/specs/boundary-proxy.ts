/**
 * Inside a Linux workspace's boundary every client gets out the one way, a
 * Chromium started with no proxy option among them: the sandbox's proxy
 * URLs name the srt host's relay, which presents srt's token for every
 * request (agent proxy-relay.ts). Before it, srt's URLs carried the token as
 * userinfo, which Chromium drops, and the `artifact_browse` address a
 * session opened in its own Chromium was refused at the proxy:
 * `407 /__cawco/enter`, then a timeout (2026-10-22).
 *
 *   bun scripts/probe-kit/run.ts boundary-proxy
 *
 * Runs inside a Linux workspace, on the live hub its tool door reaches.
 * The environment is the boundary's as its runner gives a command. In a
 * boundary that predates the relay (srt's proxy URL still carries its
 * credential), the spec first stands this build's relay up as the boundary
 * does, in front of that same srt proxy: the host half
 * (`startProxyRelay`, the token taken from the URL) on a socket in
 * `$TMPDIR`, dialing srt's proxy socket as the srt host dials srt's port
 * (past srt's own bridge to its port in here, no hop of the relay's), and
 * the runner's own step (`RELAY_STEP`) run in a shell of its
 * own, which bridges it to `127.0.0.1:3129` and points the proxy URLs at it.
 * Then, with that environment:
 *
 * (a) `artifact_browse` of the project's newest page answers its pass
 *     address; a plain `chromium.launch()` (no proxy option) opens it: the
 *     entry's 302, the page's own document, and no answer of 400 or over on
 *     the page's origin; the same browser's WebSocket to a public echo
 *     server (wss://, a CONNECT tunnel) hears its message back;
 * (b) curl over CONNECT: example.com over https, 200; and 20 MB from
 *     Cloudflare's speed test, every byte;
 * (c) plain HTTP on one kept-alive connection through the proxy: two GETs
 *     of example.com, both 200, one connection made;
 * (d) request bodies through the proxy over plain HTTP, chunked and
 *     counted: httpbin echoes each whole;
 * (e) `git ls-remote` of GitHub over https names a commit;
 * (f) node's own fetch (`NODE_USE_ENV_PROXY`) reads example.com, 200;
 * (g) a host srt refuses (a loopback name, the srt host's ask callback):
 *     the proxy in the environment answers its CONNECT with srt's own
 *     refusal, byte for byte what srt answers with its token directly;
 * (h) a plain `ws://` upgrade through that proxy is answered as srt answers
 *     it with its token directly (its status line), never a 407;
 * (i) bursts of 200 connections at once, one burst at a time: CONNECTs
 *     through that proxy, every one answered 200; CONNECTs to srt's own
 *     bridge to its HTTP proxy (3128), every one answered by srt; SOCKS5
 *     greetings to its bridge to its SOCKS proxy (1080), every one answered
 *     with a method. In each, every connection opens within 1 s, before a
 *     dropped SYN's retry would, and no listener of the sandbox's network
 *     drops a handshake (its `ListenDrops`). A boundary whose srt predates
 *     0.0.81 bridges with socat's own backlog of 5 and fails the last two.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import {
  RELAY_SOCKET_ENV,
  RELAY_SOCKET_NAME,
  RELAY_STEP,
  startProxyRelay,
} from "../../../packages/agent/src/proxy-relay";
import { readWithin } from "../../../packages/core/src/bounded";
import { listedPid, signalGroup } from "../../../packages/core/src/signal";
import { SOCAT_BACKLOG } from "../../../packages/core/src/socat";
import { until } from "../../scratch-fleet";
import { launchEnv } from "../browser-leftovers";
import { type Kit, ROOT, type Spec } from "../kit";

type Env = Record<string, string | undefined>;

/** A public WebSocket echo server. */
const WSS_ECHO = "wss://echo.websocket.org/";

/** srt's own bridge to its port inside the sandbox, as `pgrep -af` lists it: the socket it connects to. */
const SRT_BRIDGE = /UNIX-CONNECT:(\S+)/;

/**
 * srt's own ports inside the sandbox, each a socat to srt's proxy on the host
 * (linux-sandbox-utils.js `buildSandboxCommand`: `relay(3128, httpSocketPath)`,
 * `relay(1080, socksSocketPath)` at 0.0.81).
 */
const SRT_HTTP_PORT = 3128;
const SRT_SOCKS_PORT = 1080;

/** A socat's listen address on its command line: `TCP-LISTEN`, or from srt 0.0.81 `TCP6-LISTEN` (IPv4 mapped in) or `TCP4-LISTEN`, its port and options. */
const SOCAT_LISTEN = /\b(TCP[46]?-LISTEN:\d+,\S*)/;

/** The command line of the socat listening on `port` in this sandbox, as `pgrep -a socat` lists it; undefined when none does. */
const socatOn = async (port: number): Promise<string | undefined> =>
  (await Bun.$`pgrep -a socat`.nothrow().text())
    .split("\n")
    .find((line) => new RegExp(`\\bTCP[46]?-LISTEN:${port},`).test(line));

/** A port nothing on this loopback holds now. */
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

/** `git ls-remote <url> HEAD`'s one line. */
const COMMIT_HEAD = /^[0-9a-f]{40}\tHEAD$/;

/** This checkout's CLI: `--record` is this tree's, which the machine's installed `cawco` may predate. */
const CLI = join(ROOT, "packages/cli/src/cli.ts");

/** The hub's record `cawco tool <name> --record` answers (core tool-answer.ts), parsed. */
const tool = async <T>(name: string, input: object): Promise<T> =>
  JSON.parse(
    await Bun.$`${process.execPath} ${CLI} tool ${name} --record ${JSON.stringify(input)}`.text()
  ) as T;

/** `argv` run with `env`: its exit code, stdout and stderr. */
const ran = async (argv: string[], env: Env, stdin?: Blob) => {
  const proc = Bun.spawn(argv, {
    env,
    stdin: stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: out.trim(), err: err.trim().slice(0, 400) };
};

/** Everything a raw TCP peer at `port` on loopback answers `request` with, to its close (or what it said in 10 s). */
const rawAnswer = async (port: number, request: string): Promise<string> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  const chunks: Buffer[] = [];
  const done = () => resolve();
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      data: (_socket, data) => {
        chunks.push(Buffer.from(data));
      },
      close: done,
      end: done,
      error: done,
    },
  });
  socket.write(request);
  await readWithin(10_000, (signal) => {
    signal.addEventListener("abort", () => socket.end());
    return promise;
  });
  return Buffer.concat(chunks).toString("latin1");
};

/**
 * The environment a command gets in this boundary, and what was stood up
 * for it: in a boundary that predates the relay, this build's relay in
 * front of the same srt proxy, as the srt host and its runner make it.
 */
const boundaryEnv = async (kit: Kit) => {
  const srt = new URL(process.env.HTTPS_PROXY ?? "");
  if (!srt.username) {
    kit.note(
      `the boundary's proxy is ${srt.origin}, with no credential: its own relay`
    );
    return {
      env: { ...process.env } as Env,
      srtUrl: undefined,
      stop: () => undefined,
    };
  }
  kit.note(
    `the boundary's proxy URL carries srt's credential (${srt.host}): it predates the relay, so this build's relay is stood up in front of that srt proxy as the boundary does`
  );
  // srt's proxy as the srt host dials it, straight: the socket srt's own
  // bridge to its port in here connects to (that socat's `UNIX-CONNECT:`),
  // past that bridge, which listens with socat's own backlog of 5 and is no
  // hop of the relay's in a boundary that has one.
  const srtSocket = (await socatOn(Number(srt.port)))?.match(SRT_BRIDGE)?.[1];
  if (!srtSocket) {
    throw new Error(
      `no socat bridges srt's port ${srt.port} in this boundary, so its proxy's socket is unknown`
    );
  }
  const upstreamPort = await freePort();
  const upstream = Bun.spawn(
    [
      "socat",
      `TCP-LISTEN:${upstreamPort},bind=127.0.0.1,fork,reuseaddr,backlog=${SOCAT_BACKLOG}`,
      `UNIX-CONNECT:${srtSocket}`,
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "ignore" }
  );
  await until(
    "srt's proxy socket bridged for the relay",
    async () => (await Bun.file("/proc/net/tcp").text()).toUpperCase(),
    (tcp) =>
      tcp.includes(
        `0100007F:${upstreamPort.toString(16).toUpperCase().padStart(4, "0")} 00000000:0000 0A`
      ),
    5000
  );
  const socket = join(process.env.TMPDIR ?? "", RELAY_SOCKET_NAME);
  const relay = await startProxyRelay({
    socket,
    upstream: { host: "127.0.0.1", port: upstreamPort },
    credential: credentialOf(srt),
  });
  // The runner's step, in a session of its own, so its socat goes with it.
  const step = Bun.spawn(
    ["setsid", "bash", "--norc", "--noprofile", "-c", `${RELAY_STEP}\nenv -0`],
    {
      env: { ...process.env, [RELAY_SOCKET_ENV]: socket },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const said = await new Response(step.stdout).text();
  await step.exited;
  const env: Env = Object.fromEntries(
    said
      .split("\0")
      .filter((pair) => pair.includes("="))
      .map((pair) => [
        pair.slice(0, pair.indexOf("=")),
        pair.slice(pair.indexOf("=") + 1),
      ])
  );
  return {
    env,
    srtUrl: srt,
    stop: () => {
      // setsid made the step's shell its own group's leader; its socat stays in that group.
      signalGroup(listedPid(step.pid), "SIGTERM");
      relay.close();
      upstream.kill("SIGKILL");
    },
  };
};

/** (a) The artifact_browse address in a plain chromium.launch() with `env`. */
const browseLeg = async (kit: Kit, env: Env) => {
  const page = (
    await tool<{ id: string; kind: string }[]>("artifact_list", {})
  ).find((one) => one.kind === "page");
  if (!page) {
    kit.check("(a) the project has a page to browse", false);
    return;
  }
  const { url } = await tool<{ url: string }>("artifact_browse", {
    id: page.id,
  });
  const browser = await chromium.launch({ env: launchEnv(env) });
  try {
    const tab = await browser.newPage();
    const answered: { path: string; status: number }[] = [];
    const { origin } = new URL(url);
    tab.on("response", (response) => {
      if (new URL(response.url()).origin === origin) {
        answered.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        });
      }
    });
    const failed = await tab
      .goto(url, { timeout: 60_000, waitUntil: "load" })
      .then(() => null)
      .catch((error: Error) => error.message.split("\n")[0]);
    const artifact = await tab
      .locator("script[data-artifact]")
      .getAttribute("data-artifact", { timeout: 10_000 })
      .catch(() => null);
    kit.check(
      "(a) a plain chromium.launch() opens the artifact_browse address: the entry's 302, the page's own document, nothing of 400 or over on its origin",
      failed === null &&
        artifact === page.id &&
        answered[0]?.path === "/__cawco/enter" &&
        answered[0]?.status === 302 &&
        answered.every((one) => one.status < 400),
      JSON.stringify({
        failed,
        artifact,
        title: await tab.title().catch(() => null),
        answered: answered.slice(0, 6),
        of: answered.length,
      })
    );
    // A WebSocket from the same browser, on a page of no origin (no page's
    // CSP in the way): wss:// is a CONNECT tunnel through the proxy.
    const blank = await browser.newPage();
    const heard = await readWithin(20_000, () =>
      blank
        .evaluate(
          (at) =>
            new Promise<string>((resolve) => {
              const socket = new WebSocket(at);
              socket.onopen = () => socket.send("cawco-relay");
              socket.onmessage = (event) => {
                if (event.data === "cawco-relay") {
                  socket.close();
                  resolve("echoed");
                }
              };
              socket.onerror = () => resolve("error");
            }),
          WSS_ECHO
        )
        .catch((error: Error) => error.message)
    );
    const echoed = heard.kind === "answered" ? heard.value : "no echo in 20 s";
    kit.check(
      `(a) the same browser's WebSocket to ${WSS_ECHO} (through a CONNECT tunnel) opens and hears its message echoed`,
      echoed === "echoed",
      echoed
    );
  } finally {
    await browser.close();
  }
};

/** (b)–(f): curl, git and node through the proxy the environment names. */
const clientLegs = async (kit: Kit, env: Env) => {
  const secure = await ran(
    [
      "curl",
      "-sS",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "https://example.com/",
    ],
    env
  );
  const bulk = await ran(
    [
      "curl",
      "-sS",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code} %{size_download}",
      "https://speed.cloudflare.com/__down?bytes=20000000",
    ],
    env
  );
  kit.check(
    "(b) curl over CONNECT: example.com 200; 20 MB from Cloudflare, every byte",
    secure.out === "200" && bulk.out === "200 20000000",
    JSON.stringify({ secure, bulk })
  );

  const kept = await ran(
    [
      "curl",
      "-sS",
      "-o",
      "/dev/null",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code} %{num_connects}\\n",
      "http://example.com/",
      "http://example.com/",
    ],
    env
  );
  const lines = kept.out.split("\n");
  kit.check(
    "(c) plain HTTP on one kept-alive proxy connection: two GETs, both 200, one connection made",
    lines.length === 2 &&
      lines.every((line) => line.startsWith("200 ")) &&
      lines.reduce((sum, line) => sum + Number(line.split(" ")[1]), 0) === 1,
    JSON.stringify(kept)
  );

  const body = "cawco-relay ".repeat(25_000);
  const echoOf = async (inChunks: boolean) => {
    const said = await ran(
      [
        "curl",
        "-sS",
        "-H",
        "Content-Type: text/plain",
        ...(inChunks ? ["-H", "Transfer-Encoding: chunked"] : []),
        "--data-binary",
        "@-",
        "http://httpbin.org/anything",
      ],
      env,
      new Blob([body])
    );
    try {
      const { data } = JSON.parse(said.out) as { data?: string };
      return {
        length: data?.length ?? -1,
        whole: data === body,
        err: said.err,
      };
    } catch {
      return {
        length: -1,
        whole: false,
        err: said.err || said.out.slice(0, 200),
      };
    }
  };
  const chunked = await echoOf(true);
  const counted = await echoOf(false);
  kit.check(
    `(d) request bodies over plain HTTP through the proxy, chunked and counted: httpbin echoes each whole (${body.length} bytes)`,
    chunked.whole && counted.whole,
    JSON.stringify({ chunked, counted })
  );

  const git = await ran(
    [
      "git",
      "ls-remote",
      "https://github.com/anthropics/sandbox-runtime.git",
      "HEAD",
    ],
    env
  );
  kit.check(
    "(e) git ls-remote of GitHub over https names a commit",
    git.code === 0 && COMMIT_HEAD.test(git.out),
    JSON.stringify(git)
  );

  const node = await ran(
    [
      "node",
      "-e",
      "fetch('https://example.com/').then((r) => console.log(r.status), (e) => { console.log(String(e.cause ?? e)); process.exit(1); })",
    ],
    { ...env, NODE_USE_ENV_PROXY: "1" }
  );
  kit.check(
    "(f) node's fetch through the environment's proxy reads example.com: 200",
    node.code === 0 && node.out === "200",
    JSON.stringify(node)
  );
};

/** How many CONNECTs the burst opens at once. */
const BURST = 200;
/** A dropped SYN is sent again after the retransmission timeout, a second at first (RFC 6298 §2.1, "the RTO SHOULD be set to 1 second"). */
const SYN_RETRY_MS = 1000;
/** The burst's CONNECT target: a host srt lets through. */
const BURST_TARGET = "example.com:443";

/** This network namespace's accept-queue counters (`TcpExt` in /proc/net/netstat): handshakes a full listener dropped. */
const listenDrops = async (): Promise<{ drops: number; overflows: number }> => {
  const [names, values] = (await Bun.file("/proc/net/netstat").text())
    .split("\n")
    .filter((line) => line.startsWith("TcpExt:"))
    .map((line) => line.split(" ").slice(1));
  const of = (name: string) => Number(values?.[names?.indexOf(name) ?? -1]);
  return { drops: of("ListenDrops"), overflows: of("ListenOverflows") };
};

/** What a burst sends on each of its connections, and its answer's first words once they are in (undefined until then). */
interface Ask {
  bytes: string | Uint8Array;
  read: (head: Buffer) => string | undefined;
}

/** A CONNECT to {@link BURST_TARGET}: its answer is the status line. */
const CONNECT_ASK: Ask = {
  bytes: `CONNECT ${BURST_TARGET} HTTP/1.1\r\nHost: ${BURST_TARGET}\r\n\r\n`,
  read: (head) => {
    const text = head.toString("latin1");
    return text.includes("\r\n") ? (text.split("\r\n")[0] ?? "") : undefined;
  },
};

/** A SOCKS5 greeting offering no authentication (RFC 1928 §3): its answer is the server's version and chosen method, two bytes. */
const SOCKS_ASK: Ask = {
  bytes: new Uint8Array([5, 1, 0]),
  read: (head) =>
    head.length >= 2 ? `SOCKS ${head[0]}, method ${head[1]}` : undefined,
};

/** One connection to `port` on loopback asking `ask`: when it opened, when it was answered, and the answer's first words. */
const askOnce = async (
  port: number,
  ask: Ask
): Promise<{ answer: string; answered: number; opened: number }> => {
  const started = performance.now();
  const { promise, resolve } = Promise.withResolvers<string>();
  let opened = -1;
  let head = Buffer.alloc(0);
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      open: () => {
        opened = performance.now() - started;
      },
      data: (_socket, data) => {
        head = Buffer.concat([head, Buffer.from(data)]);
        const answer = ask.read(head);
        if (answer !== undefined) {
          resolve(answer);
        }
      },
      close: () => resolve(ask.read(head) ?? "closed with no answer"),
      error: (_socket, error) => resolve(`error: ${error.message}`),
    },
  });
  opened = opened < 0 ? performance.now() - started : opened;
  socket.write(ask.bytes);
  const read = await readWithin(30_000, () => promise);
  const answered = performance.now() - started;
  socket.end();
  return {
    opened,
    answered,
    answer: read.kind === "answered" ? read.value : "no answer in 30 s",
  };
};

/** The listen address of the socat on `port` in this sandbox ({@link socatOn}). */
const socatListen = async (port: number): Promise<string | undefined> =>
  (await socatOn(port))?.match(SOCAT_LISTEN)?.[1];

/**
 * One burst of (i): {@link BURST} connections at once to `port`, each asking
 * `ask`. Each opens before a dropped SYN's retry would
 * ({@link SYN_RETRY_MS}), no listener of this network drops a handshake (the
 * bursts run one at a time, so the count is this burst's), and every answer
 * is one `wanted` takes.
 */
const burst = async (
  kit: Kit,
  what: string,
  port: number,
  ask: Ask,
  wanted: { says: string; takes: (answer: string) => boolean }
): Promise<void> => {
  const listen = await socatListen(port);
  const before = await listenDrops();
  const runs = await Promise.all(
    Array.from({ length: BURST }, () => askOnce(port, ask))
  );
  const after = await listenDrops();
  const opened = runs.map((one) => one.opened).sort((a, b) => a - b);
  const late = opened.filter((ms) => ms >= SYN_RETRY_MS).length;
  const answers = new Map<string, number>();
  for (const { answer } of runs) {
    answers.set(answer, (answers.get(answer) ?? 0) + 1);
  }
  const ok = runs.filter((one) => wanted.takes(one.answer)).length;
  const slowest = Math.max(...runs.map((one) => one.answered));
  kit.check(
    `(i) ${BURST} ${what} at once: each connection opens within ${SYN_RETRY_MS} ms, no listener of this network drops a handshake, ${wanted.says}`,
    late === 0 && ok === BURST && after.drops === before.drops,
    `its socat listens ${listen ?? "(no socat found on the port)"}; opened in ${Math.round(opened[0] ?? -1)} to ${Math.round(opened.at(-1) ?? -1)} ms, ${late} at ${SYN_RETRY_MS} ms or later; ${ok} of ${BURST} answered so (${JSON.stringify(Object.fromEntries(answers))}), the slowest answer at ${Math.round(slowest)} ms; this network's listeners dropped ${after.drops - before.drops} handshakes (${after.overflows - before.overflows} accept-queue overflows)`
  );
};

/**
 * (i) Bursts, as a package install or a page opens its connections: through
 * the environment's proxy (the relay, core `SOCAT_BACKLOG`), then to srt's
 * own bridges to its HTTP and SOCKS proxies, whose backlog srt sets
 * (`backlog=4096` from 0.0.81). srt's answers there are its own: a 407 to a
 * CONNECT without its token, a method to a SOCKS greeting. What is proved is
 * that the listener takes the whole burst at once.
 */
const burstLeg = async (kit: Kit, env: Env) => {
  const proxy = new URL(env.HTTPS_PROXY ?? "");
  await burst(
    kit,
    `CONNECTs through the environment's proxy ${proxy.host}`,
    Number(proxy.port),
    CONNECT_ASK,
    {
      says: "every one answered 200",
      takes: (answer) => answer.startsWith("HTTP/1.1 200"),
    }
  );
  await burst(
    kit,
    `CONNECTs to srt's own HTTP proxy bridge 127.0.0.1:${SRT_HTTP_PORT}`,
    SRT_HTTP_PORT,
    CONNECT_ASK,
    {
      says: "every one answered by srt (its 407 without the token)",
      takes: (answer) => answer.startsWith("HTTP/1.1 "),
    }
  );
  await burst(
    kit,
    `SOCKS5 greetings to srt's own SOCKS proxy bridge 127.0.0.1:${SRT_SOCKS_PORT}`,
    SRT_SOCKS_PORT,
    SOCKS_ASK,
    {
      says: "every one answered by srt with its method",
      takes: (answer) => answer.startsWith("SOCKS 5, "),
    }
  );
};

/** srt's credential from its proxy URL's userinfo, as a client that reads it presents it. */
const credentialOf = (srt: URL): string =>
  `${decodeURIComponent(srt.username)}:${decodeURIComponent(srt.password)}`;

/** {@link credentialOf} as a `Proxy-Authorization` value. */
const basicOf = (srt: URL): string =>
  `Basic ${Buffer.from(credentialOf(srt)).toString("base64")}`;

/** (g) A host srt refuses: the environment's proxy answers as srt does. */
const deniedLeg = async (kit: Kit, env: Env, srtUrl: URL | undefined) => {
  const proxy = new URL(env.HTTPS_PROXY ?? "");
  const connectTo = (authorization?: string) =>
    `CONNECT probe.localhost:443 HTTP/1.1\r\nHost: probe.localhost:443\r\n${authorization ? `Proxy-Authorization: ${authorization}\r\n` : ""}\r\n`;
  const through = await rawAnswer(Number(proxy.port), connectTo());
  const direct = srtUrl
    ? await rawAnswer(Number(srtUrl.port), connectTo(basicOf(srtUrl)))
    : undefined;
  kit.check(
    "(g) a host srt refuses (a loopback name): the environment's proxy answers its CONNECT with srt's own 403, as srt answers it directly",
    through.startsWith("HTTP/1.1 403") &&
      through.includes("blocked-by-allowlist") &&
      (direct === undefined || direct === through),
    JSON.stringify({ through, direct })
  );

  // A plain ws:// upgrade, absolute-form as a client sends it to a proxy:
  // passed to srt as a tunnel, and answered as srt answers it.
  const { host } = new URL(WSS_ECHO);
  const upgrade = (authorization?: string) =>
    `GET http://${host}/ HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${authorization ? `Proxy-Authorization: ${authorization}\r\n` : ""}\r\n`;
  const statusOf = (answer: string | undefined) =>
    answer === undefined ? undefined : (answer.split("\r\n")[0] ?? "");
  const upgraded = await rawAnswer(Number(proxy.port), upgrade());
  const upgradedDirect = srtUrl
    ? await rawAnswer(Number(srtUrl.port), upgrade(basicOf(srtUrl)))
    : undefined;
  kit.check(
    "(h) a plain ws:// upgrade through the environment's proxy is answered as srt answers it with its token directly (its status line; never a 407)",
    !statusOf(upgraded)?.includes(" 407") &&
      (upgradedDirect === undefined ||
        statusOf(upgradedDirect) === statusOf(upgraded)),
    JSON.stringify({
      upgraded: statusOf(upgraded),
      upgradedDirect: statusOf(upgradedDirect),
    })
  );
};

const run = async (kit: Kit) => {
  // A workspace's boundary on another platform has no srt proxy to read.
  if (!(process.platform === "linux" && process.env.SANDBOX_RUNTIME === "1")) {
    kit.check(
      "runs inside a Linux workspace's boundary, whose srt proxy it reads",
      false,
      `platform ${process.platform}, SANDBOX_RUNTIME ${process.env.SANDBOX_RUNTIME ?? "unset"}`
    );
    return;
  }
  const { env, srtUrl, stop } = await boundaryEnv(kit);
  try {
    kit.check(
      "the boundary's proxy URLs name the relay with no credential",
      [
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "ALL_PROXY",
        "https_proxy",
        "all_proxy",
      ].every((name) => env[name] === "http://127.0.0.1:3129") &&
        !existsSync(env[RELAY_SOCKET_ENV] ?? "/nonexistent"),
      JSON.stringify(
        Object.fromEntries(
          [
            "HTTPS_PROXY",
            "HTTP_PROXY",
            "ALL_PROXY",
            "https_proxy",
            "all_proxy",
            RELAY_SOCKET_ENV,
          ].map((name) => [name, env[name]])
        )
      )
    );
    await browseLeg(kit, env);
    await clientLegs(kit, env);
    await deniedLeg(kit, env, srtUrl);
    await burstLeg(kit, env);
  } finally {
    stop();
  }
};

const spec: Spec = {
  name: "boundary-proxy",
  workspace:
    "it reads the srt proxy and the tool door a Linux workspace's boundary gives a command",
  run,
};
export default spec;
