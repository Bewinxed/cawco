/**
 * HTTPS beside each of a process's plain listeners on the machine's tailnet
 * addresses (tailnet-https.ts): for each port a TLS listener on loopback
 * and a door on each tailnet address that carries TLS connections to it
 * (tailnet-door.ts). The hub holds the dashboard's port's; the preview server
 * holds every preview port's (preview-server/listeners.ts), from the
 * certificate the hub reads and hands it.
 *
 * A door stands for as long as its address is the machine's: a new
 * certificate opens a new TLS listener, and each door sends the
 * connections that come after to it while the old one finishes those it
 * holds. Closing a door and opening another on the same address instead
 * resets what reached the old one and wasn't taken yet, and a connection
 * the old door took after its TLS listener stopped is dropped as it is
 * piped (measured: a fifth of new connections reset under renewals).
 */
import { errnoCode } from "@cawco/core/absent";
import { causeOf } from "@cawco/preview/proxy";
import { Effect } from "effect";
import {
  type DoorTarget,
  openTailnetDoor,
  type TailnetDoor,
} from "./tailnet-door";

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

/** A TLS listener, and how many of the doors' connections are piped to it now. */
interface Serving {
  pipes: number;
  /** Replaced: it stops once the last connection piped to it ends. */
  replaced: boolean;
  secure: Secure;
}

/** What serves a port's HTTPS: its TLS listener and its door on each tailnet address, by address. */
interface Held {
  doors: Map<string, TailnetDoor>;
  serving: Serving;
}

/** A port's HTTPS on the tailnet addresses, beside its plain listener. */
interface Beside {
  /** Each TLS listener replaced that still serves a connection piped to it before. */
  draining: Set<Serving>;
  held: Held | null;
  open: OpenSecure;
  port: number;
}

/** Whether a bind failed because another listener holds the address and port. */
const held = (thrown: unknown): boolean => errnoCode(thrown) === "EADDRINUSE";

/** Whether `a` and `b` are the same certificate and key. */
const samePair = (a: Pair, b: Pair): boolean =>
  a.cert === b.cert && a.key === b.key;

/** Work let go, named `what`: on the hub's lifetime, or the preview server's scope. */
export type LetGo = (what: string, work: Effect.Effect<unknown>) => void;

