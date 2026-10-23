/**
 * A machine's harness CLI CawCo refuses (Claude Code below core's
 * `CLAUDE_VERSION_FLOOR`, pi below `PI_VERSION_FLOOR`, OpenCode not
 * `OPENCODE_VERSION`) stands in place of what it blocks, with its fix as one
 * press that runs on the machine (dashboard HarnessBlock, core TOOL_CATALOG),
 * and an added machine joins with its harness CLIs brought up (hub
 * installs.ts `ready`), over a command, over SSH, and after the hub lost it.
 *
 * The scratch fleet's agent runs stand-ins first on its PATH:
 * - `claude`, whose version is written in the script itself: its `update`
 *   rewrites the file at the host's real version, as a real update moves
 *   the binary the version read is keyed on (agent claude-version.ts).
 *   While `update-fails` is in the sandbox it refuses, in a sentence of its
 *   own; while `update-noop` is there it answers as a Homebrew install does
 *   ("Claude is up to date!", exit 0) and changes nothing; while
 *   `update-holds` is there it waits. Everything else it hands to the host's
 *   real Claude Code.
 * - `pi` at 1.2.0, whose `update` rewrites it at 1.3.0 (pi's sessions run
 *   on the agent's embedded pi; the CLI is only version-gated).
 * - `opencode2` saying 2.0.28, there from the agent's start so no OpenCode
 *   server runs; everything else the real OpenCode's.
 *
 * 1. The account's sign-in popover on the machine shows the refusal and
 *    Update Claude Code, and no sign-in form; the row says Claude Code out
 *    of date. At 390 nothing in the popover runs past it.
 * 2. A failed update says why, in the updater's words, and the press reads
 *    Retry. One the package manager answers "up to date" while the version
 *    stays below the floor fails in the updater's words too.
 * 3. Retry runs it again; held, it says it is updating; a reload brings the
 *    popover back on the same update; Esc parks it on the row.
 * 4. Let go, the update lands: the hub's report and tool cell read the new
 *    version, and the popover offers the sign-in, saying which Claude Code
 *    is there now.
 * 5. A Claude session's start refused at the version gate shows the same
 *    press in its composer; pressed, it lands and the session starts again.
 * 6. pi: a pi start refused for its version shows Update pi in its
 *    composer; pressed, pi lands at 1.3.0 and the session starts again.
 * 7. OpenCode: its start refused for its version shows Install OpenCode
 *    2.0.29; pressed, it fails by cause (the copy came some way CawCo does
 *    not install it); the machine's own OpenCode back, the block clears and
 *    the session starts again.
 * 8. A start again refused after the update lands (the account gone, so the
 *    hub refuses it) is said on the session's composer, with Retry.
 * 9. An add by a command runs its harnesses step after the machine is
 *    listed, updates Claude Code, and joins ready.
 * 10. An add the hub lost mid-step (the hub restarted) runs the step again
 *     once the machine is online, and joins ready.
 * 11. An add over SSH (the kit's SSH target, whose CawCo is the build the
 *     hub offers, so the installer joins again) runs its harnesses step,
 *     updates Claude Code, and joins ready.
 * 12. A fresh machine with no Claude Code whose installer finds no route to
 *     claude.ai (the nightly at cf911c631, stage 2: a root box under
 *     systemd, its add ended failed after it joined): the add ends joined,
 *     its last line says why in curl's own words, the machine's tool cell
 *     holds that failure, and the joined outcome shows Claude Code's block
 *     with Retry and why.
 *
 *   bun scripts/probe-kit/run.ts claude-update
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { AuthContext } from "ssh2";
import {
  CLAUDE_VERSION_FLOOR,
  OPENCODE_VERSION,
  olderThan,
  PI_VERSION_FLOOR,
} from "../../../packages/core/src/tools";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import {
  ACCOUNT,
  type Fleet,
  MACHINE,
  MODEL,
  until,
} from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";
import { keyAccepted, machineBin, serveTarget, WAYS } from "../ssh-target";

const OLD = "2.1.96";
/** What the update puts on: the host's real Claude Code's version, which a session it unblocks then runs. */
const REAL = Bun.which("claude") ?? "";
const NEW =
  /\d+\.\d+\.\d+/.exec(
    REAL ? Bun.spawnSync([REAL, "--version"]).stdout.toString() : ""
  )?.[0] ?? "";
const PI_OLD = "1.2.0";
const OPENCODE_OLD = "2.0.28";
const REFUSED = "the update server refused this machine (stand-in)";
const BREW = "Claude is up to date!";
const BLOCK = "[data-slot=harness-block]";
const SIGN_IN = /^Sign in/;
const CODE_IN = /code=([A-Z0-9]+)/;
const WINDOW = "[data-connect-window]";
const NO_ROUTE = "curl: (6) Could not resolve host: claude.ai";
const SSH_USER = "deploy";

/**
 * The stand-in `claude`, at `version`: its own `--version`, `update` and
 * `auth status`; everything else the host's real Claude Code (`real`), as
 * slow-harness-cli's stand-in does.
 */
