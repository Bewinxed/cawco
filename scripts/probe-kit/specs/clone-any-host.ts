/**
 * "Clone a repository" takes any git URL and clones it with plain git (agent
 * session.ts `#clone`, core `isGitUrl`): nothing assumes GitHub.
 *
 *   bun scripts/probe-kit/run.ts clone-any-host
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), with no `gh` anywhere on the agent's PATH that could clone:
 *
 * (a) A spawn whose bootstrap names the fleet's local bare repository over
 *     `file://`, a remote on no forge at all: the session runs, in
 *     `<baseDir>/origin`, a git checkout whose `origin` is that URL and
 *     whose HEAD is the bare repository's.
 * (b) The same spawn again: the existing clone is the requested repository
 *     (the same host and path), so it runs there again.
 * (c) A bootstrap naming `owner/repo`, which names no host: the spawn is
 *     refused with "owner/repo is not a git URL", and no `repo` folder is
 *     made under its baseDir.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MACHINE, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "clone-any-host",
  async run(kit) {
    const fleet = await kit.fleet(() => ({
      everyMs: 5,
      words: ["clone-any-host", "answer"],
    }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const url = `file://${join(fleet.sandbox, "origin.git")}`;
    const baseDir = join(fleet.workdir, "clones");
    const head = (
      await Bun.$`git -C ${join(fleet.sandbox, "origin.git")} rev-parse HEAD`.text()
    ).trim();

    // (a) a remote on no forge, cloned by plain git.
    const first = await fleet.spawn("claude", "Clone over file://", baseDir, {
      bootstrap: { repo: url, baseDir },
    });
    const clone = join(baseDir, "origin");
    const origin = (
      await Bun.$`git -C ${clone} remote get-url origin`.nothrow().text()
    ).trim();
    const cloned = (
      await Bun.$`git -C ${clone} rev-parse HEAD`.nothrow().text()
    ).trim();
    kit.check(
      "(a) a file:// remote clones into <baseDir>/origin",
      existsSync(join(clone, ".git")),
      clone
    );
    kit.check("(a) its origin is the URL asked for", origin === url, origin);
    kit.check(
      "(a) its HEAD is the bare repository's",
      cloned === head,
      `${cloned} vs ${head}`
    );
    await fleet.stopSession(first);

    // (b) the same URL again runs in the clone already there.
    const again = await fleet.spawn("claude", "Clone again", baseDir, {
      bootstrap: { repo: url, baseDir },
    });
    kit.check(
      "(b) the same URL runs again in the existing clone",
      (await fleet.instance(again))?.status === "running"
    );
    await fleet.stopSession(again);

    // (c) owner/repo names no host: refused, nothing made.
    const refused = crypto.randomUUID();
    await fleet.post({
      verb: "spawn",
      machineId: MACHINE,
      instanceId: refused,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId: refused,
        cwd: baseDir,
        harness: "claude",
        title: "Clone owner/repo",
        permissionMode: "bypassPermissions",
        bootstrap: { repo: "owner/repo", baseDir },
      },
    });
    const row = await until(
      "the owner/repo spawn refused",
      () => fleet.instance(refused),
      (one) => Boolean(one?.last_error),
      120_000
    );
    kit.check(
      "(c) owner/repo is refused as no git URL",
      row?.last_error?.includes("owner/repo is not a git URL") === true,
      row?.last_error ?? "no error"
    );
    kit.check(
      "(c) no folder is made for it",
      !existsSync(join(baseDir, "repo"))
    );
  },
};

export default spec;
