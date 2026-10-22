/**
 * The Work Outlives Its Surface Rule (DESIGN.md) on five Configure surfaces,
 * on a scratch fleet's real hub and the built dashboard. Each leg reloads
 * mid-step and finds the same step and details; puts the surface away
 * mid-wait and reads the parked row from the DOM and the hub; presses the
 * row and finds the same flow, the same link where one was shown; and a
 * refusal says its words in the surface and on the row, never in a toast.
 *
 * - Fetch a skill (a SKILL.md this spec serves on 127.0.0.1 and holds):
 *   reload mid-fetch keeps the popover open on the same source and name,
 *   the hub's row `fetching`; Esc parks it on the skill's row ("Fetching…",
 *   Open fetch); Open fetch brings it back with the same source; released,
 *   it closes into the landed row. A source answering 404: the popover and
 *   the row both say why, through a reload. An ambiguous GitHub repo
 *   (`skills:joe-bell/skills`, read from github.com): its choices survive a
 *   reload and come back from the row.
 * - Link a marketplace (a marketplace.json served here, the link's read
 *   held): reload keeps the popover and the source; the link stands as a
 *   row under its source with Open link; refused, the popover and the row
 *   say it in the same words, through a reload.
 * - Connections: the Sign in to Gitea form keeps its address and account
 *   through a reload, never its key (nothing of it in the tab's storage),
 *   and says why the key is asked again. An OAuth sign-in (scripts/probe-kit
 *   mcp-oauth-mock.ts): its tab closed, the row says so, through a reload,
 *   and its button reads Open sign-in, which opens the hub's same page.
 * - An account on a machine (a stand-in `claude` printing a fixed link):
 *   the popover's link comes back after a reload, read from the hub's
 *   pending sign-in; put away, the row says it waits on the pasted code and
 *   offers Open sign-in, which shows the same link; a code that does not
 *   take is said in the popover and, put away, on the row.
 * - Add an account: reload on Sign in stands on Sign in, the address naming
 *   the account the first link made, the same link shown; the accounts list
 *   carries the account as "Setup not finished · Sign in", and its press
 *   opens the setup there with the same link.
 *
 *   bun scripts/probe-kit/run.ts work-outlives-surface
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import {
  accountsWords,
  connectionsWords,
  skillsWords,
} from "../../../packages/core/src";
import { ACCOUNT, MACHINE, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";
import { mcpOauthMock } from "../mcp-oauth-mock";

const EMAIL = "probe@scratch-fleet.test";
const STATE = "pr0beStateValue";
const LINK = `https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Aprofile+user%3Ainference&code_challenge=pr0beChallenge&code_challenge_method=S256&state=${STATE}`;

/** The stand-in `claude`: `--version`, `auth login|status|logout`, the SDK's initialize. */
const STAND_IN = `#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
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
  for await (const _line of console) {
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

/** A held answer: released with a status and body when the leg says so. */
interface Hold {
  release: (status: number, body: string) => void;
}

/** A local source whose answers to `path` this spec holds until it lets them go. */
function heldServer(answers: Record<string, () => Response | Hold>) {
  const holds = new Map<string, Hold>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      const make = answers[path];
      if (!make) {
        return new Response("not here", { status: 404 });
      }
      const made = make();
      if (made instanceof Response) {
        return made;
      }
      return new Promise<Response>((resolve) => {
        holds.set(path, {
          release: (status, body) => {
            holds.delete(path);
            resolve(new Response(body, { status }));
          },
        });
      });
    },
  });
  return {
    origin: server.url.origin,
    stop: () => server.stop(true),
    /** Lets go of the held answer to `path`, once one is waiting. */
    async release(path: string, status: number, body: string): Promise<void> {
      const hold = await until(
        `a held request for ${path}`,
        () => holds.get(path),
        Boolean,
        60_000
      );
      hold.release(status, body);
    },
  };
}

/** An answer to hold: the server keeps the request open until `release`. */
const HOLD = (): Hold => ({ release: () => undefined });

const skillMd = (name: string) =>
  `---\nname: ${name}\ndescription: held by the probe\n---\nHeld.\n`;

interface SkillRow {
  choices?: string[];
  error?: string;
  fetching?: boolean;
  hash?: string;
  name: string;
}
interface LinkRow {
  error?: string;
  fetching?: boolean;
  source: string;
}
interface FleetRead {
  config: { marketplaces: { name: string; source: string }[] };
  links: LinkRow[];
  skills: SkillRow[];
}
interface ConnectionRead {
  name: string;
  signIn?: { expiresAt: number; url: string };
}
interface AccountsRead {
  accounts: { id: string; provider: string; setupStep?: string }[];
  pending: {
    accountId: string;
    challenge: { url?: string };
    machineId: string;
  }[];
}

const fleetOf = (fleet: KitFleet) => fleet.api<FleetRead>("/api/fleet");
const skillOf = async (fleet: KitFleet, name: string) =>
  (await fleetOf(fleet)).skills.find((one) => one.name === name);

const rowOf = (page: Page, name: string): Locator =>
  page.locator(`li[data-row-name="${name}"]`);

/** An account-on-machine row's trigger, by its label: "Sign in <account> on <machine>". */
const SIGN_IN_ON = new RegExp(`^${accountsWords.machines.signIn} .+ on `);
/** The same trigger while its sign-in is parked on the row. */
const OPEN_SIGN_IN_ON = new RegExp(
  `^${accountsWords.machines.openSignIn} .+ on `
);

/** The setup's provider row for Claude. */
const CLAUDE_ROW = /^Claude$/;

/** What a shown device code holds besides its letters and digits. */
const NOT_CODE = /[^\da-z]/gi;

/** Text with its runs of white space made one space. */
const flat = (text: string | null | undefined) =>
  (text ?? "").replace(/\s+/g, " ").trim();

const toasts = (page: Page) => page.locator("[data-sonner-toast]").count();

/** What every leg runs on. */
interface Leg {
  base: string;
  fleet: KitFleet;
  kit: Kit;
  page: Page;
}

/** Fetch a skill and link a marketplace. */
async function skillLegs({ kit, fleet, page, base }: Leg): Promise<void> {
  const { check } = kit;
  // ── Fetch a skill ────────────────────────────────────────────────────
  const HELD = "probe-held";
  const REFUSED = "probe-refused";
  const sources = heldServer({
    [`/${HELD}/SKILL.md`]: HOLD,
    [`/${REFUSED}/SKILL.md`]: HOLD,
  });
  let marketReads = 0;
  const market = heldServer({
    "/m/marketplace.json": () => {
      marketReads += 1;
      // The form's own read of its name answers; the link's read is held.
      return marketReads === 1
        ? Response.json({ name: "probe-market", plugins: [] })
        : HOLD();
    },
  });
  try {
    const heldSource = `${sources.origin}/${HELD}/SKILL.md`;
    await open(page, `${base}/config/skills`, "main");
    const fetchForm = page.locator("form[data-fetch-skill]");
    const startFetch = async (source: string, name: string) => {
      await page
        .getByRole("button", { name: skillsWords.fetchSkill, exact: true })
        .first()
        .click();
      await fetchForm.waitFor();
      await fetchForm.locator("#skill-source").fill(source);
      await fetchForm.locator("#skill-name").fill(name);
      await fetchForm
        .getByRole("button", { name: skillsWords.fetchSkill })
        .click();
      await until(
        `${name}'s fetch under way on the hub`,
        () => skillOf(fleet, name),
        (row) => row !== undefined
      );
    };

    await startFetch(heldSource, HELD);
    await page.reload();
    await fetchForm.waitFor({ timeout: 30_000 });
    const afterReload = {
      source: await fetchForm.locator("#skill-source").inputValue(),
      name: await fetchForm.locator("#skill-name").inputValue(),
      hub: (await skillOf(fleet, HELD))?.fetching === true,
    };
    check(
      "skill · a reload mid-fetch opens the popover again with the same source and name, the hub's row fetching",
      afterReload.source === heldSource &&
        afterReload.name === HELD &&
        afterReload.hub,
      JSON.stringify(afterReload)
    );

    // Esc at once, while the glass card still rehearses its first open.
    await page.keyboard.press("Escape");
    await fetchForm.waitFor({ state: "detached", timeout: 10_000 });
    const parked = rowOf(page, HELD);
    const parkedRead = await parked.evaluate((row) => ({
      meta: row.querySelector('[data-slot="meta"]')?.textContent ?? "",
      open: row.querySelector("[data-open-fetch]")?.textContent ?? null,
    }));
    check(
      "skill · Esc parks the fetch on its row: Fetching… and Open fetch",
      parkedRead.meta.includes(skillsWords.fetching) &&
        flat(parkedRead.open) === skillsWords.openFetch,
      JSON.stringify(parkedRead)
    );

    await parked.locator("[data-open-fetch]").click();
    await fetchForm.waitFor({ timeout: 10_000 });
    const back = await fetchForm.locator("#skill-source").inputValue();
    check(
      "skill · Open fetch brings the popover back on the same fetch",
      back === heldSource,
      back
    );

    await sources.release(`/${HELD}/SKILL.md`, 200, skillMd(HELD));
    const landed = await until(
      "the held skill landed",
      () => skillOf(fleet, HELD),
      (row) => Boolean(row.hash) && !row.fetching
    );
    await fetchForm
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => undefined);
    const closed = {
      form: await fetchForm.count(),
      kept: await page.evaluate(() =>
        sessionStorage.getItem("cawco:fetch-skill")
      ),
      hash: landed.hash,
    };
    check(
      "skill · landed, the popover closes into the row and lets the fetch go",
      closed.form === 0 &&
        closed.kept !== null &&
        JSON.parse(closed.kept).asked === null,
      JSON.stringify(closed)
    );

    await startFetch(`${sources.origin}/${REFUSED}/SKILL.md`, REFUSED);
    await sources.release(`/${REFUSED}/SKILL.md`, 404, "gone");
    const refusedRow = await until(
      "the refused skill's fault on the hub",
      () => skillOf(fleet, REFUSED),
      (row) => Boolean(row.error) && !row.fetching
    );
    const said = flat(
      await fetchForm
        .locator('[data-slot="refused"]')
        .textContent({ timeout: 10_000 })
    );
    await page.keyboard.press("Escape");
    await page.reload();
    await rowOf(page, REFUSED).waitFor();
    await settle(page, 500);
    const shutThroughReload = (await fetchForm.count()) === 0;
    const rowSays = flat(await rowOf(page, REFUSED).innerText());
    check(
      "skill · a fetch the hub refused is said in the popover and, through a reload, on its row; Esc then an instant reload leaves the popover shut; no toast",
      shutThroughReload &&
        said === skillsWords.fetchRefused(REFUSED, refusedRow.error ?? "") &&
        rowSays.includes(refusedRow.error ?? "\u0000") &&
        (await toasts(page)) === 0,
      `popover ${JSON.stringify(said)}; row ${JSON.stringify(rowSays)}`
    );

    // An ambiguous repo: its choices are the hub's, so they come back.
    const CHOICE = "probe-choice";
    await page.keyboard.press("Escape").catch(() => undefined);
    await startFetch("skills:joe-bell/skills", CHOICE);
    const ambiguous = await until(
      "the ambiguous repo's choices",
      () => skillOf(fleet, CHOICE),
      (row) => !row.fetching && (row.choices?.length ?? 0) > 0,
      120_000
    ).catch(() => undefined);
    if (ambiguous) {
      await page.reload();
      await fetchForm.waitFor({ timeout: 30_000 });
      const choicesAfter = await fetchForm
        .locator('[data-slot="choice"]')
        .allTextContents();
      await page.keyboard.press("Escape");
      await rowOf(page, CHOICE).locator("[data-open-fetch]").click();
      const choicesBack = await fetchForm
        .locator('[data-slot="choice"]')
        .allTextContents();
      check(
        "skill · an ambiguous repo's choices stand through a reload, and come back from the row",
        choicesAfter.length === ambiguous.choices?.length &&
          choicesBack.length === choicesAfter.length,
        `${choicesAfter.map(flat).join(", ")} | ${choicesBack.map(flat).join(", ")}`
      );
      await page.keyboard.press("Escape");
    } else {
      kit.note(
        "skill · the ambiguous-repo leg read nothing from github.com within 2 min: not asserted"
      );
    }

    // ── Link a marketplace ────────────────────────────────────────────
    const marketSource = `${market.origin}/m/marketplace.json`;
    const linkForm = page.locator("form[data-link-marketplace]");
    await page
      .getByRole("button", { name: skillsWords.linkMarketplace, exact: true })
      .first()
      .click();
    await linkForm.waitFor();
    await linkForm.locator("#market-source").fill(marketSource);
    await until(
      "the marketplace's own name read",
      () => linkForm.locator("#market-name").inputValue(),
      (value) => value === "probe-market",
      30_000
    );
    await linkForm.getByRole("button", { name: skillsWords.link }).click();
    await until(
      "the link under way on the hub",
      async () => (await fleetOf(fleet)).links,
      (links) =>
        links.some((one) => one.source === marketSource && one.fetching)
    );
    await page.reload();
    await linkForm.waitFor({ timeout: 30_000 });
    const linkAfter = await linkForm.locator("#market-source").inputValue();
    const linkRow = rowOf(page, marketSource);
    check(
      "marketplace · a reload mid-link opens the popover again on the same source; the link stands as a row",
      linkAfter === marketSource && (await linkRow.count()) === 1,
      `${linkAfter}; rows ${await linkRow.count()}`
    );
    await page.keyboard.press("Escape");
    await linkForm.waitFor({ state: "detached", timeout: 10_000 });
    const linkParked = flat(await linkRow.innerText());
    await linkRow.locator("[data-open-link]").click();
    await linkForm.waitFor({ timeout: 10_000 });
    const linkBack = await linkForm.locator("#market-source").inputValue();
    check(
      "marketplace · put away, the row says the link is read and offers Open link, which brings the same link back",
      linkParked.includes(skillsWords.readingManifest) &&
        linkParked.includes(skillsWords.openLink) &&
        linkBack === marketSource,
      `${JSON.stringify(linkParked)}; back on ${linkBack}`
    );
    await market.release("/m/marketplace.json", 500, "broken");
    const refusedLink = await until(
      "the refused link on the hub",
      async () =>
        (await fleetOf(fleet)).links.find((one) => one.source === marketSource),
      (one) => Boolean(one.error)
    );
    const linkWords = skillsWords.linkRefused(
      marketSource,
      refusedLink.error ?? ""
    );
    const inPopover = flat(
      await linkForm
        .locator('[data-slot="refused"]')
        .textContent({ timeout: 10_000 })
    );
    await page.keyboard.press("Escape");
    await page.reload();
    await linkRow.waitFor();
    const onRow = flat(
      await linkRow.locator('[data-slot="note"]').first().textContent()
    );
    check(
      "marketplace · a refused link is said in the popover and, through a reload, on its row in the same words; no toast",
      inPopover === linkWords &&
        onRow === linkWords &&
        (await toasts(page)) === 0,
      `popover ${JSON.stringify(inPopover)}; row ${JSON.stringify(onRow)}`
    );
  } finally {
    sources.stop();
    market.stop();
  }
}

