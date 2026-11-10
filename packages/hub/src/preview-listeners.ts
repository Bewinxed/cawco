/**
 * Every listener the hub has open for previews, and what is known of each:
 * the one table that owns that state, read and changed only through its
 * members. A listener is one of an origin's own port (a session's, a
 * project's or a machine artifact's alike: its key is the origin's, see
 * preview-origin.ts), one holding a port an origin let go ({@link
 * ListenerTable.hold}), or host mode's one on the range's first port.
 */

/** The hop the hub's listener is in a preview failure's line (core `previewFailed`). */
export const HOP = "hub listener";

/** A preview origin's listener on its port: the plain one and its TLS twins, stopped together with their connections. */
export interface Listener {
  port: number;
  stop: () => Promise<void>;
}

/**
 * An origin's listener, with the origins that may frame what it serves
 * beside the dashboards. Only a machine artifact's origin is ever framed by
 * a page that shows it ({@link ListenerTable.allow}).
 */
interface Held {
  ancestors: Set<string>;
  listener: Listener;
}

export function createListenerTable() {
  /** Each origin's listener, by its key; it lasts as long as the origin (schema.ts `artifacts.origin` for an artifact's), whoever opened it. */
  const held = new Map<string, Held>();
  /**
   * Each port an origin let go, held by a listener of the hub's own, by
   * port: a stale address there is answered as one on another origin's port
   * is (preview-ports.ts `holdVacant`).
   */
  const vacant = new Map<number, Listener>();
  /**
   * Each origin's open sockets, by its key: a frame that shows it holds one
   * while it stands (its overlay's doc link, which keeps itself open: core
   * doc-link.ts; a previewed app's own), so an origin a screen shows is in
   * use, as a stage counts its viewers by its sockets (agent stage.ts).
   */
  const viewers = new Map<string, number>();
  /** When this hub process last wrote each origin's use, by its key: a write throttle alone ({@link ListenerTable.useDue}). */
  const usedWritten = new Map<string, number>();
  /** Host mode's one listener. */
  let host: Listener | undefined;

  return {
    /** `listener` serves origin `key` from now, nobody yet allowed to frame it. */
    bind(key: string, listener: Listener): void {
      held.set(key, { ancestors: new Set<string>(), listener });
    },

    /** Origin `key`'s listener and what is known of its use go; the listener, to stop, or undefined when it had none. */
    unbind(key: string): Listener | undefined {
      const listener = held.get(key)?.listener;
      held.delete(key);
      viewers.delete(key);
      usedWritten.delete(key);
      return listener;
    },

    /** Origin `key`'s port while its listener stands; undefined when it has none. */
    portOf(key: string): number | undefined {
      return held.get(key)?.listener.port;
    },

    /** Whether origin `key` has a listener. */
    has(key: string): boolean {
      return held.has(key);
    },

    /** Every origin that has a listener. */
    keys(): string[] {
      return [...held.keys()];
    },

    /** The origin whose listener serves `port`; undefined when none does. */
    keyAt(port: number): string | undefined {
      for (const [key, { listener }] of held) {
        if (listener.port === port) {
          return key;
        }
      }
    },

    /** Origin `origin` may frame what origin `key` serves. */
    allow(key: string, origin: string): void {
      held.get(key)?.ancestors.add(origin);
    },

    /** The origins that may frame what origin `key` serves beside the dashboards. */
    ancestorsOf(key: string | undefined): string[] {
      return key === undefined ? [] : [...(held.get(key)?.ancestors ?? [])];
    },

    /** A socket opened (`by` 1) or closed (-1) on origin `key`. */
    watch(key: string, by: 1 | -1): void {
      const now = (viewers.get(key) ?? 0) + by;
      if (now > 0) {
        viewers.set(key, now);
      } else {
        viewers.delete(key);
      }
    },

    /** Whether a socket is open on origin `key` now. */
    watched(key: string): boolean {
      return viewers.has(key);
    },

    /**
     * Whether origin `key`'s use is to be written now, `every` ms apart at
     * most, `now` the time of the use: the write throttle, set as it
     * answers true.
     */
    useDue(key: string, now: number, every: number): boolean {
      if (now - (usedWritten.get(key) ?? 0) < every) {
        return false;
      }
      usedWritten.set(key, now);
      return true;
    },

    /** `listener` holds `port`, which no origin serves now. */
    hold(port: number, listener: Listener): void {
      vacant.set(port, listener);
    },

    /** The listener holding `port`, which no origin serves; undefined when none does. */
    vacantAt(port: number): Listener | undefined {
      return vacant.get(port);
    },

    /** The listener holding `port` is let go, to stop; undefined when none held it. */
    takeVacant(port: number): Listener | undefined {
      const listener = vacant.get(port);
      vacant.delete(port);
      return listener;
    },

    /** Host mode's listener stands. */
    standHost(listener: Listener): void {
      host = listener;
    },

    /** Whether host mode's listener stands. */
    hosting(): boolean {
      return host !== undefined;
    },

    /** Every listener, each kind of them, gone from the table: the ones to stop. */
    drain(): Listener[] {
      const all = [
        ...[...held.values()].map(({ listener }) => listener),
        ...vacant.values(),
        ...(host ? [host] : []),
      ];
      held.clear();
      vacant.clear();
      host = undefined;
      return all;
    },
  };
}

export type ListenerTable = ReturnType<typeof createListenerTable>;
