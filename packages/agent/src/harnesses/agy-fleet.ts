/**
 * The fleet's config on Antigravity, in files CawCo owns: the fleet's
 * skills in CawCo's own dir ({@link AGY_SKILLS}) and its memory in CawCo's
 * own file (core `fleetMemoryFile`), each linked into every account's agy
 * home, which agy reads as its whole home (`--gemini-dir`: the project's
 * `assets/b3380ec3/agy-harness-parity.md` §P-o). agy reads its skills and
 * its global rules again before each turn ("Antigravity rereads your rules
 * and skills before each turn", its customization-discovery doc), so a
 * sync reaches a running session on its next turn. agy 1.5.18 follows a
 * link in its home, a dir's and a file's alike, and a skill added and a
 * memory changed behind a link were in the model request of the running
 * session's next turn (the project's `assets/8c459ba3/q1-summary.txt`).
 * The person's own `~/.gemini` is never read or written.
 *
 * - **Skills**: `<home>/skills`, a link to {@link AGY_SKILLS}, which the
 *   sync writes (fleet.ts `syncSkillFiles`).
 * - **Memory**: `<home>/GEMINI.md`, a link to the fleet's memory file, which
 *   agy keeps always on (its rules doc: "AGENTS.md and GEMINI.md do not use
 *   frontmatter… keeps it continuously active"). A session's own documents
 *   (its folder's placed memory, the hub's documents for it) are its
 *   system prompt's, appended as it starts (agy-sessiond.ts), since one
 *   home holds every session of its account.
 * - **Hooks**: CawCo's one hook in the home runs the fleet's
 *   (agy-fleet-hooks.ts); their states are read from the harness set
 *   (fleet-harness-set.ts).
 * - **MCP servers**: handed to each session in `session/new`, through its
 *   gate (agy-sessiond.ts `mcpServersOf`), never in the home's
 *   `mcp_config.json`, which every session of the home would start.
 */
import { join } from "node:path";
import type {
  FleetHoldings,
  FleetItemState,
  FleetSyncReport,
  PlacedFleetConfig,
} from "@cawco/core/fleet";
import { makeFolder } from "@cawco/core/folders";
import { fleetMemoryFile } from "@cawco/core/paths/fleet";
import {
  agyAccountHome,
  agyFleetRoot,
  harnessRecordsDir,
} from "@cawco/core/paths/harnesses";
import { Effect, Schema } from "effect";
import { heldSkills, memoryState, syncMemory, syncSkillFiles } from "../fleet";
import { hookStatesInSet, readFleetHarnessSet } from "../fleet-harness-set";
import type { FleetPart } from "../fleet-parts";
import { placeSets } from "../fleet-place-set";
import { writeJson } from "../json-file";
import {
  type FleetSidecar,
  fleetReport,
  pointLink,
  readSidecar,
  skillStatesIn,
} from "./fleet-common";

/** The fleet's skills for Antigravity, one dir every account's home links as its `skills`. */
const AGY_SKILLS = join(agyFleetRoot(), "skills");
/** The fleet's memory, CawCo's own file, which every account's home links as its `GEMINI.md`. */
const AGY_MEMORY = fleetMemoryFile();
/** What the fleet sync last wrote for Antigravity, by hash. */
const AGY_SIDECAR = join(harnessRecordsDir("agy"), "fleet.json");

/** A home's fleet links could not be made. */
class AgyFleetLinkError extends Schema.TaggedError<AgyFleetLinkError>()(
  "AgyFleetLinkError",
  { link: Schema.String, cause: Schema.Defect() }
) {}

/** `link` pointing at `target` ({@link pointLink}), or why not. */
const linkTo = (link: string, target: string) =>
  Effect.tryPromise({
    try: () => pointLink(link, target),
    catch: (cause) => new AgyFleetLinkError({ link, cause }),
  });

/**
 * Agy home `home` linked to the fleet's skills and memory: what every
 * launch readies (agy-launch.ts `prepareAgyHome`), so a home made after
 * the last sync takes the fleet as it stands.
 */
export const linkAgyFleet = Effect.fn("linkAgyFleet")(function* (home: string) {
  yield* Effect.promise(() => makeFolder(AGY_SKILLS));
  yield* Effect.promise(() => makeFolder(home));
  yield* linkTo(join(home, "skills"), AGY_SKILLS);
  yield* linkTo(join(home, "GEMINI.md"), AGY_MEMORY);
});

/** Every account home `accountIds` names, linked ({@link linkAgyFleet}); one that fails is said on the log. */
const linkHomes = (accountIds: readonly string[]): Promise<void> =>
  Effect.runPromise(
    Effect.forEach(
      accountIds,
      (accountId) =>
        linkAgyFleet(agyAccountHome(accountId)).pipe(
          Effect.catch((error) =>
            Effect.logWarning(
              `[fleet] agy: ${error.link} was not linked: ${String(error.cause)}`
            )
          )
        ),
      { discard: true }
    )
  );

/**
 * The parts of a fleet sync Antigravity has: its skills, into
 * {@link AGY_SKILLS}, and its memory, into the fleet's memory file, each
 * linked into every account home of `accountIds`. Its hooks' states are
 * read from the harness set once every harness's converge has ended
 * ({@link agyFleetHooks}); its MCP servers reach each session as it starts.
 */
export const syncAgyFleet = async (
  config: PlacedFleetConfig,
  parts: ReadonlySet<FleetPart>,
  accountIds: readonly string[]
): Promise<FleetSyncReport> => {
  const sidecar = await readSidecar(AGY_SIDECAR);
  const skillStates: Record<string, FleetItemState> = {};
  const report = fleetReport(skillStates);
  const skills = parts.has("skills")
    ? await syncSkillFiles(
        AGY_SKILLS,
        config.skills,
        sidecar.skills,
        skillStates
      )
    : sidecar.skills;
  const memory = parts.has("memory")
    ? await syncMemory(AGY_MEMORY, config.memory, sidecar.memory, report)
    : sidecar.memory;
  if (parts.has("skills") || parts.has("memory")) {
    await writeJson(AGY_SIDECAR, {
      skills,
      ...(memory ? { memory } : {}),
      userLayerMoved: true,
    } satisfies FleetSidecar);
  }
  await linkHomes(accountIds);
  return report;
};

/** The skills CawCo wrote for Antigravity, as they are on disk now. */
export const agyFleetHoldings = async (): Promise<FleetHoldings> => {
  const sidecar = await readSidecar(AGY_SIDECAR);
  return { skills: await heldSkills(AGY_SKILLS, Object.keys(sidecar.skills)) };
};

/** Each fleet hook as CawCo runs it on Antigravity: from the harness set and the places' files, as last written; what it cannot run, unsupported. */
export const agyFleetHooks = async (): Promise<
  Record<string, FleetItemState>
> => hookStatesInSet("agy", await readFleetHarnessSet(), await placeSets());

/** What Antigravity has of what CawCo last put on it, unchanged. */
export const agyFleetStatus = async (): Promise<FleetSyncReport> => {
  const sidecar = await readSidecar(AGY_SIDECAR);
  return {
    ...fleetReport(await skillStatesIn(AGY_SKILLS, sidecar.skills)),
    hooks: await agyFleetHooks(),
    ...(sidecar.memory === undefined
      ? {}
      : { memory: await memoryState(AGY_MEMORY, sidecar.memory) }),
  };
};
