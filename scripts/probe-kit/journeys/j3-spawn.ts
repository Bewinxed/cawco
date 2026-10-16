/**
 * J3, spawn a session against a project (JOURNEY.md Flow 4): from the
 * fleet board, through the new-session dialog with the project chosen in
 * it, to `session/[id]` streaming;
 * then the session's permission mode changed from its session card, and the
 * machine's harness process proven to run under the new mode.
 *
 * The mode change carries the protection of the stay-in-context spec it
 * replaces, which caught “changing a session's permissions said done while
 * the machine kept the old process”: Full Send is a mode Claude Code takes
 * only at launch, so the hub must hold it, the session's process must be a
 * new one, and that process must have been launched in it. Read from the
 * hub and the machine (sessiond's PID, the process's own command line),
 * never from the page's words alone.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import {
  type Data,
  eventually,
  expect,
  gone,
  type Journey,
  type Leg,
  shows,
} from "./suite";

const SPAWN = "JOURNEY-SPAWN";
const START = /^Start/;
/** The fleet board's ways into the New Session dialog: the tab strip's and the rail's. */
const NEW_SESSION = /^(New session|Start session)$/;
const PROJECT_CHIP = /^Project:/;
const SESSION_TABS = "Open sessions in this group";
const MODE_FLAG = "--permission-mode";
const PERMISSION_MODE = /^Permission mode:/;
const IN_FULL_SEND = /^Permission mode: Full Send/;
const FULL_SEND = /^Full Send/;
const ASK_FIRST = /^Ask first/;
const IN_ASK_FIRST = /^Permission mode: Ask first/;
const SPACES = /\s+/;
const REGEX_SIGNS = /[.*+?^${}()|[\]\\]/g;
/** What the new session says to its first message. */
const READING = "Reading the README now, then I'll summarise it.";

interface Seeded {
  /** Its checkout: the folder its sessions start in. */
  dir: string;
  id: string;
  name: string;
}

/** The project a data set's sessions start in, made through the hub's API. */
async function seed(fleet: KitFleet, data: Data): Promise<Seeded> {
  const dir = join(fleet.sandbox, `${data}-docs`);
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const words = "Docs refresh";
  const name = data === "stretched" ? `${words} — ${words} — ${words}` : words;
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  return { dir, id: project.id, name };
}

/** One row of the hub's instances. */
interface Row {
  id: string;
  permission_mode: string | null;
  status: string;
  title: string | null;
}

const sessionsOf = (fleet: KitFleet, project: string) =>
  fleet.query<Row>(
    "SELECT id, status, permission_mode, title FROM instances WHERE project_id = ? ORDER BY spawned_at DESC",
    project
  );

/** `pid`'s children, read from /proc. */
async function children(pid: number): Promise<number[]> {
  const tasks = await readdir(`/proc/${pid}/task`).catch(() => [] as string[]);
  const all = await Promise.all(
    tasks.map((task) =>
      readFile(`/proc/${pid}/task/${task}/children`, "utf8").catch(() => "")
    )
  );
  return all.join(" ").split(SPACES).filter(Boolean).map(Number);
}

/**
 * The permission mode the session's Claude Code process was launched in,
 * read off its command line (`claude … --permission-mode=<mode>`; none
 * given is Claude Code's own `default`), on the process sessiond runs or
 * one under it. Null when no Claude Code process is found.
 */
