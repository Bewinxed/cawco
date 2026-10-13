/**
 * Unlock keychain (Stay In Context audit row #22), live on a Mac: a scratch
 * fleet whose agent's HOME holds a throwaway login keychain, locked, so the
 * machine reports `unreadable-credentials`; the dashboard's machine menu
 * offers Unlock, the step opens under the row, a wrong password reads the
 * agent's refusal there, the right one unlocks it, the machine's auth moves
 * on at the hub and the row stops offering Unlock.
 *
 *   bun scripts/probe-kit/run.ts keychain-unlock
 *
 * Runs only on macOS, outside any workspace boundary (a workspace's Seatbelt
 * profile denies the keychain's mach services, boundary-policy.ts
 * `KEYCHAIN_MACH_SERVICES`, so every `security` call there fails with
 * errSecParam) and outside the desktop session (over ssh): a locked keychain
 * read from inside the desktop session can raise a password dialog instead of
 * answering `errSecInteractionNotAllowed` (exit 36), which is the case the
 * feature exists for.
 *
 * Why a scratch HOME is enough: the agent unlocks
 * `${homedir()}/Library/Keychains/login.keychain-db` (agent/src/auth.ts) and
 * detects the lock with `security find-generic-password` over the user's
 * search list (agent/src/accounts.ts `keychainRefused`). Both follow HOME:
 * Bun's `homedir()` reads it, and the Security framework expands the user
 * domain's `~/Library/Preferences/com.apple.security.plist` and
 * `~/Library/Keychains/login.keychain` with `getenv("HOME")`
 * (DLDBListCFPref.cpp `getPwInfo(kHomeDir)`,
 * github.com/apple-oss-distributions/Security, OSX/libsecurity_keychain/lib).
 *
 * The owner's own keychains are never named. Every `security` call that
 * names a keychain goes through {@link inScratch}, which runs it with HOME
 * set to the scratch HOME and refuses any path outside it or under the real
 * home's Library; the scratch HOME itself is refused if it is, holds, or sits
 * under the real home's Library. The real user's search list is read (no
 * path named) before, right after the scratch list is set, and at the end,
 * and must never move.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { platform, userInfo } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Page } from "playwright-core";
import { ACCOUNT, MACHINE, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { open, settle } from "../kit";

const MACHINES_BUTTON = /^\d+ machines?/;
const UNLOCK_ITEM = /^Unlock keychain/;
const UNLOCK_BUTTON = /^Unlock$/;
/** agent/src/auth.ts, `security unlock-keychain` exiting errSecAuthFailed. */
const WRONG_PASSWORD = "That password did not unlock the keychain.";
/** `errSecInteractionNotAllowed`'s exit: the keychain is there and locked, and nothing may ask. */
const LOCKED_EXIT = 36;
/** A user name Claude Code files its Keychain item under as it is (agent/src/accounts.ts). */
const KEYCHAIN_USER = /^[a-zA-Z0-9._-]+$/;

const within = (child: string, parent: string): boolean =>
  child === parent || child.startsWith(`${parent}/`);

/** The real path of `path`, or of its nearest existing parent with the rest appended. */
const resolved = (path: string): string =>
  existsSync(path)
    ? realpathSync(path)
    : join(resolved(dirname(path)), basename(path));

/** The real user's home dirs: the password database's and `$HOME`, as real paths. */
const realHomes = (): string[] => [
  ...new Set(
    [userInfo().homedir, process.env.HOME]
      .filter((home): home is string => Boolean(home))
      .map(resolved)
  ),
];

/**
 * Throws unless `home` is a scratch HOME the owner's keychains are not in:
 * not a real home, not above one, and not under a real home's Library.
 */
function refuseUnlessScratch(home: string): string {
  const real = resolved(home);
  for (const owner of realHomes()) {
    if (within(owner, real)) {
      throw new Error(
        `Refusing: the scratch HOME ${real} is or holds the real home ${owner}.`
      );
    }
    if (within(real, join(owner, "Library"))) {
      throw new Error(
        `Refusing: the scratch HOME ${real} is under the real ${owner}/Library.`
      );
    }
  }
  return real;
}

interface Said {
  code: number;
  err: string;
  out: string;
}

/**
 * One `security` call with HOME set to the scratch HOME `home`, naming the
 * keychain `path`, which must resolve inside `home` and outside every real
 * home's Library, or the call is refused before it runs. Its arguments are
 * never printed: some carry the throwaway password.
 */
