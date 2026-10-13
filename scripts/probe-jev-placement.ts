/**
 * Probe: Jev placement's Jev-off rules (Projects spec §5.9) on a scratch
 * fleet (real hub, agent and sessiond on loopback, real Claude Code against
 * a mock model). The scratch hub holds no OpenRouter key, so Jev is off, and
 * each row this probe drives must be decided by the table's Jev-off rule.
 * Each check waits for the hub's own `[jev off] <row>` line and quotes it.
 *
 * 1. Duplicates, filed by no session (you): a second task with exactly the
 *    first's files and checks is dropped as its duplicate.
 * 2. Event routing: an issue two routes match goes to the oldest route's
 *    routine.
 * 3. Phone requests and Triage: a sentence from the phone goes to the lead
 *    as your words, and that wake carries the untriaged tasks as one batch.
 * 4. Delegate type, Judged checks and Attach or fresh: an attempt at a task
 *    that names no type runs "medium"; landed with acceptance criteria and
 *    the lead off, the task goes to you; your comment on it then continues
 *    the attempt's session when it is warm and idle.
 * 5. Ready to dispatch and Dispatch order, with the lead on: only the task
 *    the lead scored `ready: yes` is started, in board order.
 *
 * Run from the repo root:
 *   bun scripts/probe-jev-placement.ts [--keep]
 *
 * 4 runs a delegate, so it needs a machine that can start a workspace
 * boundary: inside a CawCo workspace none can, and 4 fails there with the
 * boundary's own words ("the boundary exited (code 1) as it started").
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const REPO = "probe/app";
const FINISH = "mcp__cawco__finish_item";
const TOKEN = `ghp_probe_${crypto.randomUUID().replaceAll("-", "")}`;
/** The hub log lines a run prints at its end. */
const LOGGED = /\[jev|\[dispatch\]|\[ingress\]|\[phone\]|work-items|error/i;

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};

// ── A fake GitHub REST API: one repository's issues, nothing else ─────────────
const issues: { created: string; number: number; title: string }[] = [];
const githubFetch = (request: Request): Response => {
  if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return Response.json({ message: "Bad credentials" }, { status: 401 });
  }
  const { pathname } = new URL(request.url);
  const body =
    pathname === `/repos/${REPO}/issues`
      ? issues.map((issue) => ({
          number: issue.number,
          html_url: `https://github.com/${REPO}/issues/${issue.number}`,
          title: issue.title,
          body: "The login page shows a blank screen.",
          user: { login: "bob" },
          labels: [],
          state: "open",
          repository_url: `http://127.0.0.1:${fake.port}/repos/${REPO}`,
          created_at: issue.created,
          updated_at: issue.created,
          closed_at: null,
        }))
      : [];
  return Response.json(body, { headers: { "x-ratelimit-remaining": "4999" } });
};
const fake = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: githubFetch });

// ── The mock model ───────────────────────────────────────────────────────────
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};
/** Every request Caw's sessions made, whole: the probe reads his wakes here. */
const leadSaw: string[] = [];

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes("You are Caw, the lead")) {
    leadSaw.push(request.all);
    return text("noted");
  }
  if (!request.all.includes("Your work item is an attempt at")) {
    return text("ok");
  }
  if (
    request.last.includes("A comment on") ||
    request.last.includes("checks passed") ||
    request.last.includes("The item")
  ) {
    return text("done");
  }
  return call(request, FINISH, {
    summary: "Wrote the theme file and checked it exists.",
  });
};

const fleet = await scratchFleet({ name: "probe-jev-placement", respond });
fleet.env.CAWCO_GITHUB_API = `http://127.0.0.1:${fake.port}`;
const home = fleet.env.HOME as string;

