/**
 * Tailscale Funnel, as the relay uses it (Projects spec §5.5 Relay): one
 * public mount, `/hooks/`, on the hub host's own Funnel port, proxied to the
 * relay's receiver on 127.0.0.1. Everything this module knows about the
 * `tailscale` CLI stays here; relay.ts asks for a state and gets one of
 * three: live (with the public base URL), needs-owner (the one step only the
 * owner can take, in words they can act on), or wanted (why it can't be
 * applied now; the relay tries again).
 *
 * Facts it rests on (tailscale.com/docs/reference/tailscale-cli/funnel and
 * tailscale.com/docs/features/tailscale-funnel, Tailscale 1.98):
 * - `--bg` "runs persistently in the background until you turn it off …
 *   Funnel will automatically resume sharing" after a reboot.
 * - "For Funnel, you must use one of the allowed ports: 443, 8443, or
 *   10000": the relay takes 10000, its own.
 * - "The same port number cannot be used for Serve … and Funnel … at the
 *   same time … If the most recent command to configure the port was funnel,
 *   then the port will be completely public." So a port already served
 *   privately is refused, never funnelled over.
 * - `tailscale funnel --https=443 --set-path=/foo off` removes one mount.
 * - A mount's handlers are a map keyed by mount point: `SetWebHandler` does
 *   `mak.Set(&webCfg.Handlers, mount, handler)` (ipn/serve.go), so applying
 *   `/hooks/` again with the receiver's new port replaces the old target in
 *   place; it never adds a second mount beside it.
 * - The CLI trims the mount from the path before proxying ("Trim the mount
 *   point from the URL path before proxying. (#6571)", ipn/ipnlocal/serve.go
 *   v1.98.10), so the target carries `/hooks` back on and the receiver sees
 *   `/hooks/<id>`.
 * - A node without the Funnel attribute is sent through "a web interface
 *   that prompts you to approve enabling Funnel": the CLI prints that URL
 *   and waits (cmd/tailscale/cli/serve_legacy.go `enableFeatureInteractive`),
 *   so the apply runs under a timeout and the URL becomes the owner's step.
 * - A non-root user without operator rights gets "Access denied … To not
 *   require root, use 'sudo tailscale set --operator=$USER' once"
 *   (cmd/tailscale/cli/cli.go). The hub never runs sudo; the owner does,
 *   once.
 */
import { hostname, userInfo } from "node:os";
import { type Bounded, readWithin } from "@cawco/core/bounded";

/** The Funnel port the relay owns: one of the three Funnel allows, and nothing else of the hub's. */
export const FUNNEL_PORT = 10_000;
/** The one public mount. */
export const FUNNEL_MOUNT = "/hooks/";
/** How long one `tailscale` call may take: the first apply waits on the owner's approval page. Our choice. */
const CALL_MS = 20_000;
const URL_IN_OUTPUT = /https:\/\/\S+/;
const ACCESS_DENIED = /access denied/i;
const AGAIN = "the relay applies itself within a minute after.";

/** What Funnel is, for the relay. */
export type FunnelState =
  | { base: string; state: "live" }
  | { state: "needs-owner"; step: string }
  | { reason: string; state: "wanted" };

/** `tailscale funnel status --json`: Tailscale's ServeConfig (ipn/serve.go), the parts read here. */
interface ServeConfig {
  AllowFunnel?: Record<string, boolean>;
  TCP?: Record<string, unknown>;
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
}

/** What a state says, in a sentence. */
export const wordsOf = (state: FunnelState): string => {
  switch (state.state) {
    case "live":
      return `Funnel is live at ${state.base}`;
    case "needs-owner":
      return state.step;
    case "wanted":
      break;
  }
  return state.reason;
};

interface Ran {
  code: number | null;
  missing?: true;
  output: string;
  stdout: string;
}

/** What a call printed so far, kept as it comes. */
interface Heard {
  stderr: string;
  stdout: string;
}

const firstLine = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 300) ?? "no output";

export interface FunnelDeps {
  /** The CLI's path; `tailscale` on PATH unless named. */
  readonly bin?: string;
}

