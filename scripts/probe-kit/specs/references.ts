/**
 * The chips for what CawCo keeps beyond sessions and artifacts (core
 * references.ts; dashboard reference-things.svelte.ts, ThingReference): a
 * task and its to-do, a session's plan and its step, a routine, a workflow
 * and one run of it, a project and a machine. On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, calling the tools
 * each PROBE-CALL names) with a project and a session in it, and the built
 * dashboard at the desk and at 390:
 *
 * - links: task_create answers the task's link and each to-do's, todo_write
 *   the plan's and each step's, routine_create the routine's, workflow_list
 *   each workflow's, workflow_run the run's, list_sessions each online
 *   machine's, open_items its open steps', tasks' and to-dos'.
 * - chips: the agent names each by its link; each draws as its kind's chip
 *   on the shared inline look, its name and its state as the dashboard
 *   reads them now (the task's stage, the to-do untick'd, the plan k of n,
 *   the step under way, the routine on, the run's status, the machine
 *   online); a link to a task that isn't there is its label alone.
 * - peek: resting the pointer on each chip peeks its name under it.
 * - press, desk and phone: each opens where it lives: the task's pane, the
 *   task at its to-do (marked), the session's plan, the plan at its step
 *   (marked), the project's routine, the workflow's page, the run's tab, the
 *   project, the machines at its row.
 * - long names: a 40-word task title draws its chip inside its line, its
 *   label at most `c-inline-chip-max-w` (32ch) and cut, at 1440 and 390.
 *
 *   bun scripts/probe-kit/run.ts references
 */
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, type Kit, type KitFleet, open, type Spec } from "../kit";

const COMMAND = /PROBE-CALL:(\d+)/g;
const SAY = /PROBE-SAY:(\d+)/;
const LINK = /\[[^[\]]*\]\(cawco:[a-z]+\/[^)]+\)/g;
/** A JSON string's escaped quote, read back as a quote. */
const ESCAPED_QUOTE = /\\"/g;
const WORKFLOW_ID = /cawco:workflow\/([^)]+)\)/;
const ROUTINE_ID = /cawco:routine\/([^)]+)\)/;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const says = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const say = SAY.exec(request.last)?.[1];
  if (say && says.has(say) && !request.afterTool) {
    return text(says.get(say) as string);
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** Forty words, as a long title runs. */
const FORTY_WORDS = Array.from(
  { length: 40 },
  (_, i) =>
    [
      "fix",
      "the",
      "tray",
      "chip",
      "so",
      "its",
      "label",
      "never",
      "spills",
      "over",
    ][i % 10]
).join(" ");

/** A workflow that sleeps a second and ends: a run with no step of its own. */
const NAP = `import { z } from "zod";

export const inputs = z.object({});

export default async function (w: Workflow<typeof inputs>) {
  await w.sleep(1000);
  return "rested";
}
`;

interface On {
  call: (tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
  page: Page;
  project: string;
  session: string;
}

/** The link of `kind` the tool's answer gave whose destination starts with `prefix`. */
const linkIn = (answer: string, prefix: string): string | null =>
  [...answer.replace(ESCAPED_QUOTE, '"').matchAll(LINK)]
    .map((match) => match[0])
    .find((link) => link.includes(`](${prefix}`)) ?? null;

/** What each chip in the agent's line reads: its label, its state, its box and its line's. */
const chipsOf = (screen: Page) =>
  screen.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("[data-reference-chip]")].map((chip) => {
        const line = chip.closest("p, li");
        const r = chip.getBoundingClientRect();
        const l = chip.querySelector('[data-slot="label"]');
        const p = line?.getBoundingClientRect();
        return [
          `${chip.getAttribute("data-reference-chip")}:${chip.getAttribute("data-reference-id")}`,
          {
            label: l?.textContent?.trim() ?? "",
            state:
              chip.querySelector('[data-slot="state"]')?.textContent?.trim() ??
              null,
            name: chip.getAttribute("aria-label") ?? "",
            labelWidth: l?.getBoundingClientRect().width ?? 0,
            labelMax: l
              ? Number.parseFloat(getComputedStyle(l).maxWidth)
              : Number.NaN,
            cut: !!l && l.scrollWidth > l.clientWidth + 0.5,
            inLine: !!p && r.left >= p.left - 0.5 && r.right <= p.right + 0.5,
          },
        ];
      })
    )
  );

