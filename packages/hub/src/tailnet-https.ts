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
 * - A listener on the tailnet address beside the wildcard one, both with
 *   SO_REUSEPORT (Bun's `reusePort`; the dashboard's systemd socket's
 *   `ReusePort=`): Linux gives a connection to the address-bound one
 *   (measured), so the tailnet addresses answer HTTPS alone. A peer's plain
 *   http to the tailnet IP is retired with it.
 *
 * Tailscale is the one VPN here whose client issues certificates for its
 * names. Another that does would answer {@link Reading} from its own CLI or
 * API: the listeners and the relay take a name, addresses and a pair, and
 * nothing of Tailscale's.
 */
import { hostname, userInfo } from "node:os";
import type {
  TailnetHttps,
  TailnetHttpsTodo,
  TailnetOrigin,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import {
  causeOf,
  type PreviewSocket,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import type { HubLifetimeShape } from "./lifetime";
import { firstLine, runTailscale } from "./tailscale-cli";

/** How often the hub reads Tailscale's state and certificate again, for a renewal or a change. Our choice. */
const CHECK_MS = 30_000;
/** How often while a step of the person's stands. Our choice: a step they just took ticks while they still look at it. */
const NEEDS_CHECK_MS = 5000;
/** How long one `tailscale` call may take: a first certificate is an ACME order. Our choice. */
const CALL_MS = 60_000;
const ACCESS_DENIED = /access denied/i;
const PEM_BLOCK = /-----BEGIN ([A-Z ]+)-----[\s\S]+?-----END \1-----/g;
const TRAILING_DOT = /\.$/;

/** `tailscale status --json`: ipnstate.Status, the parts read here. */
interface Status {
  BackendState?: string;
  CertDomains?: string[] | null;
  CurrentTailnet?: { MagicDNSEnabled?: boolean } | null;
  Self?: { DNSName?: string; TailscaleIPs?: string[] | null } | null;
  /** Whether tailscaled uses a TUN device; false under `--tun=userspace-networking`. */
  TUN?: boolean;
}

/** `tailscale debug prefs`: ipn.Prefs, the part read here. */
interface Prefs {
  OperatorUser?: string;
}

/** A certificate and its key, as Bun's `tls` takes them. */
interface Pair {
  cert: string;
  key: string;
}

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

/** A listener as this module holds it: one it can stop. */
interface Listening {
  stop: (closeActiveConnections?: boolean) => Promise<void>;
}

/** Opens one TLS listener on `hostname` for a port: the caller's own `Bun.serve`, with `tls` and `reusePort`. */
export type OpenSecure = (hostname: string, tls: Pair) => Listening;

/** A port's TLS listeners on the tailnet addresses, beside its plain one. */
interface Beside {
  open: OpenSecure;
  port: number;
  servers: Listening[];
}

/** `server` stopped: at once with its connections (`now`), or once they finish. */
const stopped = (server: Listening, now: boolean): void =>
  detach(server.stop(now), "tailnet listener stop");

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

/** Whether a bind failed because another listener holds the address and port. */
const held = (thrown: unknown): boolean =>
  (thrown as { code?: unknown }).code === "EADDRINUSE";

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
  /** What the listeners serve with now, while serving. */
  let live: { name: string; ips: string[]; pair: Pair } | null = null;
  const besides = new Set<Beside>();
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
          why: `tailscale status didn't answer within ${Math.round(asked.after / 1000)} s`,
        },
      };
    }
    const ran = asked.value;
    // No CLI, or no daemon behind it ("failed to connect to local tailscaled"): no Tailscale here.
    if (ran.missing || ran.code !== 0) {
      return { reading: { state: "absent" } };
    }
    try {
      return { status: JSON.parse(ran.stdout) as Status };
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
      const prefs = JSON.parse(asked.value.stdout) as Prefs;
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
        why: `tailscale cert ${name} didn't answer within ${Math.round(asked.after / 1000)} s`,
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
   * `beside`'s TLS listeners on every tailnet address, with `pair`; the ones
   * opened so far stop when one is refused, and the refusal is thrown. An
   * address this machine can't bind at all (an IPv6 one with IPv6 off) is
   * left out with a line.
   */
  const openOn = (beside: Beside, ips: string[], pair: Pair): Listening[] => {
    const opened: Listening[] = [];
    for (const ip of ips) {
      try {
        opened.push(beside.open(ip, pair));
      } catch (thrown) {
        if (held(thrown)) {
          for (const server of opened) {
            stopped(server, true);
          }
          throw thrown;
        }
        console.warn(
          `[tailnet] port ${beside.port} didn't open for HTTPS on ${ip}: ${causeOf(thrown)}`
        );
      }
    }
    return opened;
  };

  /** Every TLS listener stopped: nothing serves HTTPS on the tailnet addresses. */
  const closeAll = (): void => {
    for (const beside of besides) {
      for (const server of beside.servers) {
        stopped(server, true);
      }
      beside.servers = [];
    }
    live = null;
  };

  /**
   * Every port's TLS listeners on `at`: each new one opens beside the one it
   * replaces before that one stops taking connections, so a renewal drops
   * nothing. The dashboard's refused, nothing serves and the port is the
   * person's step; a preview port's refused, that preview keeps its plain
   * listener alone, said in a line.
   */
  const serve = (at: Extract<Reading, { state: "ready" }>): Reading => {
    for (const beside of besides) {
      let opened: Listening[];
      try {
        opened = openOn(beside, at.ips, at.pair);
      } catch (thrown) {
        if (beside.port === dashboardPort) {
          closeAll();
          return {
            state: "needs",
            steps: [
              ...at.steps,
              { step: "port", done: false, command: "cawco service install" },
            ],
            name: at.name,
          };
        }
        console.warn(
          `[tailnet] preview port ${beside.port} serves no HTTPS: ${causeOf(thrown)}`
        );
        opened = [];
      }
      const replaced = beside.servers;
      beside.servers = opened;
      for (const server of replaced) {
        stopped(server, false);
      }
    }
    live = { name: at.name, ips: at.ips, pair: at.pair };
    return at;
  };

  /** Whether `at` serves with what the listeners hold now. */
  const same = (at: { name: string; ips: string[]; pair: Pair }): boolean =>
    live !== null &&
    live.name === at.name &&
    live.ips.join() === at.ips.join() &&
    live.pair.cert === at.pair.cert &&
    live.pair.key === at.pair.key;

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
      default:
        return state;
    }
  };

  const check = async (): Promise<void> => {
    let reading = await read();
    if (reading.state === "unread") {
      console.warn(`[tailnet] ${reading.why}`);
      return;
    }
    if (reading.state === "ready") {
      if (!same(reading)) {
        reading = serve(reading);
      }
    } else if (live) {
      closeAll();
    }
    const next = stateOf(reading);
    if (JSON.stringify(next) === JSON.stringify(state)) {
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
     * `port`'s TLS listeners on the tailnet addresses, opened by `open`
     * now while serving and whenever serving starts or renews; `close`
     * stops them with the plain listener they stand beside.
     */
    beside(port: number, open: OpenSecure): { close: () => void } {
      const beside: Beside = { port, open, servers: [] };
      besides.add(beside);
      if (live) {
        try {
          beside.servers = openOn(beside, live.ips, live.pair);
        } catch (thrown) {
          console.warn(
            `[tailnet] port ${port} serves no HTTPS: ${causeOf(thrown)}`
          );
        }
      }
      return {
        close(): void {
          for (const server of beside.servers) {
            stopped(server, true);
          }
          besides.delete(beside);
        },
      };
    },
  };
};

