/**
 * Fleet-wide tool denials. The fleet baseline lives in the hub's
 * `supervisor_config.denied_tools` column and reaches every machine through
 * the normal fleet-sync path (`FleetConfig.deniedTools`). The sidecar
 * (core paths/fleet.ts `claudeFleetSidecarFile`, in CawCo's data dir) caches the last-synced value so a machine
 * that loses its hub still has a policy.
 *
 * Beside the baseline, a session is denied its harness's own to-do list and
 * plan mode (core `OWN_LIST_DENIED`) while the fleet's step lists are
 * CawCo's, its own subagents (core `SUBAGENTS_DENIED`) while its helpers are
 * CawCo's delegates (core own-tools.ts, the `policy` item's `ownTools`), and
 * its own question tool (core `QUESTION_TOOL_DENIED`) always, at spawn
 * alone. Those names are never stored in the baseline; they are added here.
 *
 * A machine that has not heard the list, or cannot read the sidecar, spawns
 * nothing: no compiled list stands in for the fleet's.
 *
 * The list is the policy the hub's welcome carries (core fleet.ts
 * `FLEET_DELTA`): the agent writes it as the welcome arrives
 * ({@link applyFleetDenials}), before it answers, and the hub marks the
 * machine online only on that answer. So a machine online holds the list,
 * and a spawn waits on nothing but a write already under way: a missing
 * list at a spawn is a fault, said at once.
 *
 * The spawn paths (`claude.ts`, `opencode.ts`, `pi.ts`) read them through
 * {@link sessionFleetDenials}: the baseline, the own-list set and the
 * subagents as the fleet's switches say, and the question tool, carried in each session's own start options. They
 * are the only place the denials apply. Nothing CawCo denies is written into
 * the person's own settings: the `claude` they start themselves keeps every
 * tool their settings give it.
 *
 * Earlier versions wrote the baseline, the own-list set and the subagents
 * into `~/.claude/settings.json` too. {@link dropWrittenDenials} takes those
 * names back out once, at daemon start and on each fleet sync until it has.
 */

import {
  OWN_LIST_DENIED,
  QUESTION_TOOL_DENIED,
  SUBAGENTS_DENIED,
} from "@cawco/core/delegate-types";
import { makeLock } from "@cawco/core/keyed-lock";
import {
  OWN_TOOLS_DEFAULT,
  type OwnTools,
  OwnToolsSchema,
} from "@cawco/core/own-tools";
import { userLayerPath } from "@cawco/core/paths/claude";
import { claudeFleetSidecarFile } from "@cawco/core/paths/fleet";
import { writeStateFile } from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { clockWords } from "@cawco/core/words/account-lines";
import { toolWords } from "@cawco/core/words/tools";
import { Schema } from "effect";
import { z } from "zod";
import {
  readSettingsFile,
  settingsOf,
  writeSettingsFile,
} from "./claude-settings-file";

/** The person's own Claude Code settings, which earlier versions wrote the denials into. */
const SETTINGS = userLayerPath("settings.json");

/** The sidecar: the policy as each welcome or delta arrives, and what earlier versions wrote into {@link SETTINGS} until it is out. */
const SIDECAR = claudeFleetSidecarFile();

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const OBJECT = z.record(z.string(), z.unknown());

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  const object = OBJECT.safeParse(value);
  return object.success ? object.data : undefined;
};

/** The fleet's denials as this machine last heard them. */
interface FleetDenials {
  /** The baseline. */
  deniedTools: readonly string[];
  /** Whether sessions use CawCo's delegates and plan list or their agent's own. */
  ownTools: OwnTools;
}

/**
 * What the sidecar says of the fleet's denials: the list, or
 * that this machine has not heard them yet (no sidecar, or one written before
 * a sync carried `deniedTools`), or why the sidecar cannot be read.
 */
export type FleetDenialsRead =
  | { kind: "known"; denials: FleetDenials }
  | { kind: "unsynced"; reason: string }
  | { kind: "unreadable"; reason: string };

const UNSYNCED = `this machine has not written the fleet's denied tools (${SIDECAR})`;

