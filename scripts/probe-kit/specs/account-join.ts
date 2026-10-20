/**
 * Adding an account whose sign-in lands on an identity the hub already
 * holds, identity keyed on the organization's id, and a refusal longer than
 * two lines of a toast shown in the hub's own words. On a scratch fleet
 * whose agent runs a stand-in `claude` (first on its PATH): `auth login`
 * prints Claude Code 2.1.302's screen and, given the page's code, signs the
 * dir in as the identity the spec put in `next-login.json`; `auth status
 * --json` answers each dir's login with its `email`, `orgName` and `orgId`;
 * initialize answers its email and org name (and, as Claude Code's does, no
 * org id). The fleet's own account is signed in as EMAIL in org ORG_ONE.
 *
 * 1. Add account, a sign-in that comes out as the fleet's account: Sign in
 *    says the login was already one of your accounts, Name it saves a
 *    nickname onto that account, and Add account ends on the Accounts list
 *    with no 404 and no "There is no account" on any answer. Main PATCHed
 *    the account the join removed: "There is no account <id>." (404).
 * 2. A sign-in as the same email and org name in another org id is an
 *    account of its own; one in the same org id joins the fleet's account.
 *    Main keyed on the org's name and joined the first.
 * 4. At 320, Add account's Sign in line with a 60-character address, both
 *    the joined line and the signed-in line: it wraps inside its box (no
 *    sideways scroll in it, the step or the page), two lines or more, and
 *    its mark's middle is within 0.5px of the first line's x-height middle
 *    (The Mark Line Rule).
 * 5. A key that comes out as a key account the hub already holds: Sign in
 *    says so, and Add account ends on that account, named, with no 404.
 *    Removing by an id a join took away is refused (409), and the account
 *    it joined stays (leg 2).
 * 3. Every Claude account past its reserve, its nickname long: New session
 *    shows placement's refusal as the hub wrote it, over 160 characters.
 *    Main's hub-read turned it into "The hub didn't answer (400)."
 *
 *   bun scripts/probe-kit/run.ts account-join
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ACCOUNT, MACHINE, until } from "../../scratch-fleet";
import type { Spec } from "../kit";
import { open, settle } from "../kit";

const EMAIL = "probe@scratch-fleet.test";
const ORG_NAME = "Scratch Fleet";
const ORG_ONE = "00000000-0000-4000-8000-0000000000a1";
const ORG_TWO = "00000000-0000-4000-8000-0000000000b2";
const ORG_THREE = "00000000-0000-4000-8000-0000000000c3";
const ORG_FOUR = "00000000-0000-4000-8000-0000000000d4";
const STATE = "pr0beStateValue";
/** The page's code, whole: `code#state`. */
const CODE = `pr0beCode#${STATE}`;
const LINK = `https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Aprofile+user%3Ainference&code_challenge=pr0beChallenge&code_challenge_method=S256&state=${STATE}`;
const CLAUDE_ROW = /^Claude$/;
const NEXT_STEP = /^(Continue|Save account|Open Accounts)$/;
const NEW_SESSION = /^(New session|Start session)$/;
/** A nickname long enough that placement's refusal runs past 160 characters, on main's words too. */
const LONG_NAME =
  "The probe's own Claude account, kept for the long-refusal leg of this spec";