/** Connections: the sign-in form, and an OAuth sign-in. */
async function connectionLegs({ kit, fleet, page, base }: Leg): Promise<void> {
  const { check } = kit;
  // ── Connections ──────────────────────────────────────────────────────
  const SECRET = "probe-secret-token-not-kept";
  await open(page, `${base}/config/connections`, 'ul[aria-label="Services"]');
  await page
    .getByRole("button", { name: "Sign in to Gitea", exact: true })
    .click();
  const gitea = page.locator('form[aria-label="Sign in to Gitea"]');
  await gitea.waitFor();
  await gitea.locator("#connection-server").fill("https://gitea.test/mcp");
  await gitea.locator("#connection-account").fill("probe");
  await gitea.locator("#connection-key").fill(SECRET);
  await settle(page, 300);
  await page.reload();
  await gitea.waitFor({ timeout: 30_000 });
  const formAfter = {
    server: await gitea.locator("#connection-server").inputValue(),
    account: await gitea.locator("#connection-account").inputValue(),
    key: await gitea.locator("#connection-key").inputValue(),
    why: flat(await gitea.locator('[data-slot="secret-again"]').textContent()),
    stored: await page.evaluate((secret) => {
      const all = JSON.stringify({ ...sessionStorage, ...localStorage });
      return all.includes(secret);
    }, SECRET),
  };
  check(
    "connections · a reload keeps the sign-in form's address and account, never its key, and says why the key is asked again",
    formAfter.server === "https://gitea.test/mcp" &&
      formAfter.account === "probe" &&
      formAfter.key === "" &&
      formAfter.why === connectionsWords.secretNotKept &&
      !formAfter.stored,
    JSON.stringify(formAfter)
  );
  await gitea.getByRole("button", { name: connectionsWords.cancel }).click();

  const mock = mcpOauthMock();
  try {
    await fleet.api("/api/connections", {
      name: "gitlab-probe",
      service: "gitlab",
      account: "probe",
      transport: "http",
      url: mock.url,
      auth: "oauth",
    });
    await open(
      page,
      `${base}/config/connections`,
      'li[data-row-name="GitLab"]'
    );
    const gitlab = rowOf(page, "GitLab");
    const opened = page.context().waitForEvent("page");
    await gitlab.locator("[data-sign-in]").click();
    const tab = await opened;
    const first = await until(
      "the hub's sign-in under way",
      async () =>
        (
          await fleet.api<{ connections: ConnectionRead[] }>("/api/connections")
        ).connections.find((one) => one.name === "gitlab-probe")?.signIn,
      Boolean
    );
    await tab.close();
    await until(
      "the row saying its tab closed",
      () => gitlab.innerText(),
      (text) => flat(text).includes(connectionsWords.signInClosed),
      20_000
    );
    await page.reload();
    await gitlab.waitFor();
    const kept = {
      text: flat(await gitlab.innerText()),
      button: await gitlab
        .getByRole("button", { name: connectionsWords.openSignIn })
        .count(),
    };
    const again = page.context().waitForEvent("page");
    await gitlab.locator("[data-sign-in]").click();
    const tabAgain = await again;
    await tabAgain
      .waitForURL((url) => url.href !== "about:blank", { timeout: 10_000 })
      .catch(() => undefined);
    const after = (
      await fleet.api<{ connections: ConnectionRead[] }>("/api/connections")
    ).connections.find((one) => one.name === "gitlab-probe")?.signIn;
    check(
      "connections · a closed sign-in tab is said on the row through a reload; Open sign-in opens the hub's same page, no new sign-in",
      kept.text.includes(connectionsWords.signInClosed) &&
        kept.button === 1 &&
        tabAgain.url() === first.url &&
        after?.url === first.url,
      `${JSON.stringify(kept)}; reopened ${tabAgain.url() === first.url}; hub kept ${after?.url === first.url}`
    );
    await tabAgain.close();
  } finally {
    mock.stop();
  }
}