/**
 * The fleet's denials as the last sync wrote them, read now. Nothing stands in
 * for a list the hub never sent: a machine that has not heard it, or cannot
 * read it, says so ({@link resolvedFleetDenials} refuses on it). An empty list
 * is only ever the operator's own, cleared in the hub.
 */
export const readFleetDenials = async (): Promise<FleetDenialsRead> => {
  // Read as a settings file is (claude-settings-file.ts): it is in Claude
  // Code's folder, and a pipe or a folder in its place is never opened.
  const read = await readSettingsFile(SIDECAR);
  if (read.state === "absent") {
    return { kind: "unsynced", reason: UNSYNCED };
  }
  if (read.state === "unread") {
    return {
      kind: "unreadable",
      reason: toolWords.settingsSourceUnread(SIDECAR, read.why),
    };
  }
  const stored: unknown = read.settings;
  const sidecar = asRecord(stored);
  if (!sidecar) {
    return {
      kind: "unreadable",
      reason: toolWords.settingsSourceUnread(
        SIDECAR,
        toolWords.settingsNotAnObject
      ),
    };
  }
  if (sidecar.deniedTools === undefined) {
    return { kind: "unsynced", reason: UNSYNCED };
  }
  const list = sidecar.deniedTools;
  if (!(
    Array.isArray(list) && list.every((tool) => typeof tool === "string")
  )) {
    return {
      kind: "unreadable",
      reason: `${SIDECAR}: deniedTools is not a list of tool names`,
    };
  }
  // A sidecar a version before the switches wrote holds none: CawCo's own
  // way on both, as that version spawned.
  const own =
    sidecar.ownTools === undefined
      ? { success: true as const, data: OWN_TOOLS_DEFAULT }
      : OwnToolsSchema.safeParse(sidecar.ownTools);
  if (!own.success) {
    return {
      kind: "unreadable",
      reason: `${SIDECAR}: ownTools is not the fleet's helpers and step lists`,
    };
  }
  return {
    kind: "known",
    denials: { deniedTools: list, ownTools: own.data },
  };
};

/** The policy write a welcome or delta began last: what a spawn waits on, and all it waits on. */
let writing: Promise<void> = Promise.resolve();

/** The last policy write's failure, in its words, until a write lands. */
let lastFailure: { at: number; reason: string } | undefined;

/** The sidecar's writes, one at a time: a delta's policy never lands inside a converge's write of the rest. */
const sidecarQueue = makeLock();

/**
 * Runs `work`, a write of the sidecar, after every write of it before:
 * {@link applyFleetDenials}'s, and the converge's own (fleet.ts), which
 * keeps the denials the sidecar holds as it writes.
 */
export const sidecarTurn = <T>(work: () => Promise<T>): Promise<T> =>
  sidecarQueue.run(work);

/**
 * The fleet's denials, as a welcome or a delta carried them, into the
 * sidecar before the agent answers it; then what earlier versions wrote into
 * the person's settings goes, if it has not yet ({@link dropWrittenDenials}),
 * which is what it answers. Throws in its own words when the sidecar cannot
 * be written: the agent refuses the delta with them (NACK), and a spawn
 * refuses with them too.
 */
export const applyFleetDenials = (
  deniedTools: readonly string[],
  ownTools: OwnTools
): Promise<DeniedCleanup> => {
  const write = (async () => {
    try {
      await sidecarTurn(async () => {
        // A sidecar that does not parse holds nothing to keep: it is
        // rewritten whole, as it always has been. It is CawCo's own file,
        // never the person's.
        const sidecar = await readSettingsFile(SIDECAR);
        const stored = sidecar.state === "read" ? sidecar.settings : undefined;
        // What an earlier version wrote, named before the list it was
        // written from is replaced.
        const written = writtenOf(stored);
        await writeStateFile(
          SIDECAR,
          JSON.stringify(
            {
              ...stored,
              deniedTools: [...deniedTools],
              ownTools,
              ...(written.kind === "known"
                ? { deniedWritten: [...written.names] }
                : {}),
            },
            null,
            2
          )
        );
      });
    } catch (error) {
      const reason = `could not write ${SIDECAR}: ${said(error)}`;
      lastFailure = { at: Date.now(), reason };
      throw new Error(reason, { cause: error });
    }
    lastFailure = undefined;
    const dropped = await dropWrittenDenials();
    if (dropped.state === "failed") {
      console.warn(`[fleet] ${dropped.detail}`);
    }
    return dropped;
  })();
  writing = write.then(
    () => undefined,
    () => undefined
  );
  return write;
};

