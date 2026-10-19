/**
 * What a move asks depends only on the folder's settled state (hub
 * place-repo.ts `settled`, moves.ts `plan`). A project made from a plain
 * folder has the folder made a git repository off the request; a move's
 * plan asked for straight after waits for that step, so it never asks the
 * person to "git init" a folder CawCo is making a repository anyway.
 *
 * On a scratch fleet with two machines (real hub, agents and sessiond; no
 * session is started). Machine A is the fleet's own; machine B is
 * `probe-settled-b`. Each round makes a project on A from a fresh plain
 * folder and, with no wait, reads the move estimate to B:
 * - the estimate asks for no approval and its ask has no `git init`;
 * - the folder is a git repository by then (place-repo made it);
 * - once the folder is a repository, the estimate read again says the same:
 *   what the move asks did not depend on which step finished first.
 *
 *   bun scripts/probe-kit/run.ts move-settled
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MoveEstimate } from "../../../packages/core/src/move";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const B = "probe-settled-b";
/** Rounds per run: the race went either way on one hub, so every round must hold. */
const ROUNDS = 8;
/** Files per folder: enough that a first commit takes longer than an inspection. */
const FILES = 40;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The parts of an estimate that say what the person is asked. */
const asked = (estimate: MoveEstimate) => ({
  needsApproval: estimate.needsApproval,
  gitInit: estimate.ask?.gitInit ?? null,
  details: estimate.ask?.details ?? [],
  refused: estimate.refused ?? null,
});

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.launchMachine(B);

  for (const round of Array.from({ length: ROUNDS }, (_, index) => index + 1)) {
    const folder = join(fleet.sandbox, `plain-${round}`);
    // biome-ignore lint/performance/noAwaitInLoops: one round at a time, each its own race with nothing else running
    await mkdir(join(folder, "src"), { recursive: true });
    await Promise.all(
      Array.from({ length: FILES }, (_, index) =>
        writeFile(
          join(folder, "src", `file-${index}.ts`),
          `export const value${index} = ${index};\n`
        )
      )
    );
    await writeFile(join(folder, "README.md"), `# Plain ${round}\n`);
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: `Settled ${round}`,
      machineId: MACHINE,
      cwd: folder,
    });
    const query = `machine=${encodeURIComponent(B)}&path=${encodeURIComponent(join(fleet.sandbox, `moved-${round}`))}`;
    const first = asked(
      await fleet.api<MoveEstimate>(
        `/api/projects/${project.id}/move-estimate?${query}`
      )
    );
    const isRepo = existsSync(join(folder, ".git"));
    check(
      `round ${round}: the estimate asked straight away asks no "git init" and no approval`,
      first.refused === null &&
        first.needsApproval === false &&
        first.gitInit === false &&
        !first.details.includes("git init"),
      JSON.stringify(first)
    );
    check(
      `round ${round}: the folder is a git repository once the estimate answered`,
      isRepo,
      `${folder}/.git ${isRepo ? "exists" : "missing"}`
    );
    await until(
      `round ${round}: ${folder} a git repository`,
      () => existsSync(join(folder, ".git")),
      (made) => made,
      60_000
    );
    const settled = asked(
      await fleet.api<MoveEstimate>(
        `/api/projects/${project.id}/move-estimate?${query}`
      )
    );
    check(
      `round ${round}: the estimate read again once the folder is a repository says the same`,
      JSON.stringify(settled) === JSON.stringify(first),
      `first ${JSON.stringify(first)}, settled ${JSON.stringify(settled)}`
    );
  }
};

export default { name: "move-settled", run } satisfies Spec;
