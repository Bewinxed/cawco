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
 * Why a scratch HOME is enough: the agent unlocks, and reads the lock state
 * of, `${homedir()}/Library/Keychains/login.keychain-db`
 * (agent/src/login-keychain.ts, `SecKeychainGetStatus`), and finds the
 * account's item with `security find-generic-password` (no `-w`) over the
 * user's search list (agent/src/accounts.ts `keychainHolds`). Both follow
 * HOME: Bun's `homedir()` reads it, and the Security framework expands the
 * user domain's `~/Library/Preferences/com.apple.security.plist` and
 * `~/Library/Keychains/login.keychain` with `getenv("HOME")`
 * (DLDBListCFPref.cpp `getPwInfo(kHomeDir)`,
 * github.com/apple-oss-distributions/Security, OSX/libsecurity_keychain/lib).
 * The spec reads the lock state with the agent's own `keychainLocked`.
 *
 * The owner's own keychains are named by one call only. Every `security`
 * call on the scratch keychain goes through {@link inScratch}, which runs it
 * with HOME set to the scratch HOME and refuses any path outside it or under
 * the real home's Library; the scratch HOME itself is refused if it is,
 * holds, or sits under the real home's Library. The real user's search list
 * is captured as exact paths before anything runs ({@link captureOwnerList}),
 * and read again right after the scratch list is set, before delete-keychain
 * and after it. If the scratch list wrote through to the real user's domain
 * (should cfprefsd key it by uid, not HOME), the list is restored at once
 * with `list-keychains -d user -s <the captured paths>`, the one call under
 * the real HOME that names a keychain, and {@link ownerSecurity} allows it
 * with exactly those paths and nothing else.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { platform, userInfo } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Page } from "playwright-core";