const claudeStandIn = (
  version: string,
  flags: string,
  real: string
): string => `#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const VERSION = ${JSON.stringify(version)};
const FLAGS = ${JSON.stringify(flags)};
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log(VERSION + " (Claude Code)");
  process.exit(0);
}
if (args[0] === "update") {
  if (existsSync(join(FLAGS, "update-fails"))) {
    console.error("Error: ${REFUSED}");
    process.exit(1);
  }
  if (existsSync(join(FLAGS, "update-noop"))) {
    console.log(${JSON.stringify(BREW)});
    process.exit(0);
  }
  while (existsSync(join(FLAGS, "update-holds"))) {
    await Bun.sleep(200);
  }
  await Bun.sleep(500);
  const self = import.meta.path;
  writeFileSync(self, readFileSync(self, "utf8").replace(JSON.stringify(VERSION), JSON.stringify(${JSON.stringify(NEW)})));
  console.log("Successfully updated from " + VERSION + " to version ${NEW}");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  const signedIn = existsSync(join(FLAGS, "signed-in"));
  console.log(JSON.stringify(signedIn ? { loggedIn: true, authMethod: "claude.ai", email: "probe@scratch-fleet.test", orgName: "Scratch Fleet", orgId: "00000000-0000-4000-8000-0000000000a1" } : { loggedIn: false, authMethod: "none" }));
  process.exit(signedIn ? 0 : 1);
}
// Anything else (a session, its MCP and plugin reads) is the real Claude
// Code's, so a session the update unblocks runs against the fleet's mock.
const child = Bun.spawn([${JSON.stringify(real)}, ...args], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await child.exited);
`;

/** The stand-in `pi`, at `version`: `--version`, and `update`, which rewrites it at pi's floor. */
const piStandIn = (version: string): string => `#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
const VERSION = ${JSON.stringify(version)};
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log(VERSION);
  process.exit(0);
}
if (args[0] === "update") {
  const self = import.meta.path;
  writeFileSync(self, readFileSync(self, "utf8").replace(JSON.stringify(VERSION), JSON.stringify(${JSON.stringify(PI_VERSION_FLOOR)})));
  console.log("Updated pi to ${PI_VERSION_FLOOR}");
  process.exit(0);
}
process.exit(0);
`;

/** The stand-in `opencode2`: says an OpenCode CawCo does not run; everything else the real one's. */
const opencodeStandIn = (real: string): string => `#!/bin/sh
case "\${1:-}" in
  --version) echo "${OPENCODE_OLD}"; exit 0 ;;
esac
exec "${real}" "$@"
`;

interface AgentRow {
  harnesses?: { harness: string; refused?: string; version?: string }[];
  machineId: string;
  tools?: Record<string, { state: string; version?: string; detail?: string }>;
}

interface Install {
  id: string;
  problem: unknown;
  state: string;
  steps: { step: string }[];
}

/** The machine's row on the hub. */
const row = async (fleet: Fleet): Promise<AgentRow | undefined> =>
  (await fleet.api<AgentRow[]>("/api/agents")).find(
    (one) => one.machineId === MACHINE
  );

const reportOf = (agent: AgentRow | undefined, harness: string) =>
  agent?.harnesses?.find((one) => one.harness === harness);

declare global {
  interface Window {
    /** An element's name as a reader hears it: its aria-label, else its text outside `aria-hidden` (a Button's pending label and morph). */
    probeName: (el: Element | null | undefined) => string;
  }
}

/** Installs `probeName` on every page, before its own scripts. */
const installName = (page: Page) =>
  page.addInitScript(() => {
    window.probeName = (el) => {
      if (!el) {
        return "";
      }
      const label = el.getAttribute("aria-label");
      if (label) {
        return label.trim();
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let said = "";
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement?.closest("[aria-hidden=true]")) {
          said += node.textContent ?? "";
        }
      }
      return said.replace(/\s+/g, " ").trim();
    };
  });

/** Whether the sign-in form stands anywhere on the page: its Open sign-in link, or its code field. */
const formOn = (page: Page) =>
  page.evaluate(
    (openLink) => ({
      openLink: [...document.querySelectorAll("a, button")].some(
        (one) => window.probeName(one) === openLink
      ),
      code:
        document.querySelector(
          'input[aria-label="Code from the sign-in page"]'
        ) !== null,
    }),
    accountsWords.signin.openLink
  );

/** What the block shows now, read off the page; null when none stands. */
const blockOn = (page: Page) =>
  page.evaluate((selector) => {
    const block = document.querySelector<HTMLElement>(selector);
    if (!block) {
      return null;
    }
    return {
      harness: block.dataset.harness ?? "",
      phase: block.dataset.phase ?? "",
      press: window.probeName(block.querySelector("button")),
      progress: block.querySelector("[data-slot=progress]")?.textContent ?? "",
      error:
        block.querySelector("[data-slot=error]")?.textContent?.trim() ?? "",
      why: block.querySelector("[data-slot=why]")?.textContent?.trim() ?? "",
    };
  }, BLOCK);

/** What the page says, for a failing line. */
const pageSaid = (page: Page) =>
  page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").slice(0, 1200)
  );

/** Waits until the block's phase is `phase`, then reads it. */
const blockAt = async (page: Page, phase: string) => {
  try {
    await page.waitForFunction(
      ([selector, want]) =>
        document.querySelector<HTMLElement>(selector)?.dataset.phase === want,
      [BLOCK, phase] as const,
      { timeout: 60_000 }
    );
  } catch (error) {
    throw new Error(
      `no block at ${phase} within 60 s: block ${JSON.stringify(await blockOn(page))}; the page said: ${await pageSaid(page)}`,
      { cause: error }
    );
  }
  return await blockOn(page);
};

