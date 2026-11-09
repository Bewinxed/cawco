/**
 * Hub-owned landing: once a work item finishes, the hub, not the delegate,
 * puts the workspace's commits on the base branch. Before this, a line in
 * the brief asked the delegate to fetch, rebase and push, so "done" never
 * meant the work was on the base branch
 * (`.design-foundations/plans/2026-10-06-projects.md`, P0).
 *
 * The landing gate runs on HEAD's tree, so the working tree must equal HEAD
 * before anything is pushed: uncommitted changes, new files included
 * (ignored ones are not), go back to the delegate rather than leaving the
 * branch without them.
 *
 * An item gates before it takes a turn: fetch, rebase onto the branch as it
 * is now (a conflict is undone and goes back to the delegate), the rebase
 * made off the workspace's working tree, which then moves to it once and is
 * written nowhere else ({@link landedRebase}: watchers there, a preview's
 * dev server among them, never see a tree between the two), check that
 * this machine may push there ({@link pushCheck}: refused, the landing ends
 * in git's words with no step run), and run the landing gate on that tree
 * (the steps its project declares in gate.md: gate-file.ts, gate.ts
 * `gateSteps`), outside the queue, each step waiting there for whatever
 * machine slot or pause it needs. No session writes it. Only a gated item
 * joins the queue. The item's stop cancels whatever command of it runs, its
 * gate's steps on every machine included, and the landing ends `stopped`.
 *
 * One landing at a time per repository and branch, and a turn never waits:
 * fetch, rebase onto the branch again, run again only the commands whose
 * inputs the rebase changed, push, and, while someone keeps pushing in
 * between, the same again, three tries in all. A fetch, push check or push
 * the remote fails on its own fault, a 5xx or a dropped connection, is tried
 * again as it is, a few times with backoff ({@link triedOnFault}); one
 * refused for a reason is not. A command due in the turn that
 * would wait for a machine slot or a pause, or run on another machine (a
 * step that `needs:` one), does not: the item steps out of the turn (`busy`), gates
 * again on the newer branch, and queues again, so the next ready item lands
 * (2026-10-16: an item that had passed sat 13 minutes behind one waiting for
 * the Mac's one build slot). Nothing ahead of the branch counts as landed,
 * so running this again after a hub restart is safe.
 *
 * Every tree pushed is gated on top of the branch it lands on: the turn's
 * own rebase is the last, and the steps the turn asks for (`check(true)`)
 * pass on that tree or on the inputs each reads there. The gate is asked on
 * every landing, rebased or not: a clean rebase can still break lint or
 * typecheck (23da40303 sorted boundary.ts's imports, and ded95f4d2 formatted
 * SessionHover's, after rebases had landed them unlinted on main), and a wire
 * change can break the iOS app (312b43065). One command runs at most once on
 * one set of inputs: the caller skips a command that already passed on the
 * tree about to be pushed, or, for a step that declares the paths it reads
 * (`on:`), on the same trees of those paths (gate.ts `gateOnce`), and
 * runs every other.
 *
 * A work item that lands `branch` or `pr` goes to a branch of its own
 * instead ({@link pushBranch}): HEAD where it is, replacing only the commit
 * the hub itself last pushed there; for `pr` the hub then has the workspace's
 * machine open the pull or merge request through its origin's forge adapter
 * (landing-run.ts `pullRequestFor`, agent forges/).
 *
 * Every commit either landing puts on origin carries one `Agent-Logs-Url`
 * trailer, the link to the session that made it at the moment it was made
 * ({@link LandingDeps.logsUrl}, {@link stampCommand}): the key GitHub's Copilot coding agent writes ("the
 * agent's commits link back to the agent session logs by including an
 * `Agent-Logs-Url` trailer in the commit message",
 * github.blog/changelog/2026-03-20-trace-any-copilot-coding-agent-commit-to-its-session-logs).
 * The hub stamps it in the rebase it runs anyway, so it holds for every
 * harness alike and for commits no hook sees (`--no-verify`, a cherry-pick,
 * a rebase the session ran, a repository whose `core.hooksPath` is its own).
 */

import type { CommandResult } from "@cawco/core/commands/controls";
import { detach } from "@cawco/core/detach";
import type { RunsOnCapability } from "@cawco/core/project-gate";
import { shellQuote } from "@cawco/core/shell-quote";
import { CommandStopped, WouldWait } from "./machine-pause";

/**
 * Why git turned a landing down: the step it was on, the end of what git
 * said, and `cause` when the state after it names one, never git's words.
 * `race` is a push that was still behind the branch after every try, the
 * branch on origin having moved on from what each push was rebased onto (or,
 * read after it; `taken`, a branch of the item's own that someone other than
 * the hub moved, so the hub left it (its detail names both commits); `cut-off`, a
 * push the workspace's boundary stopped before it answered ({@link CUT_OFF}),
 * the branch read once after it and not holding the commit. Any other
 * refusal (the remote turning the login down among them) is git's words alone.
 */
export interface Refusal {
  cause?: "race" | "taken" | "cut-off";
  detail: string;
  kind: "refused";
  /**
   * `push check`: the dry run of the push before the landing gate ran a
   * step ({@link pushCheck}), its detail git's whole output.
   */
  step: "read" | "fetch" | "rebase" | "push check" | "push";
  /** The pushes made, for a `race`. */
  tries?: number;
}

/**
 * A landing whose item was stopped before it pushed
 * ({@link LandingDeps.stopped}), or while a command of it ran (machine-pause.ts
 * `CommandStopped`: the stop cancelled it on its machine): nothing went
 * anywhere.
 */
interface Stopped {
  kind: "stopped";
}

/**
 * What a landing came to. `F` is how the caller describes a failed gate. A
 * landing put `onto..sha` on the branch: `onto` the branch's commit its
 * commits were rebased onto.
 */
export type LandingOutcome<F> =
  | { kind: "landed"; sha: string; onto: string; rebased: boolean }
  | { kind: "nothing" }
  | { kind: "no-remote" }
  | Stopped
  | { kind: "dirty"; files: string }
  | { kind: "conflict"; files: string }
  | Failed<F>
  | Refusal;

