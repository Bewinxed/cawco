/**
 * A machine's Claude Code CawCo refuses (older than core's
 * `CLAUDE_VERSION_FLOOR`) stands in place of what it blocks, with its fix
 * as one press that runs on the machine (dashboard ClaudeBlock, core
 * TOOL_CATALOG's `claude`), and an added machine joins with its Claude Code
 * brought up (hub installs.ts `ready`).
 *
 * The scratch fleet's agent runs a stand-in `claude`, first on its PATH,
 * whose version is written in the script itself: its `update` rewrites the
 * file at the new version, as a real update moves the binary the version
 * read is keyed on (agent claude-version.ts). While `update-fails` is in
 * the sandbox it refuses, in a sentence of its own; while `update-holds`
 * is there it waits. Everything else it hands to the host's real Claude
 * Code, whose version is the one the update puts on.
 *
 * 1. The account's sign-in popover on the machine shows the refusal and
 *    Update Claude Code, and no sign-in form (no Open sign-in link, no code
 *    field); the row says Claude Code out of date. At 390 nothing in the
 *    popover runs past it.
 * 2. A failed update says why, in the updater's words, and the press reads
 *    Retry.
 * 3. Retry runs it again; held, it says it is updating; a reload brings the
 *    popover back on the same update; Esc parks it on the row (Updating
 *    Claude Code).
 * 4. Let go, the update lands: the hub's Claude report and tool cell read
 *    the new version, and the popover offers the sign-in, saying which
 *    Claude Code is there now.
 * 5. The account signed in, and Claude Code old again: a Claude session's
 *    start is refused at the machine's version gate, and its
 *    composer shows the same press; pressed, the update lands and the
 *    session starts again with nothing more to press.
 * 6. Claude Code old again: an add by a command runs its Claude Code step
 *    after the machine is listed, updates it, and joins.
 *
 *   bun scripts/probe-kit/run.ts claude-update
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  CLAUDE_VERSION_FLOOR,
  olderThan,
} from "../../../packages/core/src/tools";
import {
  ACCOUNT,
  type Fleet,
  MACHINE,
  MODEL,
  until,
} from "../../scratch-fleet";
import { open, type Spec } from "../kit";

const OLD = "2.1.96";
/** What the update puts on: the host's real Claude Code's version, which a session it unblocks then runs. */
const REAL = Bun.which("claude") ?? "";
const NEW =
  /\d+\.\d+\.\d+/.exec(
    REAL ? Bun.spawnSync([REAL, "--version"]).stdout.toString() : ""
  )?.[0] ?? "";
const REFUSED = "the update server refused this machine (stand-in)";
const BLOCK = "[data-slot=claude-block]";
const SIGN_IN = /^Sign in/;
const CODE_IN = /code=([A-Z0-9]+)/;

/**
 * The stand-in `claude`, at `version`: its own `--version`, `update` and
 * `auth status`; everything else the host's real Claude Code (`real`), as
 * slow-harness-cli's stand-in does.
 */
const standIn = (
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

const claudeOf = (agent: AgentRow | undefined) =>
  agent?.harnesses?.find((one) => one.harness === "claude");

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
  page.evaluate(() => ({
    openLink: [...document.querySelectorAll("a, button")].some(
      (one) => window.probeName(one) === "Open sign-in link"
    ),
    code:
      document.querySelector(
        'input[aria-label="Code from the sign-in page"]'
      ) !== null,
  }));

/** What the block shows now, read off the page; null when none stands. */
const blockOn = (page: Page) =>
  page.evaluate((selector) => {
    const block = document.querySelector<HTMLElement>(selector);
    if (!block) {
      return null;
    }
    return {
      phase: block.dataset.phase ?? "",
      press: window.probeName(block.querySelector("button")),
      progress: block.querySelector("[data-slot=progress]")?.textContent ?? "",
      error:
        block.querySelector("[data-slot=error]")?.textContent?.trim() ?? "",
      why: block.querySelector("[data-slot=why]")?.textContent?.trim() ?? "",
    };
  }, BLOCK);

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
    // What stood there instead, for the failing line to say.
    const seen = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, " ").slice(0, 1200)
    );
    throw new Error(
      `no block at ${phase} within 60 s: block ${JSON.stringify(await blockOn(page))}; the page said: ${seen}`,
      { cause: error }
    );
  }
  return await blockOn(page);
};

