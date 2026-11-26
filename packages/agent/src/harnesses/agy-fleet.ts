/**
 * The fleet's config on Antigravity, in files CawCo owns: the fleet's
 * skills in CawCo's own dir ({@link AGY_SKILLS}) and its memory in CawCo's
 * own file (core `fleetMemoryFile`), each placed in every session's own agy
 * dir (`--gemini-dir`, core paths/harnesses.ts `agySessionDir`), which agy
 * reads as its whole home (the project's `assets/b3380ec3/
 * agy-harness-parity.md` §P-o). Two sessions of one account read only
 * their own dirs' skills, `GEMINI.md` and `config/hooks.json`, while
 * sharing the account's app-data dir, its sign-in and conversations (the
 * project's `assets/cbec55e2/REPORT.md` Q2). agy reads its skills and its
 * global rules again before each turn ("Antigravity rereads your rules and
 * skills before each turn", its customization-discovery doc), and follows
 * a link in its home, so a sync reaches a running session on its next turn
 * (the project's `assets/8c459ba3/q1-summary.txt`). The person's own
 * `~/.gemini` is never read or written. CawCo places none of the fleet in
 * the account's home, where its own runs go; a home item 9 linked keeps
 * those links, which a session started before this layout still runs on
 * (its host outlives an agent restart) until it relaunches.
 *
 * - **Skills**: `<dir>/skills`, a link to {@link AGY_SKILLS}, which the
 *   sync writes (fleet.ts `syncSkillFiles`); for a session with a starting
 *   set, a dir of links to the set's skills alone, each listed once its
 *   skill is synced (agy 1.5.18 lists a skill through a link and passes
 *   over one whose skill is not there yet).
 * - **Memory**: `<dir>/GEMINI.md`, which agy keeps always on (its rules
 *   doc: "AGENTS.md and GEMINI.md do not use frontmatter… keeps it
 *   continuously active"): the fleet's memory, then the session's own
 *   documents (its folder's placed memory, the hub's documents for it),
 *   which its dir keeps apart ({@link OWN_MEMORY}) so a sync writes the
 *   file again with the fleet's new memory.
 * - **Hooks**: CawCo's one hook in each dir runs the fleet's
 *   (agy-fleet-hooks.ts); their states are read from the harness set
 *   (fleet-harness-set.ts).
 * - **MCP servers**: handed to each session in `session/new`, through its
 *   gate (agy-sessiond.ts `mcpServersOf`), never in a dir's
 *   `mcp_config.json`.
 *
 * agy also reads `skills/` in the account's shared app-data dir, which
 * every session of the account would list: CawCo writes nothing there.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import type {
  FleetHoldings,
  FleetItemState,
  FleetSyncReport,
  PlacedFleetConfig,
} from "@cawco/core/fleet";
import { makeFolder } from "@cawco/core/folders";
import { fleetMemoryFile } from "@cawco/core/paths/fleet";
import {
  agyFleetRoot,
  agySessionDirs,
  harnessRecordsDir,
} from "@cawco/core/paths/harnesses";
import { writeStateFile } from "@cawco/core/state-file";
import { Effect, Schema } from "effect";
import { runPromise } from "../daemon-runtime";
import { heldSkills, memoryState, syncMemory, syncSkillFiles } from "../fleet";
import { hookStatesInSet, readFleetHarnessSet } from "../fleet-harness-set";
import { readFleetMemory } from "../fleet-memory";
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

/** The fleet's skills for Antigravity, one dir each session's dir links as its `skills`, or links its set's skills from. */
const AGY_SKILLS = join(agyFleetRoot(), "skills");
/** The fleet's memory, CawCo's own file, which opens each session's `GEMINI.md`. */
const AGY_MEMORY = fleetMemoryFile();
/** What the fleet sync last wrote for Antigravity, by hash. */
const AGY_SIDECAR = join(harnessRecordsDir("agy"), "fleet.json");

/** A session dir's fleet could not be placed. */
class AgyFleetLinkError extends Schema.TaggedError<AgyFleetLinkError>()(
  "AgyFleetLinkError",
  { link: Schema.String, cause: Schema.Defect() }
) {}

