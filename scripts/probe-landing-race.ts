/**
 * Probe: an item's landing on its base when the base keeps moving, on a
 * scratch fleet (real hub, agent and sessiond on loopback, mock model,
 * workspace boundary included). The landing's push through the workspace's
 * git door is the first host-side git-lfs run in a clone with no LFS: it
 * must not stop the boundary under the push (boundary-host.ts `markLfs`).
 *
 * One project whose origin is the hub's own remote, branch `main`, whose
 * package.json's `typecheck` the landing gate runs after each rebase. Each
 * item's delegate (the mock drives its tools) commits a file and calls
 * finish_item. On each of its first `n` gate runs that typecheck has the
 * probe, outside the boundary, push someone else's commit to the hub's
 * repository's `main`, and waits for it, so `main` moves between the hub's
 * rebase and its push on every try that `n` covers. On a failure it prints
 * what the services logged of workspaces, boundaries and items.
 *
 * a. n = 2: the first two pushes lose, the third lands. The item is done, its
 *    commit on `main` over both of the others'.
 * b. n = ∞: every push loses. The item fails, its error's first line says
 *    `main` moved before each of the hub's 3 pushes; the parent's tray
 *    panel, hovered in the built dashboard, shows that line.
 *
 * Run from the repo root after `bunx vite build` in apps/dashboard:
 *   bun scripts/probe-landing-race.ts [--keep]
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureDeps } from "./lib/deps";
import type { Reply, Seen } from "./scratch-fleet";

// The dependencies first (lib/deps.ts): what needs them loads after.
await ensureDeps();
const { chromium } = await import("playwright-core");
const { MACHINE, scratchFleet, until } = await import("./scratch-fleet");

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const DELEGATE_TAG = /PROBE-DELEGATE-(\w+)/;
const FINISH = "mcp__cawco__finish_item";

/** How many of each item's gate runs move main: a's first two, every one of b's. */
const MOVES: Record<string, number> = { a: 2, b: 1000 };

/**
 * What the delegate of `tag` runs in its workspace, inside its boundary: its
 * commit carries `race-n`, how many of its gate runs move main.
 */