/** An account on a machine, by a pasted code. */
async function accountLeg({ kit, fleet, page, base }: Leg): Promise<void> {
  const { check } = kit;
  // ── An account on a machine ──────────────────────────────────────────
  const made = await fleet.api<{ id: string }>("/api/accounts", {
    provider: "anthropic",
    kind: "subscription",
  });
  const pendingLink = async (account: string) =>
    (await fleet.api<AccountsRead>("/api/accounts")).pending.find(
      (one) => one.accountId === account && one.machineId === MACHINE
    )?.challenge.url;
  await open(page, `${base}/config/accounts/${made.id}`, "main");
  await page.getByRole("button", { name: SIGN_IN_ON }).first().click();
  const popups = page.context().waitForEvent("page");
  await page
    .getByRole("button", { name: accountsWords.signin.openLink })
    .click();
  await (await popups).close();
  const linkAnchor = page.getByRole("link", {
    name: accountsWords.signin.openLink,
  });
  const firstHref = await until(
    "the machine's link shown",
    () => linkAnchor.getAttribute("href"),
    Boolean,
    60_000
  );
  await page.reload();
  const reloadedHref = await until(
    "the link shown again after a reload",
    () => linkAnchor.getAttribute("href").catch(() => null),
    Boolean,
    30_000
  );
  check(
    "account · a reload opens the sign-in popover again on the same link, the hub's pending one",
    firstHref === LINK &&
      reloadedHref === LINK &&
      (await pendingLink(made.id)) === LINK,
    `${firstHref === LINK} ${reloadedHref === LINK}`
  );
  await page.keyboard.press("Escape");
  await linkAnchor.waitFor({ state: "detached", timeout: 10_000 });
  const parkedState = flat(
    await page
      .locator('[data-slot="machine-state"][data-parked]')
      .first()
      .textContent()
      .catch(() => null)
  );
  const openAgain = page.getByRole("button", { name: OPEN_SIGN_IN_ON });
  const openLabel = await openAgain.count();
  await openAgain.first().click();
  const backHref = await until(
    "the link shown again from the row",
    () => linkAnchor.getAttribute("href").catch(() => null),
    Boolean,
    10_000
  );
  check(
    "account · put away, the row says it waits on the pasted code and offers Open sign-in, which shows the same link",
    parkedState === accountsWords.machines.waitingPaste &&
      openLabel === 1 &&
      backHref === LINK,
    `${JSON.stringify(parkedState)}; Open sign-in ${openLabel}; ${backHref === LINK}`
  );
  await page
    .getByRole("textbox", { name: accountsWords.signin.codeLabel })
    .fill("not-the-code");
  await page
    .getByRole("button", { name: accountsWords.signin.done, exact: true })
    .click();
  const problem = flat(
    await until(
      "the code refused",
      () =>
        page
          .locator("[data-signin-problem]")
          .textContent()
          .catch(() => null),
      Boolean,
      60_000
    )
  );
  await page.keyboard.press("Escape");
  const onRowProblem = flat(
    await page
      .locator('[data-slot="refused"]')
      .first()
      .textContent({ timeout: 10_000 })
  );
  check(
    "account · a code that did not take is said in the popover and, put away, on the row; no toast",
    problem !== "" && onRowProblem === problem && (await toasts(page)) === 0,
    `popover ${JSON.stringify(problem)}; row ${JSON.stringify(onRowProblem)}`
  );
}