export const createTailnetDoors = (letGo: LetGo) => {
  /** `server` stopped: at once with its connections (`now`), or once they finish. */
  const stopped = (server: Listening, now: boolean): void => {
    letGo(
      "tailnet listener stop",
      Effect.promise(() => server.stop(now))
    );
  };

  /** A port's doors, then its TLS listener, stopped. */
  const stoppedHeld = (holding: Held | null, now: boolean): void => {
    for (const door of holding?.doors.values() ?? []) {
      stopped(door, now);
    }
    if (holding) {
      stopped(holding.serving.secure, now);
    }
  };

  /** Every listener of `beside`'s HTTPS stopped with its connections, those replaced and draining too. */
  const stoppedBeside = (beside: Beside): void => {
    stoppedHeld(beside.held, true);
    beside.held = null;
    for (const serving of beside.draining) {
      stopped(serving.secure, true);
    }
    beside.draining.clear();
  };

  /**
   * `serving` replaced in `beside`: stopped once no connection is piped to
   * it, so one a door took just before its renewal finishes its handshake
   * there (measured: Bun's `stop(false)` resets a connection still in its
   * TLS handshake).
   */
  const retire = (beside: Beside, serving: Serving): void => {
    serving.replaced = true;
    if (serving.pipes === 0) {
      stopped(serving.secure, false);
      return;
    }
    beside.draining.add(serving);
  };

  const besides = new Set<Beside>();
  /** What the listeners serve with now, while serving. */
  let live: TailnetLive | null = null;

  /** Where `beside`'s doors send a connection now: its TLS listener and the tailnet name; null once its HTTPS is gone. */
  const targetOf = (beside: Beside): DoorTarget | null => {
    const serving = beside.held?.serving;
    const tlsPort = serving?.secure.port;
    if (!serving || tlsPort === undefined || live === null) {
      return null;
    }
    return {
      tlsPort,
      name: live.name,
      piped: () => {
        serving.pipes += 1;
        return () => {
          serving.pipes -= 1;
          if (
            serving.replaced &&
            serving.pipes === 0 &&
            beside.draining.delete(serving)
          ) {
            stopped(serving.secure, false);
          }
        };
      },
    };
  };

  /** `beside`'s TLS listener with `pair`, on loopback at a port the system picks. */
  const openSecure = (beside: Beside, pair: Pair): Serving => {
    const secure = beside.open({ hostname: "127.0.0.1", port: 0, tls: pair });
    // A TCP listener on loopback: Bun names no port only for a Unix socket.
    if (secure.port === undefined) {
      stopped(secure, true);
      throw new Error("the tailnet's TLS listener opened on no port");
    }
    return { secure, pipes: 0, replaced: false };
  };

  /**
   * `beside`'s door on `ip`. Refused because the port can't be shared, it
   * throws; an address this machine can't bind at all (an IPv6 one with
   * IPv6 off) is left out with a line, as null.
   */
  const doorOn = (beside: Beside, ip: string): TailnetDoor | null => {
    try {
      return openTailnetDoor({
        hostname: ip,
        port: beside.port,
        target: () => targetOf(beside),
      });
    } catch (thrown) {
      if (held(thrown)) {
        throw thrown;
      }
      console.warn(
        `[tailnet] port ${beside.port} didn't open for HTTPS on ${ip}: ${causeOf(thrown)}`
      );
      return null;
    }
  };

  /** `beside`'s door on each of `ips`: the one standing in `was` kept, a new one opened ({@link doorOn}); a refusal stops those this opened and is thrown. */
  const doorsOn = (
    beside: Beside,
    ips: string[],
    was: Held | null
  ): Map<string, TailnetDoor> => {
    const doors = new Map<string, TailnetDoor>();
    const opened: TailnetDoor[] = [];
    try {
      for (const ip of ips) {
        const door = was?.doors.get(ip) ?? doorOn(beside, ip);
        if (door && door !== was?.doors.get(ip)) {
          opened.push(door);
        }
        if (door) {
          doors.set(ip, door);
        }
      }
    } catch (thrown) {
      for (const door of opened) {
        stopped(door, true);
      }
      throw thrown;
    }
    return doors;
  };

  /**
   * `beside` served as `at` says: its TLS listener kept while `at`'s pair is
   * the one it serves (`kept`), else a new one; a door on every tailnet
   * address ({@link doorsOn}). What this opened stops when a door is
   * refused, and the refusal is thrown; what it no longer needs is stopped
   * once the doors send to what replaced it, a TLS listener once the last
   * connection piped to it ends ({@link retire}).
   */
  const openOn = (beside: Beside, at: TailnetLive, kept: boolean): void => {
    const was = beside.held;
    const serving = was && kept ? was.serving : openSecure(beside, at.pair);
    let doors: Map<string, TailnetDoor>;
    try {
      doors = doorsOn(beside, at.ips, was);
    } catch (thrown) {
      if (serving !== was?.serving) {
        stopped(serving.secure, true);
      }
      throw thrown;
    }
    // No connection is read before this returns: each door sends the next
    // one to `serving` from here on.
    beside.held = { serving, doors };
    for (const [ip, door] of was?.doors ?? []) {
      if (doors.get(ip) !== door) {
        stopped(door, false);
      }
    }
    if (was && was.serving !== serving) {
      retire(beside, was.serving);
    }
  };

  /** Every door and TLS listener stopped: the tailnet addresses answer plain http again. */
  const close = (): void => {
    for (const beside of besides) {
      stoppedBeside(beside);
    }
    live = null;
  };

  return {
    /**
     * Every port's HTTPS on `at`: a new certificate's TLS listener opens
     * before the one it replaces stops taking connections, and each door
     * on an address still the machine's stands throughout, so a renewal
     * drops nothing. The ports whose HTTPS didn't open, each keeping its
     * plain listener alone, said in a line.
     */
    serve(at: TailnetLive): number[] {
      const kept = live !== null && samePair(live.pair, at.pair);
      live = at;
      const refused: number[] = [];
      for (const beside of besides) {
        try {
          openOn(beside, at, kept);
        } catch (thrown) {
          console.warn(
            `[tailnet] port ${beside.port} serves no HTTPS: ${causeOf(thrown)}`
          );
          refused.push(beside.port);
          stoppedHeld(beside.held, false);
          beside.held = null;
        }
      }
      return refused;
    },

    close,

    /** Whether `at` serves with what the listeners hold now. */
    same: (at: TailnetLive): boolean =>
      live !== null &&
      live.name === at.name &&
      live.ips.join() === at.ips.join() &&
      samePair(live.pair, at.pair),

    /** What the listeners serve with now; null while none. */
    live: (): TailnetLive | null => live,

    /**
     * `port`'s HTTPS on the tailnet addresses, its TLS listener opened by
     * `open`, now while serving and whenever serving starts or renews;
     * `close` stops it with the plain listener it stands beside.
     */
    beside(port: number, open: OpenSecure): { close: () => void } {
      const beside: Beside = { port, open, held: null, draining: new Set() };
      besides.add(beside);
      if (live) {
        try {
          openOn(beside, live, false);
        } catch (thrown) {
          console.warn(
            `[tailnet] port ${port} serves no HTTPS: ${causeOf(thrown)}`
          );
        }
      }
      return {
        close(): void {
          stoppedBeside(beside);
          besides.delete(beside);
        },
      };
    },
  };
};

export type TailnetDoors = ReturnType<typeof createTailnetDoors>;