async function setUp(kit: Kit): Promise<On> {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Tray work",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const session = await fleet.spawn("claude", "References", fleet.repo, {
    projectId: project.id,
  });
  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, COMPOSER);
  return { call, fleet, kit, page, project: project.id, session };
}

/** Where each chip's press lands, and how the screen shows it there. */
interface Landing {
  /** What the address says once it lands. */
  at: (url: URL) => boolean;
  /** What stands on screen there, a selector. */
  shows: string;
}

async function run(kit: Kit) {
  const on = await setUp(kit);
  const { origin } = new URL(on.page.url());
  const { project, session } = on;

  // Links from the tools' answers.
  const filed = await on.call("mcp__cawco__task_create", {
    title: "Fix the tray chip",
    todos: ["Cap the label at its line"],
  });
  const long = await on.call("mcp__cawco__task_create", {
    title: FORTY_WORDS,
  });
  const planned = await on.call("mcp__cawco__todo_write", {
    steps: [
      { content: "Read the brief", status: "completed" },
      { content: "Build the chips", status: "in_progress" },
    ],
  });
  const routine = await on.call("mcp__cawco__routine_create", {
    name: "Nightly tray check",
    prompt: "Check the tray's chips.",
    target: "lead",
    cron: "0 3 * * *",
    time_zone: "UTC",
  });
  await on.fleet.api("/api/workflows", { name: "Nap", program: NAP });
  const workflows = await on.call("mcp__cawco__workflow_list", {});
  const ran = await on.call("mcp__cawco__workflow_run", {
    name: "Nap",
    inputs: {},
  });
  const sessions = await on.call("mcp__cawco__list_sessions", {});
  const items = await on.call("mcp__cawco__open_items", {});
  const links = {
    task: linkIn(filed, `cawco:task/${project}/tsk-`),
    todo: linkIn(filed, `cawco:todo/${project}/tsk-`),
    long: linkIn(long, `cawco:task/${project}/tsk-`),
    plan: linkIn(planned, `cawco:plan/${session}`),
    step: linkIn(planned, `cawco:step/${session}/2`),
    routine: linkIn(routine, "cawco:routine/"),
    workflow: linkIn(workflows, "cawco:workflow/"),
    run: linkIn(ran, "cawco:workflow/"),
    machine: linkIn(sessions, `cawco:machine/${MACHINE}`),
  };
  const openLinks = {
    step: linkIn(items, `cawco:step/${session}/2`),
    task: linkIn(items, `cawco:task/${project}/tsk-1`),
    todo: linkIn(items, `cawco:todo/${project}/tsk-1/td-1`),
  };
  kit.check(
    "links: task_create answers the task's link and its to-do's, todo_write the plan's and each step's, routine_create the routine's, workflow_list the workflow's, workflow_run the run's, list_sessions the machine's, open_items its open step's, task's and to-do's",
    Object.values(links).every(Boolean) &&
      Object.values(openLinks).every(Boolean) &&
      links.workflow !== links.run,
    JSON.stringify({ links, openLinks })
  );

  // The agent names each by its link; a task that isn't there reads as its label.
  const projectLink = `[Tray work](cawco:project/${project})`;
  const number = String(says.size + 1);
  says.set(
    number,
    `Filed ${links.task} with ${links.todo}, and ${links.long}. Plan: ${links.plan}, now ${links.step}. Routine ${links.routine}; workflow ${links.workflow}, its run ${links.run}. In ${projectLink} on ${links.machine}. Not [Gone task](cawco:task/${project}/tsk-999).`
  );
  await on.fleet.send(session, `PROBE-SAY:${number}`);
  const runId = links.run?.match(WORKFLOW_ID)?.[1] ?? "";
  const workflowId = links.workflow?.match(WORKFLOW_ID)?.[1] ?? "";
  const routineId = links.routine?.match(ROUTINE_ID)?.[1] ?? "";
  const wanted: Record<string, { label: string; state: string | null }> = {
    [`task:${project}/tsk-1`]: { label: "Fix the tray chip", state: null },
    [`todo:${project}/tsk-1/td-1`]: {
      label: "Cap the label at its line",
      state: "To do",
    },
    [`plan:${session}`]: { label: "Read the brief", state: "1 of 2" },
    [`step:${session}/2`]: { label: "Build the chips", state: "Under way" },
    [`routine:${routineId}`]: { label: "Nightly tray check", state: "On" },
    [`workflow:${workflowId}`]: { label: "Nap", state: null },
    [`workflow:${runId}`]: { label: "Nap", state: null },
    [`project:${project}`]: { label: "Tray work", state: null },
    [`machine:${MACHINE}`]: { label: "", state: "Online" },
  };
  const chips = await until(
    "every chip drawn",
    () => chipsOf(on.page),
    (read) => Object.keys(wanted).every((key) => key in read),
    60_000
  ).catch(() => chipsOf(on.page));
  const gone = await on.page.evaluate(
    () =>
      document.body.textContent?.includes("Not Gone task") === true &&
      !document.querySelector('[data-reference-id$="/tsk-999"]')
  );
  const drawn = Object.entries(wanted).map(([key, want]) => {
    const chip = chips[key];
    return {
      key,
      ok:
        !!chip &&
        (want.label === "" || chip.label === want.label) &&
        (want.state === null || chip.state === want.state) &&
        chip.name.startsWith(chip.label),
      chip,
    };
  });
  kit.check(
    "chips: each link draws as its kind's chip on the shared look, its name and state as the dashboard reads them (the to-do to do, the plan 1 of 2, the step under way, the routine on, the machine online), its accessible name both; a task that isn't there is its label alone",
    drawn.every((one) => one.ok) && gone,
    JSON.stringify({ drawn: drawn.filter((one) => !one.ok), gone })
  );
  const taskChip = chips[`task:${project}/tsk-1`];
  const runChip = chips[`workflow:${runId}`];
  kit.check(
    "chips: the task's chip carries its stage, and the run's its status, in words",
    !!taskChip?.state && !!runChip?.state,
    JSON.stringify({ task: taskChip, run: runChip })
  );

  // Peek: resting on each chip peeks its name.
  const peeks: Record<string, string | null> = {};
  for (const key of Object.keys(wanted)) {
    const [kind, ...rest] = key.split(":");
    const id = rest.join(":");
    const chip = on.page
      .locator(`[data-reference-chip="${kind}"][data-reference-id="${id}"]`)
      .first();
    // biome-ignore lint/performance/noAwaitInLoops: one chip's peek at a time, the pointer on it
    await chip.hover().catch(() => undefined);
    peeks[key] = await until(
      `${key}'s peek`,
      async () => {
        const peek = on.page.locator('[data-slot="reference-peek"]');
        return (await peek.count()) > 0 ? peek.first().textContent() : null;
      },
      Boolean,
      3000
    ).catch(() => null);
    await on.page.mouse.move(0, 0);
  }
  kit.check(
    "peek: resting the pointer on each chip peeks its name under it",
    Object.entries(peeks).every(
      ([key, words]) => !!words && words.includes(chips[key]?.label ?? "\u0000")
    ),
    JSON.stringify(peeks)
  );

  // Press: each opens where it lives, on the desk and on the phone.
  const landings: Record<string, Landing> = {
    [`task:${project}/tsk-1`]: {
      at: (url) =>
        url.pathname === `/project/${project}` &&
        url.searchParams.get("task") === "tsk-1",
      shows: '[data-task-pane="tsk-1"]',
    },
    [`todo:${project}/tsk-1/td-1`]: {
      at: (url) =>
        url.searchParams.get("task") === "tsk-1" &&
        url.searchParams.get("todo") === "td-1",
      shows: '[data-todo="td-1"][data-linked]',
    },
    [`plan:${session}`]: {
      at: (url) => url.pathname === `/session/${session}`,
      shows: '[data-plan-row="2"]',
    },
    [`step:${session}/2`]: {
      at: (url) => url.pathname === `/session/${session}`,
      shows: '[data-plan-row="2"][data-linked]',
    },
    [`routine:${routineId}`]: {
      at: (url) =>
        url.pathname === `/project/${project}` &&
        url.searchParams.get("view") === "routines" &&
        url.searchParams.get("routine") === routineId,
      shows: `[data-routine="${routineId}"]`,
    },
    [`workflow:${workflowId}`]: {
      at: (url) => url.pathname === `/workflows/${workflowId}`,
      shows: "body",
    },
    [`workflow:${runId}`]: {
      at: (url) =>
        url.pathname.startsWith("/session/") && url.pathname.includes(runId),
      shows: "body",
    },
    [`project:${project}`]: {
      at: (url) => url.pathname === `/project/${project}`,
      shows: "body",
    },
    [`machine:${MACHINE}`]: {
      at: () => true,
      shows: `li[data-machine="${MACHINE}"]`,
    },
  };
  const pressAll = async (screen: Page, where: string) => {
    const landed: Record<string, string> = {};
    for (const [key, landing] of Object.entries(landings)) {
      const [kind, ...rest] = key.split(":");
      const id = rest.join(":");
      // biome-ignore lint/performance/noAwaitInLoops: each press from the session's page, one after another
      await open(screen, `${origin}/session/${session}`, COMPOSER);
      await screen
        .locator('[data-side-card="preview"] button[data-slot="close"]')
        .click({ timeout: 2000 })
        .catch(() => undefined);
      const chip = screen
        .locator(`[data-reference-chip="${kind}"][data-reference-id="${id}"]`)
        .first();
      await chip.waitFor({ timeout: 30_000 }).catch(() => undefined);
      await chip.click({ timeout: 10_000 }).catch(() => undefined);
      const shown = async () => {
        try {
          return await screen.locator(landing.shows).first().isVisible();
        } catch {
          return false;
        }
      };
      const ok = await until(
        `${where}: ${key} lands`,
        async () => landing.at(new URL(screen.url())) && (await shown()),
        Boolean,
        15_000
      ).catch(() => false);
      landed[key] = ok ? "landed" : `at ${screen.url()}`;
    }
    return landed;
  };
  const desk = await pressAll(on.page, "desk");
  kit.check(
    "press (desk): each chip opens where it lives: the task's pane, the task at its to-do (marked), the session's plan, the plan at its step (marked), the project's routine, the workflow's page, the run's tab, the project, the machines at its row",
    Object.values(desk).every((one) => one === "landed"),
    JSON.stringify(desk)
  );
  const phone = await kit.page("phone");
  const small = await pressAll(phone, "phone");
  kit.check(
    "press (phone): each chip opens where it lives on the phone too",
    Object.values(small).every((one) => one === "landed"),
    JSON.stringify(small)
  );

  // A 40-word title holds its line, at 1440 and at 390.
  const longKey = Object.keys(chips).find(
    (key) => key.startsWith(`task:${project}/`) && !key.endsWith("/tsk-1")
  );
  const holds = async (screen: Page) => {
    await open(screen, `${origin}/session/${session}`, COMPOSER);
    const read = await until(
      "the long chip",
      () => chipsOf(screen),
      (now) => !!longKey && !!now[longKey],
      30_000
    ).catch(() => chipsOf(screen));
    const chip = longKey ? read[longKey] : undefined;
    return {
      chip,
      spills: await screen.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1
      ),
    };
  };
  const wide = await holds(on.page);
  const narrow = await holds(phone);
  const fits = (read: typeof wide) =>
    !!read.chip &&
    read.chip.inLine &&
    Number.isFinite(read.chip.labelMax) &&
    read.chip.labelWidth <= read.chip.labelMax + 0.5 &&
    read.chip.cut &&
    read.chip.name.includes(FORTY_WORDS) &&
    !read.spills;
  kit.check(
    "long names: a 40-word task title's chip stands inside its line, its label at most c-inline-chip-max-w (32ch) and cut, its whole title its accessible name, at 1440 and 390, and nothing spills",
    fits(wide) && fits(narrow),
    JSON.stringify({ wide, narrow })
  );
  await phone.close();
}

const spec: Spec = { name: "references", run };
export default spec;
