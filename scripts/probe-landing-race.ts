/**
 * Probe: a checked item's landing on its base, when the base keeps moving
 * and when origin refuses the login, on a scratch fleet (real hub, agent and
 * sessiond on loopback, mock model, workspace boundary included).
 *
 * One project whose origin is the hub's own remote, branch `main`. Each item's
 * delegate (the mock drives its tools) commits a file and calls finish_item.
 * Its one check pushes someone else's commit to origin's `main` on each of its
 * first `n` runs: the checks run once before the landing and again after each
 * rebase, so `main` moves between the hub's rebase and its push on every try
 * that `n` covers.
 *
 * a. n = 3: the first two pushes lose, the third lands. The item is done, its
 *    commit on `main` over all three of the others'.
 * b. n = ∞: every push loses. The item fails, its error's first line says
 *    `main` moved before each of the hub's 3 pushes; the parent's tray
 *    panel, hovered in the built dashboard, shows that line.
 * c. Origin answers 401 to everything: the item fails, its error's first
 *    line names the machine and says origin did not authorise it.
 *
 * Run from the repo root after `bunx vite build` in apps/dashboard:
 *   bun scripts/probe-landing-race.ts [--keep]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import {
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const DELEGATE_TAG = /PROBE-DELEGATE-(\w+)/;
const FINISH = "mcp__cawco__finish_item";

/** An origin that refuses every login: git asks for one, and no helper has it. */
const refusing = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    new Response("login refused\n", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="probe"' },
    }),
});
const REFUSING_URL = `http://127.0.0.1:${refusing.port}/repo.git`;

/** What the delegate of `tag` runs in its workspace, inside its boundary. */
const delegateCommand = (tag: string) =>
  [
    `echo 'made by the delegate ${tag}' > delegate-${tag}.txt`,
    `git add delegate-${tag}.txt`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    ...(tag === "c" ? [`git remote set-url origin ${REFUSING_URL}`] : []),
    'echo "status: [$(git status --porcelain | tr "\\n" " ")]"',
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

/**
 * The check: on each of its first `n` runs, someone else's commit pushed to
 * origin's main from this clone (its HEAD untouched), then the run's number.
 */
const racingCheck = (n: number) =>
  [
    'f="$(git rev-parse --git-dir)/probe-runs"',
    'run=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 ))',
    'echo "$run" > "$f"',
    `if [ "$run" -le ${n} ]; then git fetch -q origin main && c=$(GIT_AUTHOR_NAME=Other GIT_AUTHOR_EMAIL=o@probe.test GIT_COMMITTER_NAME=Other GIT_COMMITTER_EMAIL=o@probe.test git commit-tree -p origin/main -m "Someone else's push $run" "origin/main^{tree}") && git push -q origin "$c:refs/heads/main"; fi`,
    'echo "check run $run"',
  ].join("; ");

const results: Record<string, string> = {};
const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = DELEGATE_TAG.exec(request.all)?.[1];
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  // What the delegate's last tool answered (its Bash output, finish_item's
  // answer), as the request that follows carries it.
  console.log(
    `${new Date(request.at).toISOString()} delegate ${tag} (finish_item ${request.toolNames.includes(FINISH) ? "offered" : "not offered"}): ${request.last.slice(-600).replaceAll("\n", " ⏎ ")}`
  );
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", {
      command: delegateCommand(tag),
      description: "Commit",
    });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, { summary: `Committed delegate-${tag}.txt.` });
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

const fleet = await scratchFleet({ name: "probe-landing-race", respond });
const home = fleet.env.HOME as string;
const owner: Record<string, string> = {
  PATH: fleet.env.PATH as string,
  HOME: home,
  USER: fleet.env.USER as string,
  XDG_CONFIG_HOME: fleet.env.XDG_CONFIG_HOME as string,
  XDG_DATA_HOME: fleet.env.XDG_DATA_HOME as string,
  XDG_CACHE_HOME: fleet.env.XDG_CACHE_HOME as string,
  XDG_RUNTIME_DIR: fleet.env.XDG_RUNTIME_DIR as string,
};
const sh = async (cwd: string, command: string): Promise<string> => {
  const ran = await Bun.$`sh -c ${command}`
    .cwd(cwd)
    .env(owner)
    .quiet()
    .nothrow();
  const out = `${ran.stdout.toString()}${ran.stderr.toString()}`.trim();
  if (ran.exitCode !== 0) {
    throw new Error(`${command} (in ${cwd}) exited ${ran.exitCode}: ${out}`);
  }
  return out;
};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

interface WorkItem {
  error: string | null;
  id: string;
  result: string | null;
  state: string;
  workspace_id: string;
}
const itemOf = (id: string) =>
  fleet.query<WorkItem>("SELECT * FROM work_items WHERE id = ?", id)[0];
const firstLine = (text: string | null) =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";

