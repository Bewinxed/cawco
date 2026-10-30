/**
 * A workspace's git door (agent hub-git.ts) for a remote that is not the
 * hub, on a host that is not GitHub: the door speaks git's remote helper
 * protocol itself and runs the host's own git with the host's own
 * credential, by the project's upstream rule. Run against the real door
 * and real git, with no boundary: git here runs with exactly the helper,
 * door socket, ssh and config a workspace's commands get (`gitDoorEnv`,
 * and `guardedPushParameters` and `quietGitParameters` as a guarded
 * workspace's executor adds them),
 * against bare repositories git's own http-backend serves on the loopback
 * (`serveGitHttp`): the clone's origin, `probe/origin.git`, and another
 * person's, `someone/else.git`.
 *
 *   bun scripts/probe-kit/run.ts git-door
 *
 * Under "Keep agents off other repositories" (the rule names the origin):
 * (a) `git fetch origin` reads the origin through the door;
 * (b) a commit pushed to `origin` lands there, once;
 * (k) a fetch with an annotated tag to follow works with the options git
 *     sends the door (traced: `progress`, `verbosity`, `followtags`), each
 *     answered;
 * (l) `git push --dry-run origin HEAD:main`, as a landing's push check runs
 *     it, exits 0 with the ref listed, and origin's main is unchanged;
 * (m) a dry run of a push that is not a fast-forward is refused with git's
 *     reason; (n) with `--force` it is ok, and main is still unchanged;
 * (o) the real push of HEAD to main lands, once;
 * (t) an item's own branch, pushed as the hub pushes it (hub landing.ts
 *     `pushBranch`), takes its first round; (u) reopened, its next round
 *     rebased onto a moved main replaces it, leased on the first (the door
 *     carries git's `option cas` to the host's `--force-with-lease`; before
 *     2026-10-19 it answered `unsupported` and the remote refused the push
 *     as non-fast-forward); (v) after someone else pushed there, the next
 *     round is refused, by the push check and by the push, in words naming
 *     their commit and the hub's last, and their commit stays; (w) git's
 *     lease reaches the door: a stale one git refuses itself, and a held
 *     one is sent as `option cas`, answered ok, and lands;
 * (c) a push to someone/else.git is refused in the guard's words, and that
 *     repository takes no push; (p) its dry run is refused the same way;
 * (d) a push from another repository whose origin is the same URL is
 *     refused: the door serves the workspace's clone alone, and the origin
 *     takes no push;
 * (e) a push over ssh under a login the rewrite does not cover: git's ssh
 *     says the workspace holds no key.
 * Under "Ask me first", with a stand-in hub taking the ask:
 * (f) the push to someone/else.git is held: the hub is asked once, for
 *     that repository and that commit, as this machine's git sign-in; git
 *     reads the hub's answer; the repository takes no push; (q) its dry run
 *     says it would wait for the owner, and asks nobody;
 * (g) a push over ssh in git's scp-like form under `git@` is held the same
 *     way, for that host's repository, and reaches no network.
 * With "Let agents post upstream" in the rule:
 * (h) the same push to someone/else.git goes, with the host's credential,
 *     and lands there.
 * Large files, with the host holding a credential for the loopback host (a
 * git credential store under its HOME) and the clone committing a
 * `.lfsconfig` that names a trap endpoint:
 * (r) under "Let agents post upstream", a dry run of a commit carrying an
 *     LFS file is ok and sends nothing: no object, no ref, no push;
 * (i) under "Let agents post upstream", a commit carrying an LFS file pushed
 *     to someone/else.git lands with its object in that repository's own LFS
 *     (`someone/else.git/info/lfs`), sent with the host's credential; the
 *     trap the `.lfsconfig` names is never called;
 * (j) under "Ask me first", such a push is held with nothing sent; made on
 *     approval (`makeHeldPush`), its object reaches someone/else.git's
 *     LFS with the host's credential before the commit lands, and the trap
 *     is still never called.
 * Every push through the door ends:
 * (y) when the host's credential helper never answers (as macOS's
 *     osxkeychain waits on a keychain prompt nobody is there for), the
 *     door stops the git-lfs it runs, helper and all, after 120 s of
 *     silence, and the push is refused in words that say so;
 * (y2) an approved held push (`makeHeldPush`) whose helper never answers
 *     ends the same way: its git push's whole process group is stopped
 *     after 120 s of silence, and no credential helper is left;
 * (z) when the door says `ok` and then nothing (a stuck agent), the helper
 *     ends git's push itself after 60 s, in words that say so.
 * A command's git, through the workspace's real executor and runner, on
 * the host (workspace-git-quiet.ts):
 * (x) a commit, a fetch and a rebase start no git maintenance or gc, and
 *     3 s later none runs from the clone.
 * The workspace's gh (workspace-gh.ts, through the workspace's real
 * executor and runner, on the host):
 * (s) under "Let agents post upstream" no forge token is in a command's
 *     environment, the caller's GH_TOKEN included, nor in any file of the
 *     workspace's, and gh's post is made by the GitHub door with the host's
 *     token; under "Ask me first" the door holds it for the person.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UpstreamPosts } from "../../../packages/core/src/upstream-guard";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { serveGitHttp } from "../git-http";
import type { Spec } from "../kit";
import { workspaceGhLeg } from "../workspace-gh";
import { workspaceGitQuietLeg } from "../workspace-git-quiet";

const ORIGIN = "probe/origin.git";
const ELSE = "someone/else.git";
/** A repository that takes only signed-in pushes, as a forge's public one does. */
const PRIVATE = "someone/private.git";
const IDENTITY = ["-c", "user.name=Probe", "-c", "user.email=probe@probe.test"];
/** git-lfs's filters, given per command so the clone's own config stays as a clone's is. */
const LFS_FILTERS = [
  "-c",
  "filter.lfs.clean=git-lfs clean -- %f",
  "-c",
  "filter.lfs.smudge=git-lfs smudge -- %f",
  "-c",
  "filter.lfs.process=git-lfs filter-process",
  "-c",
  "filter.lfs.required=true",
];
/** A traced line of an option git sent its helper, or the helper's answer to one (`ok`, `unsupported`, `error …`). */
const HELPER_OPTION_TRACE =
  /Debug: Remote helper: (-> option |<- (ok|unsupported|error)\b)/u;
