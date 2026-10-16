/**
 * Two projects that share one repository are one (project-merge.ts): the
 * newer folds into the older, and every row that named the newer names the
 * one kept (db `foldProject`).
 *
 * A scratch fleet's hub and agent. Project A is a git checkout whose origin
 * is on github.com; project B, made after it, a git repository with no
 * origin, and a rule is scoped to B. B's checkout is given A's origin and
 * named again as B's place: the hub reads its remote, and B folds into A.
 *
 * (a) B is gone from the projects, A stands.
 * (b) The rule scoped to B now names A: it fires in the project B became.
 *
 *   bun scripts/probe-kit/run.ts project-merge
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const ORIGIN = "https://github.com/probe-owner/probe-merge.git";

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    await writeFile(
      join(fleet.home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const git = (cwd: string, ...args: string[]) =>
      Bun.$`git ${args}`
        .cwd(cwd)
        .env({ ...process.env, HOME: fleet.home })
        .quiet();
    const checkout = async (name: string) => {
      const dir = join(fleet.sandbox, name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "README.md"), `# ${name}\n`);
      await git(dir, "init", "-q", "-b", "main");
      await git(dir, "add", "-A");
      await git(dir, "commit", "-qm", "First commit");
      return dir;
    };
    const make = async (name: string, cwd: string) => {
      const made = await fleet.api<{ id?: string; project?: { id: string } }>(
        "/api/projects",
        { name, machineId: MACHINE, cwd, caw: false }
      );
      return made.project?.id ?? made.id ?? "";
    };
    const projects = async () =>
      await fleet.api<{ id: string; remote: string | null }[]>(
        "/api/projects"
      );

    const dirA = await checkout("merge-a");
    await git(dirA, "remote", "add", "origin", ORIGIN);
    const projectA = await make("Merge probe A", dirA);
    const dirB = await checkout("merge-b");
    const projectB = await make("Merge probe B", dirB);
    const rule = await fleet.api<{ id: string }>("/api/rules", {
      name: "Merge probe rule",
      enabled: true,
      pattern: "merge probe",
      matchKind: "phrase",
      caseSensitive: false,
      wholeWord: false,
      watch: "text",
      reply: "The merge probe's rule fired.",
      timing: "turn",
      repeat: true,
      scope: { projectId: projectB },
    });
    const before = await projects();
    kit.check(
      "setup: A knows its remote, B none, and a rule is scoped to B",
      Boolean(projectA && projectB && rule.id) &&
        before.find((one) => one.id === projectA)?.remote !== null &&
        before.find((one) => one.id === projectB)?.remote === null,
      JSON.stringify(
        before.filter((one) => one.id === projectA || one.id === projectB)
      )
    );

    // B's checkout learns A's origin; naming it again has the hub read it.
    await git(dirB, "remote", "add", "origin", ORIGIN);
    await fleet.api(`/api/projects/${projectB}/places`, {
      machineId: MACHINE,
      path: dirB,
    });

    const after = await projects();
    kit.check(
      "a: B folded into A: B is gone, A stands",
      !after.some((one) => one.id === projectB) &&
        after.some((one) => one.id === projectA),
      after.map((one) => `${one.id} ${one.remote}`).join(", ")
    );
    const { rules } = await fleet.api<{
      rules: { id: string; scope: { projectId?: string } }[];
    }>("/api/rules");
    const moved = rules.find((one) => one.id === rule.id);
    kit.check(
      "b: the rule scoped to B now names A",
      moved?.scope.projectId === projectA,
      `rule ${rule.id}: ${JSON.stringify(moved?.scope)}; A ${projectA}, B ${projectB}`
    );
  } finally {
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default { name: "project-merge", run } satisfies Spec;
