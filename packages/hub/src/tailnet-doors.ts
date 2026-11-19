/**
 * HTTPS beside each of a process's plain listeners on the machine's tailnet
 * addresses (tailnet-https.ts): for each port a TLS listener on loopback
 * and a door on each tailnet address that carries TLS connections to it
 * (tailnet-door.ts). The hub holds the dashboard's port's; the preview server
 * holds every preview port's (preview-server/listeners.ts), from the
 * certificate the hub reads and hands it.
 */
import { errnoCode } from "@cawco/core/absent";
import { detach } from "@cawco/core/detach";
import { causeOf } from "@cawco/preview/proxy";
import { openTailnetDoor, type TailnetDoor } from "./tailnet-door";

/** A certificate and its key, as Bun's `tls` takes them. */
export interface Pair {
  cert: string;
  key: string;
}

/** What the listeners serve with: the tailnet name, its addresses, and the certificate. */
export interface TailnetLive {
  ips: string[];
  name: string;
  pair: Pair;
}

/** A listener as this module holds it: one it can stop. */
interface Listening {
  stop: (closeActiveConnections?: boolean) => Promise<void>;
}

/** A port's TLS listener, at the port it took. */
interface Secure extends Listening {
  readonly port: number | undefined;
}

/**
 * Opens a port's TLS listener: the caller's own `Bun.serve` with these
 * `hostname`, `port` and `tls` (loopback, a port the system picks), which
 * the port's doors on the tailnet addresses carry TLS connections to.
 */
export type OpenSecure = (at: {
  hostname: string;
  port: number;
  tls: Pair;
}) => Secure;

/** What serves a port's HTTPS: its TLS listener and its door on each tailnet address. */
interface Held {
  doors: TailnetDoor[];
  secure: Secure;
}

/** A port's HTTPS on the tailnet addresses, beside its plain listener. */
interface Beside {
  held: Held | null;
  open: OpenSecure;
  port: number;
}

/** `server` stopped: at once with its connections (`now`), or once they finish. */
const stopped = (server: Listening, now: boolean): void =>
  detach(server.stop(now), "tailnet listener stop");

/** A port's doors, then its TLS listener, stopped. */
const stoppedHeld = (serving: Held | null, now: boolean): void => {
  for (const door of serving?.doors ?? []) {
    stopped(door, now);
  }
  if (serving) {
    stopped(serving.secure, now);
  }
};

/** Whether a bind failed because another listener holds the address and port. */
const held = (thrown: unknown): boolean => errnoCode(thrown) === "EADDRINUSE";

export const createTailnetDoors = () => {
  const besides = new Set<Beside>();
  /** What the listeners serve with now, while serving. */
  let live: TailnetLive | null = null;

  /**
   * `beside`'s TLS listener with `at`'s pair, and its door on every tailnet
   * address; what opened so far stops when a door is refused, and the
   * refusal is thrown. An address this machine can't bind at all (an IPv6
   * one with IPv6 off) is left out with a line.
   */
  const openOn = (beside: Beside, at: TailnetLive): Held => {
    const secure = beside.open({
      hostname: "127.0.0.1",
      port: 0,
      tls: at.pair,
    });
    const opened: Held = { secure, doors: [] };
    // A TCP listener on loopback: Bun names no port only for a Unix socket.
    const tlsPort = secure.port;
    if (tlsPort === undefined) {
      stoppedHeld(opened, true);
      throw new Error("the tailnet's TLS listener opened on no port");
    }
    for (const ip of at.ips) {
      try {
        opened.doors.push(
          openTailnetDoor({
            hostname: ip,
            name: at.name,
            port: beside.port,
            tlsPort,
          })
        );
      } catch (thrown) {
        if (held(thrown)) {
          stoppedHeld(opened, true);
          throw thrown;
        }
        console.warn(
          `[tailnet] port ${beside.port} didn't open for HTTPS on ${ip}: ${causeOf(thrown)}`
        );
      }
    }
    return opened;
  };

  /** Every door and TLS listener stopped: the tailnet addresses answer plain http again. */
  const close = (): void => {
    for (const beside of besides) {
      stoppedHeld(beside.held, true);
      beside.held = null;
    }
    live = null;
  };

  return {
    /**
     * Every port's HTTPS on `at`: each new TLS listener and door opens
     * beside the one it replaces before that one stops taking connections,
     * so a renewal drops nothing. The ports whose HTTPS didn't open, each
     * keeping its plain listener alone, said in a line.
     */
    serve(at: TailnetLive): number[] {
      const refused: number[] = [];
      for (const beside of besides) {
        let opened: Held | null;
        try {
          opened = openOn(beside, at);
        } catch (thrown) {
          console.warn(
            `[tailnet] port ${beside.port} serves no HTTPS: ${causeOf(thrown)}`
          );
          refused.push(beside.port);
          opened = null;
        }
        const replaced = beside.held;
        beside.held = opened;
        stoppedHeld(replaced, false);
      }
      live = at;
      return refused;
    },

    close,

    /** Whether `at` serves with what the listeners hold now. */
    same: (at: TailnetLive): boolean =>
      live !== null &&
      live.name === at.name &&
      live.ips.join() === at.ips.join() &&
      live.pair.cert === at.pair.cert &&
      live.pair.key === at.pair.key,

    /** What the listeners serve with now; null while none. */
    live: (): TailnetLive | null => live,

    /**
     * `port`'s HTTPS on the tailnet addresses, its TLS listener opened by
     * `open`, now while serving and whenever serving starts or renews;
     * `close` stops it with the plain listener it stands beside.
     */
    beside(port: number, open: OpenSecure): { close: () => void } {
      const beside: Beside = { port, open, held: null };
      besides.add(beside);
      if (live) {
        try {
          beside.held = openOn(beside, live);
        } catch (thrown) {
          console.warn(
            `[tailnet] port ${port} serves no HTTPS: ${causeOf(thrown)}`
          );
        }
      }
      return {
        close(): void {
          stoppedHeld(beside.held, true);
          beside.held = null;
          besides.delete(beside);
        },
      };
    },
  };
};

export type TailnetDoors = ReturnType<typeof createTailnetDoors>;
