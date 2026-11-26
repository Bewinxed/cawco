/**
 * A dashboard's first frames, as its socket opens: the board (board.ts
 * `firstFrame`), whole or what moved since the version it named, followed
 * by an update about to restart the hub, when one is, and Recent's stored
 * transcripts. Then the fleet's browsers, whole, to a page on this wire: a
 * browser view paints from them and follows each `browser_list` frame
 * after, never polling. Then each passkey QR still in time, which the
 * take-over view draws over its stream.
 */
import type { HubEnvelope } from "@cawco/core/envelopes";
import { syncSection } from "@cawco/core/loop-watch";
import { WIRE_PROTOCOL } from "@cawco/core/stream";
import type { HubContext } from "./hub-context";
import type { ClientSocket } from "./wire-socket";

type DashboardGreetingContext = Pick<
  HubContext,
  | "board"
  | "browsers"
  | "hubBuild"
  | "hubRun"
  | "moves"
  | "owedAfterBoard"
  | "pulses"
  | "sendToClient"
  | "storedRecent"
>;

/** `held`: the board the dashboard named (core `BOARD_HELD_PARAM`), sent what moved since it when it is of this hub's run. */
export const createDashboardGreeting =
  (ctx: DashboardGreetingContext) =>
  (
    ws: ClientSocket,
    older: boolean,
    held: { hubRun: string; version: number } | undefined
  ): void => {
    syncSection("dashboard greeted: board", () => {
      const { changes, version } = ctx.board.firstFrame(
        held && held.hubRun === ctx.hubRun && !older ? held.version : undefined
      );
      ctx.sendToClient(ws, {
        verb: "frames",
        machineId: "",
        payload: {
          kind: "instances",
          protocol: WIRE_PROTOCOL,
          // `hubBuild` lets a client tell a hub that is behind from a
          // machine that is.
          hubBuild: ctx.hubBuild,
          // The numbering this socket's streams count in: a page of the
          // same run resumes from its `seq`.
          hubRun: ctx.hubRun,
          version,
          // A screen that connects is handed every move; each change after
          // arrives on the `moves` frame.
          moves: ctx.moves.table(),
          // Seed now-state once per connection; updates have per-session frames.
          pulses: Object.fromEntries(ctx.pulses),
          ...changes,
        },
      } satisfies HubEnvelope<"frames">);
    });
    syncSection("dashboard greeted: owed frames", () => {
      for (const payload of ctx.owedAfterBoard()) {
        ctx.sendToClient(ws, {
          verb: "frames",
          machineId: "hub",
          payload,
        } satisfies HubEnvelope<"frames">);
      }
    });
    // Then Recent's stored transcripts, whole (stored-recent.ts).
    syncSection("dashboard greeted: stored transcripts", () =>
      ctx.sendToClient(ws, {
        verb: "frames",
        machineId: "hub",
        payload: { kind: "stored", stored: ctx.storedRecent.now() },
      } satisfies HubEnvelope<"frames">)
    );
    if (!older) {
      syncSection("dashboard greeted: browsers", () => {
        ctx.sendToClient(ws, {
          verb: "frames",
          machineId: "hub",
          payload: { kind: "browser_list", browsers: ctx.browsers.list() },
        } satisfies HubEnvelope<"frames">);
        // Then each passkey QR still in time, so a page opened or reloaded
        // after the prompt appeared still shows it over the take-over.
        for (const payload of ctx.browsers.passkeyQrs()) {
          ctx.sendToClient(ws, {
            verb: "frames",
            machineId: "hub",
            payload,
          } satisfies HubEnvelope<"frames">);
        }
      });
    }
  };