/** The landing gate, failed on the rebased tree. */
export interface Failed<F> {
  failing: F;
  kind: "gate-failed";
}

/**
 * A turn the item stepped out of: a command due there would have waited
 * (`words`, {@link WouldWait}'s), so it gates again.
 */
interface Busy {
  kind: "busy";
  words: string;
}

export interface LandingDeps<F> {
  /**
   * The landing gate on the tree the workspace holds now (rebased onto the
   * branch), each step skipped that
   * passed, or one covering it did, on its inputs as they are there:
   * undefined when all pass. `inTurn` false is the gate before the queue,
   * where a command waits for what it needs; true is the landing turn, where
   * a command that would wait for a machine slot or a pause, or run on
   * another machine, throws {@link WouldWait} instead of running.
   */
  check: (inTurn: boolean) => Promise<Failed<F> | undefined>;
  /**
   * The link to the session whose commits these are (its dashboard page),
   * stamped on each as its `Agent-Logs-Url` trailer ({@link stampCommand}).
   */
  logsUrl: string;
  /**
   * The landing stepped out of its turn to gate again: the words of what a
   * command due there would have waited for.
   */
  onStepOut?: (words: string) => void;
  /**
   * Serialises landings that share a key: the repository's root commit and
   * the branch ({@link ready}).
   */
  queue: LandingQueue;
  /**
   * Runs a shell command in the workspace's checkout; `noWait`, in the turn,
   * throws {@link WouldWait} rather than wait for its machine's pause or a
   * slot (machine-pause.ts `noWait`). The item's stop cancels a command
   * running then (machine-pause.ts `CommandStopped`), all but the push
   * (`lands`): one the remote may have taken already runs to its end, and
   * the branch says whether it landed. `moves`, the commit a command moves
   * the worktree to (a landing's move to its rebased commit, {@link landedRebase}): its machine runs it
   * on its host, the sandbox down, when it writes a path the boundary keeps
   * from every command (machine-pause.ts `CommandOptions.moves`).
   */
  run: (
    cmd: string,
    timeoutMs: number,
    noWait?: boolean,
    lands?: boolean,
    moves?: string
  ) => Promise<CommandResult>;
  /**
   * Paths the uncommitted-work check passes over: the item's outputs, which
   * the hub collects rather than lands, committed or not.
   */
  skip?: string[];
  /**
   * Whether the item this lands was stopped since the landing began: asked
   * before each turn and right before each push, so a stop ends a landing
   * that queued or gated before it ({@link Stopped}). Before 2026-10-17 a
   * landing stopped while queued still pushed when its turn came.
   */
  stopped?: () => boolean;
  /** This landing in the queue: how others name it, and how it hears its wait. */
  turn?: LandingTurn;
}

/**
 * One landing in a {@link LandingQueue}: how a landing queued behind it names
 * it, and how it hears its own wait for its turn.
 */
export interface LandingTurn {
  /** Each change of its wait: the words while it waits its turn, null once it runs. */
  onWait?: (words: string | null) => void;
  /** The landing as a waiter's words name it: `“Fix the tray” (153fd0db)`. */
  who: string;
}

export type LandingQueue = <T>(
  key: string,
  run: () => Promise<T>,
  turn?: LandingTurn
) => Promise<T>;

/**
 * What a landing waiting its turn says: the branch, the landing running now,
 * and how many more are ahead of it.
 */
const turnWords = (branch: string, ahead: LandingTurn[]): string =>
  `queued to land on ${branch} behind ${ahead[0]?.who ?? "another landing"}${ahead.length > 1 ? ` and ${ahead.length - 1} more` : ""}`;

/**
 * One chain of landings per key; a failed landing never blocks the next. A
 * landing that waits its turn says so, naming the one running and how many
 * more are ahead (`turn.onWait`), each time that changes (2026-10-15: items
 * sat for half an hour with nothing to say what held them). A
 * turn waits for nothing ({@link land}): it is a fetch, a rebase, the
 * commands whose inputs that rebase changed, and a push.
 */
export function landingQueue(): LandingQueue {
  const tails = new Map<string, Promise<void>>();
  /** Per key: the landing running now and those waiting behind it, in order. */
  const lines = new Map<
    string,
    { running: LandingTurn | undefined; waiting: LandingTurn[] }
  >();
  /** Tells each waiting landing of `key` who is ahead of it now. */
  const sayWaits = (key: string): void => {
    const line = lines.get(key);
    if (!line) {
      return;
    }
    const branch = key.slice(key.lastIndexOf("#") + 1);
    const ahead = line.running ? [line.running] : [];
    for (const turn of line.waiting) {
      turn.onWait?.(turnWords(branch, ahead));
      ahead.push(turn);
    }
  };
  return <T>(
    key: string,
    run: () => Promise<T>,
    turn: LandingTurn = { who: "another landing" }
  ): Promise<T> => {
    const line = lines.get(key) ?? { running: undefined, waiting: [] };
    lines.set(key, line);
    const queued = line.running !== undefined || line.waiting.length > 0;
    line.waiting.push(turn);
    if (queued) {
      sayWaits(key);
    }
    const result = (tails.get(key) ?? Promise.resolve()).then(async () => {
      line.waiting = line.waiting.filter((each) => each !== turn);
      line.running = turn;
      if (queued) {
        turn.onWait?.(null);
      }
      sayWaits(key);
      try {
        return await run();
      } finally {
        line.running = undefined;
      }
    });
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    tails.set(key, tail);
    // Cleanup only; the caller awaits `result`.
    detach(
      tail.then(() => {
        if (tails.get(key) === tail) {
          tails.delete(key);
          lines.delete(key);
        }
      }),
      "landing queue"
    );
    return result;
  };
}

/** Git that talks to the remote may wait on the network. */
const NETWORK_MS = 300_000;
const LOCAL_MS = 60_000;
/**
 * A command the workspace's boundary cut off: its sandbox stopped while it
 * ran (agent boundary.ts, the executor's "cut off" line). A push cut off
 * there is not tried again: the branch is read once ({@link holds}), and the
 * landing is landed when it holds the commit and refused, saying so, when it
 * does not.
 */
