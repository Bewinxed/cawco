/**
 * The person's phone on a scratch fleet: a stand-in Cawrier that keeps
 * every push the hub sends, one phone paired, and a session's rest as the
 * hub reads it. Kept from turn-push (cut on 2026-10-26) for the specs that
 * still read what reached the phone.
 */

import { until } from "../scratch-fleet";
import type { KitFleet } from "./kit";

const BURST_SENT = /\[notify\] push (needs-\S+): \d+ in one \(([^)]*)\)/u;

/** A push the stand-in Cawrier took: a visible one under its collapse id, its alert as the lock screen shows it. */
interface Pushed {
  collapseId?: string;
  payload: {
    aps?: { alert?: { body?: string; subtitle?: string; title?: string } };
    cawco?: { installId?: string; instanceId?: string; kind?: string };
  };
}

/**
 * A stand-in Cawrier that keeps every push, the hub pointed at it, and one
 * phone paired: what reached the person's phone. `turns(id)` is how many
 * of them carried the session's finished turn.
 */
export const standInPhone = (fleet: KitFleet) => {
  const pushed: Pushed[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        pushed.push((await request.json()) as Pushed);
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 204 });
    },
  });
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  return {
    /** Pairs one phone with the hub, which must be up. */
    pair: async (): Promise<void> => {
      const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
      await fleet.api("/api/push/register", {
        pairingId: crypto.randomUUID(),
        secret: Buffer.from(bytes(32)).toString("base64url"),
        key: Buffer.from(bytes(32)).toString("base64"),
        name: "Probe iPhone",
        platform: "ios",
      });
    },
    /**
     * The pushes so far that carried the session's finished turn: under its
     * own `turn-<id>` collapse id, or a burst's (`needs-…`) the hub's log
     * says held it among others ("N in one (turn-<id>, …)").
     */
    turns: async (instanceId: string): Promise<number> => {
      const turn = `turn-${instanceId}`;
      const bursts = new Set(
        (await fleet.logs("hub")).split("\n").flatMap((line) => {
          const held = BURST_SENT.exec(line);
          return held?.[2]?.split(", ").includes(turn) ? [held[1]] : [];
        })
      );
      return pushed.filter(
        (one) => one.collapseId === turn || bursts.has(one.collapseId ?? "")
      ).length;
    },
    /** Every push so far, oldest first. */
    pushes: (): Pushed[] => [...pushed],
    /** Every push's collapse id so far, for a failure's detail. */
    ids: (): string[] => pushed.map((one) => one.collapseId ?? "background"),
    /** The alert of each push so far about install `id` (hub push.ts `install`), oldest first. */
    installAlerts: (id: string) =>
      pushed
        .filter((one) => one.payload.cawco?.installId === id)
        .map((one) => one.payload.aps?.alert ?? {}),
    stop: () => cawrier.stop(true),
  };
};

export type Phone = ReturnType<typeof standInPhone>;

/** A session at rest: no turn open on the hub, no busy pulse. */
export const atRest = async (fleet: KitFleet, id: string): Promise<void> => {
  await until(
    `${id.slice(0, 8)} at rest`,
    async () => {
      const [row] = fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        id
      );
      const pulses =
        await fleet.api<Record<string, { busy?: boolean }>>("/api/pulses");
      return row?.turn_open_at === null && !pulses[id]?.busy;
    },
    Boolean,
    120_000
  );
};