/** A spawn refused because the fleet's denials are not known here, in words. */
class FleetDenialsRefused extends Schema.TaggedError<FleetDenialsRefused>()(
  "FleetDenialsRefused",
  { message: Schema.String }
) {
  constructor(reason: string) {
    super({ message: `Not started: ${reason}.` });
  }
}

/**
 * The single source of truth for the fleet's denials. Both the spawn path
 * and the settings-convergence path read the sidecar through
 * {@link readFleetDenials}, so they read the same value and cannot drift.
 *
 * Waits only on a policy write already under way (a welcome that arrived
 * with the spawn behind it). A machine with no list after that, or whose
 * sidecar cannot be read, refuses at once with {@link FleetDenialsRefused}:
 * the hub marks a machine online only once it has written the list, so
 * none here is a fault, said in words that say which.
 */
const resolvedFleetDenials = async (): Promise<FleetDenials> => {
  await writing;
  const read = await readFleetDenials();
  switch (read.kind) {
    case "known":
      return read.denials;
    case "unsynced":
      throw new FleetDenialsRefused(
        lastFailure
          ? `${read.reason}: the policy the hub sent at ${clockWords(lastFailure.at)} could not be written (${lastFailure.reason})`
          : `${read.reason}: the hub marks a machine online only once it has written them, so this start reached the machine before the hub's welcome`
      );
    case "unreadable":
      throw new FleetDenialsRefused(read.reason);
    default:
      unhandled("read", read);
  }
};

/**
 * What the fleet denies a session being spawned: the baseline; the own-list
 * set while the fleet's step lists are CawCo's; the subagents while its
 * helpers are CawCo's delegates; and the harness's own question tool always
 * (core `QUESTION_TOOL_DENIED`: a session asks the person through CawCo's
 * `ask`). The spawn's own `denyTools` union on top, in each adapter, so a
 * delegate type that denies the subagents keeps them denied either way.
 */
export const sessionFleetDenials = async (): Promise<string[]> => {
  const { deniedTools, ownTools } = await resolvedFleetDenials();
  return [
    ...new Set([
      ...deniedTools,
      ...(ownTools.stepLists === "cawco" ? OWN_LIST_DENIED : []),
      ...(ownTools.helpers === "delegates" ? SUBAGENTS_DENIED : []),
      ...QUESTION_TOOL_DENIED,
    ]),
  ];
};

/**
 * Whether sessions use CawCo's delegates and plan list or their agent's own,
 * as this machine last heard the fleet's switches (core own-tools.ts): what
 * a harness reads that sets them per server rather than per session
 * (OpenCode's plan agent). CawCo's own way on both while it has heard none
 * or cannot read them; a spawn then refuses on its own
 * ({@link sessionFleetDenials}).
 */
export const fleetOwnTools = async (): Promise<OwnTools> => {
  const read = await readFleetDenials();
  return read.kind === "known" ? read.denials.ownTools : OWN_TOOLS_DEFAULT;
};

const isNameList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((tool) => typeof tool === "string");

/**
 * What earlier versions wrote into the person's settings and is not out yet,
 * as the sidecar `stored` says it:
 * - `deniedWritten`, once a version that keeps it has written the sidecar:
 *   the names still to come out, none once they are;
 * - on a sidecar an earlier version left (a baseline and no
 *   `deniedWritten`), what it wrote on every converge: the baseline, the
 *   own-list set and the subagents. It put them back each time, so the file
 *   cannot say whether one was also the person's; each is taken as CawCo's;
 * - nothing on a machine that has never heard the list: nothing was written.
 */