/** An account on a machine, by device code. */
async function deviceLeg({ kit, fleet, page, base }: Leg): Promise<void> {
  const { check } = kit;
  // ── An account on a machine, by device code ─────────────────────────
  // GitHub Copilot signs in with GitHub's own device code (pi-ai's
  // github-copilot), read from github.com: a code nobody enters, which
  // lapses on its own.
  await page.keyboard.press("Escape");
  const copilot = await fleet.api<{ id: string }>("/api/accounts", {
    provider: "github-copilot",
    kind: "oauth",
  });
  const pendingCode = async () =>
    (await fleet.api<AccountsRead>("/api/accounts")).pending.find(
      (one) => one.accountId === copilot.id && one.machineId === MACHINE
    )?.challenge;
  const shownCode = page.locator('[data-slot="code"]');
  const codeText = async () =>
    flat(await shownCode.textContent().catch(() => null)).replace(NOT_CODE, "");
  await open(page, `${base}/config/accounts/${copilot.id}`, "main");
  await page.getByRole("button", { name: SIGN_IN_ON }).first().click();
  await page
    .getByRole("button", { name: accountsWords.device.start, exact: true })
    .click();
  const firstCode = await until(
    "GitHub's device code shown",
    codeText,
    Boolean,
    60_000
  );
  const held = await pendingCode();
  await page.reload();
  const reloadedCode = await until(
    "the device code shown again after a reload",
    codeText,
    Boolean,
    30_000
  );
  check(
    "device · a reload opens the popover again on the same code, the hub's pending one, still waited on",
    reloadedCode === firstCode &&
      (held as { userCode?: string } | undefined)?.userCode?.replace(
        NOT_CODE,
        ""
      ) === firstCode,
    `${firstCode} → ${reloadedCode}`
  );
  await page.keyboard.press("Escape");
  await shownCode.waitFor({ state: "detached", timeout: 10_000 });
  const deviceParked = flat(
    await page
      .locator('[data-slot="machine-state"][data-parked]')
      .first()
      .textContent()
      .catch(() => null)
  );
  await page.getByRole("button", { name: OPEN_SIGN_IN_ON }).first().click();
  const backCode = await until(
    "the device code from the row",
    codeText,
    Boolean,
    10_000
  );
  check(
    "device · put away, the row says it waits on the code and offers Open sign-in, which shows the same code",
    deviceParked === accountsWords.machines.waitingCode &&
      backCode === firstCode,
    `${JSON.stringify(deviceParked)}; ${backCode}`
  );
  await page.keyboard.press("Escape");
}

