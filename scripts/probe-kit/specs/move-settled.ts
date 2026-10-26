/**
 * What a move asks depends only on the folder's settled state (hub
 * place-repo.ts `settled` and `hold`, moves.ts `plan`). A plain folder made
 * a project's place is made a git repository off the request; a move's plan
 * asked for meanwhile waits for that step, so it never asks the person to
 * "git init" a folder CawCo is making a repository anyway.
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
 * One more round adds a plain folder to a project that has no checkout
 * yet, while the hub's read of the folder's remote is held: machine A is
 * paused (machine-pause.ts holds every command the hub runs there, the
 * remote read among them; the agent's own calls go on). The estimate asked
 * while the read is held must give the same settled answer once A resumes.
 *
 * Last, a move whose session names no permission mode is refused at once,
 * with the words every start that names none gets, and nothing is cloned.
 *
 *   bun scripts/probe-kit/run.ts move-settled
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MoveEstimate, MoveJob } from "../../../packages/core/src/move";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const B = "probe-settled-b";
/** Rounds per run: the race went either way on one hub, so every round must hold. */
const ROUNDS = 8;
/** Files per folder: enough that a first commit takes longer than an inspection. */
const FILES = 40;
/** How long the held round keeps the remote read held after asking for the estimate. */
const HELD_MS = 3000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The parts of an estimate that say what the person is asked. */
const asked = (estimate: MoveEstimate) => ({
  needsApproval: estimate.needsApproval,
  gitInit: estimate.ask?.gitInit ?? null,
  details: estimate.ask?.details ?? [],
  refused: estimate.refused ?? null,
});

/** A settled answer: no approval, no `git init`, nothing refused. */
const settledAnswer = (said: ReturnType<typeof asked>): boolean =>
  said.refused === null &&
  said.needsApproval === false &&
  said.gitInit === false &&
  !said.details.includes("git init");

