/**
 * A move that ends a session's background work ends what that work runs in
 * its workspace, as the session is told it did (agent claude-carry.ts
 * `#stopForCarry`, hub account-carry.ts `endedByMoveWords`).
 *
 * 2026-11-04: a session moved to another account read "the move ended what
 * your old process was still running", while its background command ran on
 * in its workspace, re-parented to the sandbox's init, until the machine's
 * leak watch told it that it had left the command behind. The carry ended
 * Claude Code's process, whose end cuts off the command it ran in its
 * workspace's boundary: the runner sends TERM to that command's process
 * group (boundary/, the runner's `cancel`). That command was a `timeout`,
 * which runs in a group of its own (GNU timeout's `setpgid (0, 0)`, unless
 * `--foreground`), as a server started with `setsid` or a daemon's double
 * fork do, so the cut-off never reached it; only a stop of the session
 * ended that work (boundary/work.ts `endSessionWork`, by the session's name in
 * each process's environment).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) with two Claude accounts, R (the fleet's own, first in
 * placement) and W, each its own fake login and token, so the mock says
 * which account a request ran on. A delegate in a workspace starts on R; its
 * first turn starts `timeout 900 sleep 600.7373` in the background, a group
 * of its own as the probe kit's run was, and ends. Its next
 * request on R is refused 403 (an organization whose subscription access is
 * refused, `oauth_org_not_allowed`), which signs R out and moves the
 * delegate, stopped on its refused sign-in, to W, ending the work its
 * process holds for later (hub account-carry.ts `moveRowsToAccount`, `endLater`).
 *
 * - (a) Before the refusal, the background `sleep` runs. (A bare `sleep`, in
 *   its command's group, ended with the CLI's cut-off before the move's own
 *   ending looked: r421 read it gone and no agent line.)
 * - (b) The delegate moves to W.
 * - (c) Within {@link GONE_WAIT_MS} of its move the `sleep` is gone, and the
 *   agent's log says the move ended what it left running in its workspace,
 *   naming its pid.
 * - (d) Its first turn on W reads the hub's word that the move ended its
 *   background task, interrupted with its outcome unknown.
 *
 * Its delegate's commands run in a workspace boundary, so it runs on the host.
 *
 *   bun scripts/probe-kit/run.ts move-ends-tasks
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { DAY_MS, HOUR_MS } from "../../../packages/core/src/time";
import { workWords } from "../../../packages/core/src/words/work";
import {
  ACCOUNT,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The account the delegate moves to, beside the fleet's own (R). */
const W = "acct-move-ends-w";
const R_TOKEN = "sk-ant-oat01-fake-scratch-fleet";
const W_TOKEN = "sk-ant-oat01-fake-move-ends-w";
/** What opens the delegate's brief, so the mock knows its requests. */
const TAG = "PROBE-MOVE-ENDS";
/** The background command's `sleep` argument, and the description it runs under. */
const LEFTOVER = "600.7373";
/** What the `sleep` runs under: GNU timeout, which leads a process group of its own. */
const TIMEOUT = "timeout 900";
const DESCRIPTION = "Sleep in the background";
/** Anthropic's words for an organization whose subscription access is refused. */
const ORG_REFUSED =
  "OAuth authentication is currently not allowed for this organization.";
/** How soon after its move the delegate's background command is gone: the machine's SIGTERM, grace and SIGKILL (agent boundary/processes.ts `WORK_GRACE_MS`), and room. */
const GONE_WAIT_MS = 30_000;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const limitsNow = (): Reply["limits"] => ({
  fiveHour: { resetsAt: Date.now() + 3 * HOUR_MS, utilization: 0.1 },
  sevenDay: { resetsAt: Date.now() + 5 * DAY_MS, utilization: 0.1 },
});

/** How far the delegate is into its turn on R. */
let step = 0;
/** Holds its next request on R until the probe has seen its `sleep` run; then that request is refused. */
const refuse = Promise.withResolvers<void>();

const respond = async (request: Seen): Promise<Reply> => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!(request.all.includes(TAG) && request.auth.includes(R_TOKEN))) {
    return { everyMs: 5, words: ["ok"], limits: limitsNow() };
  }
  if (step === 0) {
    step = 1;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: `${TIMEOUT} sleep ${LEFTOVER}`,
          description: DESCRIPTION,
          run_in_background: true,
        },
      },
    };
  }
  if (step === 1 && request.afterTool) {
    step = 2;
    return { everyMs: 5, words: ["Started."], limits: limitsNow() };
  }
  await refuse.promise;
  return {
    everyMs: 5,
    words: [],
    deny: { status: 403, message: ORG_REFUSED },
  };
};

/** A store of `id` in the fleet's HOME: a fake login, `token` its credential. */
const furnish = async (
  home: string,
  id: string,
  token: string,
  n: string
): Promise<void> => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: token,
        refreshToken: `sk-ant-ort01-fake-move-ends-${n}`,
        expiresAt: Date.now() + 365 * DAY_MS,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(dir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: `${n}@scratch-fleet.test`,
        organizationName: `${n} Organization`,
        accountUuid: `00000000-0000-4000-8000-0000000000${n}1`,
        organizationUuid: `00000000-0000-4000-8000-0000000000${n}2`,
      },
    })
  );
};

/** A reading of `id` (one session window, 10% used), so a move may weigh it. */
const fileReading = (fleet: KitFleet, id: string): void => {
  fleet.write(
    "INSERT OR REPLACE INTO account_readings (account_id, subscription, window_kinds, last_seen_at) VALUES (?, 'Claude Max', '[\"session\"]', ?)",
    id,
    Date.now()
  );
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'session', '', 'session', 1, 10, 'normal', ?)",
    id,
    new Date(Date.now() + 3 * HOUR_MS).toISOString()
  );
};

