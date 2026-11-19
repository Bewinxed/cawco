/**
 * HTTPS on the hub machine's tailnet name (core tailnet-https.ts): while the
 * machine is on a tailnet with HTTPS certificates, the dashboard's port and
 * every preview port answer `https://<name>:<port>` on its tailnet addresses,
 * and every other interface (the LAN address, `cawco.local`, loopback) keeps
 * answering plain http on the same ports. Where something stands in the way,
 * every step on the path is the state, each done or not, and the dashboard's
 * onboarding row lists them; the hub checks again every {@link NEEDS_CHECK_MS}
 * on its own while one stands, so each ticks as the person takes it.
 *
 * The hub serves TLS itself, with Tailscale's certificate, rather than
 * proxying through `tailscale serve`:
 * - Serve binds a kernel listener on (tailnet address, port) for each served
 *   port, "purely for connections from the machine itself", and retries it
 *   with backoff (ipn/ipnlocal/serve.go `localListener`). Linux refuses that
 *   bind beside the hub's `0.0.0.0` one, in either order (measured), so
 *   whichever binds second loses: the dashboard's socket would leave the
 *   machine's own https requests unanswered, and a preview listener opening
 *   after tailscaled took its port would fail.
 * - `tailscale cert --cert-file - --key-file - <name>` prints the pair
 *   (cmd/tailscale/cli/cert.go: 'output cert file or "-" for stdout').
 *   tailscaled answers it from its cache and starts a renewal in the
 *   background when ARI says one is due (feature/acme/cert.go "starting
 *   async renewal"), so asking again is the renewal: a new pair rebinds.
 * - A door on each tailnet address beside the wildcard listener, both with
 *   SO_REUSEPORT (Bun's `reusePort`; the dashboard's systemd socket's
 *   `ReusePort=`): Linux gives a connection to the address-bound one
 *   (measured), so the tailnet addresses answer HTTPS alone. The door
 *   (tailnet-door.ts) carries a TLS connection to the port's TLS listener on
 *   loopback and answers plain http with a 308 to the same path on the name,
 *   so a peer that types `http://<name>:<port>` (a browser upgrades no
 *   non-default port) or `http://<tailnet IP>:<port>` lands on HTTPS.
 *
 * Tailscale is the one VPN here whose client issues certificates for its
 * names. Another that does would answer {@link Reading} from its own CLI or
 * API: the listeners and the relay take a name, addresses and a pair, and
 * nothing of Tailscale's.
 */