/** A start as the dashboard sends one (fleet.spawn waits for it to run, and these are refused): its id, once its row reads failed. */
const refusedStart = async (
  fleet: Fleet,
  harness: "claude" | "opencode" | "pi",
  title: string
): Promise<{ id: string; lastError: string }> => {
  const id = crypto.randomUUID();
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId: id,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId: id,
      cwd: fleet.workdir,
      harness,
      model: MODEL[harness],
      title,
      ...(harness === "pi" ? {} : { permissionMode: "bypassPermissions" }),
    },
  });
  const refused = await until(
    `the ${harness} start refused`,
    () => fleet.instance(id),
    (one) => one.status === "error",
    90_000
  );
  return { id, lastError: refused.last_error ?? "" };
};

/** Waits until the session's row leaves `error`: it started again. */
const startedAgain = (fleet: Fleet, id: string) =>
  until(
    "the refused session started again",
    () => fleet.instance(id),
    (one) => one.status !== "error",
    120_000
  ).catch((error: Error) => error);

/** The machine's report of `harness` once it reads `accept`, within 150 s (a refusal not re-read on a move waits for the minute's read). */
const reportReads = (
  fleet: Fleet,
  harness: string,
  accept: (report: ReturnType<typeof reportOf>) => boolean,
  label: string
) =>
  until(
    label,
    () => row(fleet),
    (agent) => accept(reportOf(agent, harness)),
    150_000
  );

/** An install of this hub, as `/api/installs` holds it. */
const installOf = async (fleet: Fleet, id: string) =>
  (await fleet.api<{ installs: Install[] }>("/api/installs")).installs.find(
    (one) => one.id === id
  );

/** What drives one spec run: the fleet, its stand-ins, the page. */
interface Run {
  base: string;
  check: Kit["check"];
  claude: string;
  flags: string;
  fleet: Fleet;
  /** Puts the Claude stand-in back at the old version and has the agent read it now. */
  makeOld: () => Promise<void>;
  page: Page;
}

const spec: Spec = {
  name: "claude-update",
  async run(kit) {
    const { check } = kit;
    if (
      !check(
        "a real claude at the floor or newer is on this host's PATH for the stand-in to hand sessions to",
        NEW !== "" && !olderThan(NEW, CLAUDE_VERSION_FLOOR),
        `${REAL || "no claude"} says ${NEW || "no version"}`
      )
    ) {
      return;
    }
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const realOpencode =
      Bun.which("opencode2", { PATH: fleet.env.PATH ?? "" }) ?? "";
    const bin = join(fleet.sandbox, "stand-in-bin");
    const flags = join(fleet.sandbox, "claude-flags");
    await mkdir(bin, { recursive: true });
    await mkdir(flags, { recursive: true });
    const claude = join(bin, "claude");
    await writeFile(claude, claudeStandIn(OLD, flags, REAL), { mode: 0o755 });
    await writeFile(join(bin, "pi"), piStandIn(PI_OLD), { mode: 0o755 });
    if (realOpencode) {
      await writeFile(join(bin, "opencode2"), opencodeStandIn(realOpencode), {
        mode: 0o755,
      });
    }
    const ssh = await sshTarget(fleet);
    const machineEnv = { PATH: `${bin}:${fleet.env.PATH}` };
    fleet.launch("sessiond", [], machineEnv);
    await fleet.sessiondUp();
    fleet.launch("hub", [], ssh.hubEnv);
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], machineEnv);
    await fleet.agentUp();
    const reported = await until(
      "the machine's Claude report",
      () => row(fleet),
      (agent) => reportOf(agent, "claude") !== undefined,
      60_000
    );
    check(
      `the agent reports Claude Code ${OLD} refused for its version`,
      reportOf(reported, "claude")?.refused === "version" &&
        reportOf(reported, "claude")?.version === OLD,
      JSON.stringify(reportOf(reported, "claude"))
    );

    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await installName(page);
    const run: Run = {
      base,
      check,
      claude,
      fleet,
      flags,
      page,
      makeOld: async () => {
        await writeFile(claude, claudeStandIn(OLD, flags, REAL), {
          mode: 0o755,
        });
        // A probe of the tools sees the version move (agent tools.ts
        // `sawTool`), and the agent reads Claude's report again with it.
        await fleet.controlAnswer("listTools", []);
        await until(
          "the machine's Claude report refused again",
          () => row(fleet),
          (agent) => reportOf(agent, "claude")?.refused === "version",
          60_000
        );
      },
    };
    await signInLegs(run, kit);
    await sessionLeg(run);
    await piLeg(run);
    await opencodeLeg(run, realOpencode);
    await refusedRestartLeg(run);
    await commandAddLeg(run);
    await lostAddLeg(run, ssh.hubEnv);
    await sshAddLeg(run, ssh);
    await noRouteAddLeg(run);
  },
};

