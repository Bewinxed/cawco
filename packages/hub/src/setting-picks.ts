/**
 * A session's model, effort and permission mode, picked in any state of the
 * session. The hub's row is what every launch of the session runs on
 * (launches.ts `bounded`: its model, its chosen effort, its mode), so a pick
 * the session's process cannot take now is kept there and answered as taken:
 * its next launch runs on it, whatever brings it back (a send, a restore, a
 * relaunch). A process that runs takes the pick at once, as its control
 * (relay-control.ts `relaySettingPick`).
 *
 * A process that may still run on a machine that is away is the one case a
 * row alone does not cover: the process keeps running on what it had, and
 * its own word on its settings (each turn's `init`) would write that back
 * over the pick. So its pick is also held for it ({@link HeldPicks}), in
 * the hub's database (db held-picks.ts), so a hub that restarts meanwhile
 * still holds it: its word on a held setting is not recorded (launches.ts
 * `noteSessionSettings`, its effort reading in agent-socket
 * session-signals.ts), and as its machine registers again, before what
 * was held for it is handed over, each held pick goes to the process as its
 * control ({@link applyHeldPicks}). A launch takes what is held for it in
 * place of what its payload named (`bounded`), and the hold ends there.
 */

import type { ControlArgs } from "@cawco/core/control-table";
import { detach } from "@cawco/core/detach";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
} from "@cawco/core/session/controls";
import type { ClosureContext } from "./closure-context";
import type { createLaunches } from "./launches";
import { BUSY_TIMEOUT_MS } from "./machine-read-timeouts";
import type { HeldPicks, SettingPick } from "./setting-pick-shapes";
import { unreachable } from "./unreachable";

/** Whether the CLI runs in its bypass mode: Bypass, and Full Send on top of it. */
const bypasses = (mode: string | null | undefined): boolean =>
  mode === "bypassPermissions" || mode === "fullSend";

/** Rows whose process may still run while their machine is away. */
const MAY_RUN: ReadonlySet<string> = new Set([
  "running",
  "starting",
  "unknown",
]);

export type SettingPicksContext = Pick<
  ClosureContext,
  | "db"
  | "machineCalls"
  | "machineName"
  | "modelRefusal"
  | "owedMoves"
  | "registry"
  | "relaunchOnAccount"
  | "sessionIdle"
  | "sessionName"
> &
  Pick<ReturnType<typeof createLaunches>, "sessionModeRefusal">;

