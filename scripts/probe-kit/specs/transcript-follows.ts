/**
 * A transcript open in a tab follows its session through every relaunch,
 * with no reload: on a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model) with two Claude accounts of one organization,
 * in the built dashboard at the desk. The session's transcript is opened
 * once, then the session is, in order:
 *
 * 1. moved to the other account through the hub's own move route
 *    (`POST /api/instances/:id/account`);
 * 2. moved back the same way (its own account's dir again);
 * 3. stopped, then started again by the dashboard's revive (a resume);
 * 4. killed under its harness (a crash), which the hub relaunches.
 *
 * After each, a new turn is sent through the hub and its reply must appear in
 * the open pane, and the pane's rows (ids and words, in order) must be the
 * rows a fresh load of the same page draws.
 *
 *   bun scripts/probe-kit/run.ts transcript-follows
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import {
  ACCOUNT,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const OTHER = "acct-scratch-fleet-two";
const TAG = /PROBE-[A-Z0-9-]+/;

/** A turn's words name the prompt they answer, so each reply is findable. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  const asked = request.last.match(TAG)?.[0] ?? "nothing";
  return { everyMs: 20, words: ["Answer ", "to ", asked] };
};

interface Row {
  account_id: string | null;
  session_id: string | null;
  spawned_at: number | null;
  status: string;
}

/** The pane's rows, as drawn: each message's id and words, in order. */
const rowsOf = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-message]")].map(
      (node) =>
        `${node.dataset.message}: ${(node.innerText ?? "").replace(/\s+/g, " ").trim()}`
    )
  );

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  // The second account's login, beside the fleet's own: another person of
  // the same organization, so a move between them keeps the cache.
  const otherDir = join(fleet.home, ".cawco", "accounts", OTHER, "claude");
  await mkdir(otherDir, { recursive: true });
  await writeFile(
    join(otherDir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-fake-scratch-fleet-two",
        refreshToken: "sk-ant-ort01-fake-scratch-fleet-two",
        expiresAt: Date.now() + 365 * 24 * 60 * 60_000,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(otherDir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: "probe-two@scratch-fleet.test",
        organizationName: "Scratch Fleet",
        accountUuid: "00000000-0000-4000-8000-000000000003",
        organizationUuid: "00000000-0000-4000-8000-000000000002",
      },
    })
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe two', 'green', 1, 0, ?)",
    OTHER,
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "the second account signed in",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        OTHER
      )[0],
    (signin) => signin?.state === "signed-in",
    120_000
  );

  const id = await fleet.spawn("claude", "Followed");
  const row = () =>
    fleet.query<Row>(
      "SELECT account_id, session_id, spawned_at, status FROM instances WHERE id = ?",
      id
    )[0] as Row;
  const answered = (tag: string) =>
    until(
      `the hub's transcript answering ${tag}`,
      async () =>
        JSON.stringify(
          await fleet.api(`/api/instances/${id}/transcript?limit=50`)
        ),
      (read) => read.includes(`Answer to ${tag}`),
      120_000
    );
  await fleet.send(id, "PROBE-OPEN: say hello.");
  await answered("PROBE-OPEN");

  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("[cawco]")) {
      lines.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
    }
  });
  const url = `${base}/session/${id}`;
  await open(page, url, "[data-message]");
  await page.waitForFunction(
    () => document.body.innerText.includes("Answer to PROBE-OPEN"),
    null,
    { timeout: 30_000 }
  );

  /** A new turn reaches the open pane, and the pane is what a fresh load draws. */
  const follows = async (leg: string, tag: string) => {
    await fleet.send(id, `${tag}: answer me.`);
    await answered(tag);
    const shown = await page
      .waitForFunction(
        (words) => document.body.innerText.includes(words),
        `Answer to ${tag}`,
        { timeout: 30_000 }
      )
      .then(
        () => true,
        () => false
      );
    kit.check(
      `${leg}: the new turn's reply appears in the open pane, no reload`,
      shown,
      shown ? undefined : lines.slice(-12).join("\n")
    );
    // Its tail settles before the two are compared: the reply is whole.
    await page.waitForTimeout(1500);
    const held = await rowsOf(page);
    const fresh = await kit.page("desk");
    await open(fresh, url, "[data-message]");
    await fresh.waitForFunction(
      (words) => document.body.innerText.includes(words),
      `Answer to ${tag}`,
      { timeout: 30_000 }
    );
    await fresh.waitForTimeout(1500);
    const loaded = await rowsOf(fresh);
    await fresh.close();
    const same = JSON.stringify(held) === JSON.stringify(loaded);
    kit.check(
      `${leg}: the open pane's rows are a fresh load's`,
      same,
      same
        ? `${held.length} rows`
        : `open:\n${held.join("\n")}\nfresh:\n${loaded.join("\n")}`
    );
  };

  /** An in-app link to `path`, followed: the router's navigation, never a load. */
  const visit = async (path: string) => {
    await page.evaluate((href) => {
      const link = document.createElement("a");
      link.href = href;
      document.body.append(link);
      link.click();
      link.remove();
    }, path);
  };
  // The page this pane is drawn in: a reload anywhere below would drop it.
  await page.evaluate(() => {
    (window as unknown as { probeLoad: number }).probeLoad = 1;
  });
  const sameLoad = () =>
    page.evaluate(
      () => (window as unknown as { probeLoad?: number }).probeLoad === 1
    );

  // ── 0. its tab closed while it talks, then opened again ──────────────
  const other = await fleet.spawn("claude", "Elsewhere");
  await visit(`/session/${other}`);
  await page.waitForSelector('button[aria-label="Close Followed"]', {
    state: "attached",
    timeout: 30_000,
  });
  await page.click('button[aria-label="Close Followed"]', { force: true });
  await page.waitForSelector('button[aria-label="Close Followed"]', {
    state: "detached",
    timeout: 15_000,
  });
  // The socket goes while it is closed, as a hub restart or a dead link
  // takes it: the hub follows nothing for the socket that replaces it.
  await page.evaluate(() =>
    (
      globalThis as unknown as { __cawcoSocket: WebSocket }
    ).__cawcoSocket.close()
  );
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __cawcoSocket: WebSocket }).__cawcoSocket
        .readyState === WebSocket.OPEN,
    null,
    { timeout: 30_000 }
  );
  await fleet.send(id, "PROBE-AWAY: answer me.");
  await answered("PROBE-AWAY");
  await visit(`/session/${id}`);
  const back = await page
    .waitForFunction(
      () => document.body.innerText.includes("Answer to PROBE-AWAY"),
      null,
      { timeout: 30_000 }
    )
    .then(
      () => true,
      () => false
    );
  kit.check(
    "0 reopened: what it said while its tab was closed is in the pane",
    back,
    back ? undefined : lines.slice(-12).join("\n")
  );
  await follows("0 reopened", "PROBE-REOPENED");

  // ── 1. moved to the other account by the hub's move route ─────────────
  const first = row();
  const there = first.account_id === OTHER ? ACCOUNT : OTHER;
  const move = async (to: string) => {
    const before = row().spawned_at;
    const answer = await fleet.api<{ state: string }>(
      `/api/instances/${id}/account`,
      { accountId: to }
    );
    await until(
      `the session relaunched on ${to}`,
      row,
      (now) =>
        now.account_id === to &&
        now.status === "running" &&
        now.spawned_at !== before,
      120_000
    );
    return answer.state;
  };
  const moved = await move(there);
  kit.note(`moved ${first.account_id} → ${there}: ${moved}`);
  await follows("1 moved", "PROBE-MOVED");

  // ── 2. moved back ─────────────────────────────────────────────────────
  await move(first.account_id ?? ACCOUNT);
  await follows("2 moved back", "PROBE-BACK");

  // ── 3. stopped, then revived (a resume) ───────────────────────────────
  await fleet.stopSession(id);
  await until(
    "the session stopped",
    row,
    (now) => now.status !== "running",
    60_000
  );
  const stoppedAt = row().spawned_at;
  const { session_id: sessionKey } = row();
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
      permissionMode: "bypassPermissions",
      resume: { sessionKey },
    },
  });
  await until(
    "the session running again",
    row,
    (now) => now.status === "running" && now.spawned_at !== stoppedAt,
    120_000
  );
  await follows("3 stopped and resumed", "PROBE-RESUMED");

  // ── 4. its harness killed; the hub carries it on ──────────────────────
  const pid = await fleet.sessionPid(id);
  if (!kit.check("4: the session's harness has a pid", pid !== undefined)) {
    return;
  }
  const crashedAt = row().spawned_at;
  process.kill(pid as number, "SIGKILL");
  await until(
    "the session relaunched after the crash",
    row,
    (now) => now.spawned_at !== crashedAt,
    120_000
  ).catch(() => undefined);
  await follows("4 crashed and relaunched", "PROBE-CRASHED");

  // ── 5. continued in place: a fresh conversation under the same id ─────
  const conversation = row().session_id;
  await fleet.api(`/api/instances/${id}/continue`, {
    summarizer: { harness: "claude", model: MODEL.claude },
    target: { harness: "claude", model: MODEL.claude },
    inPlace: true,
  });
  await until(
    "the session going on in a fresh conversation",
    row,
    (now) => now.status === "running" && now.session_id !== conversation,
    240_000
  );
  await follows("5 continued in place", "PROBE-CONTINUED");
  kit.check("the page was never reloaded", await sameLoad());
};

export default { name: "transcript-follows", run } satisfies Spec;