/** 1 to 4: the sign-in popover's block, its failures, its reload and park, and its landing. */
async function signInLegs(run: Run, kit: Kit): Promise<void> {
  const { base, check, fleet, flags, page } = run;
  const accountPage = `${base}/config/accounts/${ACCOUNT}`;
  const machineState = page.locator("[data-slot=machine-state]").first();
  // The machine row's own Sign in, not another on the page.
  const machineRow = page.locator("li", { has: machineState }).first();
  const trigger = machineRow.getByRole("button", { name: SIGN_IN });

  // 1. The popover holds the refusal and its press, no sign-in form.
  await open(page, accountPage, "[data-slot=machine-state]");
  const rowWord = (await machineState.textContent())?.trim();
  await trigger.click();
  const shown = await blockAt(page, "idle");
  const form = await formOn(page);
  check(
    "1. the sign-in popover shows why and Update Claude Code in place of the sign-in form",
    shown?.press === "Update Claude Code" &&
      shown.why.includes(`Claude Code ${OLD} on this machine is older than`) &&
      !form.openLink &&
      !form.code,
    `block ${JSON.stringify(shown)}; form ${JSON.stringify(form)}`
  );
  check(
    "1. the machine's row says Claude Code out of date",
    rowWord === "Claude Code out of date",
    `row: ${rowWord}`
  );
  const phone = await kit.page("phone");
  await open(phone, accountPage, "[data-slot=machine-state]");
  await phone
    .locator("li", { has: phone.locator("[data-slot=machine-state]") })
    .first()
    .getByRole("button", { name: SIGN_IN })
    .click();
  await phone.waitForSelector(BLOCK);
  const fits = await phone.evaluate((selector) => {
    const block = document.querySelector<HTMLElement>(selector);
    const box = block?.getBoundingClientRect();
    return {
      right: box?.right ?? 0,
      width: window.innerWidth,
      spills: block ? block.scrollWidth > block.clientWidth : true,
      page: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, BLOCK);
  check(
    "1. at 390 the block stands inside the viewport and nothing in it runs sideways",
    fits.right <= fits.width && !fits.spills && !fits.page,
    JSON.stringify(fits)
  );
  await phone.close();

  // 2. A failed update says why, with Retry.
  await writeFile(join(flags, "update-fails"), "");
  await page.locator(BLOCK).getByRole("button").click();
  const failed = await blockAt(page, "failed");
  check(
    "2. a failed update says why in the updater's words, and the press reads Retry",
    failed?.press === "Retry" &&
      failed.error.startsWith("Claude Code didn't update on") &&
      failed.error.includes(REFUSED),
    JSON.stringify(failed)
  );
  // 2. A package manager's "up to date" while the version stays below the floor.
  await rm(join(flags, "update-fails"));
  await writeFile(join(flags, "update-noop"), "");
  await page.locator(BLOCK).getByRole("button").click();
  const noop = await page
    .waitForFunction(
      ([selector, brew]) =>
        document
          .querySelector(`${selector} [data-slot=error]`)
          ?.textContent?.includes(brew) === true,
      [BLOCK, BREW] as const,
      { timeout: 60_000 }
    )
    .then(() => blockOn(page))
    .catch(() => blockOn(page));
  check(
    `2. an updater that answers "${BREW}" and leaves ${OLD} fails in its own words, and how to go on`,
    noop?.phase === "failed" &&
      noop.press === "Retry" &&
      noop.error.includes(
        `claude update finished, and claude still says ${OLD}`
      ) &&
      noop.error.includes(`claude update said: ${BREW}`) &&
      noop.error.includes("Update it on the machine the way it was installed"),
    JSON.stringify(noop)
  );

  // 3. Retry, held mid-update: a reload keeps it, Esc parks it on the row.
  await rm(join(flags, "update-noop"));
  await writeFile(join(flags, "update-holds"), "");
  await page.locator(BLOCK).getByRole("button").click();
  const running = await blockAt(page, "running");
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = await blockAt(page, "running");
  check(
    "3. held, it says it is updating, and a reload brings the popover back on the same update",
    running?.progress.startsWith("Updating Claude Code on") === true &&
      reloaded?.progress === running.progress,
    `before ${JSON.stringify(running)}; after the reload ${JSON.stringify(reloaded)}`
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    BLOCK,
    { timeout: 10_000 }
  );
  const parked = (await machineState.textContent())?.trim();
  check(
    "3. Esc parks the update on its row",
    parked === "Updating Claude Code",
    `row: ${parked}`
  );

  // 4. Let go: it lands, the version is read again, the sign-in is offered.
  await rm(join(flags, "update-holds"));
  const landed = await until(
    "the machine's Claude report at the new version",
    () => row(fleet),
    (agent) =>
      reportOf(agent, "claude")?.version === NEW &&
      !reportOf(agent, "claude")?.refused,
    90_000
  );
  check(
    `4. the agent read Claude Code again: ${NEW}, no longer refused, and its tool cell installed`,
    landed.tools?.claude?.state === "installed" &&
      landed.tools.claude.version === NEW,
    JSON.stringify({
      report: reportOf(landed, "claude"),
      tool: landed.tools?.claude,
    })
  );
  await trigger.click();
  await page.waitForFunction(
    (openLink) =>
      [...document.querySelectorAll("a, button")].some(
        (one) => window.probeName(one) === openLink
      ),
    accountsWords.signin.openLink,
    { timeout: 30_000 }
  );
  const offered = await page.evaluate(
    (selector) => ({
      block: document.querySelector(selector) !== null,
      landed:
        document.querySelector("[data-slot=landed]")?.textContent?.trim() ?? "",
    }),
    BLOCK
  );
  check(
    "4. the popover then offers the sign-in, saying which Claude Code is there now",
    !offered.block && offered.landed.startsWith(`Claude Code ${NEW} is on`),
    JSON.stringify(offered)
  );
  await page.keyboard.press("Escape");
}

/** 5: a Claude start refused at the version gate, and its composer's press. */
async function sessionLeg(run: Run): Promise<void> {
  const { base, check, fleet, flags, page } = run;
  // The account signed in first, so the hub's own account check lets the
  // start through to the machine's version gate.
  await writeFile(join(flags, "signed-in"), "");
  await fleet.accountSignedIn();
  await run.makeOld();
  const { id, lastError } = await refusedStart(
    fleet,
    "claude",
    "refused for its Claude Code"
  );
  await open(page, `${base}/session/${id}`, BLOCK);
  const atStart = await blockOn(page);
  check(
    "5. a Claude start refused for the version fails in the gate's words, and its composer shows Update Claude Code",
    lastError.includes(`Claude Code ${OLD} on this machine is older than`) &&
      atStart?.press === "Update Claude Code",
    `error ${lastError}; block ${JSON.stringify(atStart)}`
  );
  await page.locator(BLOCK).getByRole("button").click();
  const again = await startedAgain(fleet, id);
  const reread = await reportReads(
    fleet,
    "claude",
    (report) => report?.version === NEW,
    "the machine's Claude report at the new version"
  ).catch(() => undefined);
  check(
    "5. pressed, the update lands and the session starts again with nothing more to press",
    !(again instanceof Error) && reread !== undefined,
    again instanceof Error
      ? `${again.message}: ${JSON.stringify(fleet.instance(id))}`
      : JSON.stringify(again)
  );
}

/** 6: pi below its floor, a pi start refused, and its composer's press. */
async function piLeg(run: Run): Promise<void> {
  const { base, check, fleet, page } = run;
  const refusedPi = await reportReads(
    fleet,
    "pi",
    (report) => report?.refused === "version",
    "the machine's pi report refused for its version"
  ).catch((error: Error) => error);
  check(
    `6. the agent reports pi ${PI_OLD} refused for its version`,
    !(refusedPi instanceof Error),
    refusedPi instanceof Error
      ? `${refusedPi.message}: ${JSON.stringify(reportOf(await row(fleet), "pi"))}`
      : JSON.stringify(reportOf(refusedPi, "pi"))
  );
  const { id, lastError } = await refusedStart(
    fleet,
    "pi",
    "refused for its pi"
  );
  await open(page, `${base}/session/${id}`, BLOCK);
  const atStart = await blockOn(page);
  check(
    "6. a pi start refused for the version fails in the gate's words, and its composer shows Update pi",
    lastError.includes(`pi ${PI_OLD} at `) &&
      lastError.includes(
        ` on this machine isn't one CawCo runs (${PI_VERSION_FLOOR} or newer)`
      ) &&
      atStart?.harness === "pi" &&
      atStart.press === "Update pi",
    `error ${lastError}; block ${JSON.stringify(atStart)}`
  );
  await page.locator(BLOCK).getByRole("button").click();
  const again = await startedAgain(fleet, id);
  const tool = (await row(fleet))?.tools?.pi;
  check(
    `6. pressed, pi lands at ${PI_VERSION_FLOOR} and the session starts again with nothing more to press`,
    !(again instanceof Error) &&
      tool?.state === "installed" &&
      tool.version === PI_VERSION_FLOOR,
    `${again instanceof Error ? again.message : JSON.stringify(again)}; tool ${JSON.stringify(tool)}`
  );
}

/** 7: OpenCode not its one version, its press failing by cause, and its own copy back. */
async function opencodeLeg(run: Run, realOpencode: string): Promise<void> {
  const { base, check, fleet, page } = run;
  if (
    !check(
      "7. the scratch fleet has an OpenCode for the stand-in to stand before",
      realOpencode !== ""
    )
  ) {
    return;
  }
  const { id, lastError } = await refusedStart(
    fleet,
    "opencode",
    "refused for its OpenCode"
  );
  await open(page, `${base}/session/${id}`, BLOCK);
  const atStart = await blockOn(page);
  check(
    `7. an OpenCode start refused for its version fails in the gate's words, and its composer shows Install OpenCode ${OPENCODE_VERSION}`,
    lastError.includes(
      `OpenCode ${OPENCODE_OLD} on this machine isn't one CawCo runs (${OPENCODE_VERSION})`
    ) &&
      atStart?.harness === "opencode" &&
      atStart.press === `Install OpenCode ${OPENCODE_VERSION}`,
    `error ${lastError}; block ${JSON.stringify(atStart)}`
  );
  await page.locator(BLOCK).getByRole("button").click();
  const failed = await blockAt(page, "failed");
  check(
    "7. pressed, it fails by cause: the copy came some way CawCo doesn't install OpenCode, and Retry stands",
    failed?.press === "Retry" &&
      failed.error.startsWith("OpenCode didn't install on") &&
      failed.error.includes("came from none of the ways CawCo installs"),
    JSON.stringify(failed)
  );
  // The machine's own OpenCode back: the block clears and the session goes on.
  await rm(join(fleet.sandbox, "stand-in-bin", "opencode2"));
  await fleet.controlAnswer("listTools", []);
  const again = await startedAgain(fleet, id);
  check(
    "7. with the machine's own OpenCode back, the block clears and the session starts again",
    !(again instanceof Error),
    again instanceof Error
      ? `${again.message}: ${JSON.stringify(reportOf(await row(fleet), "opencode"))}; page: ${await pageSaid(page)}`
      : JSON.stringify(again)
  );
}

/** 8: a start again refused after the update lands, said on the session's composer with Retry. */
async function refusedRestartLeg(run: Run): Promise<void> {
  const { base, check, claude, fleet, flags, page } = run;
  await run.makeOld();
  const { id } = await refusedStart(fleet, "claude", "its start again refused");
  // Claude Code up, so the account's removal signs it out there; then old
  // again, so the session's block stands and its press brings it up.
  await writeFile(claude, claudeStandIn(NEW, flags, REAL), { mode: 0o755 });
  await fleet.controlAnswer("listTools", []);
  await reportReads(
    fleet,
    "claude",
    (report) => report?.version === NEW && !report.refused,
    "the machine's Claude report at the new version"
  );
  // The sessions the legs before started on the account stop first: the
  // hub removes no account a session still runs on.
  const onAccount = () =>
    fleet
      .query<{ id: string }>(
        "SELECT id FROM instances WHERE account_id = ? AND status IN ('starting', 'running', 'sleeping')",
        ACCOUNT
      )
      .map((one) => one.id);
  for (const live of onAccount()) {
    // biome-ignore lint/performance/noAwaitInLoops: one stop at a time, as a person presses each
    await fleet.stopSession(live);
  }
  await until(
    "no session running on the account",
    () => onAccount(),
    (live) => live.length === 0,
    60_000
  );
  const removed = await fetch(`${fleet.base}/api/accounts/${ACCOUNT}`, {
    method: "DELETE",
  });
  check(
    "8. the account is removed, so a Claude start on the machine is the hub's to refuse",
    removed.ok,
    `${removed.status} ${await removed.text()}`
  );
  await run.makeOld();
  await open(page, `${base}/session/${id}`, BLOCK);
  await page.locator(BLOCK).getByRole("button").click();
  const said = await page
    .waitForSelector("[data-slot=relaunch-error]", { timeout: 120_000 })
    .then(() =>
      page.evaluate(() => {
        const line = document.querySelector("[data-slot=relaunch-error]");
        return {
          text: line?.querySelector("p")?.textContent?.trim() ?? "",
          retry: window.probeName(line?.querySelector("button")),
        };
      })
    )
    .catch(async () => ({ text: await pageSaid(page), retry: "" }));
  check(
    "8. the start again refused is said on the session's composer, what happened and why, with Retry",
    said.text.startsWith("Claude Code runs on") &&
      said.text.includes("this session didn't start again") &&
      said.text.includes("No Claude account is signed in") &&
      said.retry === "Retry",
    JSON.stringify(said)
  );
}

/** 9: an add by a command brings the old Claude Code up before it joins. */
async function commandAddLeg(run: Run): Promise<void> {
  const { check, fleet } = run;
  await run.makeOld();
  const started = await fleet.api<{ install: Install & { command: string } }>(
    "/api/installs",
    { route: "command", address: fleet.base }
  );
  const code = CODE_IN.exec(started.install.command)?.[1] ?? "";
  await fetch(`${fleet.base}/install.sh?code=${code}`).then((r) => r.text());
  await fetch(`${fleet.base}/api/agents/${encodeURIComponent(MACHINE)}`, {
    headers: { "x-cawco-install-code": code },
  });
  const ended = await until(
    "the add's end",
    () => installOf(fleet, started.install.id),
    (one) => one.state !== "running",
    180_000
  );
  const output = await fleet.api<{ lines: string[] }>(
    `/api/installs/${started.install.id}/output`
  );
  // The machine's probe after the install lands as its own beat.
  const after = await until(
    "the machine's tool cell after the add",
    () => row(fleet),
    (agent) => agent.tools?.claude?.state === "installed",
    30_000
  ).catch(() => row(fleet));
  check(
    "9. an add by a command runs its harnesses step after the machine is listed, updates Claude Code, and joins ready",
    ended.state === "joined" &&
      ended.steps.map((one) => one.step).join(",") ===
        "run,install,listed,harnesses" &&
      output.lines.some((line) =>
        line.includes(`updating Claude Code ${OLD}`)
      ) &&
      after?.tools?.claude?.state === "installed" &&
      after.tools.claude.version === NEW,
    `${ended.state} ${JSON.stringify(ended.steps.map((one) => one.step))} ${JSON.stringify(ended.problem)}; output: ${JSON.stringify(output.lines.slice(-6))}; tool ${JSON.stringify(after?.tools?.claude)}`
  );
}

/** 10: an add the hub lost mid-step runs its harnesses step once the machine is online again. */
async function lostAddLeg(
  run: Run,
  hubEnv: Record<string, string>
): Promise<void> {
  const { check, fleet, flags } = run;
  await run.makeOld();
  await writeFile(join(flags, "update-holds"), "");
  const started = await fleet.api<{ install: Install & { command: string } }>(
    "/api/installs",
    { route: "command", address: fleet.base }
  );
  const code = CODE_IN.exec(started.install.command)?.[1] ?? "";
  await fetch(`${fleet.base}/install.sh?code=${code}`).then((r) => r.text());
  await fetch(`${fleet.base}/api/agents/${encodeURIComponent(MACHINE)}`, {
    headers: { "x-cawco-install-code": code },
  });
  await until(
    "the add on its harnesses step, the update held",
    () => installOf(fleet, started.install.id),
    (one) => one.steps.at(-1)?.step === "harnesses",
    60_000
  );
  // The hub restarts mid-step: the add is lost, and comes back.
  await fleet.stop("hub");
  fleet.launch("hub", [], hubEnv);
  await fleet.hubUp();
  await rm(join(flags, "update-holds"));
  const ended = await until(
    "the lost add's end",
    () => installOf(fleet, started.install.id),
    (one) => one.state !== "running" && one.state !== "lost",
    180_000
  ).catch((error: Error) => error);
  const logs = await fleet.logs("hub");
  const lost = logs.includes(
    `[installs] ${started.install.id} (by a command) was running when the hub stopped: lost`
  );
  const resumed = logs.includes(`[installs] ${started.install.id}: lost, and`);
  check(
    "10. an add the hub lost mid-step runs its harnesses step again once the machine is online, and joins ready",
    !(ended instanceof Error) &&
      ended.state === "joined" &&
      ended.steps.at(-1)?.step === "harnesses" &&
      lost &&
      resumed,
    `${ended instanceof Error ? ended.message : `${ended.state} ${JSON.stringify(ended.steps.map((one) => one.step))} ${JSON.stringify(ended.problem)}`}; lost logged ${lost}; resumed logged ${resumed}`
  );
}

/** The kit's SSH target, furnished as a machine on the build the hub offers, and the hub's PATH with its `ssh`. */
interface SshTarget {
  /** The box's HOME, where its CawCo is furnished once the hub says its build. */
  home: string;
  hubEnv: Record<string, string>;
  port: number;
  stop: () => void;
  target: string;
}

/** The target: the hub's key in its `authorized_keys`, the hub's `ssh` pointed at it (connect-machine's setup). */
async function sshTarget(fleet: Fleet): Promise<SshTarget> {
  const dir = join(fleet.sandbox, "ssh-target");
  const home = join(dir, "home");
  const hubBin = join(dir, "hub-bin");
  mkdirSync(join(home, ".ssh"), { recursive: true, mode: 0o700 });
  mkdirSync(hubBin, { recursive: true });
  mkdirSync(join(fleet.home, ".ssh"), { recursive: true, mode: 0o700 });
  const hubKey = join(fleet.home, ".ssh", "id_ed25519");
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -C cawco-probe-hub -f ${hubKey}`.quiet();
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "host_key")}`.quiet();
  writeFileSync(
    join(dir, "ssh_config"),
    `UserKnownHostsFile ${join(dir, "known_hosts")}\nIdentityFile ${hubKey}\nIdentitiesOnly yes\n`
  );
  writeFileSync(
    join(hubBin, "ssh"),
    `#!/bin/sh\nexec /usr/bin/ssh -F ${join(dir, "ssh_config")} "$@"\n`,
    { mode: 0o755 }
  );
  const authorized = join(home, ".ssh", "authorized_keys");
  writeFileSync(authorized, readFileSync(`${hubKey}.pub`, "utf8"), {
    mode: 0o600,
  });
  const authenticate = (ctx: AuthContext): void => {
    if (
      ctx.username === SSH_USER &&
      ctx.method === "publickey" &&
      keyAccepted(authorized, ctx)
    ) {
      ctx.accept();
      return;
    }
    ctx.reject(WAYS);
  };
  const { port, server } = await serveTarget({
    authenticate,
    home,
    host: "127.0.0.1",
    hostKey: readFileSync(join(dir, "host_key")),
    path: machineBin(join(dir, "machine-bin")),
    port: 0,
  });
  return {
    home,
    hubEnv: { PATH: `${hubBin}:${fleet.env.PATH}` },
    port,
    stop: () => server.close(),
    target: `${SSH_USER}@127.0.0.1`,
  };
}

/**
 * 11: an add over SSH. The box has CawCo on the build the hub offers, so the
 * installer joins it again (core install-script.ts's rejoin branch); its
 * `cawco` stand-in answers `binary-rejoin` as the fleet's own machine, which
 * is online, so the hub's side (its key, its connection, the installer
 * through it, its wait for the machine) runs as the product's own up to the
 * harnesses step.
 */
async function sshAddLeg(run: Run, ssh: SshTarget): Promise<void> {
  const { check, fleet } = run;
  const offer = await fleet
    .api<{ manifest?: { version?: string } }>("/api/binary-updates/latest")
    .then(
      (answer) => answer.manifest?.version ?? "",
      () => ""
    );
  if (
    !check(
      "11. the hub offers its fleet a build (its channel's newest), which the SSH box is furnished on",
      offer !== "",
      `GET /api/binary-updates/latest: ${offer || "no build named"}`
    )
  ) {
    ssh.stop();
    return;
  }
  const binary = join(ssh.home, ".local", "share", "cawco", "binary");
  mkdirSync(join(binary, "current"), { recursive: true });
  writeFileSync(
    join(binary, "installation.json"),
    `{"role":"agent","hubUrl":"http://not-joined.invalid","installedVersion":"${offer}"}\n`
  );
  writeFileSync(
    join(binary, "current", "cawco"),
    `#!/bin/sh
[ "\${1:-}" = binary-rejoin ] || { echo "cawco (claude-update stand-in): only binary-rejoin" >&2; exit 2; }
echo "cawco-install: joined as ${MACHINE}"
exit 0
`,
    { mode: 0o755 }
  );
  await run.makeOld();
  const started = await fleet.api<{ install: Install }>("/api/installs", {
    route: "ssh",
    target: ssh.target,
    port: ssh.port,
    signIn: "key",
  });
  const ended = await until(
    "the SSH add's end",
    () => installOf(fleet, started.install.id),
    (one) => one.state !== "running",
    240_000
  ).catch((error: Error) => error);
  const output = await fleet
    .api<{ lines: string[] }>(`/api/installs/${started.install.id}/output`)
    .catch(() => ({ lines: [] as string[] }));
  check(
    "11. an add over SSH runs its harnesses step after the machine is listed, updates Claude Code, and joins ready",
    !(ended instanceof Error) &&
      ended.state === "joined" &&
      ended.steps.at(-1)?.step === "harnesses" &&
      output.lines.some((line) => line.includes(`updating Claude Code ${OLD}`)),
    `${ended instanceof Error ? ended.message : `${ended.state} ${JSON.stringify(ended.steps.map((one) => one.step))} ${JSON.stringify(ended.problem)}`}; output: ${JSON.stringify(output.lines.slice(-10))}`
  );
  ssh.stop();
}

/**
 * 12: a fresh machine with no Claude Code, whose installer finds no route to
 * claude.ai. The agent starts again on a PATH with no `claude` anywhere on
 * it and a `curl` that answers claude.ai as a machine with no route does
 * (the real curl for anything else); everything else is the product's.
 */
async function noRouteAddLeg(run: Run): Promise<void> {
  const { base, check, fleet, page } = run;
  const dir = join(fleet.sandbox, "no-route-bin");
  await mkdir(dir, { recursive: true });
  const realCurl = Bun.which("curl") ?? "/usr/bin/curl";
  await writeFile(
    join(dir, "curl"),
    `#!/bin/sh
case "$*" in
  *claude.ai*) echo "${NO_ROUTE}" >&2; exit 6 ;;
esac
exec "${realCurl}" "$@"
`,
    { mode: 0o755 }
  );
  await rm(run.claude, { force: true });
  const hasClaude = (folder: string) =>
    Bun.which("claude", { PATH: folder }) !== null;
  const path = [
    dir,
    ...(fleet.env.PATH ?? "")
      .split(":")
      .filter((folder) => folder && !hasClaude(folder)),
  ].join(":");
  await fleet.stop("agent");
  fleet.launch("agent", [], { PATH: path });
  await fleet.agentUp();
  await reportReads(
    fleet,
    "claude",
    (report) => report?.refused === "not-installed",
    "the machine's Claude report: not installed"
  );
  const started = await fleet.api<{ install: Install & { command: string } }>(
    "/api/installs",
    { route: "command", address: fleet.base }
  );
  const code = CODE_IN.exec(started.install.command)?.[1] ?? "";
  await fetch(`${fleet.base}/install.sh?code=${code}`).then((r) => r.text());
  await fetch(`${fleet.base}/api/agents/${encodeURIComponent(MACHINE)}`, {
    headers: { "x-cawco-install-code": code },
  });
  const ended = await until(
    "the add's end",
    () => installOf(fleet, started.install.id),
    (one) => one.state !== "running",
    180_000
  );
  const output = await fleet.api<{ lines: string[] }>(
    `/api/installs/${started.install.id}/output`
  );
  const last = output.lines.at(-1) ?? "";
  const tool = (await row(fleet))?.tools?.claude;
  check(
    "12. a fresh machine whose Claude Code installer finds no route to claude.ai still joins, its last line saying why in curl's words",
    ended.state === "joined" &&
      ended.problem === null &&
      ended.steps.at(-1)?.step === "harnesses" &&
      last.includes("Claude Code didn't install on") &&
      last.includes(NO_ROUTE) &&
      last.includes("is in the fleet"),
    `${ended.state} ${JSON.stringify(ended.problem)} ${JSON.stringify(ended.steps.map((one) => one.step))}; last line: ${last}`
  );
  check(
    "12. the machine's tool cell holds the install's failure in curl's words",
    tool?.state === "failed" &&
      tool.version === undefined &&
      (tool.detail ?? "").includes(NO_ROUTE),
    JSON.stringify(tool)
  );
  await open(page, `${base}/?install=${started.install.id}`, WINDOW);
  const outcome = await page
    .waitForFunction(
      ([win, block]) =>
        document.querySelector(`${win} [data-outcome=joined] ${block}`) !==
        null,
      [WINDOW, BLOCK] as const,
      { timeout: 30_000 }
    )
    .then(() => blockOn(page))
    .catch(async () => ({ missing: await pageSaid(page) }));
  check(
    "12. the joined outcome shows Claude Code's block: why, and Retry with the install's failure",
    outcome !== null &&
      !("missing" in outcome) &&
      outcome.harness === "claude" &&
      outcome.phase === "failed" &&
      outcome.press === "Retry" &&
      outcome.why.startsWith("Claude Code isn't installed on") &&
      outcome.error.includes(NO_ROUTE),
    JSON.stringify(outcome)
  );
}

export default spec;