export const createFunnel = ({ bin = "tailscale" }: FunnelDeps = {}) => {
  const host = hostname();
  const user = userInfo().username;

  /**
   * One `tailscale` call within {@link CALL_MS}. What it printed is kept in
   * `heard` as it comes, so a call let go unanswered still says what it
   * printed (the approval URL it waits on).
   */
  const run = (
    args: string[],
    heard: Heard = { stdout: "", stderr: "" }
  ): Promise<Bounded<Ran>> =>
    readWithin(CALL_MS, async (signal) => {
      let child: Bun.Subprocess<"ignore", "pipe", "pipe">;
      try {
        child = Bun.spawn([bin, ...args], {
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          signal,
        });
      } catch {
        return { code: null, missing: true, output: "", stdout: "" };
      }
      const keep = async (
        stream: ReadableStream<Uint8Array>,
        into: keyof Heard
      ) => {
        const decoder = new TextDecoder();
        for await (const chunk of stream) {
          heard[into] += decoder.decode(chunk, { stream: true });
        }
      };
      const [, , code] = await Promise.all([
        keep(child.stdout, "stdout"),
        keep(child.stderr, "stderr"),
        child.exited,
      ]);
      return {
        code,
        output: `${heard.stdout}\n${heard.stderr}`,
        stdout: heard.stdout,
      };
    });

  /** "<what> did not answer within N s." */
  const noAnswer = (what: string, after: number): string =>
    `${what} did not answer within ${Math.round(after / 1000)} s`;

  const notInstalled = (): FunnelState => ({
    state: "needs-owner",
    step: `Tailscale isn't installed on ${host}, where the hub runs. Install it (tailscale.com/download) and sign it in to your tailnet; ${AGAIN}`,
  });

  /** The ServeConfig as the CLI answers it; a state when it can't be read. */
  const status = async (): Promise<ServeConfig | FunnelState> => {
    const asked = await run(["funnel", "status", "--json"]);
    switch (asked.kind) {
      case "answered":
        break;
      case "unanswered":
        return {
          state: "wanted",
          reason: `${noAnswer(`Tailscale on ${host}`, asked.after)} with its Funnel status`,
        };
      default: {
        const unhandled: never = asked;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const ran = asked.value;
    if (ran.missing) {
      return notInstalled();
    }
    if (ran.code !== 0) {
      return {
        state: "wanted",
        reason: `Tailscale on ${host} didn't answer its Funnel status: ${firstLine(ran.output)}`,
      };
    }
    try {
      return (JSON.parse(ran.stdout) as ServeConfig | null) ?? {};
    } catch {
      return {
        state: "wanted",
        reason: `Tailscale's Funnel status on ${host} wasn't JSON: ${firstLine(ran.stdout)}`,
      };
    }
  };

  const isState = (value: ServeConfig | FunnelState): value is FunnelState =>
    "state" in value;

  /** The `host:10000` key a config serves the port under, when it does. */
  const servedAt = (config: ServeConfig): string | undefined =>
    Object.keys({ ...config.Web, ...config.AllowFunnel }).find((key) =>
      key.endsWith(`:${FUNNEL_PORT}`)
    );

  const target = (port: number) => `http://127.0.0.1:${port}/hooks`;

  /** The public base, when the config has the relay's mount funnelled to `port`. */
  const liveBase = (config: ServeConfig, port: number): string | undefined => {
    const at = servedAt(config);
    const proxy = at
      ? config.Web?.[at]?.Handlers?.[FUNNEL_MOUNT]?.Proxy
      : undefined;
    return at && config.AllowFunnel?.[at] === true && proxy === target(port)
      ? `https://${at}${FUNNEL_MOUNT}`
      : undefined;
  };

  /** Whether the port is served privately: Funnel on it would make all of it public. */
  const servedPrivately = (config: ServeConfig): boolean => {
    const at = servedAt(config);
    const tcp = config.TCP?.[String(FUNNEL_PORT)] !== undefined;
    return (tcp || at !== undefined) && !(at && config.AllowFunnel?.[at]);
  };

  /** Why an apply that did not take hold didn't, from what the CLI said. */
  const refusalOf = (ran: Ran): FunnelState => {
    if (ACCESS_DENIED.test(ran.output)) {
      return {
        state: "needs-owner",
        step: `Tailscale lets only root change Funnel on ${host}. Run this there once: sudo tailscale set --operator=${user}. Then ${AGAIN}`,
      };
    }
    const url = URL_IN_OUTPUT.exec(ran.stdout)?.[0];
    if (url) {
      return {
        state: "needs-owner",
        step: `Funnel isn't enabled for ${host} on your tailnet yet. Open ${url} and approve it; ${AGAIN}`,
      };
    }
    return {
      state: "wanted",
      reason: `tailscale funnel on ${host} did not apply: ${firstLine(ran.output)}`,
    };
  };

  return {
    host,

    /**
     * Makes `/hooks/` on port 10000 public, proxied to the receiver on
     * `port`, unless it already is; a mount left pointing at another port
     * (the receiver's port before a hub restart) is re-pointed in place.
     * Answers what Funnel then is, read back from its status. A port served
     * privately is refused.
     */
    async apply(port: number): Promise<FunnelState> {
      const before = await status();
      if (isState(before)) {
        return before;
      }
      const base = liveBase(before, port);
      if (base) {
        return { state: "live", base };
      }
      if (servedPrivately(before)) {
        return {
          state: "needs-owner",
          step: `Port ${FUNNEL_PORT} on ${host} is served privately with Tailscale Serve, and Funnel on that port would make all of it public, so the relay won't apply. Move that Serve off port ${FUNNEL_PORT} (tailscale serve --https=${FUNNEL_PORT} off); ${AGAIN}`,
        };
      }
      const heard: Heard = { stdout: "", stderr: "" };
      const ran = await run(
        [
          "funnel",
          "--bg",
          `--https=${FUNNEL_PORT}`,
          `--set-path=${FUNNEL_MOUNT}`,
          target(port),
        ],
        heard
      );
      if (ran.kind === "answered" && ran.value.missing) {
        return notInstalled();
      }
      // Answered or not, its status says whether it took hold.
      const after = await status();
      if (isState(after)) {
        return after;
      }
      const applied = liveBase(after, port);
      if (applied) {
        console.log(`[relay] Funnel is live: ${applied} → ${target(port)}`);
        return { state: "live", base: applied };
      }
      switch (ran.kind) {
        case "answered":
          return refusalOf(ran.value);
        case "unanswered": {
          // The CLI waits on the owner's approval page and prints its URL
          // first: what it printed before it was let go is the owner's step.
          const step = refusalOf({
            code: null,
            output: `${heard.stdout}\n${heard.stderr}`,
            stdout: heard.stdout,
          });
          return step.state === "needs-owner"
            ? step
            : {
                state: "wanted",
                reason: `${noAnswer(`tailscale funnel on ${host}`, ran.after)}: ${firstLine(`${heard.stdout}\n${heard.stderr}`)}`,
              };
        }
        default: {
          const unhandled: never = ran;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
    },

    /** Removes the relay's mount when Funnel has it; answers why it couldn't, or nothing. */
    async remove(): Promise<string | undefined> {
      const before = await status();
      if (isState(before)) {
        return wordsOf(before);
      }
      const at = servedAt(before);
      if (!(at && before.Web?.[at]?.Handlers?.[FUNNEL_MOUNT])) {
        return;
      }
      const ran = await run([
        "funnel",
        `--https=${FUNNEL_PORT}`,
        `--set-path=${FUNNEL_MOUNT}`,
        "off",
      ]);
      switch (ran.kind) {
        case "answered":
          break;
        case "unanswered":
          return noAnswer(`tailscale funnel on ${host}`, ran.after);
        default: {
          const unhandled: never = ran;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      if (ran.value.code === 0) {
        console.log(`[relay] Funnel's ${FUNNEL_MOUNT} mount on ${at} is off`);
        return;
      }
      return wordsOf(refusalOf(ran.value));
    },
  };
};

export type Funnel = ReturnType<typeof createFunnel>;
