/**
 * A retirement sweep never takes a workspace someone is looking at, nor the
 * files a delegate kept there that git ignores (hub workspace-retire.ts,
 * db artifacts.ts `previewing`; agent workspace.ts `ignoredOwn`). On
 * 2026-10-15 obelisk retired workspace d9289b3d, its commits pushed to a
 * branch of their own, while it served the owner's open previews
 * `task-split` and `task-review`, and its git-ignored preview harness
 * `.probe/preview/` went with it, no carry written.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included. The project ignores `.probe/`,
 * `node_modules` and `.env*`. Two delegates of one parent each commit a
 * file and land it; I also leaves `.probe/x.ts`, `.probe/node_modules/dep.js`
 * and `.env.local` in its clone. The parent holds a preview artifact of P's
 * workspace, shown in its panel (rows as the hub keeps them: an artifact
 * goes only with its session, there is no route that deletes one). Both
 * set past the two idle hours:
 *
 * (a) A sweep leaves P, listing it in `previewed` with the artifact's name,
 *     its clone and row standing; the hub logs it once.
 * (b) The same sweep retires I and names a carry; the carry's `ignored/`
 *     holds `.probe/x.ts` as written, and neither the dependency tree nor
 *     the secret file; its README names `ignored/`; I's clone is gone.
 * (c) The artifact deleted, the next sweep retires P, its clone gone.
 *
 *   bun scripts/probe-kit/run.ts workspace-retire-kept
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = /PROBE-KEPT-([PI])/;
const FINISH = "mcp__cawco__finish_item";
const BACKDATE_MS = 3 * 3_600_000;

const commitCommand = (tag: string) =>
  [
    ...(tag === "I"
      ? [
          "mkdir -p .probe/node_modules",
          "echo 'export const seed = 1;' > .probe/x.ts",
          "echo dep > .probe/node_modules/dep.js",
          "echo SECRET=1 > .env.local",
        ]
      : []),
    `echo 'made by ${tag}' > kept-${tag}.txt`,
    `git add kept-${tag}.txt`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", { command: commitCommand(tag), description: "Commit" });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Committed kept-${tag}.txt.`,
      summary: `Committed kept-${tag}.txt.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

interface Workspace {
  id: string;
  path: string;
  state: string;
}

interface Sweep {
  failed: { workspaceId: string; reason: string }[];
  previewed: { workspaceId: string; artifacts: string[] }[];
  retired: { workspaceId: string; carry: string | null }[];
}

const spec: Spec = {
  name: "workspace-retire-kept",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo kept > README.md && printf '.probe/\\nnode_modules\\n.env*\\n' > .gitignore && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Kept",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const workspaceOf = (id: string) =>
      fleet.query<Workspace>(
        "SELECT id, path, state FROM workspaces WHERE id = ?",
        id
      )[0] as Workspace;
    const delegate = async (tag: "P" | "I") => {
      const started = await fleet.api<{
        instanceId: string;
        workItemId: string;
        workspaceId: string;
      }>("/api/work-items", {
        parentInstanceId: parent,
        title: `Commit and end ${tag}`,
        prompt: `PROBE-KEPT-${tag}: commit a file.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
        checks: [{ name: "Probe check", command: "true" }],
      });
      const item = await until(
        `work item ${tag} ended`,
        () =>
          fleet.query<{ state: string; error: string | null }>(
            "SELECT state, error FROM work_items WHERE id = ?",
            started.workItemId
          )[0],
        (row) =>
          row !== undefined &&
          ["done", "failed", "cancelled"].includes(row.state),
        300_000
      );
      return { ...started, item };
    };
    const [p, i] = [await delegate("P"), await delegate("I")];
    const wp = workspaceOf(p.workspaceId);
    const wi = workspaceOf(i.workspaceId);
    check(
      "P and I are done, their commits landed; I's clone holds .probe/x.ts, .probe/node_modules/dep.js and .env.local",
      p.item.state === "done" &&
        i.item.state === "done" &&
        existsSync(join(wi.path, ".probe", "x.ts")) &&
        existsSync(join(wi.path, ".probe", "node_modules", "dep.js")) &&
        existsSync(join(wi.path, ".env.local")),
      `P ${p.item.state} ${p.item.error ?? ""}; I ${i.item.state} ${i.item.error ?? ""}`
    );

    // The parent's preview of P's dev server, shown in its panel.
    const artifactId = crypto.randomUUID();
    const now = Date.now();
    fleet.write(
      "INSERT INTO artifacts (id, instance_id, project_id, kind, name, machine_id, source, revision, seq, changes, delivered_seq, created_at, updated_at, shown_at) VALUES (?, ?, ?, 'preview', 'task-review', ?, ?, 1, 0, '{}', 0, ?, ?, ?)",
      artifactId,
      parent,
      project.id,
      MACHINE,
      JSON.stringify({ port: 5199, workspace: wp.id }),
      now,
      now,
      now
    );
    fleet.write(
      "INSERT INTO shown_previews (instance_id, artifact_id) VALUES (?, ?)",
      parent,
      artifactId
    );

    const then = Date.now() - BACKDATE_MS;
    for (const run of [p, i]) {
      fleet.write(
        "UPDATE work_items SET ended_at = ? WHERE id = ?",
        then,
        run.workItemId
      );
      fleet.write(
        "UPDATE instances SET turn_ended_at = ?, last_request_at = ? WHERE id = ?",
        then,
        then,
        run.instanceId
      );
    }

    // ── (a) a previewed workspace stays ─────────────────────────────────
    const first = await fleet.api<Sweep>("/api/workspaces/retire", {});
    const shown = first.previewed.find((one) => one.workspaceId === wp.id);
    check(
      "(a) the sweep leaves P, listed in previewed with task-review; its clone and row stand",
      shown?.artifacts.join(",") === "task-review" &&
        !first.retired.some((one) => one.workspaceId === wp.id) &&
        existsSync(wp.path) &&
        workspaceOf(wp.id).state === "active",
      JSON.stringify(first)
    );

    // ── (b) ignored files go to a carry ─────────────────────────────────
    const carry =
      first.retired.find((one) => one.workspaceId === wi.id)?.carry ?? "";
    const ignored = join(carry, "ignored");
    const seed = carry
      ? await Bun.file(join(ignored, ".probe", "x.ts"))
          .text()
          .catch(() => "")
      : "";
    check(
      "(b) the same sweep retires I and names a carry in ~/.cawco/carries",
      carry.startsWith(join(home, ".cawco", "carries", `${wi.id}-`)) &&
        existsSync(carry),
      JSON.stringify(first)
    );
    check(
      "(b) the carry's ignored/ holds .probe/x.ts as written, and neither .probe/node_modules nor .env.local",
      seed === "export const seed = 1;\n" &&
        !existsSync(join(ignored, ".probe", "node_modules")) &&
        !existsSync(join(ignored, ".env.local")),
      carry
        ? (await Bun.$`find ${carry}`.quiet().nothrow()).stdout.toString()
        : "no carry"
    );
    const readme = carry
      ? await Bun.file(join(carry, "README.md"))
          .text()
          .catch(() => "")
      : "";
    check(
      "(b) its README names ignored/, and I's clone is gone, its row archived",
      readme.includes("`ignored/`") &&
        readme.includes("1 file git ignores that its work wrote") &&
        !existsSync(wi.path) &&
        workspaceOf(wi.id).state === "archived",
      `${readme.slice(0, 900)} | clone ${existsSync(wi.path) ? "stands" : "gone"}, ${workspaceOf(wi.id).state}`
    );

    // ── (c) the artifact gone, P goes ───────────────────────────────────
    fleet.write("DELETE FROM shown_previews WHERE artifact_id = ?", artifactId);
    fleet.write("DELETE FROM artifacts WHERE id = ?", artifactId);
    const second = await fleet.api<Sweep>("/api/workspaces/retire", {});
    check(
      "(c) with the artifact deleted, the next sweep retires P, with no carry; its clone is gone, its row archived",
      second.retired.some(
        (one) => one.workspaceId === wp.id && one.carry === null
      ) &&
        second.previewed.length === 0 &&
        !existsSync(wp.path) &&
        workspaceOf(wp.id).state === "archived",
      JSON.stringify(second)
    );
    const hub = (await fleet.logs("hub"))
      .split("\n")
      .filter((line) => line.includes("[workspace-retire]"));
    check(
      "the hub logged P left once for its artifact, then retired; I retired with its carry",
      hub.filter(
        (line) => line.includes(`${wp.id} on `) && line.includes(": left,")
      ).length === 1 &&
        hub.some(
          (line) => line.includes(`${wp.id} on `) && line.includes(": retired")
        ) &&
        hub.some(
          (line) =>
            line.includes(`${wi.id} on `) && line.includes("saved to the carry")
        ),
      hub.join(" | ")
    );
  },
};

export default spec;