const writtenOf = (
  stored: Record<string, unknown> | undefined
):
  | { kind: "known"; names: readonly string[] }
  | { kind: "unreadable"; reason: string } => {
  const written = stored?.deniedWritten;
  if (isNameList(written)) {
    return { kind: "known", names: written };
  }
  if (written !== undefined) {
    return {
      kind: "unreadable",
      reason: `${SIDECAR}: deniedWritten is not a list of tool names`,
    };
  }
  const baseline = stored?.deniedTools;
  if (baseline === undefined) {
    return { kind: "known", names: [] };
  }
  if (!isNameList(baseline)) {
    return {
      kind: "unreadable",
      reason: `${SIDECAR}: deniedTools is not a list of tool names`,
    };
  }
  return {
    kind: "known",
    names: [...new Set([...baseline, ...OWN_LIST_DENIED, ...SUBAGENTS_DENIED])],
  };
};

/**
 * The settings without each of `names` in `permissions.deny`, and how many
 * went. A rule is taken out only where it is one of `names` exactly; every
 * other rule, and every other key, comes back out as it went in.
 */
const withoutNames = (
  settings: Record<string, unknown>,
  names: readonly string[]
): { gone: string[]; next: Record<string, unknown> } => {
  const permissions = asRecord(settings.permissions);
  const deny: unknown = permissions?.deny;
  if (!(permissions && Array.isArray(deny))) {
    return { gone: [], next: settings };
  }
  const out = new Set(names);
  const gone = deny.filter(
    (rule): rule is string => typeof rule === "string" && out.has(rule)
  );
  if (gone.length === 0) {
    return { gone, next: settings };
  }
  return {
    gone,
    next: {
      ...settings,
      permissions: {
        ...permissions,
        deny: deny.filter((rule) => !gone.includes(rule)),
      },
    },
  };
};

/** What {@link dropWrittenDenials} came to, so the daemon can say it in one line. */
export type DeniedCleanup =
  | { state: "none" }
  | { state: "dropped"; names: readonly string[] }
  | { state: "failed"; detail: string };

/**
 * Takes out of `~/.claude/settings.json`'s `permissions.deny` what earlier
 * versions wrote there ({@link writtenOf}), then records in the sidecar that
 * nothing is left to take out, so it runs once: a name the person adds there
 * afterwards stays. Run at daemon start and after each fleet sync's write
 * of the sidecar; once done, each run reads the sidecar and stops.
 *
 * Nothing is written over a settings file that is there and could not be
 * read (claude-settings-file.ts): the rest of it is the person's own. That
 * is `failed`, said with why, and the record stays for the next start or
 * sync to try again. A pipe in its place is never opened, so the daemon's
 * start, which runs this first, goes on.
 */
export const dropWrittenDenials = (): Promise<DeniedCleanup> =>
  sidecarTurn(async () => {
    try {
      const sidecar = await readSettingsFile(SIDECAR);
      if (sidecar.state === "unread") {
        return {
          state: "failed",
          detail: toolWords.settingsSourceUnread(SIDECAR, sidecar.why),
        };
      }
      const stored = sidecar.state === "read" ? sidecar.settings : undefined;
      const written = writtenOf(stored);
      if (written.kind === "unreadable") {
        return { state: "failed", detail: written.reason };
      }
      if (written.names.length === 0) {
        return { state: "none" };
      }
      const file = await readSettingsFile(SETTINGS);
      if (file.state === "unread") {
        return {
          state: "failed",
          detail: toolWords.settingsLeft(
            toolWords.settingsSourceUnread(SETTINGS, file.why)
          ),
        };
      }
      const { gone, next } = withoutNames(settingsOf(file), written.names);
      if (gone.length > 0) {
        await writeSettingsFile(SETTINGS, file, next);
      }
      await writeStateFile(
        SIDECAR,
        JSON.stringify({ ...stored, deniedWritten: [] }, null, 2)
      );
      return gone.length > 0
        ? { state: "dropped", names: gone }
        : { state: "none" };
    } catch (error) {
      return {
        state: "failed",
        detail: `could not take CawCo's denied tools out of ${SETTINGS}: ${said(error)}`,
      };
    }
  });
