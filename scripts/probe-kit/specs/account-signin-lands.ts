/**
 * A Claude account's sign-in by a pasted code, finished on its own account
 * page (AccountMachines), updates that page in place: the popover says who
 * it signed in as, puts itself away, and the machine's row stands signed in
 * (its ⋯ menu, no state word). The page never trips Svelte's effect loop
 * guard (`effect_update_depth_exceeded`) and never falls to the error page,
 * while the hub's answers to the sign-in arrive around it: the accounts read
 * with the new sign-in, the rebalance the hub starts for an account that
 * just signed in on a machine (rebalance.ts "signed in on …, so its accounts
 * there are looked at now"), and the usage read the dashboard takes after.
 *
 * The owner's case (2026-10-22, 0.1.12-nightly.4977): the code pasted on
 * niftybot.art's row, the sign-in landed on the hub, and the page went to
 * "Something went wrong" with `effect_update_depth_exceeded`.
 *
 * On a scratch fleet (real hub, agent and sessiond) whose machine runs a
 * stand-in `claude`: its `auth login` prints a fixed link and takes one code,
 * storing a login for the account's config dir; `auth status` reads it.
 * One leg per engine, Chromium and WebKit, each on an account of its own.
 *
 * Before the code is pasted, the page is reloaded with the sign-in waiting
 * on it: the popover opens again on the same link, the hub's pending one,
 * drawn with its sign-in from its first frame (the flow made as the page
 * is, not by an effect after it), its link drawn once and never redrawn,
 * and the code pasted after the reload signs in.
 *
 * Add an account, the same way, per engine: Claude picked, the machine's
 * row stands idle with Sign in before any sign-in is made (the press makes
 * it); its link comes back after a reload (the setup taken up again makes
 * the sign-in the hub kept); the code pasted then signs in, and the row
 * says so, with no effect loop and no console error.
 *
 *   bun scripts/probe-kit/run.ts account-signin-lands
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { accountsWords, configureWords } from "../../../packages/core/src";
import { ACCOUNT, MACHINE, until } from "../../scratch-fleet";
import { type Engine, type Kit, type KitFleet, open, type Spec } from "../kit";

const STATE = "pr0beStateValue";
const LINK = `https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Aprofile+user%3Ainference&code_challenge=pr0beChallenge&code_challenge_method=S256&state=${STATE}`;
/** The page's code, whole: `code#state`. The stand-in's login takes this one. */
const CODE = `pr0beCode#${STATE}`;
/** Who the fleet's own account is signed in as. */
const FLEET_EMAIL = "probe@scratch-fleet.test";
/**
 * Who a code pasted for `account` signs in as: an address of its own, so the
 * hub joins it into no other account (one per engine's leg).
 */
const landsAs = (account: string) => `lands-${account}@scratch-fleet.test`;

/** The stand-in `claude`: `--version`, `auth login|status|logout`, the SDK's initialize. */
const STAND_IN = `#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
const args = process.argv.slice(2);
const login = join(process.env.CLAUDE_CONFIG_DIR ?? "", "probe-login.json");
const who = () => (existsSync(login) ? JSON.parse(readFileSync(login, "utf8")) : null);
if (args[0] === "--version") {
  console.log("2.1.302 (Claude Code)");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  const one = who();
  console.log(JSON.stringify(one ? { loggedIn: true, authMethod: "claude.ai", email: one.email, orgName: one.orgName, orgId: one.orgId } : { loggedIn: false, authMethod: "none" }));
  process.exit(one ? 0 : 1);
}
if (args[0] === "auth" && args[1] === "logout") {
  rmSync(login, { force: true });
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "login") {
  process.stdout.write("Opening browser to sign in…\\r\\nIf the browser didn't open, visit: " + ${JSON.stringify(LINK)} + "\\r\\nPaste code here if prompted > ");
  for await (const line of console) {
    if (line.trim() === ${JSON.stringify(CODE)}) {
      writeFileSync(login, JSON.stringify({ email: "lands-" + basename(dirname(process.env.CLAUDE_CONFIG_DIR ?? "")) + "@scratch-fleet.test", orgName: "Lands Org", orgId: "00000000-0000-4000-8000-0000000000b2" }));
      process.stdout.write("\\r\\nLogin successful.\\r\\n");
      process.exit(0);
    }
    process.stdout.write("\\r\\nInvalid code.\\r\\nPaste code here if prompted > ");
  }
}
if (!args.includes("--input-format")) {
  process.exit(0);
}
for await (const line of console) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }
  if (message.type !== "control_request") {
    continue;
  }
  const one = who();
  const response = message.request?.subtype === "initialize"
    ? { commands: [], agents: [], models: [{ value: "claude-haiku-4-5", displayName: "Haiku 4.5", description: "The stand-in's one model" }], output_style: "default", available_output_styles: [], account: one ? { email: one.email, organization: one.orgName } : {}, claude_code_version: "2.1.302" }
    : {};
  process.stdout.write(JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: message.request_id, response } }) + "\\n");
}
`;