const CUT_OFF = 137;
const CONFLICT_MARK = "cawco-conflict";
/**
 * Tries when someone else pushes between our fetch and our push. Each try
 * after the first rebases onto the newer branch and runs the steps whose
 * inputs moved again, so the window is theirs: a busy branch can win it twice.
 */
const ATTEMPTS = 3;

/**
 * The waits before each push or fetch tried again after the remote failed
 * it on its own fault ({@link remoteFault}): three more tries, 5 s, 15 s and
 * 45 s apart. On 2026-11-04, between about 12:40 and 13:20, three landings were
 * refused `[remote rejected] (Internal Server Error)` and one `(failure)`,
 * GitHub's own report-status for the ref (`ng <ref> <reason>`, git
 * send-pack.c `receive_status`), while its status page said all was
 * operational; each landed on its next try with nothing changed.
 */
const FAULT_WAITS_MS = [5000, 15_000, 45_000] as const;

/**
 * Why a remote turns a ref down on its own fault, as git prints the reason
 * the remote gave (transport.c `print_ref_status`: `[remote rejected]
 * (<reason>)`, and git's own `[remote failure] (remote failed to report
 * status)` when it never answered for the ref), or as git says the
 * connection failed: a 5xx (remote-curl.c "RPC failed; HTTP <code>", curl's
 * "The requested URL returned error: <code>") or a connection that dropped.
 */
const FAULT_WORDS =
  /\((?:internal server error|failure|service unavailable|bad gateway|gateway time-?out)\)|remote failed to report status|\bHTTP 5\d\d\b|returned error: 5\d\d\b|the remote end hung up unexpectedly|unexpected disconnect while reading sideband packet|early EOF|connection reset by peer|empty reply from server|was not closed cleanly|recv failure/iu;
/**
 * A refusal that has a reason: git's own (`[rejected] (non-fast-forward)`,
 * `(fetch first)`, `(stale info)`), or the remote's words on why
 * (`remote: error: GH006: Protected branch update failed`, a hook's
 * `remote: fatal: …`), whatever else git said after it.
 */
const REASONED_REFUSAL = /\[rejected\]|^remote: (?:error|fatal):/imu;

/**
 * Whether a push or fetch that failed did so on the remote's own fault
 * ({@link FAULT_WORDS}) and never for a reason ({@link REASONED_REFUSAL}):
 * only such a one is tried again. Read from git's words, as nothing else says it: a
 * 5xx and a non-fast-forward both exit 1. Through a workspace's git door the
 * host's git's ref line is the reason the door gives (agent hub-git.ts
 * `pushAnswers`), so `[remote rejected] HEAD -> main ([remote rejected]
 * (Internal Server Error))` reads the same as git's own.
 */
const remoteFault = (result: CommandResult): boolean => {
  const said = `${result.stderr}\n${result.stdout}`;
  return !REASONED_REFUSAL.test(said) && FAULT_WORDS.test(said);
};

/**
 * A push or fetch, tried again while the remote fails it on its own fault
 * ({@link remoteFault}) and the landing is not stopped, after each wait of
 * {@link FAULT_WAITS_MS}, each try logged. `settled` is whether one that
 * answered needs no other: a fetch that answered 0; a push that it landed (0, or the branch holds the commit
 * when read after it: a 5xx can come after the remote took the ref), or its
 * boundary cut it off ({@link CUT_OFF}), which is read once and never tried
 * again. Answers the last push; a push that failed every time is refused in
 * its words, as one try is.
 */
async function triedOnFault(
  what: string,
  push: () => Promise<CommandResult>,
  settled: (pushed: CommandResult) => Promise<boolean>,
  stopped?: () => boolean
): Promise<CommandResult> {
  for (let n = 1; ; n += 1) {
    const pushed = await push();
    const wait = FAULT_WAITS_MS[n - 1];
    if (
      (await settled(pushed)) ||
      wait === undefined ||
      !remoteFault(pushed) ||
      stopped?.()
    ) {
      return pushed;
    }
    console.warn(
      `[landing] ${what}: try ${n} of ${FAULT_WAITS_MS.length + 1} failed on the remote's own fault, trying again in ${wait / 1000} s: ${detailOf(pushed).replaceAll("\n", " | ")}`
    );
    await Bun.sleep(wait);
  }
}

/**
 * `git fetch origin <base>`, tried again on the remote's own fault
 * ({@link triedOnFault}): every fetch of a landing, and of a branch push.
 */
const fetchBase = (
  run: (cmd: string, timeoutMs: number) => Promise<CommandResult>,
  base: string,
  stopped?: () => boolean
): Promise<CommandResult> =>
  triedOnFault(
    `the fetch of ${base}`,
    () => run(`git fetch origin ${shellQuote(base)}`, NETWORK_MS),
    async (fetched) => fetched.exitCode === 0,
    stopped
  );

/** A command git refused at `step`, in its words. */
const refusal = (step: Refusal["step"], result: CommandResult): Refusal => ({
  kind: "refused",
  step,
  detail: detailOf(result),
});

