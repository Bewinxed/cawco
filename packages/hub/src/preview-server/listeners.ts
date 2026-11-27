/**
 * Every preview origin's listener, held by the preview server: one on each
 * port the hub's port rows give an origin (db/previews.ts), on the bind
 * address and each loopback address it doesn't answer (core
 * loopback-binds.ts, as the dashboard's port), each with its TLS twin
 * while the tailnet serves HTTPS (tailnet-doors.ts), and host mode's one on
 * the range's first port, which routes each request by its Host. The
 * rows and the mode are the hub's: it writes them and says so (`ports`), and
 * the listeners are made to stand as they say (`stand`),
 * each bind refused said back to the hub, which moves that origin.
 *
 * A port an origin let go is held here a while ({@link VACANT_HOLD_MS}) by a
 * listener of no origin, so a stale address there is answered (locked, or
 * sent on: preview-stale.ts), not with the browser's connection error; any
 * origin the rows give it takes it at once.
 */
import { errnoCode } from "@cawco/core/absent";
import { loopbackBeside } from "@cawco/core/loopback-binds";
import { isStreamRelayPort } from "@cawco/core/stream-relay";
import {
  causeOf,
  previewFailed,
  previewWebSocket,
  untransformed,
} from "@cawco/preview/proxy";
import type { Server } from "bun";
import { Effect, Semaphore } from "effect";
import { ElysiaStatus } from "elysia";
import { BIND_HOST, FLEET_PORTS, PREVIEW_PORTS } from "../config";
import type { PassCheck } from "../preview-access";
import { SESSION_PASS_MS } from "../preview-access";
import { type HostPattern, labelOf, parsePattern } from "../preview-hosts";
import { HOP } from "../preview-origin";
import type { TailnetDoors } from "../tailnet-doors";
import { asReached } from "../tailnet-https";
import type { ListenerSocket } from "./serve";

/** How long a port an origin let go stays held for its stale addresses: a session's pass ticket's life, the longest an `artifact_browse` url can still be entered. */
const VACANT_HOLD_MS = SESSION_PASS_MS;

/**
 * The addresses each listener binds: the hub's bind address and each
 * loopback address it doesn't answer, so a dashboard opened at
 * `http://localhost:3455` reaches `http://localhost:<port>` by either
 * family, as it reaches the dashboard. Read once, at the first listener.
 */
let bindHosts: string[] | undefined;
const hostsToBind = (): string[] => {
  bindHosts ??= [BIND_HOST, ...loopbackBeside(BIND_HOST)];
  return bindHosts;
};

/** A listener: the plain ones and their TLS twin, stopped together with their connections. */
interface Held {
  port: number;
  stop: () => Promise<void>;
}

/** What a listener answers with: each request's origin from its route, behind its lock. */
export type Answer = (
  request: Request,
  server: Server<ListenerSocket>,
  key: string | undefined,
  lock: PassCheck
) => Promise<Response | undefined>;

export interface ListenersEnv {
  answer: Answer;
  doors: TailnetDoors;
  /** Work let go, named `what`, for as long as the server runs (main.ts). */
  letGo: (what: string, work: Effect.Effect<unknown, unknown>) => void;
  /** The lock's passes and their use (store.ts, the link). */
  passes: PassCheck["passes"];
  /** Origin `key` was used now (a request). */
  used: (key: string) => void;
}

/** What a stand did not open: each origin's bind refused, and host mode's. */
export interface Stood {
  host: { held: boolean; why: string } | null;
  refused: { key: string; port: number; held: boolean; why: string }[];
}

/** Why no origin may have `port` in mode `mode`; null when one may (hub preview-ports.ts `barred`). */
const barredPort = (port: number, mode: "port" | "host"): string | null => {
  const fleet = FLEET_PORTS.get(port);
  if (fleet) {
    return `it is ${fleet} port`;
  }
  if (isStreamRelayPort(port)) {
    return "it is the stream relay's port";
  }
  if (mode === "host" && port === PREVIEW_PORTS.first) {
    return "it is host mode's listener port";
  }
  return port < PREVIEW_PORTS.first || port > PREVIEW_PORTS.last
    ? "it is outside the preview ports"
    : null;
};