/** The stand-in `claude`: `--version`, `auth login|status|logout`, the SDK's initialize; anything else exits 0. */
const STAND_IN = `#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  for await (const line of console) {
    if (line.trim() === ${JSON.stringify(CODE)}) {
      writeFileSync(login, readFileSync(process.env.PROBE_NEXT_LOGIN, "utf8"));
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

interface Identity {
  email: string;
  orgId: string;
  orgName: string;
}

interface AccountRow {
  email: string | null;
  id: string;
  identity: {
    email: string;
    orgId?: string | null;
    organization: string;
  } | null;
  label: string | null;
  provider: string;
}

const spec: Spec = {
  name: "account-join",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const bin = join(fleet.sandbox, "stand-in-bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "claude"), STAND_IN, { mode: 0o755 });
    const next = join(fleet.sandbox, "next-login.json");
    const signInAs = (identity: Identity) =>
      writeFile(next, JSON.stringify(identity));
    // The fleet's own account, signed in as EMAIL in ORG_ONE.
    await writeFile(
      join(
        fleet.home,
        ".cawco",
        "accounts",
        ACCOUNT,
        "claude",
        "probe-login.json"
      ),
      JSON.stringify({ email: EMAIL, orgName: ORG_NAME, orgId: ORG_ONE })
    );
    const machineEnv = {
      PATH: `${bin}:${fleet.env.PATH}`,
      PROBE_NEXT_LOGIN: next,
    };
    fleet.launch("sessiond", [], machineEnv);
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], machineEnv);
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const claudeAccounts = async () =>
      (
        await fleet.api<{ accounts: AccountRow[] }>("/api/accounts")
      ).accounts.filter((one) => one.provider === "anthropic");
    const named = await until(
      "the fleet's account named by its login",
      claudeAccounts,
      (all) => all.some((one) => one.id === ACCOUNT && one.email === EMAIL)
    );
    kit.note(`before: ${JSON.stringify(named)}`);

    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    // Every answer the hub gave the page, for 404s and "There is no account".
    const answers: string[] = [];
    page.on("response", async (response) => {
      if (!response.url().includes("/api/accounts")) {
        return;
      }
      const body = await response.text().catch(() => "");
      answers.push(
        `${response.request().method()} ${new URL(response.url()).pathname} ${response.status()} ${body.slice(0, 160)}`
      );
    });

    /**
     * Add account up to its Sign in step's answer, signed in on the fleet's
     * machine as `identity`: the words the step shows for it, the joined
     * line's or the signed-in line's.
     */
    const wizardSignIn = async (
      on: typeof page,
      identity: Identity
    ): Promise<string> => {
      await signInAs(identity);
      await open(on, `${base}/config/accounts/new`, "[data-choice]");
      await on
        .locator("[data-choice]")
        .filter({ has: on.locator(".plabel", { hasText: CLAUDE_ROW }) })
        .first()
        .click();
      await on
        .locator("[data-slot=machines]")
        .getByRole("button", { name: "Sign in", exact: true })
        .first()
        .click();
      const code = on.locator("[data-account-setup-code]").first();
      await until(
        "the sign-in link handed out",
        () => code.isEnabled(),
        Boolean,
        60_000
      );
      await code.fill(CODE);
      await on
        .getByRole("button", { name: "Done", exact: true })
        .first()
        .click();
      const words = on.locator(
        "[data-slot=signed-as] [data-slot=joined], [data-slot=signed-as] [data-slot=signed-in]"
      );
      const said = await until(
        "the sign-in answered",
        async () =>
          (await words.count()) > 0
            ? await words.first().innerText()
            : undefined,
        Boolean,
        60_000
      );
      await settle(on, 300);
      return said;
    };

    // ── 1. Add account, landing on the fleet's account ──────────────────
    const said = await wizardSignIn(page, {
      email: EMAIL,
      orgName: ORG_NAME,
      orgId: ORG_ONE,
    });
    check(
      "1: Sign in says the sign-in was already one of your accounts",
      said.includes(`${EMAIL} was already one of your accounts`),
      said
    );
    /**
     * Add account from its Sign in step to its end: Name it given `nickname`,
     * then each Continue, the last one Save account. Answers the setup's
     * refusal, if one stopped it.
     */
    const throughToEnd = async (
      on: typeof page,
      name: string
    ): Promise<string | null> => {
      const problem = on.locator(".problem[role=alert]");
      for (
        let step = 0;
        step < 8 && new URL(on.url()).pathname.endsWith("/new");
        step += 1
      ) {
        const field = on.locator("#setup-nickname");
        // biome-ignore lint/performance/noAwaitInLoops: one step at a time, each after the last landed
        const naming = (await field.count()) > 0;
        if (naming && (await field.inputValue()) !== name) {
          await field.fill(name);
        }
        await on.getByRole("button", { name: NEXT_STEP }).last().click();
        await settle(on, 300);
        if ((await problem.count()) > 0) {
          return await problem.innerText();
        }
      }
      return null;
    };
    const nickname = "Joined by the probe";
    const refused = await throughToEnd(page, nickname);
    const missing = answers.filter(
      (line) => line.includes(" 404 ") || line.includes("There is no account")
    );
    check(
      '1: Add account ends on the Accounts list, Name it included, with no 404 and no "There is no account"',
      new URL(page.url()).pathname === "/config/accounts" &&
        refused === null &&
        missing.length === 0,
      `at ${page.url()}, problem ${JSON.stringify(refused)}, answers ${JSON.stringify(missing.length > 0 ? missing : answers.slice(-6))}`
    );
    const afterJoin = await claudeAccounts();
    check(
      "1: the hub holds one Claude account, the fleet's, named as Name it said",
      afterJoin.length === 1 &&
        afterJoin[0]?.id === ACCOUNT &&
        afterJoin[0]?.label === nickname,
      JSON.stringify(afterJoin)
    );

    // ── 2. Keyed on the org's id ────────────────────────────────────────
    const signInThroughHub = async (identity: Identity) => {
      await signInAs(identity);
      const made = await fleet.api<{ id: string }>("/api/accounts", {
        provider: "anthropic",
        kind: "subscription",
      });
      await fleet.api<{ url: string }>(
        `/api/accounts/${made.id}/machines/${MACHINE}/signin`,
        {}
      );
      const done = await fleet.api<{
        joined?: { accountId: string };
        state: string;
      }>(`/api/accounts/${made.id}/machines/${MACHINE}/signin/complete`, {
        code: CODE,
      });
      return { id: made.id, done };
    };
    const other = await signInThroughHub({
      email: EMAIL,
      orgName: ORG_NAME,
      orgId: ORG_TWO,
    });
    const afterOther = await claudeAccounts();
    const otherRow = afterOther.find((one) => one.id === other.id);
    check(
      "2: the same email and org name in another org id is an account of its own",
      other.done.state === "signed-in" &&
        other.done.joined === undefined &&
        afterOther.length === 2 &&
        otherRow?.identity?.orgId === ORG_TWO,
      `answer ${JSON.stringify(other.done)}; accounts ${JSON.stringify(afterOther)}`
    );
    const same = await signInThroughHub({
      email: EMAIL,
      orgName: "Renamed org",
      orgId: ORG_ONE,
    });
    const afterSame = await claudeAccounts();
    check(
      "2: the same email in the same org id (its name changed) joins the fleet's account",
      same.done.joined?.accountId === ACCOUNT &&
        afterSame.length === 2 &&
        !afterSame.some((one) => one.id === same.id),
      `answer ${JSON.stringify(same.done)}; accounts ${JSON.stringify(afterSame)}`
    );
    const removing = await fetch(`${fleet.base}/api/accounts/${same.id}`, {
      method: "DELETE",
    }).then(async (response) => ({
      status: response.status,
      text: await response.text(),
    }));
    const afterRemoving = await claudeAccounts();
    check(
      "2: removing by an id a join took away is refused, and the account it joined stays",
      removing.status === 409 &&
        afterRemoving.some((one) => one.id === ACCOUNT),
      `${removing.status} ${removing.text}; accounts ${afterRemoving.map((one) => one.id).join(", ")}`
    );

    // ── 4. A long address wraps, in both lines, at 320 ──────────────────
    const narrow = await kit.page("phone");
    await narrow.setViewportSize({ width: 320, height: 740 });
    /** The Sign in step's line `slot`, read off the engine. */
    const lineOf = (slot: "joined" | "signed-in") =>
      narrow.evaluate((which) => {
        const row = document.querySelector<HTMLElement>(
          "[data-slot=signed-as]"
        );
        const words = row?.querySelector<HTMLElement>(`[data-slot=${which}]`);
        const glyph = row?.querySelector(".mark-cell svg");
        if (!(row && words && glyph)) {
          return null;
        }
        const range = document.createRange();
        range.selectNodeContents(words);
        const lines = new Set(
          [...range.getClientRects()]
            .filter((rect) => rect.width > 0)
            .map((rect) => Math.round(rect.top))
        ).size;
        // A zero-wide box 1ex tall on the first line's baseline: its middle
        // is that line's x-height middle.
        const ex = document.createElement("span");
        ex.style.cssText =
          "display:inline-block;inline-size:0;block-size:1ex;vertical-align:baseline";
        words.prepend(ex);
        const band = ex.getBoundingClientRect();
        ex.remove();
        const mark = glyph.getBoundingClientRect();
        const step = row.closest<HTMLElement>(".box");
        return {
          lines,
          offBy:
            Math.round(
              Math.abs(
                mark.top + mark.height / 2 - (band.top + band.height / 2)
              ) * 100
            ) / 100,
          row: row.scrollWidth - row.clientWidth,
          step: step ? step.scrollWidth - step.clientWidth : null,
          page:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        };
      }, slot);
    const LONG_JOINED =
      "the-wrap-leg-of-account-join-signs-in-as@some-long-domain.test";
    const LONG_NEW =
      "a-fresh-account-for-the-wrap-leg-of-the-spec@long-domain.test";
    await signInThroughHub({
      email: LONG_JOINED,
      orgName: ORG_NAME,
      orgId: ORG_THREE,
    });
    for (const [slot, email, orgId] of [
      ["joined", LONG_JOINED, ORG_THREE],
      ["signed-in", LONG_NEW, ORG_FOUR],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one sign-in at a time, on one page
      const shown = await wizardSignIn(narrow, {
        email,
        orgName: ORG_NAME,
        orgId,
      });
      const read = await lineOf(slot);
      check(
        `4: at 320, the ${slot} line with a ${email.length}-character address wraps inside its box, its mark on the first line's x-height`,
        read !== null &&
          read.row <= 0 &&
          (read.step ?? 0) <= 0 &&
          read.page <= 0 &&
          read.lines >= 2 &&
          read.offBy <= 0.5,
        `${JSON.stringify(read)}; said ${JSON.stringify(shown)}`
      );
    }

    // ── 5. A key that lands on a key account the hub already holds ──────
    const choices = await fleet.api<
      { kind: string; name: string; provider: string; signin: string }[]
    >("/api/accounts/providers");
    const keyed = choices.find((one) => one.signin === "api-key");
    if (keyed) {
      const KEY = "sk-probe-account-join-0123456789abcdef";
      const held = await fleet.api<{ id: string }>("/api/accounts", {
        provider: keyed.provider,
        kind: "api_key",
      });
      const sent = await fleet.api<{ machines: unknown[] }>(
        `/api/accounts/${held.id}/key`,
        { key: KEY, machineIds: [MACHINE] }
      );
      kit.note(
        `5: the key's first account ${held.id}: ${JSON.stringify(sent)}`
      );
      const before = answers.length;
      await open(page, `${base}/config/accounts/new`, "[data-choice]");
      await page
        .locator("[data-choice]")
        .filter({ has: page.locator(".plabel", { hasText: keyed.name }) })
        .first()
        .click();
      await page.getByLabel("API key", { exact: true }).fill(KEY);
      await page.getByRole("button", { name: "Send key", exact: true }).click();
      const joinedLine = page.locator(
        "[data-slot=signed-as] [data-slot=joined]"
      );
      const keySaid = await until(
        "the key's answer",
        async () =>
          (await joinedLine.count()) > 0
            ? await joinedLine.innerText()
            : undefined,
        Boolean,
        60_000
      ).catch((error: unknown) => String(error));
      const keyNickname = "The probe's key";
      const keyRefused = await throughToEnd(page, keyNickname);
      const keyAccounts = (
        await fleet.api<{ accounts: AccountRow[] }>("/api/accounts")
      ).accounts.filter((one) => one.provider === keyed.provider);
      const keyMissing = answers
        .slice(before)
        .filter(
          (line) =>
            line.includes(" 404 ") || line.includes("There is no account")
        );
      check(
        `5: a ${keyed.name} key already one of your accounts says so, and Add account ends on that account, named, with no 404`,
        keySaid.includes("was already one of your accounts") &&
          new URL(page.url()).pathname === "/config/accounts" &&
          keyRefused === null &&
          keyMissing.length === 0 &&
          keyAccounts.length === 1 &&
          keyAccounts[0]?.id === held.id &&
          keyAccounts[0]?.label === keyNickname,
        `said ${JSON.stringify(keySaid)}; at ${page.url()}; problem ${JSON.stringify(keyRefused)}; ${JSON.stringify(keyMissing)}; accounts ${JSON.stringify(keyAccounts)}`
      );
    } else {
      check(
        "5: a provider that takes a key, to add",
        false,
        JSON.stringify(choices)
      );
    }

    // ── 3. A long refusal, in New session ───────────────────────────────
    fleet.write(
      "UPDATE accounts SET reserve_pct = 0 WHERE provider = 'anthropic'"
    );
    fleet.write(
      "UPDATE accounts SET label = ? WHERE id = ?",
      LONG_NAME,
      ACCOUNT
    );
    const hubSaid = await fetch(
      `${fleet.base}/api/accounts/placement?harness=claude&machineId=${MACHINE}`
    ).then(async (response) => ({
      status: response.status,
      text: await response.text(),
    }));
    check(
      "3: placement refuses with a reason longer than 160 characters",
      hubSaid.status === 400 && hubSaid.text.length > 160,
      `${hubSaid.status} (${hubSaid.text.length} chars) ${hubSaid.text}`
    );
    // The fleet's machine, as the one this person last started a session
    // on (spawnPrefs `rememberedMachine`): the dialog opens on it.
    await page.goto(`${base}/session`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (machine) =>
        localStorage.setItem("cawco-spawn-machine", JSON.stringify(machine)),
      MACHINE
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: NEW_SESSION })
      .filter({ visible: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "New Session" });
    const title = dialog
      .locator("[data-slot=start-notice] [data-slot=alert-title]")
      .first();
    const shown = await until(
      "New session's refusal",
      async () =>
        (await title.count()) > 0 ? await title.innerText() : undefined,
      Boolean,
      60_000
    ).catch((error: unknown) => String(error));
    const seen =
      (await dialog.count()) > 0
        ? await dialog.first().innerText()
        : "(no dialog)";
    check(
      "3: New session shows the hub's reason whole, not that the hub didn't answer",
      shown.trim() === hubSaid.text.trim() && !shown.includes("didn't answer"),
      `shown ${JSON.stringify(shown)}; placement asked ${JSON.stringify(answers.filter((line) => line.includes("placement")))}; the dialog said ${JSON.stringify(seen.slice(0, 600))}`
    );
    const box = await title
      .evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflow: getComputedStyle(el).overflow,
        lineClamp: getComputedStyle(el).webkitLineClamp,
      }))
      .catch((error: unknown) => String(error));
    check(
      "3: the reason stands whole on screen: nothing clipped, nothing scrolls sideways",
      typeof box === "object" &&
        box.scrollHeight <= box.clientHeight + 1 &&
        box.scrollWidth <= box.clientWidth + 1 &&
        box.lineClamp === "none",
      JSON.stringify(box)
    );
    kit.note(`3: the refusal (${hubSaid.text.length} chars): ${hubSaid.text}`);
  },
};

export default spec;