const delegateCommand = (tag: string) =>
  [
    `echo 'made by the delegate ${tag}' > delegate-${tag}.txt`,
    `echo ${MOVES[tag] ?? 0} > race-n`,
    `git add delegate-${tag}.txt race-n`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    'echo "status: [$(git status --porcelain | tr "\\n" " ")]"',
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

/**
 * The repository's `typecheck`, which the landing gate runs on the rebased
 * tree, between the hub's rebase and its push: on each of its first
 * `race-n` runs it asks for main to move (a `probe-want-<run>` file in its
 * git dir) and waits for the probe, outside the boundary, to push someone
 * else's commit to the hub's repository and answer with
 * `probe-moved-<run>`. Then the run's number.
 */
const RACE_SCRIPT = [
  'g="$(git rev-parse --absolute-git-dir)"',
  "n=$(cat race-n 2>/dev/null || echo 0)",
  'run=$(( $(cat "$g/probe-runs" 2>/dev/null || echo 0) + 1 ))',
  'echo "$run" > "$g/probe-runs"',
  'if [ "$run" -le "$n" ]; then touch "$g/probe-want-$run"; i=0; until [ -e "$g/probe-moved-$run" ]; do i=$((i + 1)); if [ "$i" -gt 600 ]; then echo "main was not moved for run $run"; exit 1; fi; sleep 0.1; done; fi',
  'echo "gate run $run"',
].join("\n");

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
    return tool(FINISH, {
      headline: `Committed delegate-${tag}.txt.`,
      summary: `Committed delegate-${tag}.txt.`,
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
/** The hub's repository of the project, once it is made. */
let bare = "";
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

/** The log lines a failure prints: workspaces, boundaries, items, landings. */
const LOGGED = /boundary|workspace|work-items|landing|cut off|\[git\]/i;

/**
 * Someone else, outside the boundary: each run item `id`'s gate asked to
 * move main for (and `moved` has not seen) gets a commit pushed to the hub's
 * repository, then the answer the gate's typecheck waits for.
 */
const moveAsked = async (
  id: string,
  tag: string,
  moved: Set<string>
): Promise<void> => {
  const row = itemOf(id);
  const path = row
    ? fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        row.workspace_id
      )[0]?.path
    : undefined;
  if (!path) {
    return;
  }
  const gitDir = join(path, ".git");
  const names = await readdir(gitDir).catch(() => [] as string[]);
  const wants = names.filter(
    (name) => name.startsWith("probe-want-") && !moved.has(name)
  );
  for (const want of wants) {
    moved.add(want);
    const run = want.slice("probe-want-".length);
    // biome-ignore lint/performance/noAwaitInLoops: one push at a time, in the order asked
    await sh(
      fleet.sandbox,
      `[ -d other ] || git clone -q ${bare} other; cd other && git pull -q --ff-only origin main && git commit -q --allow-empty -m "Someone else's push ${run}" && git push -q origin HEAD:main`
    );
    await writeFile(join(gitDir, `probe-moved-${run}`), "");
    console.log(`  moved main for ${tag}'s gate run ${run}`);
  }
};

/** The parent delegates `tag`, whose gate moves main on its first `MOVES[tag]` runs; the item once ended, and its parent. */
const delegate = async (cwd: string, projectId: string, tag: string) => {
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
    }
  );
  console.log(
    `delegate ${tag}: item ${started.workItemId}, session ${started.instanceId}`
  );
  const moved = new Set<string>();
  let moving = Promise.resolve();
  const mover = setInterval(() => {
    moving = moving.then(() => moveAsked(started.workItemId, tag, moved));
  }, 100);
  try {
    const item = await until(
      `work item ${tag} ended`,
      () => itemOf(started.workItemId),
      (row) =>
        row !== undefined &&
        ["done", "failed", "cancelled"].includes(row.state),
      300_000
    );
    console.log(`item ${tag}: ${item.state}; error: ${item.error ?? "(null)"}`);
    return { item, parent };
  } finally {
    clearInterval(mover);
    await moving;
  }
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
  await writeFile(join(src, "race.sh"), `${RACE_SCRIPT}\n`);
  await writeFile(
    join(src, "package.json"),
    `${JSON.stringify({ name: "race", private: true, scripts: { typecheck: "sh race.sh" } }, null, 2)}\n`
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
  bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);

  // ── a: main moves on the gate's first two runs ──────────────────────────
  const a = await delegate(src, project.id, "a");
  const mainA = await sh(bare, "git log --format=%s main");
  check(
    "a: item done",
    a.item.state === "done",
    `${a.item.state} ${a.item.error ?? ""}`
  );
  check(
    "a: landed over both of the others' pushes",
    mainA.split("\n")[0] === "Delegate commit a" &&
      [1, 2].every((run) => mainA.includes(`Someone else's push ${run}`)),
    mainA.replaceAll("\n", " | ")
  );
  check(
    "a: report says it rebased, and its landing gate ran typecheck",
    (a.item.result ?? "").includes(", rebased onto the newer main.") &&
      (a.item.result ?? "").includes("- bun run typecheck: pass ("),
    (a.item.result ?? "")
      .split("\n")
      .find((line) => line.startsWith("Landed")) ?? "(no Landed line)"
  );

  // ── b: main moves on every run ──────────────────────────────────────────
  const b = await delegate(src, project.id, "b");
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
  const chip = page
    .locator(
      '.kit-tray-chip:is([data-delegate-tray-tone="failed"], [data-key="failed"])'
    )
    .first();
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
  if (failed) {
    // What the services said of workspaces, boundaries and items.
    const logs = (await readdir(fleet.sandbox))
      .filter((name) => name.endsWith(".log") || name.endsWith(".err"))
      .sort();
    const texts = await Promise.all(
      logs.map((name) => Bun.file(join(fleet.sandbox, name)).text())
    );
    for (const [index, name] of logs.entries()) {
      const lines = (texts[index] ?? "")
        .split("\n")
        .filter((line) => LOGGED.test(line))
        .slice(-40);
      console.log(`── ${name}\n${lines.join("\n").slice(0, 8000)}`);
    }
  }
  await browser?.close();
  dashboard?.kill();
  await fleet.close();
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);