async function launchedMode(pid: number): Promise<string | null> {
  const queue = [pid];
  for (let at = 0; at < queue.length && at < 64; at += 1) {
    const one = queue[at] as number;
    // biome-ignore lint/performance/noAwaitInLoops: the tree is walked in order, parent before child
    const line = await readFile(`/proc/${one}/cmdline`, "utf8").catch(() => "");
    const argv = line.split("\0").filter(Boolean);
    if (argv.includes("--permission-prompt-tool=stdio")) {
      const flag = argv.findIndex(
        (arg) => arg === MODE_FLAG || arg.startsWith(`${MODE_FLAG}=`)
      );
      if (flag === -1) {
        return "default";
      }
      const given = argv[flag] as string;
      return given === MODE_FLAG
        ? (argv[flag + 1] ?? null)
        : given.slice(MODE_FLAG.length + 1);
    }
    queue.push(...(await children(one)));
  }
  return null;
}

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const project = leg.seeded as Seeded;
  const before = new Set(sessionsOf(fleet, project.id).map((row) => row.id));
  const prompt = `${SPAWN} ${leg.id} Summarise the README for the docs refresh.`;
  const dialog = page.getByRole("dialog", { name: "New Session" });
  let id = "";

  await leg.step(
    "Open the fleet board",
    () => page.goto(`${base}/session`, { waitUntil: "domcontentloaded" }),
    () =>
      shows(
        page.getByRole("button", { name: NEW_SESSION }),
        "a way to start a session"
      )
  );

  await leg.step(
    "Start a new session",
    () =>
      page
        .getByRole("button", { name: NEW_SESSION })
        .filter({ visible: true })
        .first()
        .click(),
    () => shows(dialog, "the New Session dialog")
  );

  const chip = dialog.getByRole("button", { name: PROJECT_CHIP });
  await leg.step(
    "Choose the project",
    async () => {
      await chip.click();
      await page
        .getByRole("button", {
          name: new RegExp(
            `^${literal(project.name)}\\s*${literal(project.dir)}`
          ),
        })
        .click();
    },
    () =>
      shows(
        dialog.getByRole("button", { name: `Project: ${project.name}` }),
        `the project chosen, “Project: ${project.name}”`
      )
  );

  await leg.step(
    "Write what the session should do",
    async () => {
      const field = dialog
        .getByRole("combobox")
        .or(dialog.getByRole("textbox"))
        .first();
      await field.click();
      await page.keyboard.type(prompt);
    },
    () =>
      eventually(
        "Start session can be pressed",
        () => dialog.getByRole("button", { name: START }).first().isEnabled(),
        Boolean
      )
  );

  // Asked first: the mode a session runs in until it is trusted, and one
  // Full Send cannot be switched to without starting the process again.
  await leg.step(
    "Choose to be asked before tools run",
    async () => {
      await dialog.getByRole("button", { name: PERMISSION_MODE }).click();
      await page.getByRole("radio", { name: ASK_FIRST }).click();
    },
    () =>
      shows(
        dialog.getByRole("button", { name: IN_ASK_FIRST }),
        "the session's mode as Ask first"
      )
  );

  await leg.step(
    "Start",
    () => dialog.getByRole("button", { name: START }).first().click(),
    async () => {
      const row = await eventually(
        "the hub runs a new session in the project, asking first",
        () => sessionsOf(fleet, project.id).find((one) => !before.has(one.id)),
        (one) => one?.status === "running" && one.permission_mode === "default",
        120_000
      );
      ({ id } = row as Row);
      await eventually(
        "the session's page is open",
        () => new URL(page.url()).pathname,
        (path) => path === `/session/${id}`,
        60_000
      );
      await eventually(
        "the model was given the first message",
        () =>
          fleet.seen.some(
            (one) => one.tools && one.all.includes(`${SPAWN} ${leg.id}`)
          ),
        Boolean,
        60_000
      );
      await gone(dialog, "the New Session dialog");
      await shows(
        page.getByText(READING),
        `the session's reply streaming (“${READING}”)`,
        60_000
      );
    }
  );

  // The open session's own tab, the chosen one in the session tabs (the
  // rail has tabs of its own): a tap on it opens its details (PaneTabs), on
  // a phone as on the desk.
  const tab = page
    .getByRole("tablist", { name: SESSION_TABS })
    .getByRole("tab", { selected: true })
    .filter({ visible: true });
  const card = page.getByLabel("Session details", { exact: true });
  await leg.step(
    "Open the session's card",
    () => tab.first().click(),
    async () => {
      await shows(card, "the session's details card");
      await shows(
        card.getByRole("button", { name: PERMISSION_MODE }),
        "the session's permission mode"
      );
    }
  );

  const pidBefore = await fleet.sessionPid(id);
  const modeBefore =
    pidBefore === undefined ? null : await launchedMode(pidBefore);
  await leg.step(
    "Switch the session to Full Send",
    async () => {
      await card.getByRole("button", { name: PERMISSION_MODE }).click();
      await page.getByRole("radio", { name: FULL_SEND }).click();
      await page.getByRole("button", { name: "Switch to Full Send" }).click();
    },
    async () => {
      await eventually(
        "the hub holds the session in Full Send",
        () =>
          fleet.query<Row>(
            "SELECT id, status, permission_mode, title FROM instances WHERE id = ?",
            id
          )[0]?.permission_mode,
        (mode) => mode === "fullSend",
        120_000
      );
      const pidAfter = await eventually(
        `the machine runs the session in a new process (it ran in ${pidBefore}, launched in ${modeBefore ?? "(no Claude Code process)"})`,
        () => fleet.sessionPid(id),
        (pid) => pid !== undefined && pid !== pidBefore,
        120_000
      );
      const modeAfter = await launchedMode(pidAfter as number);
      expect(
        "the new process was launched to skip permission checks (Full Send runs on Claude Code's bypassPermissions), the old one was not",
        modeBefore === "default" && modeAfter === "bypassPermissions",
        `process ${pidBefore} launched in ${modeBefore ?? "(no Claude Code process)"}, now ${pidAfter} in ${modeAfter ?? "(no Claude Code process)"}`
      );
      await shows(
        card.getByRole("button", { name: IN_FULL_SEND }),
        "the session's mode as Full Send"
      );
    }
  );
}

/** `words` matched as they are, inside a pattern. */
const literal = (words: string) => words.replace(REGEX_SIGNS, "\\$&");

const journey: Journey = {
  name: "j3-spawn",
  flow: "Flow 4: spawn a session against a project",
  respond: (seen: Seen) =>
    seen.tools && seen.last.includes(SPAWN)
      ? { everyMs: 40, words: READING.split(" ").map((word) => `${word} `) }
      : { everyMs: 20, words: ["Ready."] },
  seed,
  leg: walk,
};

export default journey;
