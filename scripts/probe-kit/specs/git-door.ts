/**
 * A workspace's git door (agent hub-git.ts) for a remote that is not the
 * hub, on a host that is not GitHub: the door speaks git's remote helper
 * protocol itself and runs the host's own git with the host's own
 * credential, by the project's upstream rule. Run against the real door
 * and real git, with no boundary: git here runs with exactly the helper,
 * door socket, ssh and config a workspace's commands get (`gitDoorEnv`,
 * and `guardedPushParameters` as a guarded workspace's executor adds it),
 * against bare repositories git's own http-backend serves on the loopback
 * (`serveGitHttp`): the clone's origin, `probe/origin.git`, and another
 * person's, `someone/else.git`.
 *
 *   bun scripts/probe-kit/run.ts git-door
 *
 * Under "Keep agents off other repositories" (the rule names the origin):
 * (a) `git fetch origin` reads the origin through the door;
 * (b) a commit pushed to `origin` lands there, once;
 * (c) a push to someone/else.git is refused in the guard's words, and that
 *     repository takes no push;
 * (d) a push from another repository whose origin is the same URL is
 *     refused: the door serves the workspace's clone alone, and the origin
 *     takes no push;
 * (e) a push over ssh under a login the rewrite does not cover: git's ssh
 *     says the workspace holds no key.
 * Under "Ask me first", with a stand-in hub taking the ask:
 * (f) the push to someone/else.git is held: the hub is asked once, for
 *     that repository and that commit, as this machine's git sign-in; git
 *     reads the hub's answer; the repository takes no push;
 * (g) a push over ssh in git's scp-like form under `git@` is held the same
 *     way, for that host's repository, and reaches no network.
 * With "Let agents post upstream" in the rule:
 * (h) the same push to someone/else.git goes, with the host's credential,
 *     and lands there.
 * Large files, with the host holding a credential for the loopback host (a
 * git credential store under its HOME) and the clone committing a
 * `.lfsconfig` that names a trap endpoint:
 * (i) under "Let agents post upstream", a commit carrying an LFS file pushed
 *     to someone/else.git lands with its object in that repository's own LFS
 *     (`someone/else.git/info/lfs`), sent with the host's credential; the
 *     trap the `.lfsconfig` names is never called;
 * (j) under "Ask me first", such a push is held with nothing sent; made on
 *     approval (`makeHeldPush`), its object reaches someone/else.git's
 *     LFS with the host's credential before the commit lands, and the trap
 *     is still never called.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serveGitHttp } from "../git-http";
import type { Spec } from "../kit";

const ORIGIN = "probe/origin.git";
const ELSE = "someone/else.git";
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
/** The host's own sign-in on the loopback host, as its git credential store keeps it. */
const HOST_LOGIN = { user: "host-probe", password: "host-secret" };

const spec: Spec = {
  name: "git-door",
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
    } = await import("../../../packages/agent/src/hub-git");
    const { workspaceUpstreamRuleFile } =
      await import("../../../packages/core/src/paths");
    const { normaliseRemote } =
      await import("../../../packages/core/src/upstream-guard");

    const http = serveGitHttp(join(scratch, "srv"), HOST_LOGIN);
    const originUrl = await http.bare(ORIGIN);
    const elseUrl = await http.bare(ELSE);
    // The origin holds one commit, as a project's remote would.
    const seed = join(scratch, "seed");
    await Bun.$`git init -q -b main ${seed} && git -C ${seed} ${IDENTITY} commit -q --allow-empty -m seed && git -C ${seed} push -q ${originUrl} main`.quiet();
    const clone = join(scratch, "clone");
    await Bun.$`git clone -q ${originUrl} ${clone}`.quiet();

    const id = `gd${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const ref = { id, path: clone };
    const writeRule = async (posts: "off" | "ask" | "on") => {
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
    /** git as a guarded workspace's command runs it: the door's helper first on PATH, its config words, its ssh. */
    const inside = (cwd: string, args: string[]) =>
      Bun.$`git ${args}`
        .cwd(cwd)
        .env({
          ...process.env,
          ...door,
          PATH: `${gitHelperDirOf(id)}:${process.env.PATH}`,
          GIT_CONFIG_PARAMETERS: [
            door.CAWCO_GIT_PARAMETERS,
            guardedPushParameters(),
          ].join(" "),
          GIT_TERMINAL_PROMPT: "0",
        })
        .quiet()
        .nothrow();
    const said = (run: { stderr: Buffer; stdout: Buffer }) =>
      `${run.stdout.toString()}${run.stderr.toString()}`.trim();
    const tip = async (repo: string, branch: string) =>
      (
        await Bun.$`git -C ${http.dir(repo)} rev-parse --verify --quiet refs/heads/${branch}`
          .quiet()
          .nothrow()
          .text()
      ).trim();

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
      const base = new URL(originUrl).origin;
      await mkdir(process.env.HOME, { recursive: true });
      await writeFile(
        join(process.env.HOME, ".git-credentials"),
        `http://${HOST_LOGIN.user}:${HOST_LOGIN.password}@${new URL(base).host}\n`
      );
      await writeFile(
        join(process.env.HOME, ".gitconfig"),
        `[credential]\n\thelper = store --file=${join(process.env.HOME, ".git-credentials")}\n`
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

      // (i)
      const onLfs = await lfsCommit("on.bin");
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
    } finally {
      await closeGitDoor(id);
      http.stop();
      hub.stop(true);
    }
  },
};

export default spec;