/** A plain folder of {@link FILES} small sources and a README. */
const plainFolder = async (folder: string, name: string): Promise<void> => {
  await mkdir(join(folder, "src"), { recursive: true });
  await Promise.all(
    Array.from({ length: FILES }, (_, index) =>
      writeFile(
        join(folder, "src", `file-${index}.ts`),
        `export const value${index} = ${index};\n`
      )
    )
  );
  await writeFile(join(folder, "README.md"), `# ${name}\n`);
};

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

  const estimateQuery = (label: string): string =>
    `machine=${encodeURIComponent(B)}&path=${encodeURIComponent(join(fleet.sandbox, `moved-${label}`))}`;
  const repoMade = (label: string, dir: string) =>
    until(
      `${label}: ${dir} a git repository`,
      () => existsSync(join(dir, ".git")),
      (made) => made,
      60_000
    );

  for (const round of Array.from({ length: ROUNDS }, (_, index) => index + 1)) {
    const folder = join(fleet.sandbox, `plain-${round}`);
    // biome-ignore lint/performance/noAwaitInLoops: one round at a time, each its own race with nothing else running
    await plainFolder(folder, `Plain ${round}`);
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: `Settled ${round}`,
      machineId: MACHINE,
      cwd: folder,
    });
    const query = estimateQuery(String(round));
    const estimate = await fleet.api<MoveEstimate>(
      `/api/projects/${project.id}/move-estimate?${query}`
    );
    const first = asked(estimate);
    if (round === 1) {
      // Where it moves is said once, by the title the lines stand under: a
      // destination told apart from its namesakes was said twice.
      const title = estimate.ask?.title ?? "";
      const lines = estimate.ask?.lines ?? [];
      // "Move <folder> to <destination>?", the destination as the hub names
      // it among the fleet (core `machineCalled`).
      const destination = title.slice(title.lastIndexOf(" to ") + 4, -1);
      check(
        "the ask names where it moves once, in its title",
        destination.length > 0 && !lines.join(" ").includes(destination),
        [title, ...lines].join(" / ")
      );
    }
    const isRepo = existsSync(join(folder, ".git"));
    check(
      `round ${round}: the estimate asked straight away asks no "git init" and no approval`,
      settledAnswer(first),
      JSON.stringify(first)
    );
    check(
      `round ${round}: the folder is a git repository once the estimate answered`,
      isRepo,
      `${folder}/.git ${isRepo ? "exists" : "missing"}`
    );
    await repoMade(`round ${round}`, folder);
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

  // The held round: a place added while its remote read is held.
  const folder = join(fleet.sandbox, "plain-held");
  await plainFolder(folder, "Plain held");
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Settled held",
  });
  await fleet.api(`/api/machines/${MACHINE}/pause`, {
    until: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  const adding = fleet.api(`/api/projects/${project.id}/places`, {
    machineId: MACHINE,
    path: folder,
  });
  await until(
    "the held place is the project's checkout",
    () =>
      fleet.query<{ path: string }>(
        "SELECT path FROM project_places WHERE project_id = ? AND kind = 'checkout'",
        project.id
      )[0],
    (place) => place.path === folder,
    20_000
  );
  let answeredAt: number | undefined;
  const asking = fleet
    .api<MoveEstimate>(
      `/api/projects/${project.id}/move-estimate?${estimateQuery("held")}`
    )
    .then((estimate) => {
      answeredAt = Date.now();
      return estimate;
    });
  await Bun.sleep(HELD_MS);
  const answeredWhileHeld = answeredAt !== undefined;
  const resumedAt = Date.now();
  await fleet.api(`/api/machines/${MACHINE}/resume`, {});
  await adding;
  const held = asked(await asking);
  check(
    'held round: the estimate asked while the remote read is held asks no "git init" and no approval',
    settledAnswer(held),
    `${JSON.stringify(held)}; answered ${answeredWhileHeld ? "while the read was held" : `${(answeredAt ?? resumedAt) - resumedAt} ms after A resumed`}`
  );
  await repoMade("held round", folder);
  const after = asked(
    await fleet.api<MoveEstimate>(
      `/api/projects/${project.id}/move-estimate?${estimateQuery("held")}`
    )
  );
  check(
    "held round: the estimate read again once the folder is a repository says the same",
    JSON.stringify(after) === JSON.stringify(held),
    `held ${JSON.stringify(held)}, settled ${JSON.stringify(after)}`
  );

  // The modeless leg: a move whose session names no permission mode is
  // refused as any start is (server.ts `unchosenMode`), before it copies anything.
  const modelessTarget = join(fleet.sandbox, "moved-modeless");
  const modeless = await fleet
    .api<{ id?: string }>(`/api/projects/${project.id}/moves`, {
      machineId: B,
      path: modelessTarget,
      prompt: "PROBE-MOVE: say ok.",
      spawn: { harness: "claude", model: "claude-haiku-4-5" },
    })
    .then(
      (job) => `accepted as job ${job.id ?? "(no id)"}`,
      (error: Error) => error.message
    );
  check(
    "modeless leg: a move that names no permission mode is refused with the words every start gets",
    modeless.includes(
      "400 A permission mode must be chosen for a claude session on "
    ) &&
      modeless.endsWith(
        ", and none was. Choose one, then start it again. Nothing was started."
      ),
    modeless
  );
  const jobs = (await fleet.api<MoveJob[]>("/api/moves")).filter(
    (job) => job.projectId === project.id
  );
  check(
    "modeless leg: no move job was recorded and nothing was cloned",
    jobs.length === 0 && !existsSync(modelessTarget),
    `${jobs.length} jobs (${jobs.map((job) => job.stage).join(", ")}); ${modelessTarget} ${existsSync(modelessTarget) ? "exists" : "absent"}`
  );
};

export default {
  group: "Workspaces and what agents may touch",
  name: "move-settled",
  run,
} satisfies Spec;
