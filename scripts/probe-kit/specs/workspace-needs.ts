/**
 * A machine that lacks what a delegate's workspace needs refuses every
 * delegate before anything starts, in words naming each missing tool, why
 * it is needed and the command that installs them, and its row in the
 * dashboard says the same before a delegate is sent (agent
 * workspace-needs.ts, the `workspace` capability; core
 * words/workspace-needs.ts). Stage 2's `bare` rig proves it on a machine
 * with none of them; this proves it on stand-ins.
 *
 * - A: the one answer (`workspaceNeeds`) on stand-in places: no bwrap or
 *   socat on the system path and no git on PATH names all three with the
 *   install command of the package manager there (apt, dnf, pacman, apk;
 *   none known: the person's own); a Mac lacking git names git alone, by
 *   Homebrew; every tool there: nothing missing.
 * - B: on a scratch fleet whose agent runs with git taken off its PATH, the
 *   machine's report says so, and a delegate from its home folder is
 *   refused in the report's own words before its workspace is cut.
 * - C: in a project, the folder read before a cut (`CONTROL_REPO_ROOT`) is
 *   refused first in those words: what the machine lacks before the folder.
 * - D: the machine's row in the dashboard shows those words, drawn, and
 *   Show details says where each tool was looked for.
 *
 *   bun scripts/probe-kit/run.ts workspace-needs
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  packageInstall,
  type ToolPlaces,
  workspaceNeeds,
} from "../../../packages/agent/src/workspace-needs";
import type { MachineCapability } from "../../../packages/core/src/capabilities";
import {
  workspaceNeedsDetails,
  workspaceNeedsRefusal,
} from "../../../packages/core/src/words/workspace-needs";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The dashboard's Machines button: its count of machines. */
const MACHINES_BUTTON = /^\d+ machines?/;

/** A folder of stand-in commands, each an executable that does nothing. */
const standIns = async (dir: string, commands: string[]): Promise<string> => {
  await mkdir(dir, { recursive: true });
  for (const command of commands) {
    const path = join(dir, command);
    // biome-ignore lint/performance/noAwaitInLoops: a handful of files, in order
    await writeFile(path, "#!/bin/sh\nexit 0\n");
    await chmod(path, 0o755);
  }
  return dir;
};

/** A: the one answer on stand-in places. */
const legA = async ({ check }: Kit, scratch: string): Promise<void> => {
  const none = await standIns(join(scratch, "none"), []);
  const linux = (path: string, systemPath = none): ToolPlaces => ({
    platform: "linux",
    path,
    systemPath,
  });
  const managers = [
    ["apt-get", "sudo apt-get update && sudo apt-get install -y"],
    ["dnf", "sudo dnf install -y"],
    ["pacman", "sudo pacman -S --needed"],
    ["apk", "sudo apk add"],
  ] as const;
  for (const [manager, line] of managers) {
    // biome-ignore lint/performance/noAwaitInLoops: one stand-in folder each, in order
    const path = await standIns(join(scratch, manager), [manager]);
    const needs = workspaceNeeds(linux(path));
    const commands = (needs.missing ?? []).map((tool) => tool.command);
    const command = `${line} bubblewrap socat git`;
    check(
      `A: with ${manager} and no bwrap, socat or git, the machine lacks all three and installs them with ${manager}`,
      !needs.available &&
        commands.join(" ") === "bwrap socat git" &&
        needs.installCommand === command &&
        needs.reason === workspaceNeedsRefusal(needs.missing ?? [], command),
      `${commands.join(" ")} | ${needs.installCommand} | ${needs.reason}`
    );
    if (manager === "apt-get") {
      console.log(`  the refusal on apt: ${needs.reason}`);
      check(
        "A: the refusal names bubblewrap and socat for the walls, git for the checkout, and the one install line",
        Boolean(
          needs.reason?.includes("bubblewrap and socat, which") &&
          needs.reason.includes(", and git, which") &&
          needs.reason.endsWith(`: ${command}`)
        ),
        needs.reason ?? ""
      );
    }
  }
  const unknown = workspaceNeeds(linux(none));
  check(
    "A: with no package manager CawCo knows, the refusal still names each tool and asks for the machine's own",
    !unknown.available &&
      unknown.installCommand === "" &&
      unknown.reason === workspaceNeedsRefusal(unknown.missing ?? [], ""),
    unknown.reason ?? ""
  );
  const brew = await standIns(join(scratch, "brew"), ["brew"]);
  const mac = workspaceNeeds({
    platform: "darwin",
    path: brew,
    systemPath: none,
  });
  check(
    "A: a Mac lacking git names git alone, installed by Homebrew",
    !mac.available &&
      (mac.missing ?? []).map((tool) => tool.command).join(" ") === "git" &&
      mac.installCommand === "brew install git" &&
      packageInstall(["git"], {
        platform: "darwin",
        path: brew,
        systemPath: none,
      }) === "brew install git",
    mac.reason ?? ""
  );
  const walls = await standIns(join(scratch, "walls"), ["bwrap", "socat"]);
  const gitHere = await standIns(join(scratch, "git"), ["git", "apt-get"]);
  const whole = workspaceNeeds(linux(gitHere, walls));
  const wallsOnly = workspaceNeeds(linux(none, walls), "walls");
  check(
    "A: with every tool there nothing is missing, and the walls alone ask for no git",
    whole.available && whole.missing === undefined && wallsOnly.available,
    JSON.stringify({ whole, wallsOnly })
  );
};