async function inScratch(
  home: string,
  args: string[],
  path: string
): Promise<Said> {
  const scratch = refuseUnlessScratch(home);
  const real = resolved(path);
  if (!within(real, scratch)) {
    throw new Error(
      `Refusing: security ${args[0]} names ${real}, outside the scratch HOME ${scratch}.`
    );
  }
  for (const owner of realHomes()) {
    if (within(real, join(owner, "Library"))) {
      throw new Error(
        `Refusing: security ${args[0]} names ${real}, under the real ${owner}/Library.`
      );
    }
  }
  if (!args.includes(path)) {
    throw new Error(
      `Refusing: security ${args[0]} does not name the scratch keychain it was checked for.`
    );
  }
  return await securityAs(home, args);
}

/** `security <args>` with HOME set to `home`: its exit and words. */
async function securityAs(home: string, args: string[]): Promise<Said> {
  const child = Bun.spawn(["/usr/bin/security", ...args], {
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      HOME: home,
      USER: process.env.USER ?? userInfo().username,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
}

/** The scratch HOME's keychain search list; names no keychain. */
const scratchSearchList = (home: string): Promise<Said> => {
  refuseUnlessScratch(home);
  return securityAs(home, ["list-keychains", "-d", "user"]);
};

/** The real user's keychain search list, read under the real HOME; names no keychain. */
async function ownerSearchList(): Promise<string> {
  const child = Bun.spawn(
    ["/usr/bin/security", "list-keychains", "-d", "user"],
    { stdout: "pipe", stderr: "pipe" }
  );
  const [out, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return `exit ${code}: ${out.trim()}`;
}

/** The user name the agent files its Keychain item under (agent/src/accounts.ts `keychainUser`). */
const keychainUserOf = (user: string | undefined): string =>
  user && KEYCHAIN_USER.test(user) ? user : "claude-code-user";

/**
 * The Keychain service Claude Code keeps an account dir's login under:
 * `Claude Code-credentials-` and the first 8 hex of the SHA-256 of the dir
 * exactly as the agent sets `CLAUDE_CONFIG_DIR` (agent/src/accounts.ts
 * `keychainService`, core/src/paths.ts `accountConfigDir`):
 * `<HOME>/.cawco/accounts/<id>/claude`, HOME as given.
 */
const keychainServiceOf = (configDir: string): string =>
  `Claude Code-credentials-${createHash("sha256")
    .update(configDir.normalize("NFC"))
    .digest("hex")
    .slice(0, 8)}`;

interface AgentRow {
  auth: string;
  hostname: string;
  machineId: string;
  os: string;
}

/** The unlock step under the machine's row, read from the DOM once its motion has landed. */
const stepState = (page: Page, machineId: string) =>
  page.evaluate((id) => {
    const section = document.querySelector("section.unlock");
    const item = document.querySelector(`li[data-machine="${id}"]`);
    const row = item?.querySelector(".row") ?? null;
    const input = section?.querySelector('input[type="password"]');
    const rect = input?.getBoundingClientRect();
    return {
      open: section !== null,
      /** In the machine's own list item, below its row. */
      underRow:
        section !== null &&
        row !== null &&
        section.closest("li[data-machine]") === item &&
        section.getBoundingClientRect().top >=
          Math.floor(row.getBoundingClientRect().bottom),
      modal:
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
      titles: Array.from(
        section?.querySelectorAll('[id$="-title"]') ?? [],
        (title) => title.textContent?.replace(/\s+/g, " ").trim() ?? ""
      ),
      alert:
        section?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      field: input
        ? {
            top: Math.round(rect?.top ?? 0),
            left: Math.round(rect?.left ?? 0),
            invalid: input.getAttribute("aria-invalid"),
          }
        : null,
    };
  }, machineId);

/** Right-clicks the machine's row and answers whether its menu offers Unlock keychain; the menu stays open. */
async function menuOffersUnlock(page: Page): Promise<boolean> {
  const row = page.locator(`li[data-machine="${MACHINE}"] .row`).first();
  await row.waitFor();
  await row.click({ button: "right" });
  await page.getByRole("menu").first().waitFor();
  return (await page.getByRole("menuitem", { name: UNLOCK_ITEM }).count()) > 0;
}

const spec: Spec = {
  name: "keychain-unlock",
  run: async (kit: Kit) => {
    if (platform() !== "darwin") {
      throw new Error("keychain-unlock runs on macOS only.");
    }
    if (process.env.CAWCO_WORKSPACE) {
      throw new Error(
        "keychain-unlock cannot run inside a CawCo workspace: its boundary denies the keychain's mach services (boundary-policy.ts KEYCHAIN_MACH_SERVICES). Run it from a shell on the Mac, over ssh."
      );
    }
    const ownerBefore = await ownerSearchList();

    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const { home } = fleet;
    refuseUnlessScratch(home);
    if (fleet.env.HOME !== home) {
      throw new Error(
        `Refusing: the agent's HOME ${fleet.env.HOME} is not the scratch HOME ${home}.`
      );
    }
    const keychain = join(home, "Library", "Keychains", "login.keychain-db");
    const password = randomUUID();
    const configDir = join(home, ".cawco", "accounts", ACCOUNT, "claude");
    const service = keychainServiceOf(configDir);
    const user = keychainUserOf(fleet.env.USER);
    /** The agent's own lock probe, naming the scratch keychain: 36 locked, 0 readable. */
    const probe = () =>
      inScratch(
        home,
        ["find-generic-password", "-a", user, "-s", service, keychain],
        keychain
      );
    const info = () =>
      inScratch(home, ["show-keychain-info", keychain], keychain);
    let made = false;

    try {
      // The account dir stays (the agent reports it), its file login goes:
      // its login is the keychain's, as Claude Code keeps it on a Mac.
      await rm(join(configDir, ".credentials.json"), { force: true });
      await mkdir(dirname(keychain), { recursive: true });

      const created = await inScratch(
        home,
        ["create-keychain", "-p", password, keychain],
        keychain
      );
      made = created.code === 0;
      if (!made) {
        throw new Error(
          `security create-keychain exited ${created.code}: ${created.err}`
        );
      }
      // No auto-lock (no timeout, no lock on sleep): it locks when this says.
      const settings = await inScratch(
        home,
        ["set-keychain-settings", keychain],
        keychain
      );
      const listed = await inScratch(
        home,
        ["list-keychains", "-d", "user", "-s", keychain],
        keychain
      );
      const ownerMid = await ownerSearchList();
      if (ownerMid !== ownerBefore) {
        throw new Error(
          `Stopped: setting the scratch HOME's search list moved the real user's. Before: ${ownerBefore}. Now: ${ownerMid}.`
        );
      }
      const added = await inScratch(
        home,
        [
          "add-generic-password",
          "-a",
          user,
          "-s",
          service,
          "-w",
          "x",
          keychain,
        ],
        keychain
      );
      const locked = await inScratch(
        home,
        ["lock-keychain", keychain],
        keychain
      );
      const searchList = await scratchSearchList(home);
      const lockedRead = await probe();
      const infoBefore = await info();
      kit.note(
        `scratch keychain ${keychain}: set-keychain-settings exit ${settings.code}, list-keychains -s exit ${listed.code}, add-generic-password exit ${added.code}, lock-keychain exit ${locked.code}; H's search list: ${searchList.out}; show-keychain-info before: exit ${infoBefore.code} ${infoBefore.err || infoBefore.out}`
      );
      kit.check(
        "the throwaway keychain is the scratch HOME's only one, holds the account's item and is locked (find-generic-password exits 36)",
        settings.code === 0 &&
          listed.code === 0 &&
          added.code === 0 &&
          locked.code === 0 &&
          searchList.out.includes(keychain) &&
          searchList.out.split("\n").length === 1 &&
          lockedRead.code === LOCKED_EXIT,
        JSON.stringify({
          settings,
          listed,
          added,
          locked,
          searchList,
          lockedRead,
        })
      );

      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();

      const machineRow = async () =>
        (await fleet.api<AgentRow[]>("/api/agents")).find(
          (row) => row.machineId === MACHINE
        );
      const before = await until(
        "the machine's auth reported",
        machineRow,
        (row) => row !== undefined && row.auth !== "unknown",
        60_000
      ).catch(() => machineRow());
      kit.check(
        "the hub reports the machine's auth as unreadable-credentials",
        before?.auth === "unreadable-credentials",
        JSON.stringify(before)
      );
      const hostname = before?.hostname ?? MACHINE;

      const page = await kit.page("desk");
      const base = await fleet.dashboard();
      await open(page, base, "[data-needs-caw]");
      await page.getByRole("button", { name: MACHINES_BUTTON }).first().click();
      const offered = await menuOffersUnlock(page);
      kit.check(
        "the machine's menu offers Unlock keychain…",
        offered,
        `os ${before?.os}, auth ${before?.auth}`
      );
      if (!offered) {
        return;
      }
      await page.getByRole("menuitem", { name: UNLOCK_ITEM }).click();
      await page.locator("section.unlock").waitFor();
      await settle(page);
      const opened = await stepState(page, MACHINE);
      kit.check(
        "the step opens under the machine's row, in the page, with no modal (The Open Page Rule)",
        opened.open &&
          opened.underRow &&
          !opened.modal &&
          opened.field !== null,
        JSON.stringify(opened)
      );

      const field = page.locator('section.unlock input[type="password"]');
      const submit = page
        .locator("section.unlock")
        .getByRole("button", { name: UNLOCK_BUTTON });
      await field.fill(randomUUID());
      await submit.click();
      await page
        .locator('section.unlock [role="alert"]')
        .waitFor({ timeout: 60_000 });
      await settle(page);
      const refused = await stepState(page, MACHINE);
      kit.check(
        `a wrong password reads "${WRONG_PASSWORD}" under the row`,
        refused.alert === WRONG_PASSWORD && refused.underRow,
        JSON.stringify({ alert: refused.alert, underRow: refused.underRow })
      );
      const stillLocked = await probe();
      kit.check(
        "after the refusal the field keeps its place, marked invalid, and the keychain stays locked",
        refused.field !== null &&
          opened.field !== null &&
          refused.field.top === opened.field.top &&
          refused.field.left === opened.field.left &&
          refused.field.invalid === "true" &&
          stillLocked.code === LOCKED_EXIT,
        JSON.stringify({
          opened: opened.field,
          refused: refused.field,
          probe: stillLocked.code,
        })
      );

      await field.fill(password);
      await submit.click();
      const answers = [
        `${hostname} is unlocked`,
        `No account is signed in on ${hostname}`,
        `${hostname} cannot read its logins`,
      ];
      await page.waitForFunction(
        (finals) =>
          Array.from(
            document.querySelectorAll('section.unlock [id$="-title"]')
          ).some((title) =>
            finals.includes(
              title.textContent?.replace(/\s+/g, " ").trim() ?? ""
            )
          ) || document.querySelector('section.unlock [role="alert"]') !== null,
        answers,
        { timeout: 60_000 }
      );
      await settle(page);
      const answered = await stepState(page, MACHINE);
      const readable = await probe();
      const infoAfter = await info();
      kit.note(
        `show-keychain-info after: exit ${infoAfter.code} ${infoAfter.err || infoAfter.out}`
      );
      kit.check(
        "the right password unlocks it: the agent's probe reads the item, and the step says the machine is past its keychain",
        readable.code === 0 &&
          answered.alert === null &&
          answered.titles.length === 1 &&
          (answered.titles[0] === answers[0] ||
            answered.titles[0] === answers[1]),
        JSON.stringify({ probe: readable.code, answered })
      );

      const after = await until(
        "the machine's auth past unreadable-credentials at the hub",
        machineRow,
        (row) => row !== undefined && row.auth !== "unreadable-credentials",
        30_000
      ).catch(() => machineRow());
      kit.check(
        "within 30s the hub's machine auth leaves unreadable-credentials",
        after !== undefined && after.auth !== "unreadable-credentials",
        JSON.stringify(after)
      );
      const cleared = await until(
        "the machine's menu without Unlock keychain…",
        async () => {
          const still = await menuOffersUnlock(page);
          await page.keyboard.press("Escape");
          return still;
        },
        (still) => !still,
        15_000
      ).then(
        () => true,
        () => false
      );
      kit.check(
        "the row clears: the machine's menu no longer offers Unlock keychain…",
        cleared,
        `auth ${after?.auth}`
      );
    } finally {
      if (made) {
        const deleted = await inScratch(
          home,
          ["delete-keychain", keychain],
          keychain
        );
        console.log(
          `  teardown: security delete-keychain (scratch) exited ${deleted.code}${deleted.err ? `: ${deleted.err}` : ""}`
        );
      }
      // The fleet's PIDs stop and its HOME, sandbox and runtime dir go when
      // the spec ends, failed or not (kit.ts `fleet`: `close` by PID, then
      // `clean`).
      const ownerAfter = await ownerSearchList();
      kit.check(
        "the real user's keychain search list is what it was before the run",
        ownerAfter === ownerBefore,
        JSON.stringify({ ownerBefore, ownerAfter })
      );
    }
  },
};

export default spec;