export type TailnetHttpsService = ReturnType<typeof createTailnetHttps>;

const RELAY_HOP = "tailnet dashboard relay";
/** What a browser or a proxy before it says of where it came from: the relay says it instead. */
const FORWARDED_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
];

/**
 * The dashboard on its tailnet name: every request and socket on to the
 * dashboard's own server on loopback, saying it came over HTTPS at the Host
 * the browser named (`X-Forwarded-Proto`, `X-Forwarded-Host`), which is the
 * origin the dashboard's server reads (apps/dashboard public-origin.js) for
 * its gate, its CSRF check and the page origin it tells the hub. Answers go
 * back as they came, compressed or not.
 */
export const dashboardRelay =
  (port: number): OpenSecure =>
  (address, tls) =>
    Bun.serve<PreviewSocket>({
      hostname: address,
      port,
      tls,
      reusePort: true,
      websocket: previewWebSocket,
      async fetch(request, server) {
        const url = new URL(request.url);
        const headers = proxyHeaders(request.headers);
        for (const name of FORWARDED_HEADERS) {
          headers.delete(name);
        }
        headers.set("x-forwarded-proto", "https");
        headers.set(
          "x-forwarded-host",
          request.headers.get("host") ?? url.host
        );
        const upstream = `127.0.0.1:${port}${url.pathname}${url.search}`;
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          return upgradePreview(request, server, `ws://${upstream}`, headers, {
            hop: RELAY_HOP,
            instanceId: "dashboard",
          })
            ? undefined
            : new Response("WebSocket upgrade failed", { status: 400 });
        }
        try {
          const answer = await fetch(`http://${upstream}`, {
            method: request.method,
            headers,
            body: request.body,
            redirect: "manual",
            decompress: false,
          });
          return new Response(answer.body, {
            status: answer.status,
            statusText: answer.statusText,
            headers: answer.headers,
          });
        } catch (error) {
          return new Response(
            `The dashboard on port ${port} didn't answer: ${causeOf(error)}`,
            { status: 502 }
          );
        }
      },
    });
