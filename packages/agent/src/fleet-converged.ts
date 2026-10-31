/**
 * What this machine's harnesses last converged of the fleet, kept on disk
 * (core paths.ts `fleetConvergedFile`): each item's hash as a converge
 * wrote it, and the report that converge came to. It is the converge's
 * basis: an item a delta carries whose hash this already holds is not
 * written again (fleet-desired.ts `apply`), so an agent that starts again
 * converges only what moved while it was away, with no probe; the report is
 * the one a partial converge lays its parts over (session.ts
 * `#convergeSoon`).
 *
 * A Linux workspace boundary's form names what the fleet sync wrote that it
 * binds by these hashes ({@link syncedHeld}), never by a stat of the disk.
 */
import type { FleetSyncReport } from "@cawco/core";
import { itemKind } from "@cawco/core/fleet-items";
import { fleetConvergedFile } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { FleetSyncReportSchema } from "@cawco/core/stored-shapes";
import { z } from "zod";

export interface FleetConverged {
  /**
   * The agent build (build.ts `buildKey`) whose converge of every part last
   * ended. A build that is not it converges every part once as the hub
   * welcomes it: what an earlier build's rules left (a plugin record at a
   * scope it did not look at) is the new build's to take away, with nothing
   * moved at the hub. None before the first such converge.
   */
  build?: string;
  /**
   * The generation of the desired state whose converge has ended: every
   * item a delta up to it moved was converged (ok or failed), its
   * `convergedGeneration` beside the `observedGeneration` it kept (core
   * `FleetAck`). None before its first converge.
   */
  generation?: number;
  /** Each item a converge wrote (the policy as its write landed), by id, with its hash. */
  items: Record<string, string>;
  /** The report the machine last sent; none before its first converge. */
  report?: FleetSyncReport;
}

const FleetConvergedShape = z.object({
  build: z.string().optional(),
  generation: z.number().optional(),
  items: z.record(z.string(), z.string()),
  report: FleetSyncReportSchema.optional(),
});

/** What the file holds; nothing converged when there is none, or it does not read (said). */
export const readConverged = async (): Promise<FleetConverged> => {
  try {
    return (
      (await readRecord(fleetConvergedFile(), FleetConvergedShape)) ?? {
        items: {},
      }
    );
  } catch (error) {
    console.warn(
      `[fleet] ${fleetConvergedFile()} was not read, so every item the hub sends is converged again: ${error instanceof Error ? error.message : String(error)}`
    );
    return { items: {} };
  }
};

/** Each write, one after another, so the last converge's is the one on disk. */
let writing: Promise<void> = Promise.resolve();

/** `converged` written whole, after every write begun before it. */
export const keepConverged = (converged: FleetConverged): Promise<void> => {
  const next = writing.then(() =>
    writeStateFile(fleetConvergedFile(), JSON.stringify(converged))
  );
  writing = next.catch(() => undefined);
  return next;
};

/**
 * What of the fleet sync's writes a Linux boundary binds, named by the
 * hashes of the items converged into each (core `fleetSyncedPaths`): a file
 * bind keeps the file it was made over, so each item written into a bound
 * file is named by its hash (the memory into each harness's memory file;
 * the policy, the fleet's hooks and plugins into `~/.claude/settings.json`);
 * a dir bind shows what the dir holds as it changes, but only if the dir
 * stood as the boundary started, so a bound dir in a harness's own home is
 * named by whether any item that makes it is held (skills, vendored
 * plugins); CawCo's own (the hook scripts', the MCP installs') are made
 * before any boundary starts (boundary.ts `planFor`) and name nothing. A
 * project's rows sit inside the clone the boundary binds and name nothing
 * here. A memory document, a project's hook or skill, or an MCP server
 * moves no form.
 */
export const syncedHeld = async (): Promise<string> => {
  const { items } = await readConverged();
  const lines: string[] = [];
  const made = new Set<string>();
  for (const [id, hash] of Object.entries(items).sort(([a], [b]) =>
    a < b ? -1 : Number(a > b)
  )) {
    const kind = itemKind(id);
    if (
      kind === "memory" ||
      kind === "policy" ||
      kind === "hook" ||
      kind === "plugin"
    ) {
      lines.push(`${id} ${hash}`);
    }
    if (kind === "skill") {
      made.add("skills");
    } else if (kind === "pluginPayload") {
      made.add("vendored plugins");
    }
  }
  return [...lines, ...[...made].sort().map((dir) => `${dir} made`)].join("\n");
};