/**
 * `path` with git taken off it: each of its dirs that holds a `git` stands
 * in as a folder linking everything else it holds.
 */
const withoutGit = async (path: string, under: string): Promise<string> => {
  const dirs = path.split(":").filter(Boolean);
  const kept: string[] = [];
  for (const [index, dir] of dirs.entries()) {
    if (!existsSync(join(dir, "git"))) {
      kept.push(dir);
      continue;
    }
    const farm = join(under, `bin-${index}`);
    // biome-ignore lint/performance/noAwaitInLoops: one dir at a time, in PATH order
    const [names] = await Promise.all([
      readdir(dir),
      mkdir(farm, { recursive: true }),
    ]);
    await Promise.all(
      names
        .filter((name) => name !== "git")
        .map((name) =>
          symlink(join(dir, name), join(farm, name)).catch(() => undefined)
        )
    );
    kept.push(farm);
  }
  return kept.join(":");
};

/** The machine's `workspace` capability, as the hub holds its report. */
const reported = async (
  fleet: KitFleet
): Promise<MachineCapability | undefined> =>
  (
    await fleet.api<
      {
        machineCapabilities?: { items: MachineCapability[] };
        machineId: string;
      }[]
    >("/api/agents")
  )
    .find((row) => row.machineId === MACHINE)
    ?.machineCapabilities?.items.find((item) => item.id === "workspace");

/** The hub's answer to a delegate from `cwd`, or its refusal's words. */
const delegate = (
  fleet: KitFleet,
  parent: string,
  cwd: string,
  title: string
): Promise<string> =>
  fleet
    .api<{ workspaceId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title,
      prompt: `${title}: say ok.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd,
      lands: "none",
    })
    .then(
      (started) => `started, workspace ${started.workspaceId}`,
      (error: Error) => error.message
    );

/** The workspaces the hub has filed: none is cut on a refused machine. */
const workspaceCount = (fleet: KitFleet): number =>
  fleet.query<{ n: number }>("SELECT count(*) AS n FROM workspaces")[0]?.n ?? 0;

/** B and C: the refusal before anything starts, in the report's words. */
const legsBC = async (
  { check }: Kit,
  fleet: KitFleet,
  needs: MachineCapability
): Promise<void> => {
  const home = fleet.env.HOME as string;
  const parent = await fleet.spawn("claude", "Bare parent", home);
  const refused = await delegate(fleet, parent, home, "Bare home");
  console.log(`  the hub's refusal: ${refused}`);
  check(
    "B: a delegate from the home folder is refused in the machine's report's words, naming git and how to install it",
    Boolean(needs.reason && refused.includes(needs.reason)) &&
      workspaceCount(fleet) === 0,
    `${refused.slice(0, 600)}; workspaces filed: ${workspaceCount(fleet)}`
  );
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Bare",
    machineId: MACHINE,
    cwd: home,
  });
  const inProject = await fleet.spawn("claude", "Bare project", home, {
    projectId: project.id,
  });
  const folder = join(home, "plain");
  await mkdir(folder, { recursive: true });
  const first = await delegate(fleet, inProject, folder, "Bare folder");
  console.log(`  the hub's refusal in a project: ${first}`);
  check(
    "C: in a project, what the machine lacks is said before its folder is read",
    Boolean(needs.reason && first.includes(needs.reason)) &&
      !existsSync(join(folder, ".git")) &&
      workspaceCount(fleet) === 0,
    `${first.slice(0, 600)}; ${folder}/.git ${existsSync(join(folder, ".git")) ? "exists" : "absent"}`
  );
};