/** Puts the stand-in back at the old version and has the agent read it now. */
const makeOld = async (fleet: Fleet, file: string, flags: string) => {
  await writeFile(file, standIn(OLD, flags, REAL), { mode: 0o755 });
  // A probe of the tools sees the version move (agent tools.ts `sawTool`),
  // and the agent reads Claude's report again with it.
  await fleet.controlAnswer("listTools", []);
  return await until(
    "the machine's Claude report refused again",
    () => row(fleet),
    (agent) => claudeOf(agent)?.refused === "version",
    60_000
  );
};

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
    const bin = join(fleet.sandbox, "stand-in-bin");
    const flags = join(fleet.sandbox, "claude-flags");
    await mkdir(bin, { recursive: true });
    await mkdir(flags, { recursive: true });
    const file = join(bin, "claude");
    await writeFile(file, standIn(OLD, flags, REAL), { mode: 0o755 });
    const machineEnv = { PATH: `${bin}:${fleet.env.PATH}` };
    fleet.launch("sessiond", [], machineEnv);
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], machineEnv);
    await fleet.agentUp();
    const reported = await until(
      "the machine's Claude report",
      () => row(fleet),
      (agent) => claudeOf(agent) !== undefined,
      60_000
    );
    check(
      `the agent reports Claude Code ${OLD} refused for its version`,
      claudeOf(reported)?.refused === "version" &&
        claudeOf(reported)?.version === OLD,
      JSON.stringify(claudeOf(reported))
    );

    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await installName(page);
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
        shown.why.includes(
          `Claude Code ${OLD} on this machine is older than`
        ) &&
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

    // 3. Retry, held mid-update: a reload keeps it, Esc parks it on the row.
    await rm(join(flags, "update-fails"));
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
      (agent) => claudeOf(agent)?.version === NEW && !claudeOf(agent)?.refused,
      90_000
    );
    check(
      `4. the agent read Claude Code again: ${NEW}, no longer refused, and its tool cell installed`,
      landed.tools?.claude?.state === "installed" &&
        landed.tools.claude.version === NEW,
      JSON.stringify({ report: claudeOf(landed), tool: landed.tools?.claude })
    );
    await trigger.click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("a, button")].some(
          (one) => window.probeName(one) === "Open sign-in link"
        ),
      null,
      { timeout: 30_000 }
    );
    const offered = await page.evaluate(
      (selector) => ({
        block: document.querySelector(selector) !== null,
        landed:
          document.querySelector("[data-slot=landed]")?.textContent?.trim() ??
          "",
      }),
      BLOCK
    );
    check(
      "4. the popover then offers the sign-in, saying which Claude Code is there now",
      !offered.block && offered.landed.startsWith(`Claude Code ${NEW} is on`),
      JSON.stringify(offered)
    );
    await page.keyboard.press("Escape");

    // 5. A session start refused for the version shows the same press. The
    // account is signed in first, so the hub's own account check lets the
    // start through to the machine's version gate.
    await writeFile(join(flags, "signed-in"), "");
    await fleet.accountSignedIn();
    await makeOld(fleet, file, flags);
    // A start as the dashboard sends one (fleet.spawn waits for it to run,
    // and this one is refused).
    const id = crypto.randomUUID();
    await fleet.post({
      verb: "spawn",
      machineId: MACHINE,
      instanceId: id,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId: id,
        cwd: fleet.workdir,
        harness: "claude",
        model: MODEL.claude,
        title: "refused for its Claude Code",
        permissionMode: "bypassPermissions",
      },
    });
    const refused = await until(
      "the session's start refused",
      () => fleet.instance(id),
      (one) => one.status === "error",
      60_000
    );
    await open(page, `${base}/session/${id}`, BLOCK);
    const atStart = await blockOn(page);
    check(
      "5. a Claude start refused for the version fails in the gate's words, and its composer shows Update Claude Code",
      (refused.last_error ?? "").includes(
        `Claude Code ${OLD} on this machine is older than`
      ) && atStart?.press === "Update Claude Code",
      `row ${JSON.stringify(refused)}; block ${JSON.stringify(atStart)}`
    );
    await page.locator(BLOCK).getByRole("button").click();
    const again = await until(
      "the refused session started again",
      () => fleet.instance(id),
      (one) => one.status !== "error",
      120_000
    ).catch((error: Error) => error);
    const reread = await until(
      "the machine's Claude report at the new version",
      () => row(fleet),
      (agent) => claudeOf(agent)?.version === NEW,
      30_000
    ).catch(() => undefined);
    check(
      "5. pressed, the update lands and the session starts again with nothing more to press",
      !(again instanceof Error) && reread !== undefined,
      again instanceof Error
        ? `${again.message}: ${JSON.stringify(fleet.instance(id))}`
        : JSON.stringify(again)
    );

    // 6. An add by a command brings the old Claude Code up before it joins.
    await makeOld(fleet, file, flags);
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
      async () =>
        (
          await fleet.api<{ installs: Install[] }>("/api/installs")
        ).installs.find((one) => one.id === started.install.id),
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
      "6. the add runs its Claude Code step after the machine is listed, updates it, and joins ready",
      ended.state === "joined" &&
        ended.steps.map((one) => one.step).join(",") ===
          "run,install,listed,claude" &&
        output.lines.some((line) =>
          line.includes(`updating Claude Code ${OLD}`)
        ) &&
        after?.tools?.claude?.state === "installed" &&
        after.tools.claude.version === NEW,
      `${ended.state} ${JSON.stringify(ended.steps.map((one) => one.step))} ${JSON.stringify(ended.problem)}; output: ${JSON.stringify(output.lines.slice(-6))}; tool ${JSON.stringify(after?.tools?.claude)}`
    );
  },
};

export default spec;