const accountOfRow = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id;

/** The live pids of `sleep 600.7373`, and with `timeout`, of the `timeout` it runs under. */
const sleeping = async (timeout = false): Promise<number[]> =>
  (await commandLines())
    .filter(
      (line) =>
        line.command.startsWith(`sleep ${LEFTOVER}`) ||
        (timeout && line.command.startsWith(`${TIMEOUT} sleep ${LEFTOVER}`))
    )
    .map((line) => line.pid)
    .filter((pid) => isAlive(listedPid(pid)));

const spec: Spec = {
  group: "The hub and machines",
  name: "move-ends-tasks",
  host: "its delegate's commands run in a workspace boundary",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    try {
      const home = fleet.env.HOME as string;
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.write(
        "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', ?, 'green', 1, 0, ?)",
        W,
        W,
        Date.now()
      );
      const routed = await fetchHub(
        fetch,
        fleet.base,
        hubRequest("PUT /api/accounts/routing/:provider", {
          path: { provider: "anthropic" },
          body: {
            yours: { strategy: "fill-first" },
            delegates: { strategy: "fill-first" },
            atLimit: { move: true, waitMinutes: 15, moveWholeUnderK: 200 },
          },
        })
      );
      check(
        "setup: routing fills R first, then W",
        routed.ok,
        `${routed.status} ${await routed.text()}`
      );
      await furnish(home, W, W_TOKEN, "w");
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();
      await until(
        "W signed in",
        () =>
          fleet.query<{ state: string }>(
            "SELECT state FROM account_signins WHERE account_id = ? AND machine_id = ?",
            W,
            MACHINE
          )[0]?.state,
        (state) => state === "signed-in",
        120_000
      );
      for (const id of [ACCOUNT, W]) {
        fileReading(fleet, id);
      }

      await writeFile(
        join(home, ".gitconfig"),
        "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
      );
      const repo = join(fleet.sandbox, "code");
      await Bun.$`mkdir -p ${repo} && cd ${repo} && git init -q -b main && echo moved > README.md && git add -A && git commit -qm 'First commit'`
        .env({ ...process.env, HOME: home })
        .quiet();
      const project = await fleet.api<{ id: string }>(
        hubRequest("POST /api/projects", {
          body: {
            name: "Move ends tasks",
            machineId: MACHINE,
            cwd: repo,
          },
        })
      );
      const parent = await fleet.spawn("claude", "Parent", repo, {
        projectId: project.id,
      });
      const item = await fleet.api<{ instanceId: string; workItemId: string }>(
        hubRequest("POST /api/work-items", {
          body: {
            parentInstanceId: parent,
            title: "Sleep, then move",
            prompt: `${TAG}: start the sleep.`,
            harness: "claude",
            model: MODEL.claude,
            cwd: repo,
          },
        })
      );
      const delegate = item.instanceId;

      const before = await until(
        "the delegate's background sleep",
        sleeping,
        (pids) => pids.length > 0,
        300_000
      ).catch(() => []);
      check(
        "(a) the delegate's background `sleep` runs in its workspace, on R",
        before.length > 0 && accountOfRow(fleet, delegate) === ACCOUNT,
        `sleep ${LEFTOVER}: ${before.join(", ") || "none"}; account ${accountOfRow(fleet, delegate)}`
      );

      refuse.resolve();
      const movedTo = await until(
        "the delegate moved to W",
        () => accountOfRow(fleet, delegate),
        (account) => account === W,
        180_000
      ).catch(() => accountOfRow(fleet, delegate));
      const movedAt = Date.now();
      check(
        "(b) its next request on R refused (403, oauth_org_not_allowed), the delegate moves to W",
        movedTo === W,
        String(movedTo)
      );

      const after = await until(
        "the background sleep gone",
        sleeping,
        (pids) => pids.length === 0,
        GONE_WAIT_MS
      ).catch(() => sleeping());
      const said = workWords.workEnded(delegate, "moved", [], []);
      const line = (await fleet.logs("agent"))
        .split("\n")
        .find(
          (one) =>
            one.includes(said) && before.some((pid) => one.includes(`${pid}`))
        );
      check(
        "(c) once it moved the `sleep` is gone, and the agent's log says the move ended what the delegate left running in its workspace, naming its pid",
        after.length === 0 && line !== undefined,
        `${after.length === 0 ? `gone ${((Date.now() - movedAt) / 1000).toFixed(1)} s on` : `still running: ${after.join(", ")}`}; ${line ?? "no agent line naming it ended by the move"}`
      );

      const told = await until(
        "the delegate's first turn on W told what the move ended",
        () =>
          fleet.seen.find(
            (request) =>
              request.auth.includes(W_TOKEN) &&
              request.last.includes(workWords.interrupted) &&
              request.last.includes(DESCRIPTION)
          )?.last,
        Boolean,
        180_000
      ).catch(() => undefined);
      check(
        "(d) its first turn on W reads that the move ended its background task, interrupted with its outcome unknown",
        told !== undefined,
        told === undefined
          ? "no request on W carried it"
          : told.slice(
              Math.max(0, told.indexOf(workWords.interrupted) - 300),
              told.indexOf(workWords.interrupted) + 600
            )
      );
    } finally {
      refuse.resolve();
      for (const pid of await sleeping(true)) {
        signalPid(listedPid(pid), "SIGKILL");
      }
    }
  },
};

export default spec;