/** The row's fault of what a workspace needs: its words and whether they are drawn. */
const rowNeeds = (page: Page) =>
  page.evaluate((id) => {
    const fault = [
      ...document.querySelectorAll(
        `li[data-machine="${id}"] [data-workspace-needs]`
      ),
    ].find((el) => el.checkVisibility());
    return {
      reason:
        fault?.querySelector('[data-slot="reason"]')?.textContent?.trim() ??
        null,
      details:
        fault?.querySelector('[data-slot="details"]')?.textContent?.trim() ??
        null,
    };
  }, MACHINE);

/**
 * The box of the one copy of `selector` the person sees (the list stands in
 * the Machines popover and, hidden at a desk, in the phone's sidebar), with
 * the window's height; null when no copy is shown.
 */
const shownBox = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const shown = [...document.querySelectorAll(sel)].find((el) =>
      el.checkVisibility()
    );
    if (!shown) {
      return null;
    }
    const r = shown.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      windowHeight: window.innerHeight,
    };
  }, selector);

/** D: the machine's row says it before a delegate is sent. */
const legD = async (
  kit: Kit,
  fleet: KitFleet,
  needs: MachineCapability
): Promise<void> => {
  const page = await kit.page("desk");
  await open(page, await fleet.dashboard(), "[data-needs-caw]");
  await page.getByRole("button", { name: MACHINES_BUTTON }).first().click();
  const selector = `li[data-machine="${MACHINE}"] [data-workspace-needs] [data-slot="reason"]`;
  await page.locator(selector).first().waitFor();
  await settle(page);
  const drawn = await shownBox(page, selector);
  const said = await rowNeeds(page);
  console.log(`  the row says: ${said.reason}`);
  kit.check(
    "D: the machine's row shows the report's words, drawn in the window",
    said.reason === needs.reason &&
      drawn !== null &&
      drawn.width > 0 &&
      drawn.height > 0 &&
      drawn.top >= 0 &&
      drawn.bottom <= drawn.windowHeight,
    `${JSON.stringify(drawn)} ${said.reason}`
  );
  await page
    .locator(`li[data-machine="${MACHINE}"] [data-workspace-needs]`)
    .getByRole("button", { name: "Show details" })
    .click();
  await page
    .locator(
      `li[data-machine="${MACHINE}"] [data-workspace-needs] [data-slot="details"]`
    )
    .waitFor();
  const shown = await rowNeeds(page);
  kit.check(
    "D: Show details says where each missing tool was looked for",
    shown.details === workspaceNeedsDetails(needs.missing ?? []),
    shown.details ?? ""
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await legA(kit, join(fleet.sandbox, "stand-ins"));
  const path = await withoutGit(
    fleet.env.PATH as string,
    join(fleet.sandbox, "no-git")
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], { PATH: path });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const needs = await until(
    "the machine's report of what a workspace needs",
    () => reported(fleet),
    (item) => item !== undefined,
    60_000
  ).catch(() => undefined);
  kit.check(
    "B: the machine's report says it lacks git, with the install line, as the one answer reads it",
    needs?.available === false &&
      (needs.missing ?? []).map((tool) => tool.command).includes("git") &&
      needs.reason ===
        workspaceNeedsRefusal(needs.missing ?? [], needs.installCommand),
    JSON.stringify(needs)
  );
  if (!needs || needs.available) {
    return;
  }
  await legsBC(kit, fleet, needs);
  await legD(kit, fleet, needs);
};

export default { name: "workspace-needs", run } satisfies Spec;