interface AccountsRead {
  pending: {
    accountId: string;
    challenge: { url?: string };
    machineId: string;
  }[];
  signins: { accountId: string; machineId: string; state: string }[];
}

/** What {@link watchSignin} counted of the sign-in popover's draws since the page loaded. */
interface SigninDraws {
  /** Draws of the popover holding its title and no sign-in. */
  empty: number;
  /** Times its link was taken out. */
  gone: number;
  /** Draws of its sign-in with no link: the flow drawn idle before it took up the hub's link. */
  idle: number;
  /** Times its link was put in the page. */
  links: number;
}

/**
 * In the page, from before its own scripts: every DOM change, what the
 * sign-in popover then holds. A popover reopened without its flow, or on a
 * flow that took up the hub's link only after it drew, shows here as a draw
 * without its sign-in, an idle draw, or its link put in more than once.
 * (Svelte flushes an effect's write-back within the same flush, so an
 * effect that converges in one more run draws nothing extra; that is held
 * by the page's code, which makes the flow as the page is: no effect on it
 * writes.)
 */
function watchSignin(): void {
  const seen = { empty: 0, idle: 0, links: 0, gone: 0 };
  (globalThis as { __signinDraws?: typeof seen }).__signinDraws = seen;
  const LINK_SEL = 'a[href*="/oauth/authorize"]';
  const hasLink = (node: Node) =>
    node instanceof Element &&
    (node.matches(LINK_SEL) || node.querySelector(LINK_SEL) !== null);
  const links = (nodes: NodeList) =>
    [...nodes].filter((node) => hasLink(node)).length;
  /** What the popover holds now, if it is drawn. */
  const look = (pop: Element) => {
    if (!pop.querySelector('[data-slot="title"]')) {
      return;
    }
    const panel = pop.querySelector('[data-slot="panel"]');
    if (!panel) {
      seen.empty += 1;
    } else if (!panel.querySelector(LINK_SEL)) {
      seen.idle += 1;
    }
  };
  new MutationObserver((records) => {
    for (const record of records) {
      seen.links += links(record.addedNodes);
      seen.gone += links(record.removedNodes);
    }
    for (const pop of document.querySelectorAll(
      '[id^="signin-"][id$="-popover"][role="presentation"]'
    )) {
      look(pop);
    }
  }).observe(document, { childList: true, subtree: true });
}

/** The setup's provider row for Claude. */
const CLAUDE_ROW = /^Claude$/;

/** An account-on-machine row's trigger: "Sign in <account> on <machine>". */
const SIGN_IN_ON = new RegExp(`^${accountsWords.machines.signIn} .+ on `);

/** Text with its runs of white space made one space. */
const flat = (text: string | null | undefined) =>
  (text ?? "").replace(/\s+/g, " ").trim();

/** Everything the page said went wrong: its console errors and uncaught errors. */
function errorsOf(page: Page): string[] {
  const said: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    said.push(`${error.message}\n${error.stack ?? ""}`);
  });
  return said;
}