/** `work` on `link`, or why not. */
const placing = <A>(link: string, work: () => Promise<A>) =>
  Effect.tryPromise({
    try: work,
    catch: (cause) => new AgyFleetLinkError({ link, cause }),
  });

/** What one session's dir takes of the fleet. */
export interface AgySessionFleet {
  /** The session's own memory documents, each headed by its path; empty for none. */
  readonly memory: string;
  /** The skills it may list, by name (its starting set's); none named, every skill of the fleet's. */
  readonly skills: readonly string[] | undefined;
}

/** The session's own memory documents in its dir, apart from its `GEMINI.md`, which a sync writes again from them. */
const OWN_MEMORY = "cawco-memory.md";

/** A name that is one skill's dir in {@link AGY_SKILLS}; a set's plugin skill (`plugin:skill`) or a path is none. */
const fleetSkillName = (name: string): boolean =>
  basename(name) === name && !name.startsWith(".") && !name.includes(":");

/**
 * Session dir `dir`'s `GEMINI.md`, whole: the fleet's memory as it is now,
 * then the session's own documents. A dir that holds none of them, being
 * removed or never placed, is left as it is.
 */
const writeMemory = async (dir: string): Promise<void> => {
  const own = await readFile(join(dir, OWN_MEMORY), "utf8").catch(
    unlessGone(undefined)
  );
  if (own === undefined) {
    return;
  }
  const fleet = (await readFleetMemory())?.trim() ?? "";
  await writeStateFile(
    join(dir, "GEMINI.md"),
    `${[fleet, own.trim()].filter(Boolean).join("\n\n")}\n`
  );
};

/**
 * Session dir `dir` given its fleet: its skills (every one, or its set's
 * alone) and its memory, its own documents with the fleet's. Every launch
 * places it afresh, so a conversation resumed under another set takes
 * that set.
 */
export const placeAgyFleet = Effect.fn("placeAgyFleet")(function* (
  dir: string,
  fleet: AgySessionFleet
) {
  yield* placing(AGY_SKILLS, () => makeFolder(AGY_SKILLS));
  yield* placing(dir, () => makeFolder(dir, { mode: 0o700 }));
  const skills = join(dir, "skills");
  const { skills: names } = fleet;
  if (names === undefined) {
    yield* placing(skills, () => pointLink(skills, AGY_SKILLS));
  } else {
    yield* placing(skills, async () => {
      await rm(skills, { recursive: true, force: true });
      await makeFolder(skills, { mode: 0o700 });
    });
    yield* Effect.forEach(
      names.filter(fleetSkillName),
      (name) =>
        placing(join(skills, name), () =>
          pointLink(join(skills, name), join(AGY_SKILLS, name))
        ),
      { discard: true }
    );
  }
  const memory = join(dir, "GEMINI.md");
  yield* placing(memory, async () => {
    await writeStateFile(join(dir, OWN_MEMORY), fleet.memory);
    await writeMemory(dir);
  });
});

/** What a sync could not place, said on the log. */
const sayUnplaced = Effect.catch((error: AgyFleetLinkError) =>
  Effect.logWarning(
    `[fleet] agy: ${error.link} was not written: ${String(error.cause)}`
  )
);

/** Every session dir of each account `accountIds` names, its `GEMINI.md` written again; one that fails is said on the log. */
const rewriteMemories = (accountIds: readonly string[]): Promise<void> =>
  runPromise(
    Effect.forEach(
      accountIds,
      (accountId) => {
        const dirs = agySessionDirs(accountId);
        return placing(dirs, () => readdir(dirs).catch(unlessGone([]))).pipe(
          Effect.flatMap((names) =>
            Effect.forEach(
              names,
              (name) =>
                placing(join(dirs, name, "GEMINI.md"), () =>
                  writeMemory(join(dirs, name))
                ).pipe(sayUnplaced),
              { discard: true }
            )
          ),
          sayUnplaced
        );
      },
      { discard: true }
    )
  );

/**
 * The parts of a fleet sync Antigravity has: its skills, into
 * {@link AGY_SKILLS}, which each session's dir links, and its memory, into
 * the fleet's memory file, written again into the `GEMINI.md` of every
 * session dir of `accountIds`. Its hooks' states are
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
  if (parts.has("memory")) {
    await rewriteMemories(accountIds);
  }
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