export const createListeners = (env: ListenersEnv) => {
  /** Each origin's listener, by its key. */
  const held = new Map<string, Held>();
  /** Each port an origin let go, held by a listener of no origin, and when it is let go. */
  const vacant = new Map<number, { held: Held; until: number }>();
  /** Host mode's one listener, and the pattern it routes by. */
  let host: { held: Held; pattern: HostPattern; text: string } | null = null;
  /** The rows as last read: each origin's port, by key. */
  let rows = new Map<string, number>();

  /** The lock on every origin's own port: its pass set on the host it was reached at. */
  const portLock: PassCheck = { domain: null, passes: env.passes };

  /**
   * A listener on `port`, each request's origin from `route`, behind
   * `lock`, and its TLS twin on the tailnet addresses while those serve
   * HTTPS. The plain ones bind with `reusePort`, which Linux needs on both
   * sockets to let a door on an address stand beside the wildcard listener.
   */
  const listen = (
    port: number,
    route: (request: Request) => string | undefined,
    lock: PassCheck
  ): Held => {
    const fetch = async (
      request: Request,
      server: Server<ListenerSocket>
    ): Promise<Response | undefined> => {
      const key = route(request);
      if (key) {
        env.used(key);
      }
      const answered = await env.answer(request, server, key, lock);
      if (!answered) {
        return;
      }
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        previewFailed(
          HOP,
          key ?? null,
          `its socket at ${new URL(request.url).pathname} was refused (${answered.status})`
        );
      }
      return untransformed(answered);
    };
    const error = (thrown: Error) => {
      const why = `the preview server failed serving it: ${causeOf(thrown)}`;
      previewFailed(HOP, null, why);
      return new Response(why, { status: 502 });
    };
    const plain: Server<ListenerSocket>[] = [];
    try {
      for (const hostname of hostsToBind()) {
        plain.push(
          Bun.serve<ListenerSocket>({
            hostname,
            port,
            reusePort: true,
            websocket: previewWebSocket,
            error,
            fetch,
          })
        );
      }
    } catch (thrown) {
      for (const one of plain) {
        one.stop(true);
      }
      throw thrown;
    }
    const secure = env.doors.beside(port, (at) =>
      Bun.serve<ListenerSocket>({
        ...at,
        http2: true,
        websocket: previewWebSocket,
        error,
        fetch: (request, server) => fetch(asReached(request), server),
      })
    );
    return {
      port,
      stop: async (): Promise<void> => {
        secure.close();
        await Promise.all(plain.map((one) => one.stop(true)));
      },
    };
  };

  /**
   * Whether no socket holds `port` now on any address a listener binds: a
   * bind without `reusePort` on each, closed at once. A listener binds with
   * `reusePort` (its tailnet twin needs it), and such a bind succeeds
   * silently on a port another process holds the same way, the kernel then
   * splitting connections between the two.
   */
  const unheld = (port: number): true | { held: boolean; why: string } => {
    for (const hostname of hostsToBind()) {
      try {
        Bun.serve({
          hostname,
          port,
          fetch: () => new Response(null),
        }).stop(true);
      } catch (thrown) {
        return errnoCode(thrown) === "EADDRINUSE"
          ? { held: true, why: "another program holds it" }
          : { held: false, why: causeOf(thrown) };
      }
    }
    return true;
  };

  /** Port `port` let go by the server, for an origin to bind: stopped as it is let go. */
  const takeVacant = (port: number): Promise<void> | undefined => {
    const holding = vacant.get(port);
    vacant.delete(port);
    return holding?.held.stop();
  };

  /** Port `port`, which an origin served until now, held for {@link VACANT_HOLD_MS} while no origin and no other program has it. */
  const holdVacant = (port: number): void => {
    if (vacant.has(port) || [...rows.values()].includes(port)) {
      return;
    }
    if (unheld(port) !== true) {
      return;
    }
    try {
      const holding = listen(port, () => undefined, portLock);
      const until = Date.now() + VACANT_HOLD_MS;
      vacant.set(port, { held: holding, until });
      env.letGo(
        "vacant preview port let go",
        Effect.sleep(VACANT_HOLD_MS).pipe(
          Effect.andThen(
            Effect.suspend(() => {
              const stopping =
                vacant.get(port)?.until === until
                  ? takeVacant(port)
                  : undefined;
              return stopping === undefined
                ? Effect.void
                : Effect.promise(() => stopping);
            })
          )
        )
      );
    } catch (thrown) {
      previewFailed(HOP, null, `port ${port} wasn't held: ${causeOf(thrown)}`);
    }
  };

  /** The origin a Host header names under `pattern`; undefined when it names none, or a port no origin holds. */
  const keyOfHost = (
    pattern: HostPattern,
    hostHeader: string | null
  ): string | undefined => {
    const value = hostHeader?.match(pattern.shape)?.[1]?.toLowerCase();
    if (!value) {
      return;
    }
    if (pattern.key === "session") {
      return [...rows.keys()].find((key) => labelOf(key) === value);
    }
    const port = Number(value);
    return [...rows].find(([, at]) => at === port)?.[0];
  };

  /** Host mode's listener as `settings` says it: opened, moved to another pattern, or stopped; why it didn't open. */
  const standHost = async (settings: {
    mode: "port" | "host";
    pattern: string | null;
  }): Promise<{ held: boolean; why: string } | null> => {
    const wanted = settings.mode === "host" ? (settings.pattern ?? "") : null;
    if (host && host.text === wanted) {
      return null;
    }
    if (host) {
      const stopping = host.held.stop();
      host = null;
      await stopping;
    }
    return wanted === null ? null : openHost(wanted);
  };

  /** Host mode's listener for pattern `wanted` opened on the range's first port; why it didn't open. */
  const openHost = async (
    wanted: string
  ): Promise<{ held: boolean; why: string } | null> => {
    const pattern = parsePattern(wanted);
    if (pattern instanceof ElysiaStatus) {
      return {
        held: false,
        why: `The stored host pattern ${JSON.stringify(wanted)} isn't one: ${pattern.response.detail}`,
      };
    }
    const { first } = PREVIEW_PORTS;
    const fleet =
      FLEET_PORTS.get(first) ??
      (isStreamRelayPort(first) ? "the stream relay's" : null);
    if (fleet) {
      return {
        held: false,
        why: `Port ${first} is ${fleet} port, so host-mode previews can't take it: set CAWCO_PREVIEW_PORTS to a range whose first port is free.`,
      };
    }
    await takeVacant(first);
    const free = unheld(first);
    if (free !== true) {
      return {
        held: free.held,
        why: free.held
          ? `Port ${first} is held by another listener, so host-mode previews can't take it: free it, or set CAWCO_PREVIEW_PORTS to a range whose first port is free.`
          : `Port ${first} didn't open for host-mode previews (${free.why}): free it, or set CAWCO_PREVIEW_PORTS to a range whose first port is free.`,
      };
    }
    try {
      host = {
        held: listen(
          first,
          (request) => keyOfHost(pattern, request.headers.get("host")),
          { domain: pattern.domain, passes: env.passes }
        ),
        pattern,
        text: wanted,
      };
      return null;
    } catch (thrown) {
      return {
        held: false,
        why: `Port ${first} didn't open for host-mode previews (${causeOf(thrown)}): free it, or set CAWCO_PREVIEW_PORTS to a range whose first port is free.`,
      };
    }
  };

  /** Origin `key` served on `port`: a refusal, the port's or the bind address's, when it doesn't open. */
  const bind = async (
    key: string,
    port: number
  ): Promise<{ held: boolean; why: string } | null> => {
    await takeVacant(port);
    const free = unheld(port);
    if (free !== true) {
      return free;
    }
    try {
      held.set(
        key,
        listen(port, () => key, portLock)
      );
      return null;
    } catch (thrown) {
      return {
        held: errnoCode(thrown) === "EADDRINUSE",
        why: causeOf(thrown),
      };
    }
  };

  /** Each origin's listener whose row moved or went stopped, its port held vacant. */
  const letGoMoved = async (): Promise<void> => {
    for (const [key, listener] of held) {
      if (rows.get(key) !== listener.port) {
        held.delete(key);
        await listener.stop();
        holdVacant(listener.port);
      }
    }
  };

  /** A listener for each row that has none; the binds refused. */
  const bindRows = async (
    ports: { key: string; port: number }[],
    mode: "port" | "host"
  ): Promise<{ key: string; port: number; held: boolean; why: string }[]> => {
    const refused: { key: string; port: number; held: boolean; why: string }[] =
      [];
    for (const { key, port } of ports) {
      // A row on a port no origin may have now (the mode moved) is the
      // hub's to move as it is next asked for: nothing listens there.
      if (held.has(key) || barredPort(port, mode)) {
        continue;
      }
      const failed = await bind(key, port);
      if (failed) {
        refused.push({ key, port, ...failed });
      }
    }
    return refused;
  };

  /**
   * One stand at a time, and every listener stopped after the last: one
   * finishes stopping a port before another binds it. A stand begun runs to
   * its end, so an interrupted caller never leaves a port half let go to
   * the next.
   */
  const standing = Semaphore.makeUnsafe(1);
  /** Whether every listener was stopped for good: a stand after it opens nothing. */
  let stopped = false;
  const alone = <A>(work: () => Promise<A>): Effect.Effect<A> =>
    standing.withPermit(Effect.uninterruptible(Effect.promise(work)));

  return {
    /**
     * Every listener as `ports` and `settings` say now: each origin's on its
     * port, a stale one stopped (its port held vacant), host mode's opened
     * or stopped. The binds that were refused, and host mode's refusal.
     */
    stand: (
      ports: { key: string; port: number }[],
      settings: { mode: "port" | "host"; pattern: string | null }
    ): Effect.Effect<Stood> =>
      alone(async () => {
        if (stopped) {
          return { refused: [], host: null };
        }
        rows = new Map(ports.map(({ key, port }) => [key, port]));
        await letGoMoved();
        const hostRefused = await standHost(settings);
        return {
          refused: await bindRows(ports, settings.mode),
          host: hostRefused,
        };
      }),

    /** Origin `key`'s port while its listener stands. */
    portOf: (key: string): number | undefined => held.get(key)?.port,

    /** Host mode's pattern while its listener stands. */
    hostPattern: (): HostPattern | undefined => host?.pattern,

    /** Every listener stopped for good, each kind, once a stand under way has ended. */
    stopAll: alone(async (): Promise<void> => {
      stopped = true;
      const all = [
        ...held.values(),
        ...[...vacant.values()].map((one) => one.held),
        ...(host ? [host.held] : []),
      ];
      held.clear();
      vacant.clear();
      host = null;
      await Promise.all(all.map((one) => one.stop()));
    }),
  };
};