const send = async <T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const said = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${said}`);
  }
  return (said ? JSON.parse(said) : undefined) as T;
};

/** The hub's first log line holding every one of `parts`, waited for. */
const logLine = (label: string, parts: string[], ms = 120_000) =>
  until(
    label,
    async () =>
      (await fleet.logs("hub"))
        .split("\n")
        .find((line) => parts.every((part) => line.includes(part))),
    (line) => line !== undefined,
    ms
  );

interface Task {
  id: string;
  kind: string | null;
  stage: string;
}
const taskOf = (projectId: string, id: string) =>
  send<Task>("GET", `/api/projects/${projectId}/tasks/${id}`);

/**
 * A checkout with one commit, as a project's place: its origin on
 * github.com (so the project's remote is the fake repository's), or a bare
 * copy beside it.
 */
const checkout = async (name: string, github: boolean): Promise<string> => {
  const src = join(fleet.sandbox, name);
  const origin = github
    ? `https://github.com/${REPO}.git`
    : join(fleet.sandbox, `${name}.git`);
  await mkdir(src, { recursive: true });
  await Bun.$`git init -q -b main && echo ${name} > README.md && git add -A && git commit -qm 'First commit' && git remote add origin ${origin}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  if (!github) {
    await Bun.$`git init -q --bare -b main ${origin} && git -C ${src} push -q origin main && git -C ${src} fetch -q origin && git -C ${src} remote set-head origin main`
      .env({ ...process.env, HOME: home })
      .quiet();
  }
  return src;
};

/**
 * Once the hub has learned the project's remote, its origin fetches from a
 * local bare copy (a workspace is cloned from origin, which cannot reach
 * github.com here); the project stays github.com/probe/app.
 */
const localOrigin = async (projectId: string, src: string): Promise<void> => {
  await until(
    "the project's remote",
    () =>
      fleet.query<{ remote: string | null }>(
        "SELECT remote FROM projects WHERE id = ?",
        projectId
      )[0]?.remote,
    (remote) => remote === `github.com/${REPO}`,
    60_000
  );
  const bare = join(fleet.sandbox, "origin-app.git");
  await Bun.$`git init -q --bare -b main ${bare} && git -C ${src} push -q ${bare} main && git -C ${src} remote set-url origin ${bare} && git -C ${src} fetch -q origin && git -C ${src} remote set-head origin main`
    .env({ ...process.env, HOME: home })
    .quiet();
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );

  const jev = await send<{ route: string | null }>("GET", "/api/jev");
  check(
    "0: Jev is off: the scratch hub holds no TypeSafe key and no OpenRouter key",
    jev.route === null,
    `GET /api/jev → ${JSON.stringify(jev)}`
  );

  const placementSrc = await checkout("placement", true);
  const placement = await fleet.api<{ id: string }>("/api/projects", {
    name: "Placement",
    machineId: MACHINE,
    cwd: placementSrc,
    caw: false,
  });
  const p = placement.id;
  await localOrigin(p, placementSrc);

  // ── 1: Duplicates, filed by no session ─────────────────────────────────────
  await section("1: Duplicates", async () => {
    const draft = { checks: ["test -d src"], owns: ["src/theme/**"] };
    const first = await fleet.api<Task>(`/api/projects/${p}/tasks`, {
      title: "Theme tokens",
      ...draft,
    });
    const second = await fleet.api<Task>(`/api/projects/${p}/tasks`, {
      title: "Tokens for the theme",
      ...draft,
    });
    const line = await logLine("the duplicates line", [
      "[jev off] Duplicates",
      `${second.id} was filed by no session; ${first.id} has exactly its files and checks`,
    ]);
    const dropped = await until(
      "the duplicate dropped",
      () => taskOf(p, second.id),
      (task) => task.kind === "dropped"
    );
    check(
      "1: Duplicates: no session, so an open task with exactly its files and checks makes it a duplicate",
      dropped.kind === "dropped",
      `${line.trim()} — ${second.id} is in ${dropped.stage}`
    );
  });

  // ── 2: Event routing ─────────────────────────────────────────────────────────
  await section("2: Event routing", async () => {
    await fleet.api("/api/connections", {
      name: "gh-probe",
      service: "github",
      account: "probe",
      transport: "http",
      url: `http://127.0.0.1:${fake.port}/mcp`,
      auth: "bearer",
    });
    await send("PUT", "/api/connections/gh-probe/key", { key: TOKEN });
    const routine = (name: string) =>
      fleet.api<{ id: string }>("/api/routines", {
        projectId: p,
        name,
        cron: "0 0 1 1 *",
        timeZone: "UTC",
        target: "lead",
        prompt: `${name}: look at the issue.`,
      });
    const older = await routine("Bug intake");
    const newer = await routine("Issue digest");
    for (const each of [older, newer]) {
      // biome-ignore lint/performance/noAwaitInLoops: the older route is filed first
      await fleet.api("/api/event-routes", {
        projectId: p,
        source: "github:*",
        kinds: ["issue.opened"],
        routineId: each.id,
      });
    }
    await send("PUT", `/api/projects/${p}/ingress/github`, {
      connection: "gh-probe",
    });
    await send("POST", `/api/projects/${p}/ingress/github/poll`);
    issues.push({
      number: 5,
      title: "Login is blank",
      created: new Date().toISOString(),
    });
    await send("POST", `/api/projects/${p}/ingress/github/poll`);
    const line = await logLine("the routing line", [
      "[jev off] Event routing",
      "issue:5:opened",
    ]);
    const [row] = fleet.query<{ routed_to: string | null }>(
      "SELECT routed_to FROM inbound_events WHERE delivery_key = 'issue:5:opened'"
    );
    check(
      "2: Event routing: two routes match; the matcher's oldest takes it",
      line.includes(`routine ${older.id} (of 2 matching)`) &&
        row?.routed_to === older.id,
      `${line.trim()} — routed_to ${row?.routed_to}`
    );
  });

  // ── 3: Phone requests and Triage ─────────────────────────────────────────────
  await section("3: Phone requests and Triage", async () => {
    const answer = await fleet.api<{ decidedBy: string; text: string }>(
      `/api/projects/${p}/requests`,
      { text: "Get the theme work going today." }
    );
    const phone = await logLine("the phone line", [
      "[jev off] Phone requests",
      `project=${p}`,
    ]);
    const triage = await logLine("the triage line", [
      "[jev off] Triage",
      `project=${p}`,
    ]);
    const woke = await until(
      "Caw read the sentence and the batch",
      () =>
        leadSaw.find(
          (all) =>
            all.includes("Get the theme work going today.") &&
            all.includes("Tasks no one has triaged yet")
        ),
      Boolean,
      180_000
    );
    check(
      "3: Phone requests: the lead reads the sentence",
      answer.decidedBy === "lead",
      `${phone.trim()} — answer ${JSON.stringify(answer)}`
    );
    check(
      "3: Triage: the lead's wake carries the untriaged tasks, one batch",
      Boolean(woke),
      triage.trim()
    );
  });

  // ── 4: Delegate type, Judged checks, Attach or fresh ─────────────────────────
  await section("4: an attempt and a comment", async () => {
    const task = await fleet.api<Task>(`/api/projects/${p}/tasks`, {
      title: "Write the theme file",
      acceptance: "- The theme file exists",
    });
    await send("POST", `/api/projects/${p}/tasks/${task.id}/attempts`, {});
    const typed = await logLine("the type line", [
      "[jev off] Delegate type",
      `${task.id} names no type`,
    ]);
    check(
      "4: Delegate type: nothing named one, so medium",
      typed.includes('"medium"'),
      typed.trim()
    );
    const judged = await logLine(
      "the judged line",
      ["[jev off] Judged checks", task.id],
      300_000
    );
    const after = await until(
      "the task moved",
      () => taskOf(p, task.id),
      (each) => each.kind === "you"
    );
    check(
      "4: Judged checks: the lead off, so shell checks then you",
      judged.includes("with the lead off") && after.kind === "you",
      `${judged.trim()} — ${task.id} is in ${after.stage}`
    );
    await send("POST", `/api/projects/${p}/tasks/${task.id}/comments`, {
      text: "Use the brand's teal for the accent.",
    });
    const attach = await logLine("the attach line", [
      "[jev off] Attach or fresh",
      task.id,
    ]);
    check(
      "4: Attach or fresh: no caller, so warm, idle and the same task continues",
      attach.includes("is warm and idle: its session continues"),
      attach.trim()
    );
  });

  // ── 5: Ready to dispatch and Dispatch order, the lead on ─────────────────────
  await section("5: dispatch", async () => {
    const dispatching = await fleet.api<{ id: string }>("/api/projects", {
      name: "Dispatching",
      machineId: MACHINE,
      cwd: await checkout("dispatching", false),
      caw: false,
    });
    const d = dispatching.id;
    const scored = await fleet.api<Task>(`/api/projects/${d}/tasks`, {
      title: "Add the settings page",
      fields: { ready: "yes" },
    });
    const unscored = await fleet.api<Task>(`/api/projects/${d}/tasks`, {
      title: "Explore a new onboarding",
    });
    await send("PATCH", `/api/projects/${d}/caw`, { on: true });
    await send("PATCH", `/api/projects/${d}/dispatch`, { dispatch: true });
    const ready = await logLine("the ready line", [
      "[jev off] Ready to dispatch",
      `project=${d}`,
    ]);
    const order = await logLine("the order line", [
      "[jev off] Dispatch order",
      `project=${d}`,
    ]);
    check(
      "5: Ready to dispatch: the lead's scores decide",
      ready.includes(`ready ${scored.id}; not ready ${unscored.id}`),
      ready.trim()
    );
    check(
      "5: Dispatch order: the lead's ranks, else board order",
      order.includes(`board order: ${scored.id}`),
      order.trim()
    );
  });
} finally {
  console.log("\n── hub log, placement lines ──");
  console.log(
    (await fleet.logs("hub"))
      .split("\n")
      .filter((line) => LOGGED.test(line))
      .slice(-80)
      .join("\n")
  );
  console.log("\n── results ──");
  for (const [name, result] of Object.entries(results)) {
    console.log(`${name}: ${result}`);
  }
  await fake.stop(true);
  await fleet.close();
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);