import { hostname, userInfo } from "node:os";
import { detach } from "@cawco/core/detach";
import type {
  TailnetHttps,
  TailnetHttpsTodo,
  TailnetOrigin,
} from "@cawco/core/tailnet-https";
import { secondsOf } from "@cawco/core/time";
import {
  causeOf,
  forwardRequest,
  heldWhileServed,
  type PreviewSocket,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/preview/proxy";
import { problemResponse } from "elysia/error";
import { z } from "zod";
import type { HubLifetimeShape } from "./lifetime";
import {
  createTailnetDoors,
  type OpenSecure,
  type Pair,
  type TailnetLive,
} from "./tailnet-doors";
import { firstLine, runTailscale } from "./tailscale-cli";

/** How often the hub reads Tailscale's state and certificate again, for a renewal or a change. Our choice. */
const CHECK_MS = 30_000;
/** How often while a step of the person's stands. Our choice: a step they just took ticks while they still look at it. */
const NEEDS_CHECK_MS = 5000;
/** How long one `tailscale` call may take: a first certificate is an ACME order. Our choice. */
const CALL_MS = 60_000;
const ACCESS_DENIED = /access denied/iu;
const PEM_BLOCK = /-----BEGIN ([A-Z ]+)-----[\s\S]+?-----END \1-----/gu;
const TRAILING_DOT = /\.$/u;

/** `tailscale status --json`: ipnstate.Status, the parts read here. */
const StatusSchema = z.object({
  BackendState: z.string().optional(),
  CertDomains: z.array(z.string()).nullish(),
  CurrentTailnet: z
    .object({ MagicDNSEnabled: z.boolean().optional() })
    .nullish(),
  Self: z
    .object({
      DNSName: z.string().optional(),
      TailscaleIPs: z.array(z.string()).nullish(),
    })
    .nullish(),
  /** Whether tailscaled uses a TUN device; false under `--tun=userspace-networking`. */
  TUN: z.boolean().optional(),
});
type Status = z.infer<typeof StatusSchema>;

/** `tailscale debug prefs`: ipn.Prefs, the part read here. */
const PrefsSchema = z.object({ OperatorUser: z.string().optional() });

/** What one reading found: the state, and while it can serve, what it serves with. */
type Reading =
  | { state: "absent" | "signed-out" }
  | { state: "needs"; steps: TailnetHttpsTodo[]; name?: string }
  | {
      state: "ready";
      name: string;
      ips: string[];
      pair: Pair;
      steps: TailnetHttpsTodo[];
    }
  /** It couldn't be read this time (a timeout, a refused order): what stood goes on. */
  | { state: "unread"; why: string };

/** What the person's machine is, by its sign-in. */
const user = userInfo().username;
const host = hostname();

/** The operator right, not yet given: its command, with this process's user. */
const operatorStep: TailnetHttpsTodo = {
  step: "operator",
  done: false,
  command: `sudo tailscale set --operator=${user}`,
};

/** A pair from `tailscale cert`'s stdout: its key, and every certificate of the chain in order. */
const pairOf = (stdout: string): Pair | null => {
  const blocks = [...stdout.matchAll(PEM_BLOCK)];
  const key = blocks.find(([, label]) => label?.endsWith("PRIVATE KEY"))?.[0];
  const cert = blocks
    .filter(([, label]) => label === "CERTIFICATE")
    .map(([block]) => block)
    .join("\n");
  return key && cert ? { cert: `${cert}\n`, key: `${key}\n` } : null;
};

export interface TailnetHttpsDeps {
  /** The CLI's path; `tailscale` on PATH unless named (funnel.ts's own). */
  readonly bin?: string;
  /** The dashboard's port: its TLS listener relays to the dashboard there on loopback. */
  dashboardPort: number;
  /** The hub's lifetime: the next check runs on it. */
  lifetime: HubLifetimeShape;
}

export const createTailnetHttps = ({
  bin = "tailscale",
  dashboardPort,
  lifetime,
}: TailnetHttpsDeps) => {
  const run = (args: string[]) => runTailscale(bin, args, CALL_MS);
  let state: TailnetHttps = { state: "absent", host };
  /** The dashboard's port's HTTPS (tailnet-doors.ts); the preview ports' are the preview server's, handed {@link TailnetLive} on each change. */
  const doors = createTailnetDoors();
  const listeners: ((state: TailnetHttps) => void)[] = [];

  /** `tailscale status --json`, read. */
  const readStatus = async (): Promise<
    { status: Status } | { reading: Reading }
  > => {
    const asked = await run(["status", "--json"]);
    if (asked.kind === "unanswered") {
      return {
        reading: {
          state: "unread",
          why: `tailscale status didn't answer within ${secondsOf(asked.after)} s`,
        },
      };
    }
    const ran = asked.value;
    // No CLI, or no daemon behind it ("failed to connect to local tailscaled"): no Tailscale here.
    if (ran.missing || ran.code !== 0) {
      return { reading: { state: "absent" } };
    }
    try {
      return { status: StatusSchema.parse(JSON.parse(ran.stdout)) };
    } catch {
      return {
        reading: {
          state: "unread",
          why: `tailscale status wasn't JSON: ${firstLine(ran.stdout)}`,
        },
      };
    }
  };

  /**
   * Whether this process may take Tailscale's certificate, as far as it can
   * be read before the tailnet issues one: on Linux, tailscaled lets root,
   * its own user and its operator write, and `cert` needs write
   * (ipn/ipnauth.go `IsReadonlyConn`, ipn/localapi/cert.go "cert access
   * denied"), and any user may read its prefs. A daemon running as this user
   * runs in userspace networking, the `userspace` step. Elsewhere (macOS
   * also lets its admin group write) only `tailscale cert` itself says.
   */
  const operatorTodo = async (): Promise<TailnetHttpsTodo | null> => {
    if (process.platform !== "linux" || process.getuid?.() === 0) {
      return null;
    }
    const asked = await run(["debug", "prefs"]);
    if (asked.kind === "unanswered" || asked.value.code !== 0) {
      return null;
    }
    try {
      const prefs = PrefsSchema.parse(JSON.parse(asked.value.stdout));
      return prefs.OperatorUser === user
        ? { step: "operator", done: true }
        : operatorStep;
    } catch {
      return null;
    }
  };

  /** Every step that applies to this machine, done or not, in the order to take them. */
  const stepsOf = async (
    { CertDomains, CurrentTailnet, TUN }: Status,
    name: string | undefined
  ): Promise<TailnetHttpsTodo[]> => {
    const steps: TailnetHttpsTodo[] = [];
    if (TUN === false) {
      steps.push({ step: "userspace", done: false });
    }
    // MagicDNS, then HTTPS Certificates: both on the admin console's DNS page.
    steps.push({
      step:
        CurrentTailnet?.MagicDNSEnabled === false || !name
          ? "enable-magicdns"
          : "enable-https",
      done: Boolean(name && CertDomains?.includes(name)),
    });
    const operator = await operatorTodo();
    if (operator) {
      steps.push(operator);
    }
    return steps;
  };

  /** One reading of Tailscale on this machine: its state, every step, then its certificate. */
  const read = async (): Promise<Reading> => {
    const status = await readStatus();
    if ("reading" in status) {
      return status.reading;
    }
    if (status.status.BackendState !== "Running") {
      return { state: "signed-out" };
    }
    const name =
      status.status.Self?.DNSName?.replace(TRAILING_DOT, "") || undefined;
    const steps = await stepsOf(status.status, name);
    if (!name || steps.some((todo) => !todo.done)) {
      return { state: "needs", steps, name };
    }
    return certOf(name, status.status.Self?.TailscaleIPs ?? [], steps);
  };

  /** The certificate for `name`, once every step is done: served with, or why not. */
  const certOf = async (
    name: string,
    ips: string[],
    steps: TailnetHttpsTodo[]
  ): Promise<Reading> => {
    const asked = await run([
      "cert",
      "--cert-file",
      "-",
      "--key-file",
      "-",
      name,
    ]);
    if (asked.kind === "unanswered") {
      return {
        state: "unread",
        why: `tailscale cert ${name} didn't answer within ${secondsOf(asked.after)} s`,
      };
    }
    const pair = asked.value.code === 0 ? pairOf(asked.value.stdout) : null;
    if (pair) {
      return { state: "ready", name, ips, pair, steps };
    }
    if (!ACCESS_DENIED.test(asked.value.output)) {
      return {
        state: "unread",
        why: `tailscale cert ${name} gave no certificate: ${firstLine(asked.value.output)}`,
      };
    }
    // Refused for want of the operator right, where the prefs couldn't say so.
    return {
      state: "needs",
      steps: [
        ...steps.filter((todo) => todo.step !== "operator"),
        operatorStep,
      ],
      name,
    };
  };

  /**
   * The dashboard's HTTPS on `at` (tailnet-doors.ts `serve`). Its port
   * refused, nothing serves and the port is the person's step.
   */
  const serve = (at: Extract<Reading, { state: "ready" }>): Reading => {
    if (doors.serve(at).includes(dashboardPort)) {
      doors.close();
      return {
        state: "needs",
        steps: [
          ...at.steps,
          { step: "port", done: false, command: "cawco service install" },
        ],
        name: at.name,
      };
    }
    return at;
  };

  /** The wire state a reading stands for, `unread` keeping what stood. */
  const stateOf = (reading: Reading): TailnetHttps => {
    switch (reading.state) {
      case "absent":
      case "signed-out":
        return { state: reading.state, host };
      case "needs": {
        // The first step that stands, as `step` and `command` (what an app
        // that reads one step at a time shows), and every step as `steps`.
        const first = reading.steps.find((todo) => !todo.done);
        return {
          state: "needs",
          host,
          ...(reading.name ? { name: reading.name } : {}),
          ...(first ? { step: first.step } : {}),
          ...(first?.command ? { command: first.command } : {}),
          ...(reading.steps.some((todo) => todo.step === "port")
            ? { port: dashboardPort }
            : {}),
          steps: reading.steps,
        };
      }
      case "ready":
        return {
          state: "serving",
          host,
          name: reading.name,
          dashboard: `https://${reading.name}:${dashboardPort}`,
        };
      case "unread":
        break;
    }
    return state;
  };

  const check = async (): Promise<void> => {
    let reading = await read();
    if (reading.state === "unread") {
      console.warn(`[tailnet] ${reading.why}`);
      return;
    }
    if (reading.state === "ready") {
      if (!doors.same(reading)) {
        reading = serve(reading);
      }
    } else if (doors.live()) {
      doors.close();
    }
    const next = stateOf(reading);
    if (Bun.deepEquals(next, state)) {
      return;
    }
    state = next;
    console.log(
      `[tailnet] HTTPS on ${next.name ?? host}: ${next.state}${next.step ? ` (${next.step})` : ""}`
    );
    for (const listener of listeners) {
      listener(state);
    }
  };

  /** One check at a time: a slow certificate order never overlaps the next. */
  let checking: Promise<void> | null = null;
  const checkOnce = (): Promise<void> => {
    checking ??= check().finally(() => {
      checking = null;
    });
    return checking;
  };

  return {
    /** Reads Tailscale now, then every {@link NEEDS_CHECK_MS} while a step stands, else every {@link CHECK_MS}. */
    start(): void {
      const tick = (): void => {
        detach(
          checkOnce().finally(() => {
            lifetime.after(
              "tailnet https check",
              state.state === "needs" ? NEEDS_CHECK_MS : CHECK_MS,
              tick
            );
          }),
          "tailnet check"
        );
      };
      tick();
    },

    /** Where it stands now, as `GET /api/tailnet-https` answers. */
    state: (): TailnetHttps => state,

    /** Hears every change of state. */
    onChange(listener: (state: TailnetHttps) => void): void {
      listeners.push(listener);
    },

    /** The dashboard's https address while serving, else null. */
    dashboard: (): string | null => state.dashboard ?? null,

    /** A preview port's origin on the tailnet name while serving. */
    origin(port: number): TailnetOrigin | undefined {
      const live = doors.live();
      if (!live || state.state !== "serving") {
        return;
      }
      const short = live.name.split(".")[0] ?? live.name;
      return {
        origin: `https://${live.name}:${port}`,
        hosts: [...live.ips, live.name, short].map((one) => one.toLowerCase()),
      };
    },

    /**
     * The name and addresses HTTPS is served on now, as the register and
     * every beat hand them to each agent (agent hub-loopback.ts): null
     * while it isn't.
     */
    serving(): { name: string; ips: string[] } | null {
      const live = doors.live();
      return live && state.state === "serving"
        ? { name: live.name, ips: live.ips }
        : null;
    },

    /** The name, addresses and certificate HTTPS is served with now, for the preview server's ports; null while it isn't. */
    live(): TailnetLive | null {
      return state.state === "serving" ? doors.live() : null;
    },

    /** `port`'s HTTPS on the tailnet addresses (tailnet-doors.ts `beside`). */
    beside: doors.beside,
  };
};

export type TailnetHttpsService = ReturnType<typeof createTailnetHttps>;

const RELAY_HOP = "tailnet dashboard relay";
/** What a client says of where it came from that the relay doesn't carry on: it says its hop in `X-Forwarded-*` alone. */
const UNCARRIED_HEADERS = ["forwarded", "x-forwarded-for"];
const LIST_SEPARATOR = /\s*,\s*/u;

/** `headers`' first hop of `name`, as public-origin.js reads it. */
const firstHop = (headers: Headers, name: string): string | undefined =>
  headers.get(name)?.split(LIST_SEPARATOR)[0]?.trim() || undefined;

/**
 * Where the browser reached `request`: the first hop's scheme and host when
 * a hop before this listener named them (the agent's loopback relay names
 * `http://localhost:<port>`, agent hub-loopback.ts), else this TLS
 * listener's own, `https://` at the Host the browser named.
 */
const reachedOf = (request: Request): string => {
  const proto = firstHop(request.headers, "x-forwarded-proto")?.toLowerCase();
  const said = firstHop(request.headers, "x-forwarded-host");
  const before = `${proto}://${said}`;
  return (proto === "http" || proto === "https") && said && URL.canParse(before)
    ? before
    : `https://${request.headers.get("host") ?? new URL(request.url).host}`;
};

/**
 * A preview port's request on its TLS listener as the browser reached it:
 * at the first hop's scheme and host ({@link reachedOf}), so a page served
 * through the agent's relay reads its origin as `http://localhost:<port>`,
 * the origin its embeds' frame ancestors and addresses name (hub preview.ts
 * `pageOrigin`, `embedAt`). An upgrade goes on as it came: Bun upgrades only
 * the request it handed over (measured: a rebuilt one answers "Expected 101
 * status code: 400"), and a socket's route reads no scheme.
 */
export const asReached = (request: Request): Request => {
  const reached = reachedOf(request);
  const url = new URL(request.url);
  if (
    request.headers.get("upgrade") ||
    `${url.protocol}//${url.host}` === reached
  ) {
    return request;
  }
  return new Request(`${reached}${url.pathname}${url.search}`, request);
};

/**
 * The dashboard on its tailnet name: every request and socket on to the
 * dashboard's own server on loopback, saying this hop came over HTTPS at the
 * Host the browser named (`X-Forwarded-Proto`, `X-Forwarded-Host`) after any
 * hop before it, whose first the dashboard's server reads as its origin
 * (apps/dashboard public-origin.js) for its gate, its CSRF check and the
 * page origin it tells the hub: a browser on the name is `https://<name>`,
 * one on the agent's relay `http://localhost:<port>`, as each page's Origin
 * says. Answers go back as they came, compressed or not, each chunk as it
 * is written.
 *
 * It speaks HTTP/2 to a browser that offers it (ALPN), as a preview's HTTPS
 * does (preview.ts says how): a cold page asks for its stylesheets, modules
 * and reads at once, and over HTTP/1.1 a browser takes six connections to
 * an origin, so each round trip served six. One HTTP/2 connection carries
 * them all at once. "With `tls`, Bun picks the protocol per connection using
 * ALPN. Clients that offer `h2` (browsers, `curl`, `node:http2`) get
 * HTTP/2. Everyone else gets HTTP/1.1" (bun.com/docs/runtime/http/server).
 * The socket stays HTTP/1.1: "`server.upgrade()` only works on HTTP/1.1
 * requests", and Bun offers no extended CONNECT (its SETTINGS say
 * `enableConnectProtocol: false`, read with node:http2 on Bun 1.4.4), so a
 * browser opens its WebSocket on an HTTP/1.1 connection of its own (RFC
 * 8441 §3).
 */
export const dashboardRelay =
  (port: number): OpenSecure =>
  (at) =>
    Bun.serve<PreviewSocket>({
      ...at,
      http2: true,
      websocket: previewWebSocket,
      async fetch(request, server) {
        // As long as the dashboard takes: its own limits stand behind this hop.
        heldWhileServed(server, request);
        const url = new URL(request.url);
        const headers = proxyHeaders(request.headers);
        for (const name of UNCARRIED_HEADERS) {
          headers.delete(name);
        }
        const hop = (name: string, value: string): void => {
          const before = request.headers.get(name);
          headers.set(name, before ? `${before}, ${value}` : value);
        };
        hop("x-forwarded-proto", "https");
        hop("x-forwarded-host", request.headers.get("host") ?? url.host);
        const upstream = `127.0.0.1:${port}${url.pathname}${url.search}`;
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          return upgradePreview(request, server, `ws://${upstream}`, headers, {
            hop: RELAY_HOP,
            instanceId: "dashboard",
          })
            ? undefined
            : problemResponse({
                status: 400,
                code: "websocket-upgrade-failed",
                detail: "WebSocket upgrade failed",
              });
        }
        try {
          const answer = await forwardRequest(
            `http://${upstream}`,
            request,
            headers
          );
          return new Response(answer.body, {
            status: answer.status,
            statusText: answer.statusText,
            headers: answer.headers,
          });
        } catch (error) {
          return problemResponse({
            status: 502,
            code: "dashboard-port-didnt-answer",
            detail: `The dashboard on port ${port} didn't answer: ${causeOf(error)}`,
          });
        }
      },
    });
