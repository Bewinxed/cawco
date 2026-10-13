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

/**
 * One session's pane rows, as drawn: each message's id and words, in order.
 * Its pane alone: another open session's pane is mounted beside it.
 */
const rowsOf = (page: Page, sessionId: string) =>
  page.evaluate(
    (pane) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `[data-pane="${pane}"] [data-message]`
        ),
      ].map(
        (node) =>
          `${node.dataset.message}: ${(node.innerText ?? "").replace(/\s+/g, " ").trim()}`
      ),
    sessionId
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

  // In a project, so the sidebar lists its sessions (rows with hover cards).
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Follows",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const inProject = { projectId: project.id };
  const id = await fleet.spawn("claude", "Followed", fleet.repo, inProject);
  const row = () =>
    fleet.query<Row>(
      "SELECT account_id, session_id, spawned_at, status FROM instances WHERE id = ?",
      id
    )[0] as Row;
  const answered = (tag: string, of = id) =>
    until(
      `the hub's transcript answering ${tag}`,
      async () =>
        JSON.stringify(
          await fleet.api(`/api/instances/${of}/transcript?limit=50`)
        ),
      (read) => read.includes(`Answer to ${tag}`),
      120_000
    );
  await fleet.send(id, "PROBE-OPEN: say hello.");
  await answered("PROBE-OPEN");

  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  /** Every session event the hub sent the page's dashboard socket: whose, and when. */
  const heard: { at: number; sessionId: string }[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/dashboard")) {
      return;
    }
    socket.on("framereceived", ({ payload }) => {
      let message: {
        events?: { sessionId?: string }[];
        event?: { sessionId?: string };
        type?: string;
      };
      try {
        message = JSON.parse(String(payload));
      } catch {
        return;
      }
      const events = [
        ...(message.type === "stream.event" ? [message.event] : []),
        ...(message.type === "stream.backlog" ? (message.events ?? []) : []),
      ];
      for (const event of events) {
        heard.push({ at: Date.now(), sessionId: event?.sessionId ?? "" });
      }
    });
  });
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("[cawco]") || message.type() === "error") {
      lines.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    lines.push(
      `${new Date().toISOString().slice(11, 23)} pageerror ${error.message} ${error.stack?.split("\n").slice(1, 4).join(" | ") ?? ""}`
    );
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
    const held = await rowsOf(page, id);
    const fresh = await kit.page("desk");
    await open(fresh, url, "[data-message]");
    await fresh.waitForFunction(
      (words) => document.body.innerText.includes(words),
      `Answer to ${tag}`,
      { timeout: 30_000 }
    );
    await fresh.waitForTimeout(1500);
    const loaded = await rowsOf(fresh, id);
    await fresh.close();
    const same =
      held.length > 0 && JSON.stringify(held) === JSON.stringify(loaded);
    kit.check(
      `${leg}: the open pane's rows are a fresh load's`,
      same,
      same
        ? `${held.length} rows`
        : `open:\n${held.join("\n")}\nfresh:\n${loaded.join("\n")}\nthe client's last lines:\n${lines.slice(-40).join("\n")}`
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

  /** What the page shows `words` within the wait: whether it did. */
  const shows = (words: string) =>
    page
      .waitForFunction(
        (want) => document.body.innerText.includes(want),
        words,
        {
          timeout: 30_000,
        }
      )
      .then(
        () => true,
        () => false
      );
  /** A tab's close X, by the session's title (the tab's name opens with it). */
  const tabClose = (title: string) =>
    `.session-tabs .tab:has([role="tab"][aria-label^="${title},"]) .tclose`;
  const CLOSE_FOLLOWED = tabClose("Followed");
  const closeFollowed = async () => {
    await page.waitForSelector(CLOSE_FOLLOWED, {
      state: "attached",
      timeout: 30_000,
    });
    await page.click(CLOSE_FOLLOWED, { force: true });
    await page.waitForSelector(CLOSE_FOLLOWED, {
      state: "detached",
      timeout: 15_000,
    });
  };

  // ── 0. its tab closed while it talks, then opened again ──────────────
  // Two sessions open on the one socket, the other in its own tab.
  const other = await fleet.spawn("claude", "Elsewhere", fleet.repo, inProject);
  await visit(`/session/${other}`);
  await page.waitForSelector(tabClose("Elsewhere"), {
    state: "attached",
    timeout: 30_000,
  });
  // Two things on the socket show it: its tab, and its row's hover card in
  // the sidebar. The tab closes under the card, the pointer kept on the row.
  await page.locator(`[data-hover-session="${id}"]`).first().hover();
  await page.waitForTimeout(1500);
  await page.$eval(CLOSE_FOLLOWED, (button) =>
    (button as HTMLButtonElement).click()
  );
  await page.waitForSelector(CLOSE_FOLLOWED, {
    state: "detached",
    timeout: 15_000,
  });
  await page.waitForTimeout(1000);
  const heldFrom = Date.now();
  await fleet.send(id, "PROBE-CARD: answer me.");
  await answered("PROBE-CARD");
  await page.waitForTimeout(1500);
  const underCard = heard.filter(
    (one) => one.at >= heldFrom && one.sessionId === id
  ).length;
  kit.check(
    "0 still shown: its tab closed under its hover card, the hub still sends its events",
    underCard > 0,
    `${underCard} of its events`
  );
  // The card goes (released 2 s after the pointer leaves): nothing shows it.
  await page.mouse.move(900, 450);
  await page.waitForTimeout(3500);
  const quietFrom = Date.now();
  await fleet.send(id, "PROBE-QUIET: answer me.");
  await fleet.send(other, "PROBE-ELSEWHERE: answer me.");
  await answered("PROBE-QUIET");
  await answered("PROBE-ELSEWHERE", other);
  await page.waitForTimeout(1500);
  const quiet = heard.filter((one) => one.at >= quietFrom);
  const ofLetGo = quiet.filter((one) => one.sessionId === id).length;
  const ofOther = quiet.filter((one) => one.sessionId === other).length;
  kit.check(
    "0 let go: the hub sends the socket none of its events, and the session still open on it streams",
    ofLetGo === 0 && ofOther > 0,
    `${ofLetGo} of the let-go session's events, ${ofOther} of the open one's`
  );
  // Followed again on the same socket.
  await visit(`/session/${id}`);
  const caught = await shows("Answer to PROBE-QUIET");
  kit.check(
    "0 followed again: what it said while let go is in the pane",
    caught,
    caught ? undefined : lines.slice(-12).join("\n")
  );
  await follows("0 followed again", "PROBE-AGAIN");

  // Let go again, and the socket goes while it is: a hub restart or a dead
  // link, so the hub follows nothing for the socket that replaces it.
  await visit(`/session/${other}`);
  await closeFollowed();
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
  const back = await shows("Answer to PROBE-AWAY");
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
      cwd: fleet.repo,
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