const HELPER_TRACE_HEAD = /^.*Debug: Remote helper: /u;
/** The host's own sign-in on the loopback host, as its git credential store keeps it. */
const HOST_LOGIN = { user: "host-probe", password: "host-secret" };

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "git-door",
  ownHome:
    "it serves bare repositories and opens a workspace's doors under its own HOME, and pushes to them with the host's git",
  async run(kit) {
    const { check } = kit;
    const scratch = join(
      process.env.TMPDIR ?? "/tmp",
      `gd-${crypto.randomUUID().slice(0, 6)}`
    );
    // The door's sockets and state live under HOME and the runtime dir: the
    // scratch's own, before the agent's modules read either.
    process.env.HOME = join(scratch, "h");
    process.env.XDG_RUNTIME_DIR = join(scratch, "r");
    // A stand-in hub: it takes a held post's ask and answers what the
    // session reads (hub upstream-asks.ts), recording each.
    const asks: {
      account?: string;
      post?: { refs?: { sha?: string }[]; url?: string; via?: string };
      repo?: string;
    }[] = [];
    const hub = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        if (new URL(request.url).pathname !== "/api/upstream/asks") {
          return new Response("not here\n", { status: 404 });
        }
        asks.push((await request.json()) as (typeof asks)[number]);
        return new Response(
          "PROBE-HUB-HELD: it waits in the owner's Needs you"
        );
      },
    });
    process.env.CAWCO_HUB_URL = `http://127.0.0.1:${hub.port}`;
    await mkdir(process.env.XDG_RUNTIME_DIR, { recursive: true, mode: 0o700 });
    const {
      closeGitDoor,
      gitDoorEnv,
      gitHelperDirOf,
      guardedPushParameters,
      openGitDoor,
      quietGitParameters,
    } = await import("../../../packages/agent/src/hub-git");
    const { workspaceUpstreamRuleFile } =
      await import("../../../packages/core/src/paths");
    const { normaliseRemote } =
      await import("../../../packages/core/src/upstream-guard");

    const http = serveGitHttp(join(scratch, "srv"), HOST_LOGIN);
    const originUrl = await http.bare(ORIGIN);
    const elseUrl = await http.bare(ELSE);
    const privateUrl = await http.bare(PRIVATE, true);
    // The origin holds one commit, as a project's remote would.
    const seed = join(scratch, "seed");
    await Bun.$`git init -q -b main ${seed} && git -C ${seed} ${IDENTITY} commit -q --allow-empty -m seed && git -C ${seed} push -q ${originUrl} main`.quiet();
    const clone = join(scratch, "clone");
    await Bun.$`git clone -q ${originUrl} ${clone}`.quiet();

    const id = `gd${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const ref = { id, path: clone };
    const writeRule = async (posts: UpstreamPosts) => {
      await mkdir(join(workspaceUpstreamRuleFile(id), ".."), {
        recursive: true,
      });
      await writeFile(
        workspaceUpstreamRuleFile(id),
        JSON.stringify({ posts, remotes: [normaliseRemote(originUrl)] })
      );
    };
    await writeRule("off");
    await openGitDoor(ref);
    const door = gitDoorEnv(id, clone);
    /** A guarded workspace's command environment: the door's helper first on PATH, its config words, its ssh. */
    const doorEnv = (extra: Record<string, string> = {}) => ({
      ...process.env,
      ...door,
      PATH: `${gitHelperDirOf(id)}:${process.env.PATH}`,
      GIT_CONFIG_PARAMETERS: [
        door.CAWCO_GIT_PARAMETERS,
        guardedPushParameters(),
        quietGitParameters(),
      ].join(" "),
      GIT_TERMINAL_PROMPT: "0",
      ...extra,
    });
    /** git as a guarded workspace's command runs it. */
    const inside = (
      cwd: string,
      args: string[],
      extra: Record<string, string> = {}
    ) => Bun.$`git ${args}`.cwd(cwd).env(doorEnv(extra)).quiet().nothrow();
    /** git's own trace of what it sends its remote helper and what it reads back (transport-helper.c). */
    const TRACED = { GIT_TRANSPORT_HELPER_DEBUG: "1" };
    const said = (run: { stderr: Buffer; stdout: Buffer }) =>
      `${run.stdout.toString()}${run.stderr.toString()}`
        .split("\n")
        .filter((line) => !line.startsWith("Debug: "))
        .join("\n")
        .trim();
    /** The options git sent the door in a traced run, each with the door's answer. */
    const optionsSent = (run: { stderr: Buffer }) =>
      run.stderr
        .toString()
        .split("\n")
        .filter((line) => HELPER_OPTION_TRACE.test(line))
        .map((line) => line.replace(HELPER_TRACE_HEAD, ""))
        .join(" | ");
    const tip = async (repo: string, branch: string) =>
      (
        await Bun.$`git -C ${http.dir(repo)} rev-parse --verify --quiet refs/heads/${branch}`
          .quiet()
          .nothrow()
          .text()
      ).trim();

    /** (k) to (o): the origin's own fetch and pushes, and the dry runs a landing's push check makes. */
    const originLegs = async (): Promise<void> => {
      // (k): an annotated tag beside a new commit, so git asks to follow tags.
      await Bun.$`git -C ${seed} ${IDENTITY} commit -q --allow-empty -m third && git -C ${seed} ${IDENTITY} tag -a probe-tag -m probe-tag && git -C ${seed} push -q ${originUrl} main probe-tag`.quiet();
      const fetchedTraced = await inside(clone, ["fetch", "origin"], TRACED);
      const tracked = (
        await Bun.$`git -C ${clone} rev-parse refs/remotes/origin/main`.text()
      ).trim();
      const tagged = (
        await Bun.$`git -C ${clone} rev-parse --verify --quiet refs/tags/probe-tag`
          .quiet()
          .nothrow()
          .text()
      ).trim();
      check(
        "(k) a fetch through the door still works with the options git sends, each answered",
        fetchedTraced.exitCode === 0 &&
          tracked === (await tip(ORIGIN, "main")) &&
          tagged !== "",
        `exit ${fetchedTraced.exitCode}; options ${optionsSent(fetchedTraced) || "none"}; tag ${tagged || "none"}; ${said(fetchedTraced)}`
      );

      // (l): HEAD a commit on origin's main, as a landing's rebased HEAD is.
      const ahead = (
        await Bun.$`git -C ${clone} ${IDENTITY} commit-tree -p refs/remotes/origin/main -m ahead HEAD^{tree}`.text()
      ).trim();
      const mainBefore = await tip(ORIGIN, "main");
      const pushesBefore = http.pushes(ORIGIN);
      await Bun.$`git -C ${clone} checkout -q --detach ${ahead}`.quiet();
      const dryFf = await inside(
        clone,
        ["push", "--dry-run", "origin", "HEAD:main"],
        TRACED
      );
      check(
        "(l) git push --dry-run origin HEAD:main through the door exits 0 with the ref listed, and origin's main is unchanged",
        dryFf.exitCode === 0 &&
          said(dryFf).includes("HEAD -> main") &&
          (await tip(ORIGIN, "main")) === mainBefore &&
          http.pushes(ORIGIN) === pushesBefore,
        `exit ${dryFf.exitCode}; options ${optionsSent(dryFf) || "none"}; main ${await tip(ORIGIN, "main")} (was ${mainBefore}); pushes ${http.pushes(ORIGIN) - pushesBefore}; ${said(dryFf)}`
      );

      // (m) and (n): HEAD the clone's own commit, off origin's older main.
      await Bun.$`git -C ${clone} checkout -q main`.quiet();
      const dryBehind = await inside(clone, [
        "push",
        "--dry-run",
        "origin",
        "HEAD:main",
      ]);
      check(
        "(m) a dry run of a push that is not a fast-forward, without --force, is refused with git's reason",
        dryBehind.exitCode !== 0 &&
          said(dryBehind).includes("non-fast-forward") &&
          (await tip(ORIGIN, "main")) === mainBefore,
        `exit ${dryBehind.exitCode}; ${said(dryBehind)}`
      );
      const dryForced = await inside(
        clone,
        ["push", "--dry-run", "--force", "origin", "HEAD:main"],
        TRACED
      );
      check(
        "(n) the same dry run with --force is ok, and origin's main is unchanged",
        dryForced.exitCode === 0 &&
          said(dryForced).includes("(forced update)") &&
          (await tip(ORIGIN, "main")) === mainBefore &&
          http.pushes(ORIGIN) === pushesBefore,
        `exit ${dryForced.exitCode}; options ${optionsSent(dryForced) || "none"}; main ${await tip(ORIGIN, "main")}; pushes ${http.pushes(ORIGIN) - pushesBefore}; ${said(dryForced)}`
      );

      // (o)
      await Bun.$`git -C ${clone} checkout -q --detach ${ahead}`.quiet();
      const landed = await inside(clone, ["push", "origin", "HEAD:main"]);
      await Bun.$`git -C ${clone} checkout -q main`.quiet();
      check(
        "(o) a real push of HEAD to main still lands, once",
        landed.exitCode === 0 &&
          (await tip(ORIGIN, "main")) === ahead &&
          http.pushes(ORIGIN) === pushesBefore + 1,
        `exit ${landed.exitCode}; main ${await tip(ORIGIN, "main")}; ${said(landed)}`
      );
    };

    /**
     * (t) to (w): an item's own branch across rounds, pushed as the hub
     * pushes it (hub landing.ts `branchPushCheck` before the gate, then
     * `pushBranch`), every command run in the clone with the door's
     * environment, as the hub's are in a workspace. `last` is the commit the
     * hub last pushed there (work-items.ts `lastBranchPush`).
     */
    const branchLegs = async (): Promise<void> => {
      const { branchPushCheck, landingQueue, pushBranch } =
        await import("../../../packages/hub/src/landing");
      // The landing's stamp amends each commit's message (landing.ts
      // `stampCommand`): its committer is the probe's.
      const run = async (cmd: string) => {
        const ran = await Bun.$`sh -c ${cmd}`
          .cwd(clone)
          .env(
            doorEnv({
              GIT_COMMITTER_NAME: "Probe",
              GIT_COMMITTER_EMAIL: "probe@probe.test",
            })
          )
          .quiet()
          .nothrow();
        return {
          exitCode: ran.exitCode,
          stdout: ran.stdout.toString(),
          stderr: ran.stderr.toString(),
        };
      };
      const queue = landingQueue();
      const BRANCH = "cawco/probe-round";
      /**
       * One round: HEAD a new commit on origin's main as it is now, checked,
       * then pushed; `sha`, HEAD once pushed, stamped with its session's link.
       */
      const round = async (name: string, last: string | undefined) => {
        await inside(clone, ["fetch", "origin"]);
        const made = (
          await Bun.$`git -C ${clone} ${IDENTITY} commit-tree -p refs/remotes/origin/main -m ${name} HEAD^{tree}`.text()
        ).trim();
        await Bun.$`git -C ${clone} checkout -q --detach ${made}`.quiet();
        const checked = await branchPushCheck(run, BRANCH, last);
        const pushed = await pushBranch("main", BRANCH, {
          last,
          logsUrl: "https://hub.probe.test/session/probe-round",
          queue,
          run,
        });
        const sha = (await Bun.$`git -C ${clone} rev-parse HEAD`.text()).trim();
        return { sha, checked, pushed };
      };
      const moveMain = async (name: string) =>
        await Bun.$`git -C ${seed} pull -q ${originUrl} main && git -C ${seed} ${IDENTITY} commit -q --allow-empty -m ${name} && git -C ${seed} push -q ${originUrl} main`.quiet();
      try {
        const one = await round("round 1", undefined);
        check(
          "(t) an item's first round lands on its own branch through the door",
          one.checked === undefined &&
            one.pushed.kind === "pushed" &&
            (await tip(ORIGIN, BRANCH)) === one.sha,
          `check ${JSON.stringify(one.checked)}; push ${JSON.stringify(one.pushed)}; branch ${await tip(ORIGIN, BRANCH)}`
        );

        // Reopened: main moved on, and its next round is rebased onto it.
        await moveMain("main moves");
        const two = await round("round 2", one.sha);
        check(
          "(u) its next round, rebased onto a moved main, lands: the branch takes it, leased on round 1",
          two.checked === undefined &&
            two.pushed.kind === "pushed" &&
            (await tip(ORIGIN, BRANCH)) === two.sha,
          `check ${JSON.stringify(two.checked)}; push ${JSON.stringify(two.pushed)}; branch ${await tip(ORIGIN, BRANCH)} (round 2 ${two.sha})`
        );

        // Someone else pushes to the branch.
        await Bun.$`git -C ${seed} fetch -q ${originUrl} refs/heads/${BRANCH}`.quiet();
        const theirs = (
          await Bun.$`git -C ${seed} ${IDENTITY} commit-tree -p FETCH_HEAD -m theirs FETCH_HEAD^{tree}`.text()
        ).trim();
        await Bun.$`git -C ${seed} push -q ${originUrl} ${theirs}:refs/heads/${BRANCH}`.quiet();
        const three = await round("round 3", two.sha);
        const named = (words: string | undefined) =>
          words?.includes(`is at ${theirs.slice(0, 9)}`) === true &&
          words.includes(`not at ${two.sha.slice(0, 9)}`);
        check(
          "(v) a round after someone else moved the branch is refused before the gate and at the push, in words naming both commits, and their commit stays",
          three.checked?.cause === "taken" &&
            named(three.checked.detail) &&
            three.pushed.kind === "refused" &&
            three.pushed.cause === "taken" &&
            named(three.pushed.detail) &&
            (await tip(ORIGIN, BRANCH)) === theirs,
          `check ${JSON.stringify(three.checked)}; push ${JSON.stringify(three.pushed)}; branch ${await tip(ORIGIN, BRANCH)} (theirs ${theirs})`
        );
        /** HEAD to the branch through the door, leased on `on`. */
        const leased = (on: string) =>
          inside(
            clone,
            [
              "push",
              `--force-with-lease=refs/heads/${BRANCH}:${on}`,
              "origin",
              `HEAD:refs/heads/${BRANCH}`,
            ],
            TRACED
          );
        const stale = await leased(two.sha);
        const stays = await tip(ORIGIN, BRANCH);
        const holding = await leased(theirs);
        check(
          "(w) git's lease reaches the door: leased on round 2 while the branch is at theirs, git refuses it as stale and it stays; leased on theirs, git sends `option cas`, the door answers ok, and the branch takes HEAD",
          stale.exitCode !== 0 &&
            said(stale).includes("stale info") &&
            stays === theirs &&
            holding.exitCode === 0 &&
            optionsSent(holding).includes(
              `-> option cas refs/heads/${BRANCH}:${theirs} | <- ok`
            ) &&
            (await tip(ORIGIN, BRANCH)) === three.sha,
          `stale: exit ${stale.exitCode}, branch ${stays}, ${said(stale)} | on theirs: exit ${holding.exitCode}; options ${optionsSent(holding)}; branch ${await tip(ORIGIN, BRANCH)} (round 3 ${three.sha}); ${said(holding)}`
        );
      } finally {
        await Bun.$`git -C ${clone} checkout -q main`.quiet();
      }
    };

    try {
      // (a)
      await Bun.$`git -C ${seed} ${IDENTITY} commit -q --allow-empty -m second && git -C ${seed} push -q ${originUrl} main`.quiet();
      const fetched = await inside(clone, ["fetch", "origin"]);
      const remoteMain = (
        await Bun.$`git -C ${clone} rev-parse refs/remotes/origin/main`.text()
      ).trim();
      check(
        "(a) git fetch origin reads the origin through the door",
        fetched.exitCode === 0 && remoteMain === (await tip(ORIGIN, "main")),
        `exit ${fetched.exitCode}; ${said(fetched)}; origin/main ${remoteMain}`
      );

      // (b)
      await Bun.$`git -C ${clone} ${IDENTITY} commit -q --allow-empty -m own`.quiet();
      const head = (await Bun.$`git -C ${clone} rev-parse HEAD`.text()).trim();
      const ownPushes = http.pushes(ORIGIN);
      const pushedOwn = await inside(clone, [
        "push",
        "origin",
        "HEAD:refs/heads/door-own",
      ]);
      check(
        "(b) a push to the clone's origin lands there, once",
        pushedOwn.exitCode === 0 &&
          (await tip(ORIGIN, "door-own")) === head &&
          http.pushes(ORIGIN) === ownPushes + 1,
        `exit ${pushedOwn.exitCode}; ${said(pushedOwn)}`
      );

      await originLegs();
      await branchLegs();

      // (c)
      const pushedElse = await inside(clone, [
        "push",
        elseUrl,
        "HEAD:refs/heads/door-else",
      ]);
      check(
        "(c) under keep off, a push to someone/else.git is refused in the guard's words, and it takes no push",
        pushedElse.exitCode !== 0 &&
          said(pushedElse).includes(
            `cawco: \`git push ${elseUrl}\` did not run: it writes to 127.0.0.1/someone/else`
          ) &&
          http.pushes(ELSE) === 0 &&
          (await tip(ELSE, "door-else")) === "",
        `exit ${pushedElse.exitCode}; pushes ${http.pushes(ELSE)}; ${said(pushedElse)}`
      );
      const dryElse = await inside(clone, [
        "push",
        "--dry-run",
        elseUrl,
        "HEAD:refs/heads/door-else",
      ]);
      check(
        "(p) under keep off, a dry run of that push is refused in the same words",
        dryElse.exitCode !== 0 &&
          said(dryElse).includes(
            `cawco: \`git push ${elseUrl}\` did not run: it writes to 127.0.0.1/someone/else`
          ) &&
          http.pushes(ELSE) === 0,
        `exit ${dryElse.exitCode}; ${said(dryElse)}`
      );

      // (d)
      const stranger = join(scratch, "stranger");
      await Bun.$`git init -q -b main ${stranger} && git -C ${stranger} ${IDENTITY} commit -q --allow-empty -m stranger && git -C ${stranger} remote add origin ${originUrl}`.quiet();
      const before = http.pushes(ORIGIN);
      const pushedStranger = await inside(stranger, [
        "push",
        "origin",
        "HEAD:refs/heads/door-stranger",
      ]);
      check(
        "(d) a push from another repository with the same origin URL is refused: the door serves the clone alone",
        pushedStranger.exitCode !== 0 &&
          said(pushedStranger).includes("it serves this workspace's clone") &&
          http.pushes(ORIGIN) === before &&
          (await tip(ORIGIN, "door-stranger")) === "",
        `exit ${pushedStranger.exitCode}; ${said(pushedStranger)}`
      );

      // (e)
      const overSsh = await inside(clone, [
        "push",
        "alice@other.probe.test:someone/else.git",
        "HEAD:refs/heads/door-ssh",
      ]);
      check(
        "(e) a push over ssh under another login: git's ssh says the workspace holds no key",
        overSsh.exitCode !== 0 &&
          said(overSsh).includes("cawco: git over ssh did not run here"),
        `exit ${overSsh.exitCode}; ${said(overSsh)}`
      );

      // (f)
      await writeRule("ask");
      const held = await inside(clone, [
        "push",
        elseUrl,
        "HEAD:refs/heads/door-held",
      ]);
      const [ask] = asks;
      check(
        "(f) under Ask me first, the push to someone/else.git is held: one ask for that repository and commit, as this machine's git sign-in; git reads the hub's answer; nothing lands",
        held.exitCode !== 0 &&
          said(held).includes("PROBE-HUB-HELD") &&
          asks.length === 1 &&
          ask?.repo === "127.0.0.1/someone/else" &&
          ask.account === "this machine's git sign-in" &&
          ask.post?.via === "git" &&
          ask.post.url === elseUrl &&
          ask.post.refs?.[0]?.sha === head &&
          http.pushes(ELSE) === 0 &&
          (await tip(ELSE, "door-held")) === "",
        `exit ${held.exitCode}; asks ${JSON.stringify(asks)}; pushes ${http.pushes(ELSE)}; ${said(held)}`
      );
      const dryHeld = await inside(clone, [
        "push",
        "--dry-run",
        elseUrl,
        "HEAD:refs/heads/door-held-dry",
      ]);
      check(
        "(q) under Ask me first, a dry run of that push says it would wait for the owner, and asks nobody",
        dryHeld.exitCode !== 0 &&
          said(dryHeld).includes("would wait in the owner's Needs you") &&
          asks.length === 1 &&
          http.pushes(ELSE) === 0 &&
          (await tip(ELSE, "door-held-dry")) === "",
        `exit ${dryHeld.exitCode}; asks ${asks.length}; ${said(dryHeld)}`
      );

      // (g)
      const heldSsh = await inside(clone, [
        "push",
        "git@other.probe.test:someone/else.git",
        "HEAD:refs/heads/door-held-ssh",
      ]);
      check(
        "(g) a push over ssh to git@other.probe.test is held the same way, for that host's repository",
        heldSsh.exitCode !== 0 &&
          said(heldSsh).includes("PROBE-HUB-HELD") &&
          asks.length === 2 &&
          asks[1]?.repo === "other.probe.test/someone/else" &&
          asks[1]?.post?.url === "git@other.probe.test:someone/else.git",
        `exit ${heldSsh.exitCode}; asks ${JSON.stringify(asks.slice(1))}; ${said(heldSsh)}`
      );

      // (h)
      await writeRule("on");
      const pushedOn = await inside(clone, [
        "push",
        elseUrl,
        "HEAD:refs/heads/door-on",
      ]);
      check(
        "(h) where agents may post, the same push to someone/else.git goes with the host's credential and lands",
        pushedOn.exitCode === 0 &&
          (await tip(ELSE, "door-on")) === head &&
          http.pushes(ELSE) === 1,
        `exit ${pushedOn.exitCode}; ${said(pushedOn)}`
      );

      // The host's credential for the loopback host, and the clone's trap.
      // The store alone: `helper =` first clears the list git built from the
      // system config ("If credential.helper is configured to the empty
      // string, this resets the helper list to empty", gitcredentials(7)).
      // macOS's git names osxkeychain there, which under this scratch HOME
      // finds no keychain and waits on a prompt nobody answers, holding the
      // machine's every other osxkeychain lookup behind its lock.
      const base = new URL(originUrl).origin;
      await mkdir(process.env.HOME, { recursive: true });
      await writeFile(
        join(process.env.HOME, ".git-credentials"),
        `http://${HOST_LOGIN.user}:${HOST_LOGIN.password}@${new URL(base).host}\n`
      );
      await writeFile(
        join(process.env.HOME, ".gitconfig"),
        `[credential]\n\thelper =\n\thelper = store --file=${join(process.env.HOME, ".git-credentials")}\n`
      );
      const trap = `${base}/trap/info/lfs`;
      await writeFile(
        join(clone, ".gitattributes"),
        "*.bin filter=lfs diff=lfs merge=lfs -text\n"
      );
      await writeFile(
        join(clone, ".lfsconfig"),
        `[lfs]\n\turl = ${trap}\n\tpushurl = ${trap}\n[remote "origin"]\n\tlfsurl = ${trap}\n`
      );
      /** A commit carrying one new LFS file: answers its sha and the object's id. */
      const lfsCommit = async (name: string) => {
        const content = `${name} ${crypto.randomUUID()}\n`.repeat(64);
        await writeFile(join(clone, name), content);
        await Bun.$`git -C ${clone} ${LFS_FILTERS} add .gitattributes .lfsconfig ${name} && git -C ${clone} ${IDENTITY} commit -q -m ${name}`.quiet();
        const pointer = (
          await Bun.$`git -C ${clone} cat-file -p HEAD:${name}`.text()
        ).trim();
        return {
          sha: (await Bun.$`git -C ${clone} rev-parse HEAD`.text()).trim(),
          oid: new Bun.CryptoHasher("sha256").update(content).digest("hex"),
          pointer,
        };
      };
      const ELSE_LFS = "someone/else.git";
      const ORIGIN_LFS = "probe/origin.git";

      // (r)
      const onLfs = await lfsCommit("on.bin");
      const elsePushes = http.pushes(ELSE);
      const dryLfs = await inside(clone, [
        "push",
        "--dry-run",
        elseUrl,
        "HEAD:refs/heads/door-lfs",
      ]);
      check(
        "(r) under Let agents post upstream, a dry run of a commit carrying an LFS file is ok and sends nothing: no object, no ref, no push",
        dryLfs.exitCode === 0 &&
          said(dryLfs).includes("HEAD -> door-lfs") &&
          http.lfs(ELSE_LFS).length === 0 &&
          http.lfsCalls(ELSE_LFS) === 0 &&
          http.pushes(ELSE) === elsePushes &&
          (await tip(ELSE, "door-lfs")) === "",
        `exit ${dryLfs.exitCode}; else LFS calls ${http.lfsCalls(ELSE_LFS)}; pushes ${http.pushes(ELSE) - elsePushes}; ${said(dryLfs)}`
      );

      // (i)
      const pushedLfs = await inside(clone, [
        "push",
        elseUrl,
        "HEAD:refs/heads/door-lfs",
      ]);
      const elseObjects = http.lfs(ELSE_LFS);
      check(
        "(i) under Let agents post upstream, a commit's LFS object goes to someone/else.git's own LFS with the host's credential; the clone's .lfsconfig trap is never called",
        onLfs.pointer.startsWith(
          "version https://git-lfs.github.com/spec/v1"
        ) &&
          pushedLfs.exitCode === 0 &&
          (await tip(ELSE, "door-lfs")) === onLfs.sha &&
          elseObjects.some(
            (one) => one.oid === onLfs.oid && one.user === HOST_LOGIN.user
          ) &&
          http.lfsCalls("trap") === 0 &&
          !http.lfs(ORIGIN_LFS).some((one) => one.oid === onLfs.oid),
        `exit ${pushedLfs.exitCode}; else LFS ${JSON.stringify(elseObjects)}; trap calls ${http.lfsCalls("trap")}; origin LFS ${JSON.stringify(http.lfs(ORIGIN_LFS))}; ${said(pushedLfs)}`
      );

      // (j)
      await writeRule("ask");
      const askLfs = await lfsCommit("held.bin");
      const asksBefore = asks.length;
      const heldLfs = await inside(clone, [
        "push",
        elseUrl,
        "HEAD:refs/heads/door-lfs-held",
      ]);
      const heldAsk = asks[asksBefore];
      const sentWhileHeld = http.lfs(ELSE_LFS).length;
      // Approved: made as the agent makes it, from the workspace's clone
      // (upstream-posts.ts `makeUpstreamPost`, once it has found the clone).
      const { makeHeldPush } =
        await import("../../../packages/agent/src/upstream-posts");
      const { isUpstreamPost } =
        await import("../../../packages/core/src/upstream-post");
      const heldPost: unknown = heldAsk?.post;
      const made =
        isUpstreamPost(heldPost) && heldPost.via === "git"
          ? await makeHeldPush(ref, heldPost)
          : { ok: false, said: "no git push was held" };
      const afterApproval = http.lfs(ELSE_LFS);
      check(
        "(j) under Ask me first, an LFS push is held with nothing sent; made on approval, its object reaches someone/else.git's LFS with the host's credential and the commit lands; the trap is never called",
        heldLfs.exitCode !== 0 &&
          heldAsk?.post?.refs?.[0]?.sha === askLfs.sha &&
          sentWhileHeld === elseObjects.length &&
          made.ok &&
          (await tip(ELSE, "door-lfs-held")) === askLfs.sha &&
          afterApproval.some(
            (one) => one.oid === askLfs.oid && one.user === HOST_LOGIN.user
          ) &&
          http.lfsCalls("trap") === 0,
        `held exit ${heldLfs.exitCode}; sent while held ${sentWhileHeld - elseObjects.length}; made ${JSON.stringify(made)}; else LFS ${JSON.stringify(afterApproval)}; trap calls ${http.lfsCalls("trap")}`
      );

      // (y): the host's credential helper waits forever, as osxkeychain does
      // on a keychain prompt nobody answers.
      await writeRule("on");
      const marker = `probe-silent-helper-${crypto.randomUUID().slice(0, 8)}`;
      const silentHelper = join(scratch, "silent-helper");
      await writeFile(
        silentHelper,
        `#!${systemProgram("sh")}\nexec perl -e 'sleep 86400' ${marker}\n`,
        { mode: 0o755 }
      );
      const gitconfig = join(process.env.HOME, ".gitconfig");
      const storeConfig = await Bun.file(gitconfig).text();
      await writeFile(
        gitconfig,
        `[credential]\n\thelper =\n\thelper = ${silentHelper}\n`
      );
      const stallLfs = await lfsCommit("stall.bin");
      const stallStart = Date.now();
      const stalled = await inside(clone, [
        "push",
        elseUrl,
        "HEAD:refs/heads/door-lfs-stall",
      ]);
      const stallTook = Math.round((Date.now() - stallStart) / 1000);
      const helperLeft = (
        await Bun.$`pgrep -f ${marker}`.quiet().nothrow().text()
      ).trim();
      check(
        "(y) when the host's credential helper never answers, the push ends within the door's silence limit, refused in words that say so; nothing lands and the helper is gone",
        stalled.exitCode !== 0 &&
          said(stalled).includes("said nothing for 120 s and was stopped") &&
          stallTook < 180 &&
          (await tip(ELSE, "door-lfs-stall")) === "" &&
          !http.lfs(ELSE_LFS).some((one) => one.oid === stallLfs.oid) &&
          helperLeft === "",
        `exit ${stalled.exitCode} after ${stallTook} s; helper left ${helperLeft || "none"}; ${said(stalled)}`
      );

      // (y2): an approved held push whose helper never answers. A commit of
      // its own with no large file, so git-lfs has nothing to send, to a
      // repository that reads from anyone and takes only signed-in pushes:
      // git's push itself waits on the helper.
      const heldStallLeg = async (): Promise<void> => {
        const emptyTree = (
          await Bun.$`git -C ${clone} mktree < ${new Response("")}`.text()
        ).trim();
        const lone = (
          await Bun.$`git -C ${clone} ${IDENTITY} commit-tree ${emptyTree} -m held-stall`.text()
        ).trim();
        const privatePushes = http.pushes(PRIVATE);
        const heldStart = Date.now();
        const heldStall = await makeHeldPush(ref, {
          via: "git",
          url: privateUrl,
          refs: [
            { sha: lone, dst: "refs/heads/door-held-stall", force: false },
          ],
        });
        const heldTook = Math.round((Date.now() - heldStart) / 1000);
        await writeFile(gitconfig, storeConfig);
        const heldHelperLeft = (
          await Bun.$`pgrep -f ${marker}`.quiet().nothrow().text()
        ).trim();
        check(
          "(y2) an approved held push whose credential helper never answers ends within the silence limit, its whole process group stopped: refused in words that say so, nothing lands, and no credential helper is left",
          !heldStall.ok &&
            heldStall.said.includes("git push said nothing for 120 s") &&
            heldTook < 180 &&
            http.pushes(PRIVATE) === privatePushes &&
            (await tip(PRIVATE, "door-held-stall")) === "" &&
            heldHelperLeft === "",
          `after ${heldTook} s; helper left ${heldHelperLeft || "none"}; made ${JSON.stringify(heldStall)}`
        );
      };
      await heldStallLeg();

      // (z): a door that says ok and then nothing, as a stuck agent would.
      const mutePath = join(scratch, "mute.sock");
      const mute = Bun.listen({
        unix: mutePath,
        socket: {
          open: (socket) => {
            socket.write("ok\n");
          },
          data: () => undefined,
        },
      });
      const muteStart = Date.now();
      const muted = await inside(
        clone,
        ["push", elseUrl, "HEAD:refs/heads/door-mute"],
        { CAWCO_GIT_SOCKET: mutePath }
      );
      const muteTook = Math.round((Date.now() - muteStart) / 1000);
      mute.stop(true);
      check(
        "(z) a door that answers ok and then says nothing ends git's push from the helper's side, in words that say so",
        muted.exitCode !== 0 &&
          said(muted).includes("the door said nothing for 60 s") &&
          muteTook < 120 &&
          (await tip(ELSE, "door-mute")) === "",
        `exit ${muted.exitCode} after ${muteTook} s; ${said(muted)}`
      );

      // (x)
      await workspaceGitQuietLeg(kit, { clone, id, root: scratch });

      // (s)
      await workspaceGhLeg(kit, {
        asks,
        clone,
        id,
        root: scratch,
        writeRule,
      });
    } finally {
      await closeGitDoor(id);
      http.stop();
      hub.stop(true);
    }
  },
};

export default spec;