export const createSettingPicks = (ctx: SettingPicksContext) => {
  /**
   * Whether `row`'s process takes a pick now, as its control: its machine
   * is connected and the session runs, or is starting. Every other pick is
   * kept on its row ({@link keepPick}).
   */
  const processTakes = (row: Pick<InstanceRow, "machineId" | "status">) =>
    !!ctx.registry.agent(row.machineId) &&
    (row.status === "running" || row.status === "starting");

  /**
   * Holds `pick` for `row`'s process, which may run on a machine that is
   * away ({@link HeldPicks}).
   */
  const hold = (row: InstanceRow, pick: SettingPick): void => {
    const held = ctx.db.heldPicks.get(row.id) ?? {};
    switch (pick.method) {
      case CONTROL_SET_MODEL:
        held.model = pick.value;
        break;
      case CONTROL_SET_EFFORT:
        held.effort = pick.value;
        break;
      case CONTROL_SET_PERMISSION_MODE:
        held.permissionMode = {
          mode: pick.value,
          runs: held.permissionMode?.runs ?? row.permissionMode ?? null,
        };
        break;
      default:
        break;
    }
    ctx.db.heldPicks.put(row.id, held);
  };

  /**
   * A pick no process takes now, kept on `row` for every launch of it to run
   * on, and shown on every screen from there: the model and the mode on its
   * row, the effort as the one chosen for it and the one it runs at. One its
   * machine cannot run is refused, why in its words. A pick for a process
   * that may run on a machine that is away, or for a start still owed to its
   * machine, is held for it too ({@link hold}).
   */
  const keepPick = (
    row: InstanceRow,
    pick: SettingPick
  ): "kept" | { refusal: string } => {
    switch (pick.method) {
      case CONTROL_SET_MODEL: {
        const unlisted = ctx.modelRefusal(
          row.machineId,
          row.harness,
          pick.value
        );
        if (unlisted) {
          return { refusal: unlisted };
        }
        ctx.db.patchInstance(row.id, { model: pick.value, hubModel: false });
        break;
      }
      case CONTROL_SET_EFFORT:
        ctx.db.chooseEffort(row.id, pick.value);
        // No process reads it back until one runs on it: the level it is
        // chosen at is the one it runs at.
        ctx.db.noteInstanceEffort(row.id, pick.value);
        break;
      case CONTROL_SET_PERMISSION_MODE: {
        const unfit = ctx.sessionModeRefusal(row.id, pick.value);
        if (unfit) {
          return { refusal: unfit };
        }
        ctx.db.patchInstance(row.id, { permissionMode: pick.value });
        break;
      }
      default:
        break;
    }
    // A process that may run on a machine that is away takes it as the
    // machine is back; a start still owed to its machine (kept while it
    // updates, or paced) was made before the pick, and its launch takes it.
    if (
      (!ctx.registry.agent(row.machineId) && MAY_RUN.has(row.status)) ||
      ctx.db.owesSpawn(row.id)
    ) {
      hold(row, pick);
    }
    console.info(
      `[hub] ${ctx.sessionName(row)} keeps its ${pick.method} pick (${pick.value}) for its next launch: no process of it takes it now (${row.status})`
    );
    return "kept";
  };

  /** `row`'s process asked to take `pick`, as its control. */
  const ask = (row: InstanceRow, pick: SettingPick) => {
    const call = <K extends SettingPick["method"]>(
      method: K,
      args: ControlArgs<K>
    ) =>
      ctx.machineCalls.callAgent(
        row.machineId,
        method,
        args,
        BUSY_TIMEOUT_MS,
        undefined,
        row.id
      );
    switch (pick.method) {
      case CONTROL_SET_MODEL:
        return call(pick.method, [pick.value]);
      case CONTROL_SET_EFFORT:
        return call(pick.method, [pick.value]);
      case CONTROL_SET_PERMISSION_MODE:
        return call(pick.method, [pick.value]);
      default:
        throw unreachable(pick);
    }
  };

  /**
   * Asks `row`'s process to take one held pick, as its control; the hold on
   * it ends either way. One it did not take is said in the log: the process
   * runs on what it ran on, and its row follows its word from here.
   */
  const sendHeld = async (
    row: InstanceRow,
    pick: SettingPick,
    drop: () => void
  ): Promise<void> => {
    const answer = await ask(row, pick);
    drop();
    const name = ctx.sessionName(row);
    if (answer.kind === "unanswered") {
      console.warn(
        `[hub] ${name} did not answer its ${pick.method} pick (${pick.value}) held while ${ctx.machineName(row.machineId)} was away; it runs on what it ran on`
      );
      return;
    }
    if (!answer.value.ok) {
      console.warn(
        `[hub] ${name} refused its ${pick.method} pick (${pick.value}) held while ${ctx.machineName(row.machineId)} was away: ${answer.value.error ?? "no reason given"}`
      );
    }
  };

  /**
   * Bypass or Full Send, picked while its machine was away for a process
   * in another mode: the process is relaunched in it, now when it is at
   * rest, else at its turn's end (limit-moves.ts owed relaunch), as the
   * picker relaunches a running session into it. The hold stays until that
   * launch takes it (`bounded`).
   */
  const relaunchInto = async (row: InstanceRow): Promise<void> => {
    if (!ctx.owedMoves.has(row.id)) {
      ctx.owedMoves.set(row.id, { move: null, waits: "turn" });
    }
    if (await ctx.sessionIdle(row)) {
      ctx.relaunchOnAccount(row.id);
    }
  };

  /** Each pick held for `row`'s process, sent to it ({@link sendHeld}) or relaunching it ({@link relaunchInto}). */
  const applyHeld = (row: InstanceRow, held: HeldPicks): void => {
    // The hold on one setting ends as its process answers, unless a newer
    // pick of it was held meanwhile: that one goes at the next register.
    const drop =
      <F extends keyof HeldPicks>(field: F, sent: HeldPicks[F]) =>
      () => {
        const now = ctx.db.heldPicks.get(row.id);
        if (now && Bun.deepEquals(now[field], sent)) {
          const { [field]: _answered, ...rest } = now;
          ctx.db.heldPicks.put(row.id, rest);
        }
      };
    if (held.model !== undefined) {
      const pick = { method: CONTROL_SET_MODEL, value: held.model } as const;
      detach(sendHeld(row, pick, drop("model", held.model)), "held model pick");
    }
    if (held.effort !== undefined) {
      const pick = { method: CONTROL_SET_EFFORT, value: held.effort } as const;
      detach(
        sendHeld(row, pick, drop("effort", held.effort)),
        "held effort pick"
      );
    }
    const mode = held.permissionMode;
    if (!mode) {
      return;
    }
    if (bypasses(mode.mode) && !bypasses(mode.runs)) {
      detach(relaunchInto(row), "held mode relaunch");
      return;
    }
    const pick = {
      method: CONTROL_SET_PERMISSION_MODE,
      value: mode.mode,
    } as const;
    detach(sendHeld(row, pick, drop("permissionMode", mode)), "held mode pick");
  };

  /**
   * `machineId` registered again, running `live`: each pick held for a
   * process of its goes to that process now, as its control, ahead of what
   * was held for the session (its sends), so its next turn runs on it. A
   * session whose process is gone runs on its row from its next launch,
   * which already holds the pick: its hold ends. One whose start is still
   * owed keeps it for that start's launch (`bounded`).
   */
  const applyHeldPicks = (machineId: string, live: readonly string[]) => {
    for (const [id, held] of ctx.db.heldPicks.list()) {
      const [row] = ctx.db.getInstancesByIds([id]);
      if (row && row.machineId !== machineId) {
        continue;
      }
      if (row && live.includes(id)) {
        applyHeld(row, held);
      } else if (!ctx.db.owesSpawn(id)) {
        ctx.db.heldPicks.delete(id);
      }
    }
  };

  return { applyHeldPicks, keepPick, processTakes };
};