/** The end of a failed command, as one paragraph a person can read. */
const detailOf = (result: CommandResult): string =>
  (result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`)
    .split("\n")
    .slice(-12)
    .join("\n");

/**
 * The command that lists uncommitted work, passing over `skip`: an output
 * need not be committed, so it never counts as work left behind.
 */
export const statusCommand = (skip: string[] = []): string =>
  skip.length === 0
    ? "git status --porcelain"
    : `git status --porcelain -- . ${skip.map((path) => shellQuote(`:(exclude,literal)${path}`)).join(" ")}`;

/** The trailer that links a landed commit to the session that made it. */
const LOGS_TRAILER = "Agent-Logs-Url";

/**
 * The shell `git rebase --exec` runs after each commit it makes: HEAD's
 * message through `git interpret-trailers --if-exists replace` with
 * `Agent-Logs-Url: <url>?at=<HEAD's author date>`, its session's link at the
 * moment the commit was made, and HEAD amended only when that changed it.
 * The date is git's strict ISO 8601 (`%aI`) with its `+` written `%2B`, as
 * a query string reads `+` as a space; the dashboard opens the session at
 * the first record stored at or after it (open-at.svelte.ts `rowAt`). So a
 * commit without the trailer gains one; one carrying another link has it
 * replaced; one already carrying this link as its last is left as it is,
 * the same commit, since neither a rebase nor an amend changes the author
 * date (`git help rebase`: only `--ignore-date` does), so stamping again (a
 * later gate's rebase, a second landing) adds nothing and moves nothing.
 * Every other trailer stays where it was. The amend is the commit's message
 * alone: author, tree and parents kept.
 */
const stampCommand = (url: string): string =>
  `m=$(git log -1 --format=%B) && t=$(git log -1 --format=%aI | sed 's/+/%2B/') && s=$(printf '%s\\n' "$m" | git interpret-trailers --if-exists replace --trailer ${shellQuote(`${LOGS_TRAILER}: ${url}?at=`)}"$t") && { test "$m" = "$s" || printf '%s\\n' "$s" | git commit --amend --no-verify --allow-empty --cleanup=whitespace --quiet --file=-; }`;

/**
 * What a landing's report names as its commits (landing-run.ts
 * `reportedChanges`): the commits its workspace held that its base did not,
 * as the range `from..to`. Landed on the base (`landed.onto` set), they are
 * what the landing put there: from the commit it rebased onto to the one it
 * pushed, every commit the workspace held among them, its session's own and
 * those its clone was cut with (a workspace cut `from` another holds that
 * one's). A push to a branch of its own ends at the commit it pushed; one
 * refused, or an item that lands none, at HEAD; both start at `base`,
 * origin's branch as last fetched, so they name what a landing on it would
 * put there.
 *
 * Not who made them: the session's HEAD reflog names neither the commits a
 * clone was cut with, nor the landing's own rewrite of the session's, which
 * runs in a worktree of its own whose reflog goes with it
 * ({@link stampedRebase}).
 */
export const reportedRange = (
  base: string,
  landed?: { onto: string | null; sha: string }
): { from: string; to: string } => ({
  from: landed?.onto ?? base,
  to: landed?.sha ?? "HEAD",
});

/** The commits of {@link reportedRange}'s `range`, one `git log --oneline` line each, newest first. */
export const reportedCommits = (range: { from: string; to: string }): string =>
  `git log --oneline ${shellQuote(`${range.from}..${range.to}`)}`;

/** The diffstat of {@link reportedRange}'s `range`, from where `to` left `from` (`...`), its last `lines` lines. */
export const reportedDiffstat = (
  range: { from: string; to: string },
  lines: number
): string =>
  `git diff --stat ${shellQuote(`${range.from}...${range.to}`)} | tail -n ${lines}`;

/** The line before the rebased commit in {@link stampedRebase}'s output. */
const HEAD_MARK = "cawco-head";
/** A full commit name, SHA-1's or SHA-256's. */
const COMMIT_SHA = /^[0-9a-f]{40,64}$/u;

/**
 * The cone-mode sparse-checkout patterns of the files at the root alone,
 * what `git sparse-checkout init --cone` writes: "any paths immediately under
 * leading directories (including the toplevel directory) will also be
 * included" (git-sparse-checkout(1), "Internals: cone mode handling").
 */
const ROOT_FILES_ONLY = "/*\\n!/*/\\n";

/**
 * The rebase's sparse checkout, for its git alone and every git its
 * `--exec` runs: git passes a `-c` on to the commands it starts
 * (`GIT_CONFIG_PARAMETERS`, git(1) `-c`), and leaves the `GIT_CONFIG_COUNT`
 * entries the workspace's git already carries (its door, agent hub-git.ts)
 * as they are.
 */
const SPARSE = "-c core.sparseCheckout=true -c core.sparseCheckoutCone=true";

/**
 * HEAD's own commits rebased onto `upstream` and stamped with `url`
 * ({@link stampCommand}), in a worktree of their own, so the workspace's
 * working tree is never written: its output ends with {@link HEAD_MARK} and
 * the rebased commit, which {@link landedRebase} then moves the workspace to
 * in one step. `keepBase` keeps them on the commit they start from, with
 * their merges (`--keep-base --rebase-merges`), for a branch pushed as it is.
 *
 * A `git rebase` in the workspace's own worktree checks out the commit it
 * starts from and writes each commit's files as it picks it, so every
 * watcher there saw the work undone and done again in a burst. Vite's
 * watcher keeps only the first change of a file in 50 ms (vitejs/vite#23719,
 * chokidar 3's `_throttle(EV_CHANGE, path, 50)`), and a preview went on
 * serving a file deleted mid-burst (2026-11-02, a `Failed to resolve import`
 * of a file the tip no longer had).
 *
 * The rebase's worktree is git's documented recipe, `git worktree add
 * --no-checkout`, which "can be used to suppress checkout in order to make
 * customizations, such as configuring sparse-checkout" (git-worktree(1)),
 * in the workspace's scratch dir (`$TMPDIR`). Its sparse checkout holds the
 * files at the root alone ({@link ROOT_FILES_ONLY}), set by its commands'
 * own config ({@link SPARSE}) and the worktree's own `info/sparse-checkout`
 * (`--path-format`, git 2.31), so neither the repository's config nor any
 * other worktree's changes: a rebase writes only the files it conflicts on
 * outside them (git-sparse-checkout(1): "special cases (such as hitting
 * conflicts when merging/rebasing)"). No LFS object is fetched for it
 * (`GIT_LFS_SKIP_SMUDGE`): nothing reads its files. The worktree goes when
 * the command ends, whatever it ends with.
 *
 * A rebase that stops (a conflict, a stamp that failed) is undone there,
 * and its output ends with {@link CONFLICT_MARK} and the conflicted files
 * when there are any.
 */
const stampedRebase = (
  upstream: string,
  url: string,
  keepBase = false
): string =>
  [
    `w=$(mktemp -d "\${TMPDIR:-/tmp}/cawco-rebase.XXXXXX") || exit 1`,
    `trap 'git worktree remove --force "$w" >/dev/null 2>&1 || { rm -rf "$w"; git worktree prune; }' EXIT`,
    `git worktree add --quiet --no-checkout --detach "$w" HEAD || exit 1`,
    `( cd "$w" && export GIT_LFS_SKIP_SMUDGE=1 && s=$(git rev-parse --path-format=absolute --git-path info/sparse-checkout) && mkdir -p "\${s%/*}" && printf '${ROOT_FILES_ONLY}' > "$s" && git ${SPARSE} read-tree -mu HEAD && { git ${SPARSE} rebase${keepBase ? " --keep-base --rebase-merges" : ""} --exec ${shellQuote(stampCommand(url))} ${shellQuote(upstream)} || { files=$(git diff --name-only --diff-filter=U); git rebase --abort; if [ -n "$files" ]; then printf '${CONFLICT_MARK}\\n%s\\n' "$files"; fi; exit 1; }; } && printf '${HEAD_MARK}\\n%s\\n' "$(git rev-parse HEAD)" )`,
  ].join("\n");

/** The commit {@link stampedRebase}'s output names, after its {@link HEAD_MARK}; undefined when it names none. */
const rebasedHead = (stdout: string): string | undefined => {
  const at = stdout.lastIndexOf(`${HEAD_MARK}\n`);
  const sha = at < 0 ? "" : stdout.slice(at + HEAD_MARK.length + 1).trim();
  return COMMIT_SHA.test(sha) ? sha : undefined;
};

/** What {@link landedRebase} came to: HEAD where it is now, and whether it moved. */
export type Rebased =
  | { kind: "rebased"; head: string; moved: boolean }
  | { kind: "conflict"; files: string }
  | Refusal;

/**
 * The workspace's commits rebased onto `upstream` and stamped
 * ({@link stampedRebase}, off its working tree), then its worktree moved to
 * them once: `git reset --keep`, which "updates files in the working tree
 * that are different between <commit> and HEAD" (git-reset(1)) and writes no
 * other. A rebase whose commits hold HEAD's tree (a stamp alone, a branch
 * already on its upstream) writes no file; one onto a newer upstream writes
 * each file the two trees differ in, once. A conflict leaves the workspace
 * as it was. `run` is {@link LandingDeps.run}; `noWait`, its own. The move
 * is a {@link LandingDeps.run} `moves`, made even to the commit HEAD is
 * already at, which writes nothing: its machine refuses it when the
 * workspace's own commits change harness project config, and runs it on its
 * host when it writes a path the boundary keeps from every command (agent
 * hub-command.ts `movedCommand`), as it did the rebase in the worktree.
 */
async function landedRebase(
  run: LandingDeps<unknown>["run"],
  upstream: string,
  url: string,
  keepBase: boolean,
  noWait: boolean
): Promise<Rebased> {
  const before = await run("git rev-parse HEAD", LOCAL_MS, noWait);
  if (before.exitCode !== 0) {
    return refusal("read", before);
  }
  const rebase = await run(
    stampedRebase(upstream, url, keepBase),
    LOCAL_MS,
    noWait
  );
  if (rebase.exitCode !== 0) {
    const at = rebase.stdout.lastIndexOf(CONFLICT_MARK);
    return at >= 0
      ? {
          kind: "conflict",
          files: rebase.stdout.slice(at + CONFLICT_MARK.length).trim(),
        }
      : refusal("rebase", rebase);
  }
  const head = rebasedHead(rebase.stdout);
  if (!head) {
    return {
      kind: "refused",
      step: "rebase",
      detail: `the rebase named no commit it ended on: ${detailOf(rebase)}`,
    };
  }
  const moved = await run(
    `git reset --quiet --keep ${shellQuote(head)}`,
    LOCAL_MS,
    noWait,
    false,
    head
  );
  return moved.exitCode === 0
    ? { kind: "rebased", head, moved: head !== before.stdout.trim() }
    : refusal("rebase", moved);
}

/**
 * One step of the landing gate as it runs: a step the project declares
 * (gate-file.ts), a shell command run in the item's workspace (or, with
 * `machine`, in its gate workspace on that machine, at its last commit),
 * passing when it exits 0. No session writes it.
 */
export interface GateStep {
  command: string;
  /** The paths it reads (`on:`): its pass is kept by their trees, not the whole tree's. */
  inputs?: readonly string[];
  /** How a skip names `inputs` (“what CawCoScreens and CawCo compile”); the paths when absent. */
  inputsSaid?: string;
  /** The machine it runs on, by machineId, when not the workspace's own. */
  machine?: string;
  /** What the report calls it: its `name:`, or the command. */
  name: string;
  /** The capability its machine needs (`needs:`): a paused one gives way to another that has it. */
  needs?: RunsOnCapability;
  /**
   * Why it has nothing to run, as its report line says it: a `targets:`
   * step for a diff that changes nothing its map's targets compile
   * (`no app build: nothing the app compiles changed`). It never runs.
   */
  nothing?: string;
  /** A failure leaves the steps after it unrun (`on-fail: stop`). */
  stopsRest?: boolean;
  /** Seconds before the command is killed; 600 when not given. */
  timeoutSec?: number;
}

/**
 * Lands HEAD of the workspace on `base`: gated on top of it outside the
 * queue, then its turn; one that steps out of its turn gates again on the
 * newer branch and queues again.
 */
export function land<F>(
  base: string,
  deps: LandingDeps<F>
): Promise<LandingOutcome<F>> {
  return untilStopped(landOn(base, deps));
}

/**
 * A landing's outcome, or `stopped` when its item's stop cancelled a command
 * of it ({@link CommandStopped}).
 */
const untilStopped = <T>(landing: Promise<T>): Promise<T | Stopped> =>
  landing.catch((error: unknown) => {
    if (error instanceof CommandStopped) {
      return { kind: "stopped" } as const;
    }
    throw error;
  });

async function landOn<F>(
  base: string,
  deps: LandingDeps<F>
): Promise<LandingOutcome<F>> {
  const start = await ready(deps.run, deps.skip);
  if (start.kind !== "ready") {
    return start;
  }
  const key = `${start.repo}#${base}`;
  /** Push checks refused only because origin's branch moved past the rebase. */
  let moved = 0;
  for (;;) {
    if (deps.stopped?.()) {
      return { kind: "stopped" };
    }
    const gated = await onBase(base, deps, false);
    if (gated.kind === "moved") {
      moved += 1;
      if (moved < ATTEMPTS) {
        continue;
      }
      return gated.refusal;
    }
    if (gated.kind !== "on-base") {
      return gated;
    }
    const turn = await deps.queue(
      key,
      () => attempt(base, deps, 1).catch(steppedOut),
      deps.turn
    );
    if (turn.kind !== "busy") {
      return turn;
    }
    deps.onStepOut?.(turn.words);
  }
}

/**
 * A turn's command that would have waited ({@link WouldWait}) ends the turn
 * as `busy`, in its words; any other error is the landing's.
 */
const steppedOut = (error: unknown): Busy => {
  if (error instanceof WouldWait) {
    return { kind: "busy", words: error.message };
  }
  throw error;
};

/**
 * The workspace's commits rebased onto origin's `base` as it is now, each
 * stamped with its session's link ({@link stampedRebase}), and
 * {@link LandingDeps.check} on that tree: `on-base` once they pass, with
 * whether the rebase moved HEAD and where HEAD is. In the turn (`inTurn`)
 * every command it runs throws {@link WouldWait} rather than wait. Before
 * the queue, the push is checked ({@link pushCheck}) between the rebase and
 * the gate's first step: refused, no step runs; `moved`, origin's branch
 * moved past the rebase, and the landing fetches and rebases again.
 */
async function onBase<F>(
  base: string,
  deps: LandingDeps<F>,
  inTurn: boolean
): Promise<
  | { kind: "on-base"; head: string; onto: string; rebased: boolean }
  | Moved
  | Exclude<LandingOutcome<F>, { kind: "landed" | "dirty" | "no-remote" }>
> {
  const run = (cmd: string, timeoutMs: number) =>
    deps.run(cmd, timeoutMs, inTurn);
  const target = shellQuote(`origin/${base}`);
  const fetched = await fetchBase(run, base, deps.stopped);
  if (fetched.exitCode !== 0) {
    return refusal("fetch", fetched);
  }
  const ahead = await run(`git rev-list --count ${target}..HEAD`, LOCAL_MS);
  if (ahead.exitCode !== 0) {
    return refusal("read", ahead);
  }
  if (Number(ahead.stdout.trim()) === 0) {
    return { kind: "nothing" };
  }
  const rebased = await landedRebase(
    deps.run,
    `origin/${base}`,
    deps.logsUrl,
    false,
    inTurn
  );
  if (rebased.kind !== "rebased") {
    return rebased;
  }
  const { head } = rebased;
  const onto = await run(`git rev-parse ${target}`, LOCAL_MS);
  if (onto.exitCode !== 0) {
    return refusal("read", onto);
  }
  if (!inTurn) {
    const checked = await pushCheck(
      deps.run,
      `refs/heads/${base}`,
      onto.stdout.trim()
    );
    if (checked) {
      return checked;
    }
  }
  return (
    (await deps.check(inTurn)) ?? {
      kind: "on-base",
      head,
      onto: onto.stdout.trim(),
      rebased: rebased.moved,
    }
  );
}

/**
 * A push check refused while origin's branch no longer held the commit the
 * landing rebased onto: someone pushed in between, so the dry run was behind
 * it, which says nothing of whether this machine may push. `refusal` is what
 * the landing ends with when it is behind every time.
 */
interface Moved {
  kind: "moved";
  refusal: Refusal;
}

/**
 * Whether this machine may push HEAD to origin's `ref`, asked before the
 * landing gate runs a step, so a landing whose push will be refused spends
 * no gate (2026-10-18: obelisk's GitHub credential had gone bad, and each of
 * its items ran its whole gate, a 2967 s iOS build among them, to fail at
 * the push with exit 128). `git push --dry-run` of HEAD to `ref`, through the
 * remote and the credential the real push goes through; nothing is sent.
 *
 * Decided by exit status and the remote's refs, never by git's words: 0 is
 * nothing to say. Any other exit is refused, its detail git's whole output,
 * unless origin's `ref`, read after it, has moved past `onto` (the commit the
 * landing rebased onto): then `moved`. `onto` unset (a push that replaces
 * its branch, run `--force` as the real one is leased) is never `moved`.
 */
async function pushCheck(
  run: LandingDeps<unknown>["run"],
  ref: string,
  onto?: string
): Promise<Refusal | Moved | undefined> {
  const tried = await triedOnFault(
    `the push check of ${ref}`,
    () =>
      run(
        `git push --dry-run${onto === undefined ? " --force" : ""} origin ${shellQuote(`HEAD:${ref}`)}`,
        NETWORK_MS
      ),
    async (checked) => checked.exitCode === 0
  );
  if (tried.exitCode === 0) {
    return;
  }
  const refused: Refusal = {
    kind: "refused",
    step: "push check",
    detail:
      [tried.stderr.trim(), tried.stdout.trim()].filter(Boolean).join("\n") ||
      `exit ${tried.exitCode}`,
  };
  if (onto === undefined) {
    return refused;
  }
  const there = await run(
    `git ls-remote origin ${shellQuote(ref)}`,
    NETWORK_MS
  );
  const held = there.stdout.trim().split(SPACE)[0] ?? "";
  return there.exitCode === 0 && held !== "" && held !== onto
    ? { kind: "moved", refusal: refused }
    : refused;
}

/**
 * Whether origin's `ref` is at `sha` now. A push that did not answer 0 may
 * still have landed (its command cut off after the remote took it), and a
 * ref at the commit pushed is landed whatever the command said. Part of the
 * push, it runs to its end whatever stops the landing (`lands`); `noWait`
 * in the turn.
 */
async function holds(
  run: LandingDeps<unknown>["run"],
  ref: string,
  sha: string,
  noWait: boolean
): Promise<boolean> {
  const there = await run(
    `git ls-remote origin ${shellQuote(ref)}`,
    NETWORK_MS,
    noWait,
    true
  );
  return there.exitCode === 0 && there.stdout.trim().split(SPACE)[0] === sha;
}

/**
 * Whether a push to `base` that failed lost a race: origin's branch, fetched
 * again, is no longer the commit the push was rebased onto, so someone
 * pushed in between. Unmoved, or unreadable, the push was refused for
 * another reason, and git's words on it are the landing's.
 */
async function movedOn(
  run: LandingDeps<unknown>["run"],
  base: string,
  onto: string
): Promise<boolean> {
  const fetched = await fetchBase(run, base);
  if (fetched.exitCode !== 0) {
    return false;
  }
  const now = await run(
    `git rev-parse ${shellQuote(`origin/${base}`)}`,
    LOCAL_MS
  );
  return now.exitCode === 0 && now.stdout.trim() !== onto;
}

/**
 * A push its boundary cut off ({@link CUT_OFF}) whose branch, read once
 * after it, does not hold the commit: refused, in words saying so.
 */
const cutOff = (pushed: CommandResult, ref: string, sha: string): Refusal => ({
  kind: "refused",
  step: "push",
  cause: "cut-off",
  detail: `The push was cut off before it answered (exit ${CUT_OFF}: the workspace's boundary stopped), and origin's ${ref} does not hold ${sha.slice(0, 9)} when read after it.${pushed.stderr.trim() || pushed.stdout.trim() ? `\n${detailOf(pushed)}` : ""}`,
});

/**
 * The turn: fetch, rebase, the commands whose inputs that moved, push; once
 * more if the push lost a race. Nothing in it waits: a command that would
 * throws {@link WouldWait}, which steps the item out ({@link land}).
 */
async function attempt<F>(
  base: string,
  deps: LandingDeps<F>,
  n: number
): Promise<LandingOutcome<F>> {
  if (deps.stopped?.()) {
    return { kind: "stopped" };
  }
  const gated = await onBase(base, deps, true);
  if (gated.kind === "moved") {
    return gated.refusal;
  }
  if (gated.kind !== "on-base") {
    return gated;
  }
  if (deps.stopped?.()) {
    return { kind: "stopped" };
  }
  const { head: after, onto, rebased } = gated;
  let landed = false;
  const pushed = await triedOnFault(
    `${deps.turn?.who ?? "a landing"}'s push to ${base}`,
    () =>
      deps.run(
        `git push origin ${shellQuote(`HEAD:refs/heads/${base}`)}`,
        NETWORK_MS,
        true,
        true
      ),
    async (tried) => {
      landed =
        tried.exitCode === 0 ||
        (await holds(deps.run, `refs/heads/${base}`, after, true));
      return landed || tried.exitCode === CUT_OFF;
    },
    deps.stopped
  );
  if (landed) {
    return { kind: "landed", sha: after, onto, rebased };
  }
  if (pushed.exitCode === CUT_OFF) {
    return cutOff(pushed, base, after);
  }
  // Read in the turn, as the push was: a command that would wait steps out.
  const inTurn: LandingDeps<F>["run"] = (cmd, timeoutMs) =>
    deps.run(cmd, timeoutMs, true);
  if (!(await movedOn(inTurn, base, onto))) {
    return refusal("push", pushed);
  }
  return n < ATTEMPTS
    ? await attempt(base, deps, n + 1)
    : {
        kind: "refused",
        step: "push",
        detail: detailOf(pushed),
        cause: "race",
        tries: n,
      };
}

/**
 * {@link pushCheck} for a landing on a branch of its own (`branch` or `pr`),
 * before its gate: the refusal, or nothing. A workspace with no `origin` is
 * not checked: its push says so ({@link pushBranch}'s `no-remote`).
 */
export async function branchPushCheck(
  run: LandingDeps<unknown>["run"],
  branch: string,
  last: string | undefined
): Promise<Refusal | undefined> {
  const remote = await run("git remote get-url origin", LOCAL_MS);
  if (remote.exitCode !== 0 || !remote.stdout.trim()) {
    return;
  }
  const ref = `refs/heads/${branch}`;
  const checked = await pushCheck(run, ref);
  if (checked) {
    return checked.kind === "moved" ? checked.refusal : checked;
  }
  const there = await tipOf(run, ref);
  if (typeof there !== "string") {
    return there;
  }
  const head = (await run("git rev-parse HEAD", LOCAL_MS)).stdout.trim();
  return there === head ? undefined : taken(branch, there, last, "push check");
}

/** origin's `ref` as `git ls-remote` reads it now: its sha, "" while it is missing. */
async function tipOf(
  run: LandingDeps<unknown>["run"],
  ref: string
): Promise<string | Refusal> {
  const there = await run(
    `git ls-remote origin ${shellQuote(ref)}`,
    NETWORK_MS
  );
  return there.exitCode === 0
    ? (there.stdout.trim().split(SPACE)[0] ?? "")
    : refusal("fetch", there);
}

/**
 * A branch of an item's own that origin holds at `there`, refused when that
 * is neither missing nor `last`, the commit the hub last pushed there:
 * someone else moved it, and their work is never replaced. Nothing, when
 * the hub may replace it.
 */
const taken = (
  branch: string,
  there: string,
  last: string | undefined,
  step: Refusal["step"]
): Refusal | undefined =>
  there === "" || there === last
    ? undefined
    : {
        kind: "refused",
        step,
        cause: "taken",
        detail: `origin's ${branch} is at ${there.slice(0, 9)}, ${last ? `not at ${last.slice(0, 9)}, the commit the hub last pushed there` : "and the hub has never pushed there"}: someone else moved it, so the hub left it as it is.`,
      };

/** What pushing a workspace's HEAD to a branch of its own came to. */
export type BranchOutcome =
  | { kind: "pushed"; sha: string }
  | { kind: "nothing" }
  | { kind: "no-remote" }
  | { kind: "dirty"; files: string }
  | Stopped
  | Refusal;

/**
 * The workspace's HEAD and which repository it is, as both landings start:
 * only commits go anywhere. The repository is its root commit, the one HEAD
 * reaches by first parents (core hub-repo.ts): every clone of it on any
 * machine has that one, whatever its remote is called there (a renamed
 * GitHub repository answers to its old name too; the hub answers at more than
 * one address), and two unrelated repositories never share one, so landings
 * in one repository take turns on a branch while those in two repositories
 * of one project run side by side.
 */
async function ready(
  run: LandingDeps<unknown>["run"],
  skip: string[] | undefined
): Promise<
  | { kind: "ready"; repo: string }
  | Extract<BranchOutcome, { kind: "dirty" | "no-remote" | "refused" }>
> {
  const status = await run(statusCommand(skip), LOCAL_MS);
  if (status.exitCode !== 0) {
    return refusal("read", status);
  }
  if (status.stdout.trim()) {
    return { kind: "dirty", files: status.stdout.trim() };
  }
  const remote = await run("git remote get-url origin", LOCAL_MS);
  if (remote.exitCode !== 0 || !remote.stdout.trim()) {
    return { kind: "no-remote" };
  }
  const root = await run(
    "git rev-list --max-parents=0 --first-parent HEAD",
    LOCAL_MS
  );
  if (root.exitCode !== 0 || !root.stdout.trim()) {
    return refusal("read", root);
  }
  return { kind: "ready", repo: root.stdout.trim() };
}

/**
 * Pushes the workspace's HEAD to `branch` on origin: its commits on the
 * commit they start from, not rebased onto `base`, each stamped with its
 * session's link ({@link stampedRebase} `keepBase`). Nothing ahead of
 * `base` is nothing to push. The push replaces the branch only while it is
 * missing or at `last`, the commit the hub last pushed there (an earlier
 * round of the item, rebased since, or an
 * earlier attempt at its task), leased on that commit; a branch someone else
 * moved is refused naming both commits ({@link taken}), and their work is
 * never lost.
 */
export function pushBranch(
  base: string,
  branch: string,
  deps: Pick<
    LandingDeps<unknown>,
    "logsUrl" | "queue" | "run" | "skip" | "stopped" | "turn"
  > & { last: string | undefined }
): Promise<BranchOutcome> {
  return untilStopped(pushOwnBranch(base, branch, deps));
}

async function pushOwnBranch(
  base: string,
  branch: string,
  deps: Parameters<typeof pushBranch>[2]
): Promise<BranchOutcome> {
  const { run } = deps;
  const start = await ready(run, deps.skip);
  if (start.kind !== "ready") {
    return start;
  }
  return await deps.queue(`${start.repo}#${branch}`, async () => {
    if (deps.stopped?.()) {
      return { kind: "stopped" };
    }
    const fetched = await fetchBase(run, base, deps.stopped);
    if (fetched.exitCode !== 0) {
      return refusal("fetch", fetched);
    }
    const ahead = await run(
      `git rev-list --count ${shellQuote(`origin/${base}`)}..HEAD`,
      LOCAL_MS
    );
    if (ahead.exitCode !== 0) {
      return refusal("read", ahead);
    }
    if (Number(ahead.stdout.trim()) === 0) {
      return { kind: "nothing" };
    }
    const stamped = await landedRebase(
      run,
      `origin/${base}`,
      deps.logsUrl,
      true,
      false
    );
    if (stamped.kind === "conflict") {
      return {
        kind: "refused",
        step: "rebase",
        detail: `the rebase that stamps its commits where they stand conflicted on ${stamped.files}`,
      };
    }
    if (stamped.kind !== "rebased") {
      return stamped;
    }
    const sha = stamped.head;
    if (deps.stopped?.()) {
      return { kind: "stopped" };
    }
    const refused = await leasedPush(run, branch, sha, deps.last);
    return refused && !(await holds(run, `refs/heads/${branch}`, sha, false))
      ? refused
      : { kind: "pushed", sha };
  });
}

/** Whitespace between `git ls-remote`'s sha and its ref. */
const SPACE = /\s+/u;

/**
 * HEAD (`sha`) pushed to `branch`, replacing it only while it is missing or
 * at `last` ({@link taken}), leased on what `git ls-remote` read just before
 * so a push someone makes in between is never replaced either. Tried again
 * only when the remote failed it on its own fault ({@link triedOnFault}),
 * leased the same: a branch that moved is someone else's work, and a push cut off
 * ({@link CUT_OFF}) leaves the caller to read the branch once. Answers why
 * it was refused, or nothing when it was pushed.
 */
async function leasedPush(
  run: LandingDeps<unknown>["run"],
  branch: string,
  sha: string,
  last: string | undefined
): Promise<Refusal | undefined> {
  const ref = `refs/heads/${branch}`;
  const held = await tipOf(run, ref);
  if (typeof held !== "string") {
    return held;
  }
  if (held === sha) {
    return;
  }
  const before = taken(branch, held, last, "push");
  if (before) {
    return before;
  }
  const pushed = await triedOnFault(
    `the push to ${branch}`,
    () =>
      run(
        `git push --force-with-lease=${shellQuote(`${ref}:${held}`)} origin ${shellQuote(`HEAD:${ref}`)}`,
        NETWORK_MS,
        false,
        true
      ),
    async (tried) =>
      tried.exitCode === 0 ||
      tried.exitCode === CUT_OFF ||
      (await holds(run, ref, sha, false))
  );
  if (pushed.exitCode === 0) {
    return;
  }
  if (pushed.exitCode === CUT_OFF) {
    return cutOff(pushed, ref, sha);
  }
  // Lost to someone who pushed in between when the ref no longer holds what
  // the lease named; holding it still, the push was refused otherwise.
  const again = await tipOf(run, ref);
  if (typeof again !== "string" || again === held || again === sha) {
    return refusal("push", pushed);
  }
  return taken(branch, again, held || last, "push") ?? refusal("push", pushed);
}