/** The parent delegates `tag` with a check that moves main on its first `n` runs; the item once ended, and its parent. */
const delegate = async (
  cwd: string,
  projectId: string,
  tag: string,
  n: number
) => {
  const parent = await fleet.spawn("claude", `Parent ${tag}`, cwd, {
    projectId,
  });
  const started = await fleet.api<{ workItemId: string; instanceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: `Land a commit ${tag}`,
      prompt: `PROBE-DELEGATE-${tag}: commit a file.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd,
      checks: [{ name: "Main moves meanwhile", command: racingCheck(n) }],
    }
  );
  console.log(
    `delegate ${tag}: item ${started.workItemId}, session ${started.instanceId}`
  );
  const item = await until(
    `work item ${tag} ended`,
    () => itemOf(started.workItemId),
    (row) =>
      row !== undefined && ["done", "failed", "cancelled"].includes(row.state),
    300_000
  );
  console.log(`item ${tag}: ${item.state}; error: ${item.error ?? "(null)"}`);
  return { item, parent };
};

let dashboard: ReturnType<typeof Bun.spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
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
  await sh(
    src,
    "git init -q -b main && echo race > README.md && git add -A && git commit -qm 'First commit'"
  );
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Landing race",
    machineId: MACHINE,
    cwd: src,
  });
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);

  // ── a: main moves on the first three runs ───────────────────────────────
  const a = await delegate(src, project.id, "a", 3);
  const mainA = await sh(bare, "git log --format=%s main");
  check(
    "a: item done",
    a.item.state === "done",
    `${a.item.state} ${a.item.error ?? ""}`
  );
  check(
    "a: landed over all three of the others' pushes",
    mainA.split("\n")[0] === "Delegate commit a" &&
      [1, 2, 3].every((run) => mainA.includes(`Someone else's push ${run}`)),
    mainA.replaceAll("\n", " | ")
  );
  check(
    "a: report says it rebased and ran the checks again",
    (a.item.result ?? "").includes(
      "rebased onto the newer main with the checks run again"
    ),
    (a.item.result ?? "")
      .split("\n")
      .find((line) => line.startsWith("Landed")) ?? "(no Landed line)"
  );

  // ── b: main moves on every run ──────────────────────────────────────────
  const b = await delegate(src, project.id, "b", 1000);
  const why = firstLine(b.item.error);
  check("b: item failed", b.item.state === "failed", b.item.state);
  check(
    "b: error's first line says main moved before each of 3 pushes",
    why ===
      "Not landed: main moved on origin before each of the hub's 3 pushes, so every one was turned down as behind it.",
    why || "(empty)"
  );
  check(
    "b: the report leads with it",
    firstLine(b.item.result) === why,
    firstLine(b.item.result)
  );

  // ── c: origin refuses the login ─────────────────────────────────────────
  const c = await delegate(src, project.id, "c", 0);
  const whyC = firstLine(c.item.error);
  check("c: item failed", c.item.state === "failed", c.item.state);
  check(
    "c: error's first line names the machine and the refused login",
    whyC ===
      `Not landed: the fetch of origin/main from ${MACHINE} wasn't authorised by origin.`,
    `${whyC || "(empty)"} ‖ ${(c.item.error ?? "").split("\n").slice(1, 4).join(" ⏎ ")}`
  );
  check(
    "no failed item has an empty error",
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM work_items WHERE state = 'failed' AND coalesce(error, '') = ''"
    )[0]?.n === 0,
    JSON.stringify(
      fleet.query(
        "SELECT id, state, substr(error, 1, 60) AS error FROM work_items"
      )
    )
  );

  // ── b's reason in its parent's tray, hovered in the built dashboard ────
  const port = Number(new URL(fleet.base).port) + 7;
  const site = `http://127.0.0.1:${port}`;
  dashboard = Bun.spawn(
    [
      "bunx",
      "vite",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: join(root, "apps/dashboard"),
      env: {
        ...process.env,
        CAWCO_DEV_HUB_URL: fleet.base,
        CAWCO_HUB_URL: fleet.base,
        CAWCO_PREVIEW_PORT: fleet.env.CAWCO_PREVIEW_PORT,
      },
      stdout: Bun.file(join(fleet.sandbox, "dashboard.log")),
      stderr: Bun.file(join(fleet.sandbox, "dashboard.err")),
    }
  );
  await until(
    "the dashboard answering",
    () => fetch(site).then((r) => r.ok),
    Boolean,
    60_000
  );
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto(`${site}/session/${b.parent}`, {
    waitUntil: "domcontentloaded",
  });
  const chip = page.locator(".kit-tray-chip.failed").first();
  await chip.waitFor({ timeout: 60_000 });
  await chip.hover();
  const note = page.locator(".row.fail .text").first();
  await note.waitFor({ timeout: 10_000 });
  const shown = (await note.textContent())?.trim() ?? "";
  check(
    "b: the tray panel shows the item's reason",
    shown === why,
    shown || "(empty)"
  );
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
  console.log(
    `work items: ${JSON.stringify(fleet.query("SELECT id, state, error, substr(result, 1, 300) AS result FROM work_items"), null, 1)}`
  );
} finally {
  await browser?.close();
  dashboard?.kill();
  refusing.stop(true);
  await fleet.close();
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);
