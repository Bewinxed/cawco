/**
 * A host-scope delegate's scratch dir (agent host-scratch.ts), read in
 * process under a scratch HOME: what its session's spawn makes, what the
 * hub reads back of its `$TMPDIR/outputs/`, and its removal; with the
 * `TMPDIR` its Claude Code session is given and what its brief tells it.
 * The fleet-wide round trip (delegate, finish, assets) is host-delegates'
 * h9, which runs on the host.
 *
 * - s1. A spawn's scratch dir is `~/.cawco/tmp/<id8>`, `outputs/` in it,
 *   owner-only, and it is the `TMPDIR` named.
 * - s2. Listed, `outputs/` gives each file with its size and a link as a
 *   link, in path order, a subfolder's file at its path; read, each regular
 *   file's bytes and no link's.
 * - s3. Each of the three refuses a name that is no workspace id
 *   (`../../etc`), so nothing outside the scratch root is read or removed.
 * - s4. Removed, the dir is gone and lists nothing; a later spawn makes it
 *   again.
 * - s5. Claude Code's spawn env with the scratch dir names it `TMPDIR` and
 *   keeps the CLI's own temp root at the agent's; without it, neither.
 * - s6. A host delegate's opening tells it of `$TMPDIR/outputs/` and its
 *   assets folder; of no project, that nothing is collected.
 * - s7. delegate's `host` text says files come back through
 *   `$TMPDIR/outputs/`, and no longer refuses inputs.
 *
 *   bun scripts/probe-kit/run.ts host-scratch
 */
import { lstat, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { sessionEnv } from "../../../packages/agent/src/harnesses/claude";
import {
  hostOutputs,
  hostScratchReady,
  removeHostScratch,
} from "../../../packages/agent/src/host-scratch";
import { withHostLine } from "../../../packages/core/src/injected";
import { workWords } from "../../../packages/core/src/words/work";
import type {
  HostOutputListed,
  WorkspaceOutputs,
} from "../../../packages/core/src/workspace/controls";
import { listRoleTools } from "../../../packages/hub/src/role-budgets";
import type { Kit, Spec } from "../spec";

/** What a refusal said, or "accepted". */
const said = (run: () => Promise<unknown>): Promise<string> =>
  run().then(
    () => "accepted",
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  );

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "host-scratch",
  ownHome:
    "its scratch dirs go under ~/.cawco/tmp, which must be a scratch HOME's",
  run: async ({ check }: Kit) => {
    const id = crypto.randomUUID();
    const scratch = join(homedir(), ".cawco", "tmp", id.slice(0, 8));
    const outputs = join(scratch, "outputs");

    const tmp = await hostScratchReady(id);
    const made = await lstat(outputs).catch(() => undefined);
    check(
      "s1: a spawn's scratch dir is ~/.cawco/tmp/<id8>, outputs/ in it, owner-only, and it is the TMPDIR named",
      tmp === scratch &&
        made?.isDirectory() === true &&
        // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
        (made.mode & 0o777) === 0o700,
      `${tmp}; outputs ${made ? (made.mode % 0o1000).toString(8) : "missing"}`
    );

    await mkdir(join(outputs, "deep"), { recursive: true });
    await writeFile(join(outputs, "report.pdf"), "pdf-bytes");
    await writeFile(join(outputs, "deep", "ledger.csv"), "a,b\n1,2\n");
    const outside = join(homedir(), "secret.txt");
    await writeFile(outside, "not to be read");
    await symlink(outside, join(outputs, "link.txt"));
    const listed = (await hostOutputs({ id, read: false })) as {
      listed: HostOutputListed[];
    };
    check(
      "s2: listed, outputs/ gives each file with its size and a link as a link, in path order",
      JSON.stringify(listed.listed) ===
        JSON.stringify([
          { path: "deep/ledger.csv", link: false, size: 8 },
          { path: "link.txt", link: true, size: 0 },
          { path: "report.pdf", link: false, size: 9 },
        ]),
      JSON.stringify(listed)
    );
    const read = (await hostOutputs({ id, read: true })) as WorkspaceOutputs;
    const bytes = Object.fromEntries(
      read.files.map((one) => [
        one.path,
        Buffer.from(one.content, "base64").toString(),
      ])
    );
    check(
      "s2: read, each regular file's bytes and no link's",
      JSON.stringify(bytes) ===
        JSON.stringify({
          "deep/ledger.csv": "a,b\n1,2\n",
          "report.pdf": "pdf-bytes",
        }),
      JSON.stringify(bytes)
    );

    const refused = await Promise.all([
      said(() => hostScratchReady("../../etc")),
      said(() => hostOutputs({ id: "../../etc", read: true })),
      said(() => removeHostScratch({ id: "../../etc" })),
    ]);
    check(
      "s3: each refuses a name that is no workspace id",
      refused.every((one) => one === workWords.hostScratchUnnamed),
      refused.join(" | ")
    );

    await removeHostScratch({ id });
    const gone = await lstat(scratch).catch(() => undefined);
    const after = (await hostOutputs({ id, read: false })) as {
      listed: HostOutputListed[];
    };
    const kept = await lstat(outside).catch(() => undefined);
    check(
      "s4: removed, the dir is gone and lists nothing, and what a link in it named stays",
      gone === undefined &&
        after.listed.length === 0 &&
        kept?.isFile() === true,
      `${gone ? "still there" : "gone"}; listed ${after.listed.length}`
    );
    await hostScratchReady(id);
    check(
      "s4: a later spawn makes it again",
      (await readdir(scratch)).includes("outputs")
    );
    await removeHostScratch({ id });

    const withTmp = sessionEnv(undefined, {
      instanceId: "probe-host-scratch",
      hostTmp: scratch,
    });
    const without = sessionEnv(undefined, {
      instanceId: "probe-host-scratch",
    });
    check(
      "s5: Claude Code's spawn env names the scratch dir TMPDIR and keeps the CLI's temp root at the agent's; without it, neither",
      withTmp.TMPDIR === scratch &&
        withTmp.CLAUDE_CODE_TMPDIR === tmpdir() &&
        without.TMPDIR === process.env.TMPDIR &&
        without.CLAUDE_CODE_TMPDIR === process.env.CLAUDE_CODE_TMPDIR,
      JSON.stringify({
        with: [withTmp.TMPDIR, withTmp.CLAUDE_CODE_TMPDIR],
        without: [without.TMPDIR, without.CLAUDE_CODE_TMPDIR],
      })
    );

    const inProject = withHostLine(
      "brief",
      "/home/x",
      "niftybot",
      "assets/1a2b3c4d"
    );
    const noProject = withHostLine("brief", "/home/x", "niftybot", undefined);
    check(
      "s6: a host delegate's opening names $TMPDIR/outputs/ and its assets folder; of no project, that nothing is collected",
      inProject.includes("$TMPDIR/outputs/") &&
        inProject.includes("assets/1a2b3c4d/") &&
        noProject.includes("nothing in $TMPDIR is collected"),
      `${inProject}\n${noProject}`
    );

    const delegate = listRoleTools()
      .flatMap(({ tools }) => tools)
      .find((tool) => tool.name === "delegate") as
      | {
          inputSchema: {
            properties?: Record<string, { description?: string }>;
          };
        }
      | undefined;
    const host = delegate?.inputSchema.properties?.host?.description ?? "";
    check(
      "s7: delegate's host text says files come back through $TMPDIR/outputs/, and does not refuse inputs",
      host.includes("$TMPDIR/outputs/") && !host.includes("inputs"),
      host
    );
  },
};

export default spec;