/** One engine's leg: a fresh account signed in by its pasted code on its own page. */
async function leg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  engine: Engine
): Promise<void> {
  const { check } = kit;
  const made = await fleet.api<{ id: string }>("/api/accounts", {
    provider: "anthropic",
    kind: "subscription",
  });
  const page = await kit.page("desk", { engine, init: [watchSignin] });
  const errors = errorsOf(page);
  await open(page, `${base}/config/accounts/${made.id}`, "main");
  await page.getByRole("button", { name: SIGN_IN_ON }).first().click();
  const popups = page.context().waitForEvent("page");
  await page
    .getByRole("button", { name: accountsWords.signin.openLink })
    .click();
  await (await popups).close();
  const linkShown = (within: number) =>
    until(
      `${engine}: the machine's link shown`,
      () =>
        page
          .getByRole("link", { name: accountsWords.signin.openLink })
          .getAttribute("href")
          .catch(() => null),
      (href) => href === LINK,
      within
    );
  await linkShown(60_000);

  // A reload with the sign-in waiting on its code.
  await page.reload();
  const reopened = await linkShown(30_000)
    .then(() => true)
    .catch(() => false);
  // Anything an effect would draw after the mount has drawn by now.
  await page.waitForTimeout(1500);
  const draws = await page.evaluate(
    () => (globalThis as { __signinDraws?: SigninDraws }).__signinDraws
  );
  const hubLink = (await fleet.api<AccountsRead>("/api/accounts")).pending.find(
    (one) => one.accountId === made.id && one.machineId === MACHINE
  )?.challenge.url;
  const loopAfterReload = errors.filter((one) =>
    one.includes("effect_update_depth_exceeded")
  );
  check(
    `${engine} · a reload with the sign-in waiting on its code opens the popover again on the same link, the hub's pending one`,
    reopened && hubLink === LINK,
    `reopened ${reopened}; hub's link ${hubLink === LINK}`
  );
  check(
    `${engine} · reopened, the popover is drawn with its sign-in from its first frame and its link drawn once, never redrawn; no effect loop`,
    draws !== undefined &&
      draws.empty === 0 &&
      draws.idle === 0 &&
      draws.links === 1 &&
      draws.gone === 0 &&
      loopAfterReload.length === 0,
    `${JSON.stringify(draws)}; effect_update_depth_exceeded ${loopAfterReload.length}`
  );

  const field = page.getByRole("textbox", {
    name: accountsWords.signin.codeLabel,
  });
  await field.fill(CODE);
  await page
    .getByRole("button", { name: accountsWords.signin.done, exact: true })
    .click();

  const hubSays = await until(
    `${engine}: the hub's sign-in on the machine`,
    async () =>
      (await fleet.api<AccountsRead>("/api/accounts")).signins.find(
        (one) => one.accountId === made.id && one.machineId === MACHINE
      )?.state,
    (state) => state === "signed-in",
    60_000
  );
  // The popover's check holds for --dur-hold, then it puts itself away.
  const signedInAs = flat(
    await page
      .locator('[data-slot="got"]')
      .textContent({ timeout: 10_000 })
      .catch(() => null)
  );
  const closed = await field
    .waitFor({ state: "detached", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  // The rebalance and the usage read the sign-in started land after it.
  await page.waitForTimeout(3000);

  const loop = errors.filter((one) =>
    one.includes("effect_update_depth_exceeded")
  );
  const title = await page.title();
  check(
    `${engine} · finishing the pasted-code sign-in never trips the effect loop guard`,
    loop.length === 0,
    loop.length === 0
      ? "no effect_update_depth_exceeded"
      : `${loop.length}× ${loop[0]?.slice(0, 400)}`
  );
  check(
    `${engine} · the page stays the account's page, never the error page`,
    !title.includes("Something went wrong") &&
      new URL(page.url()).pathname === `/config/accounts/${made.id}`,
    `${title} · ${page.url()}`
  );
  check(
    `${engine} · the popover says who it signed in as, then puts itself away`,
    signedInAs ===
      `${accountsWords.signin.signedInAs} ${landsAs(made.id)}`.replace(
        /\s+/g,
        " "
      ) && closed,
    `${JSON.stringify(signedInAs)}; closed ${closed}`
  );
  const row = await page.evaluate((listLabel) => {
    const list = document.querySelector(`ul[aria-label="${listLabel}"]`);
    return {
      state:
        list?.querySelector('[data-slot="machine-state"]')?.textContent ?? null,
      buttons: [...(list?.querySelectorAll("button") ?? [])].map(
        (one) => one.getAttribute("aria-label") ?? one.textContent ?? ""
      ),
    };
  }, accountsWords.editor.machines);
  const menu = row.buttons.some(
    (label) =>
      label.startsWith(configureWords.moreFor("")) && label.includes(" on ")
  );
  check(
    `${engine} · the machine's row stands signed in: no state word, its ⋯ menu; the hub says signed-in`,
    hubSays === "signed-in" &&
      row.state === null &&
      menu &&
      row.buttons.length === 1,
    JSON.stringify({ hub: hubSays, ...row })
  );
  check(
    `${engine} · no console error through the sign-in`,
    errors.length === 0,
    errors.map((one) => one.slice(0, 200)).join(" | ") || "none"
  );
}

/** One engine's setup: Claude added, signed in by a pasted code through a reload. */
async function setupLeg(kit: Kit, base: string, engine: Engine): Promise<void> {
  const { check } = kit;
  const page = await kit.page("desk", { engine });
  const errors = errorsOf(page);
  await open(page, `${base}/config/accounts/new`, "[data-choice]");
  await page
    .locator("[data-choice]")
    .filter({
      has: page.locator("[data-slot=plabel]", { hasText: CLAUDE_ROW }),
    })
    .first()
    .click();
  const rows = page.locator("[data-slot=machines]");
  const signIn = rows.getByRole("button", {
    name: accountsWords.setup.signIn,
    exact: true,
  });
  const idle = await signIn
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  const popups = page.context().waitForEvent("page");
  await signIn.first().click();
  await (await popups).close();
  const link = rows.getByRole("link", { name: accountsWords.signin.openLink });
  const shown = (within: number) =>
    until(
      `${engine}: the setup's link shown`,
      () => link.getAttribute("href").catch(() => null),
      (href) => href === LINK,
      within
    );
  await shown(60_000);
  await page.reload();
  const back = await shown(30_000)
    .then(() => true)
    .catch(() => false);
  check(
    `${engine} · setup: the machine's row stands idle with Sign in before any sign-in is made, and its link comes back after a reload`,
    idle && back,
    `idle Sign in ${idle}; link after reload ${back}`
  );
  await rows.locator("[data-account-setup-code]").fill(CODE);
  await rows
    .getByRole("button", { name: accountsWords.signin.done, exact: true })
    .click();
  const said = await rows
    .getByText(accountsWords.setup.signedIn, { exact: true })
    .first()
    .waitFor({ timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  const loop = errors.filter((one) =>
    one.includes("effect_update_depth_exceeded")
  );
  check(
    `${engine} · setup: the code pasted after the reload signs the row in; no effect loop, no console error`,
    said && loop.length === 0 && errors.length === 0,
    `signed in ${said}; ${errors.map((one) => one.slice(0, 200)).join(" | ") || "no errors"}`
  );
}

const spec: Spec = {
  name: "account-signin-lands",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const bin = join(fleet.sandbox, "stand-in-bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "claude"), STAND_IN, { mode: 0o755 });
    await writeFile(
      join(
        fleet.home,
        ".cawco",
        "accounts",
        ACCOUNT,
        "claude",
        "probe-login.json"
      ),
      JSON.stringify({
        email: FLEET_EMAIL,
        orgName: "Scratch Fleet",
        orgId: "00000000-0000-4000-8000-0000000000a1",
      })
    );
    const machineEnv = { PATH: `${bin}:${fleet.env.PATH}` };
    fleet.launch("sessiond", [], machineEnv);
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], machineEnv);
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const base = await fleet.dashboard();
    await leg(kit, fleet, base, "chromium");
    await leg(kit, fleet, base, "webkit");
    await setupLeg(kit, base, "chromium");
    await setupLeg(kit, base, "webkit");
  },
};

export default spec;