/** Add an account. */
async function setupLeg({ kit, fleet, page, base }: Leg): Promise<void> {
  const { check } = kit;
  // ── Add an account ───────────────────────────────────────────────────
  await open(page, `${base}/config/accounts/new`, "[data-choice]");
  await page
    .locator("[data-choice]")
    .filter({
      has: page.locator("[data-slot=plabel]", { hasText: CLAUDE_ROW }),
    })
    .first()
    .click();
  const setupPopup = page.context().waitForEvent("page");
  await page
    .locator("[data-slot=machines]")
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await (await setupPopup).close();
  const setupLink = page
    .locator("[data-slot=machines]")
    .getByRole("link", { name: accountsWords.signin.openLink });
  const setupHref = await until(
    "the setup's link shown",
    () => setupLink.getAttribute("href").catch(() => null),
    Boolean,
    60_000
  );
  const accountId = await until(
    "the address naming the account the link made",
    () => new URL(page.url()).searchParams.get("account"),
    Boolean,
    10_000
  );
  await page.reload();
  const current = page.locator('li[aria-current="step"]');
  const setupAfter = {
    step: flat(await current.textContent({ timeout: 30_000 })),
    href: await until(
      "the setup's link after a reload",
      () => setupLink.getAttribute("href").catch(() => null),
      Boolean,
      30_000
    ),
    hub: (await fleet.api<AccountsRead>("/api/accounts")).accounts.find(
      (one) => one.id === accountId
    )?.setupStep,
  };
  check(
    "setup · a reload stands on Sign in, its account's step kept on the hub, the same link shown",
    setupAfter.step === accountsWords.setup.steps.signIn &&
      setupAfter.href === setupHref &&
      setupAfter.hub === "signIn",
    JSON.stringify(setupAfter)
  );
  await open(page, `${base}/config/accounts`, "main");
  const parkedSetup = page.locator(
    `a[data-setup][href*="${encodeURIComponent(accountId ?? "")}"]`
  );
  const parkedText = flat(await parkedSetup.innerText({ timeout: 10_000 }));
  await parkedSetup.click();
  const resumedHref = await until(
    "the setup opened from its row",
    () => setupLink.getAttribute("href").catch(() => null),
    Boolean,
    30_000
  );
  check(
    "setup · left, the account's row says its setup is not finished, and its press opens the setup on the same link",
    parkedText.includes(
      accountsWords.setup.unfinished(accountsWords.setup.steps.signIn)
    ) &&
      resumedHref === setupHref &&
      flat(await current.textContent()) === accountsWords.setup.steps.signIn,
    `${JSON.stringify(parkedText)}; ${resumedHref === setupHref}`
  );
}

const spec: Spec = {
  name: "work-outlives-surface",
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
        email: EMAIL,
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
    const page = await kit.page("desk");

    const leg: Leg = { kit, fleet, page, base };
    await skillLegs(leg);
    await connectionLegs(leg);
    await accountLeg(leg);
    await deviceLeg(leg);
    await setupLeg(leg);
  },
};

export default spec;