import { keychainLocked } from "../../../packages/agent/src/login-keychain";
import { ACCOUNT, MACHINE, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { open, settle } from "../kit";

const MACHINES_BUTTON = /^\d+ machines?/;
const UNLOCK_ITEM = /^Unlock keychain/;
const UNLOCK_BUTTON = /^Unlock$/;
/** agent/src/auth.ts, `security unlock-keychain` exiting errSecAuthFailed. */
const WRONG_PASSWORD = "That password did not unlock the keychain.";
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
 * Throws unless the keychain `path` that `what` names resolves inside the
 * scratch HOME `home` and outside every real home's Library.
 */
function refuseUnlessScratchPath(home: string, path: string, what: string) {
  const scratch = refuseUnlessScratch(home);
  const real = resolved(path);
  if (!within(real, scratch)) {
    throw new Error(
      `Refusing: ${what} names ${real}, outside the scratch HOME ${scratch}.`
    );
  }
  for (const owner of realHomes()) {
    if (within(real, join(owner, "Library"))) {
      throw new Error(
        `Refusing: ${what} names ${real}, under the real ${owner}/Library.`
      );
    }
  }
}

/**
 * Whether the scratch keychain is locked, by the agent's own primitive
 * (agent/src/login-keychain.ts: `SecKeychainGetStatus`, no secret, no UI).
 */
function scratchLocked(home: string, path: string): boolean {
  refuseUnlessScratchPath(home, path, "SecKeychainGetStatus");
  return keychainLocked(path);
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
  refuseUnlessScratchPath(home, path, `security ${args[0]}`);
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

const OWNER_READ = ["list-keychains", "-d", "user"] as const;
/** One line of `list-keychains`: a path in double quotes. */
const LISTED_PATH = /^\s*"(.+)"\s*$/;

/** `list-keychains` output as its exact paths; throws on any line it cannot read as one. */
function listedPaths(out: string): string[] {
  return out
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const path = LISTED_PATH.exec(line)?.[1];
      if (path === undefined) {
        throw new Error(
          `Refusing: a line of the real user's search list is not a quoted path, so it could not be restored exactly: ${JSON.stringify(line)}`
        );
      }
      return path;
    });
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((path, i) => path === b[i]);

/** The real user's search list, captured once; the one baseline a restore may name. */
let ownerBaseline: readonly string[] | null = null;

/**
 * The only `security` call under the real HOME, and it allows exactly two:
 * the read `list-keychains -d user`, which names no keychain, and the
 * restore `list-keychains -d user -s <the captured paths>`, in their
 * captured order and nothing else. Every other call is refused before it runs.
 */
async function ownerSecurity(args: readonly string[]): Promise<Said> {
  const read =
    args.length === OWNER_READ.length &&
    OWNER_READ.every((word, i) => args[i] === word);
  const restore =
    ownerBaseline !== null &&
    args.length === OWNER_READ.length + 1 + ownerBaseline.length &&
    OWNER_READ.every((word, i) => args[i] === word) &&
    args[OWNER_READ.length] === "-s" &&
    sameList(args.slice(OWNER_READ.length + 1), ownerBaseline);
  if (!(read || restore)) {
    throw new Error(
      "Refusing: under the real HOME only the search list's read and its restore to the captured paths may run."
    );
  }
  const child = Bun.spawn(["/usr/bin/security", ...args], {
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

/** The real user's search list now, as exact paths; throws when it cannot be read. */
async function readOwnerList(): Promise<string[]> {
  const said = await ownerSecurity(OWNER_READ);
  if (said.code !== 0) {
    throw new Error(
      `security list-keychains -d user (the real user's) exited ${said.code}: ${said.err}`
    );
  }
  return listedPaths(said.out);
}

/**
 * Captures the real user's search list before anything runs, and squares it
 * with that capture later: a list found moved is restored at once to the
 * captured paths, read again, and both are printed. Each move found is kept.
 */
async function captureOwnerList() {
  if (ownerBaseline !== null) {
    throw new Error(
      "Refusing: the real user's search list is captured once per run."
    );
  }
  const baseline = Object.freeze(await readOwnerList());
  ownerBaseline = baseline;
  const moves: string[] = [];
  return {
    baseline,
    moves,
    read: readOwnerList,
    /** Restores the captured list if it moved; the move's account, or undefined when it had not. */
    squareUp: async (when: string): Promise<string | undefined> => {
      const found = await readOwnerList();
      if (sameList(found, baseline)) {
        return;
      }
      const restored = await ownerSecurity([...OWNER_READ, "-s", ...baseline]);
      const now = await readOwnerList();
      const account = `${when}: the real user's search list had moved. Captured: ${JSON.stringify(baseline)}. Found: ${JSON.stringify(found)}. Restore exited ${restored.code}${restored.err ? ` (${restored.err})` : ""}. Read again: ${JSON.stringify(now)}${sameList(now, baseline) ? ", as captured" : ", STILL NOT AS CAPTURED"}.`;
      console.log(`  ${account}`);
      moves.push(account);
      return account;
    },
  };
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
    // Before anything runs: a list that cannot be read exactly cannot be
    // restored, so the run stops here.
    const owner = await captureOwnerList();
    kit.note(
      `the real user's search list, captured: ${JSON.stringify(owner.baseline)}`
    );

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
    /** The agent's item read (no `-w`), naming the scratch keychain: 0 when the item is there, locked or not. */
    const holds = () =>
      inScratch(
        home,
        ["find-generic-password", "-a", user, "-s", service, keychain],
        keychain
      );
    /** The agent's lock read on the scratch keychain. */
    const lockedNow = () => scratchLocked(home, keychain);
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
      // If the scratch HOME's list wrote through to the real user's (should
      // cfprefsd key the user domain by uid, not HOME), it is restored now
      // and the run stops.
      const movedMid = await owner.squareUp(
        "after the scratch HOME's search list was set"
      );
      if (movedMid) {
        throw new Error(`Stopped: ${movedMid}`);
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
      const held = await holds();
      const lockedAtStart = lockedNow();
      const infoBefore = await info();
      kit.note(
        `scratch keychain ${keychain}: set-keychain-settings exit ${settings.code}, list-keychains -s exit ${listed.code}, add-generic-password exit ${added.code}, lock-keychain exit ${locked.code}; H's search list: ${searchList.out}; show-keychain-info before: exit ${infoBefore.code} ${infoBefore.err || infoBefore.out}`
      );
      kit.check(
        "the throwaway keychain is the scratch HOME's only one, holds the account's item (read without -w exits 0) and is locked (SecKeychainGetStatus)",
        settings.code === 0 &&
          listed.code === 0 &&
          added.code === 0 &&
          locked.code === 0 &&
          searchList.out.includes(keychain) &&
          searchList.out.split("\n").length === 1 &&
          held.code === 0 &&
          lockedAtStart,
        JSON.stringify({
          settings,
          listed,
          added,
          locked,
          searchList,
          held: held.code,
          lockedByStatus: lockedAtStart,
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
      const stillLocked = lockedNow();
      kit.check(
        "after the refusal the field keeps its place, marked invalid, and the keychain stays locked",
        refused.field !== null &&
          opened.field !== null &&
          refused.field.top === opened.field.top &&
          refused.field.left === opened.field.left &&
          refused.field.invalid === "true" &&
          stillLocked,
        JSON.stringify({
          opened: opened.field,
          refused: refused.field,
          locked: stillLocked,
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
      const lockedAfter = lockedNow();
      const infoAfter = await info();
      kit.note(
        `show-keychain-info after: exit ${infoAfter.code} ${infoAfter.err || infoAfter.out}`
      );
      kit.check(
        "the right password unlocks it: SecKeychainGetStatus reads it unlocked, and the step says the machine is past its keychain",
        !lockedAfter &&
          answered.alert === null &&
          answered.titles.length === 1 &&
          (answered.titles[0] === answers[0] ||
            answered.titles[0] === answers[1]),
        JSON.stringify({ locked: lockedAfter, answered })
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
      await tearDown(kit, owner, made ? { home, keychain } : null);
    }
  },
};

/**
 * Teardown, on failure too: the real user's list squared with its capture
 * before the scratch keychain goes, so it never points at a deleted keychain,
 * and again after, since deleting edits a search list too; then the checks
 * that it never moved and ends as captured. The fleet's PIDs stop and its
 * HOME, sandbox and runtime dir go after the spec (kit.ts `fleet`: `close` by
 * PID, then `clean`).
 */
async function tearDown(
  kit: Kit,
  owner: Awaited<ReturnType<typeof captureOwnerList>>,
  made: { home: string; keychain: string } | null
): Promise<void> {
  const squared = async (when: string) => {
    try {
      await owner.squareUp(when);
    } catch (error) {
      kit.check(
        `the real user's search list could be squared ${when}`,
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  };
  await squared("before delete-keychain");
  if (made) {
    const deleted = await inScratch(
      made.home,
      ["delete-keychain", made.keychain],
      made.keychain
    );
    console.log(
      `  teardown: security delete-keychain (scratch) exited ${deleted.code}${deleted.err ? `: ${deleted.err}` : ""}`
    );
  }
  await squared("after delete-keychain");
  kit.check(
    "the real user's keychain search list never moved during the run",
    owner.moves.length === 0,
    owner.moves.join(" | ") || JSON.stringify(owner.baseline)
  );
  const ending = await owner.read().catch((error: unknown) => error);
  kit.check(
    "the real user's keychain search list ends exactly as captured",
    Array.isArray(ending) && sameList(ending, owner.baseline),
    JSON.stringify({ captured: owner.baseline, now: ending })
  );
}

export default spec;
