/**
 * WHETHER A MACHINE'S TOOL CELLS ARE FACTS OF ITS CONNECTION NOW.
 *
 * The hub keeps each machine's tool cells (db `agentTools`) across its
 * connections, and a machine that registers says its tools on a beat after
 * the register (agent daemon.ts `readPart("tools")`), seconds later. Until
 * then the cells are the previous connection's: a copy they call installed
 * may be gone or refused now. The update pass never acts on them (it runs
 * on a machine's tools report, tool-installs.ts `keepCopiesOn`), and a read
 * that failed asks of them why only once they are this connection's
 * (history.ts `refusedRead`): asked before, a read that landed between the
 * register and the report found a stale "installed" cell, neither installing
 * nor refused, and answered 500 "couldn't be read" for the two seconds
 * before the report (host run 84ca5c0e, 20:05:27.547).
 */

/** One machine's connection now, and whether its tools have been said on it. */
interface Connection {
  heard: boolean;
  socketId: string;
  /** Reads waiting for the first tools report on it. */
  wake: Set<() => void>;
}

export interface ToolFactsShape {
  /** `machineId` registered on `socketId`: its cells are not facts until it reports its tools. */
  readonly connected: (machineId: string, socketId: string) => void;
  /** Whether `machineId`'s tool cells are its connection's now. */
  readonly heard: (machineId: string) => boolean;
  /** `socketId` stopped being `machineId`'s connection. */
  readonly left: (machineId: string, socketId: string) => void;
  /** `machineId`'s tools report landed in its cells (and the pass it runs). */
  readonly reported: (machineId: string) => void;
  /**
   * Whether `machineId`'s cells are its connection's, once they are or
   * `ms` have gone by or the connection has, whichever is first.
   */
  readonly until: (machineId: string, ms: number) => Promise<boolean>;
}

export const createToolFacts = (): ToolFactsShape => {
  const connections = new Map<string, Connection>();

  const wakeAll = (connection: Connection): void => {
    for (const wake of [...connection.wake]) {
      wake();
    }
  };

  const heard = (machineId: string): boolean =>
    connections.get(machineId)?.heard === true;

  return {
    connected: (machineId, socketId) => {
      const before = connections.get(machineId);
      // A read waiting on the connection before waits on this one.
      connections.set(machineId, {
        heard: false,
        socketId,
        wake: before?.wake ?? new Set(),
      });
    },
    heard,
    left: (machineId, socketId) => {
      const connection = connections.get(machineId);
      if (connection?.socketId !== socketId) {
        return;
      }
      connections.delete(machineId);
      wakeAll(connection);
    },
    reported: (machineId) => {
      const connection = connections.get(machineId);
      if (!connection || connection.heard) {
        return;
      }
      connection.heard = true;
      wakeAll(connection);
    },
    until: (machineId, ms) => {
      const connection = connections.get(machineId);
      if (!connection || connection.heard) {
        return Promise.resolve(connection?.heard === true);
      }
      return new Promise((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          connection.wake.delete(done);
          resolve(heard(machineId));
        };
        const timer = setTimeout(done, ms);
        connection.wake.add(done);
      });
    },
  };
};
