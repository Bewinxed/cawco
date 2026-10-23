/**
 * The git-door spec's leg (x): a command's git in a workspace leaves nothing
 * running after it (agent hub-git.ts `quietGitParameters`, which boundary.ts
 * `doorEnv` adds to every command's git config). Run through the
 * workspace's real executor and runner on the host (workspace-executor.ts),
 * so the git config is the one a command inside gets.
 *
 * (x) In a clone of its own (an origin with a commit the clone lacks), a
 *     command commits, fetches and rebases onto the fetched main: it exits 0
 *     with the commit on top of origin's; git's own trace (`GIT_TRACE`)
 *     shows it started no `git maintenance` and no `git gc`; and 3 s later
 *     no git maintenance or gc process runs from the clone or its origin.
 */
import { join } from "node:path";
import { processesWithin } from "../../packages/core/src/live-processes";
import type { Kit } from "./kit";
import { standExecutor } from "./workspace-executor";

/** A git that does upkeep, as a process's command line or git's trace of a command it ran names it. */
const UPKEEP = /\bgit(?:\.exe)?\s+(?:maintenance|gc)\b/;
const SETTLE_MS = 3000;

export const workspaceGitQuietLeg = async (
  kit: Kit,
  at: { clone: string; id: string; root: string }
): Promise<void> => {
  const origin = join(at.root, "quiet-origin");
  const clone = join(at.root, "quiet-clone");
  const trace = join(at.root, "quiet-trace.txt");
  const identity = "-c user.name=Probe -c user.email=probe@probe.test";
  await Bun.$`git init -q -b main ${origin} && git -C ${origin} ${{ raw: identity }} commit -q --allow-empty -m first && git clone -q ${origin} ${clone} && git -C ${origin} ${{ raw: identity }} commit -q --allow-empty -m second`.quiet();
  const theirs = (await Bun.$`git -C ${origin} rev-parse main`.text()).trim();

  const stood = await standExecutor(kit, "x", at);
  if (!stood) {
    return;
  }
  try {
    const said = await stood.run(
      `cd '${clone}' && export GIT_TRACE='${trace}' && git ${identity} commit -q --allow-empty -m mine && git fetch -q origin && git ${identity} rebase -q origin/main; echo "QUIET-EXIT=$?"`
    );
    await Bun.sleep(SETTLE_MS);
    const left = (await processesWithin([clone, origin])).filter((one) =>
      UPKEEP.test(one.command)
    );
    const started = (
      await Bun.file(trace)
        .text()
        .catch(() => "")
    )
      .split("\n")
      .filter((line) => line.includes("run_command:") && UPKEEP.test(line));
    const parent = (
      await Bun.$`git -C ${clone} rev-parse HEAD^`.quiet().nothrow().text()
    ).trim();
    kit.check(
      "(x) a commit, a fetch and a rebase in a workspace start no git maintenance or gc, and 3 s later none runs from its clone",
      said.includes("QUIET-EXIT=0") &&
        parent === theirs &&
        started.length === 0 &&
        left.length === 0,
      `said ${said.trim()}; HEAD^ ${parent || "none"} (origin's main ${theirs}); started ${started.join(" | ") || "none"}; running ${left.map((one) => `${one.pid} ${one.command}`).join(" | ") || "none"}`
    );
  } finally {
    stood.stop();
  }
};
