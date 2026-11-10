/**
 * A landing's push the remote fails on its own fault is tried again; one
 * refused for a reason is not (hub landing.ts `triedOnFault`, `remoteFault`).
 * On 2026-11-04 three landings were refused `[remote rejected] HEAD -> main
 * ([remote rejected] (Internal Server Error))`, one `(failure)`: GitHub's own
 * report-status for the ref, passed on by the workspace's git door, and each
 * landed on its next try with nothing changed.
 *
 * The real `land` (hub landing.ts) runs every command in a clone with the
 * environment a workspace's commands get, so its fetch and push go through
 * the real git door (agent hub-git.ts) and the host's own git, to a stand-in
 * remote: a proxy in this process in front of bare repositories git's own
 * http-backend serves (`serveGitHttp`). The proxy fails a push as asked, and
 * counts the pushes it was sent (`POST …/git-receive-pack`).
 *
 *   bun scripts/probe-kit/run.ts landing-faults
 *
 * (a) a push answered HTTP 500 once, then taken: the landing lands, after
 *     two pushes, the first logged as tried again in words naming the
 *     status (the door carries git's `RPC failed; HTTP 500` line, agent
 *     hub-git.ts `pushAnswers`);
 * (b) a push answered as GitHub did, `ng refs/heads/main Internal Server
 *     Error` in its report-status, once, then taken: the landing lands, after
 *     two pushes;
 * (c) a push the remote refuses as not a fast-forward (its receive-pack has
 *     a commit on main its fetch does not show yet): the landing is refused
 *     at once at the push, in git's words naming non-fast-forward, with no
 *     wait and nothing logged as tried again; origin's main is unchanged;
 * (d) a push the remote refuses with a reason in its report-status
 *     (`pre-receive hook declined`): refused at once, one push sent, in
 *     words naming that reason;
 * (e) the landing's fetch answered HTTP 500 once: the fetch is tried again,
 *     logged, and the landing lands.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serveGitHttp } from "../git-http";
import type { Spec } from "../spec";

const ORIGIN = "probe/origin.git";
/** The repository the proxy's receive-pack answers from in (c): origin's main and one commit more. */
const THEIRS = "probe/theirs.git";
const IDENTITY = ["-c", "user.name=Probe", "-c", "user.email=probe@probe.test"];
const RECEIVE_PACK = /\/git-receive-pack$/u;
const UPLOAD_PACK = /\/git-upload-pack$/u;
/** The repository a request names: `/<owner>/<repo>.git` and the rest. */
const REPO_PATH = /^\/([^/]+\/[^/]+\.git)(\/.*)?$/u;
/** The longest any leg refused at once may take: well under the first wait (5 s). */
const AT_ONCE_MS = 4000;

/** How the proxy answers the next push. */
type Fault =
  | { kind: "none" }
  | { kind: "http"; status: number }
  | { kind: "ng"; reason: string };

/** One pkt-line (gitprotocol-common(5)): its length in 4 hex digits, then the bytes. */
const pkt = (payload: string): string =>
  `${(payload.length + 4).toString(16).padStart(4, "0")}${payload}`;

/**
 * receive-pack's answer to a push of `refs/heads/main` that refuses it with
 * `reason` (gitprotocol-pack(5) "report-status": `unpack ok`, then `ng
 * <refname> <error-msg>`), in side-band 1 when the client asked for it.
 */
const ngReport = (reason: string, sideBand: boolean): string => {
  const report = `${pkt("unpack ok\n")}${pkt(`ng refs/heads/main ${reason}\n`)}0000`;
  return sideBand ? `${pkt(`\u0001${report}`)}0000` : report;
};

/**
 * The proxy's answer to a push it fails as `fault` says: HTTP `status`, or
 * receive-pack's report refusing main with `reason`; none for no fault.
 */
const faultAnswer = (
  fault: Fault,
  request: Request,
  body: Uint8Array<ArrayBuffer> | undefined
): Response | undefined => {
  if (fault.kind === "http") {
    return new Response("Internal Server Error\n", { status: fault.status });
  }
  if (fault.kind !== "ng") {
    return;
  }
  const sent = new TextDecoder("latin1").decode(
    request.headers.get("content-encoding") === "gzip" && body
      ? Bun.gunzipSync(body)
      : body
  );
  return new Response(ngReport(fault.reason, sent.includes("side-band-64k")), {
    headers: { "content-type": "application/x-git-receive-pack-result" },
  });
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "landing-faults",
  ownHome:
    "it serves bare repositories and opens a workspace's git door under its own HOME, and lands through it with the host's git",
  async run(kit) {
    const { check } = kit;
    const scratch = join(
      process.env.TMPDIR ?? "/tmp",
      `lf-${crypto.randomUUID().slice(0, 6)}`
    );
    process.env.HOME = join(scratch, "h");
    process.env.XDG_RUNTIME_DIR = join(scratch, "r");
    // The hub the workspace's agent knows, as git-door sets it: without one
    // `gitDoorEnv` gives no door. Nothing here reaches it.
    process.env.CAWCO_HUB_URL = "ws://hub.probe.test/ws";
    await mkdir(process.env.XDG_RUNTIME_DIR, { recursive: true, mode: 0o700 });
    const { closeGitDoor, gitDoorEnv, gitHelperDirOf, openGitDoor } =
      await import("../../../packages/agent/src/hub-git");
    const { land, landingQueue } =
      await import("../../../packages/hub/src/landing");

    const http = serveGitHttp(join(scratch, "srv"));
    const backend = new URL(await http.bare(ORIGIN)).origin;
    await http.bare(THEIRS);

    /** What the proxy does with the next push, and whether its receive-pack is THEIRS's. */
    let fault: Fault = { kind: "none" };
    let theirs = false;
    /** The pushes the proxy was sent, failed or not. */
    let pushes = 0;
    /** How many fetch requests (`git-upload-pack`) the proxy answers HTTP 500 next. */
    let fetchFaults = 0;
    const proxy = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const receive =
          RECEIVE_PACK.test(url.pathname) ||
          url.searchParams.get("service") === "git-receive-pack";
        const body =
          request.method === "POST"
            ? new Uint8Array(await request.arrayBuffer())
            : undefined;
        const upload =
          UPLOAD_PACK.test(url.pathname) ||
          url.searchParams.get("service") === "git-upload-pack";
        if (upload && fetchFaults > 0) {
          fetchFaults -= 1;
          return new Response("Internal Server Error\n", { status: 500 });
        }
        if (request.method === "POST" && RECEIVE_PACK.test(url.pathname)) {
          pushes += 1;
          const now = fault;
          fault = { kind: "none" };
          const failed = faultAnswer(now, request, body);
          if (failed) {
            return failed;
          }
        }
        const [, repo = "", rest = ""] = REPO_PATH.exec(url.pathname) ?? [];
        const to = receive && theirs && repo === ORIGIN ? THEIRS : repo;
        const headers = new Headers(request.headers);
        headers.delete("host");
        return await fetch(`${backend}/${to}${rest}${url.search}`, {
          method: request.method,
          headers,
          body,
          redirect: "manual",
          decompress: false,
        });
      },
    });
    const originUrl = `http://127.0.0.1:${proxy.port}/${ORIGIN}`;

    const seed = join(scratch, "seed");
    await Bun.$`git init -q -b main ${seed} && git -C ${seed} ${IDENTITY} commit -q --allow-empty -m seed && git -C ${seed} push -q ${originUrl} main`.quiet();
    const clone = join(scratch, "clone");
    await Bun.$`git clone -q ${originUrl} ${clone}`.quiet();

    const id = `lf${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    await openGitDoor({ id, path: clone });
    const door = gitDoorEnv(id, clone);
    /** A workspace's command environment, as git-door's spec gives it. */
    const doorEnv = {
      ...process.env,
      ...door,
      PATH: `${gitHelperDirOf(id)}:${process.env.PATH}`,
      GIT_CONFIG_PARAMETERS: door.CAWCO_GIT_PARAMETERS,
      GIT_TERMINAL_PROMPT: "0",
      GIT_COMMITTER_NAME: "Probe",
      GIT_COMMITTER_EMAIL: "probe@probe.test",
    };
    const run = async (cmd: string) => {
      const ran = await Bun.$`sh -c ${cmd}`
        .cwd(clone)
        .env(doorEnv)
        .quiet()
        .nothrow();
      return {
        exitCode: ran.exitCode,
        stdout: ran.stdout.toString(),
        stderr: ran.stderr.toString(),
      };
    };
    const tip = async (repo: string) =>
      (
        await Bun.$`git -C ${http.dir(repo)} rev-parse --verify --quiet refs/heads/main`
          .quiet()
          .nothrow()
          .text()
      ).trim();

    /** The hub's log lines of a push tried again (`[landing] …`). */
    const logged: string[] = [];
    const { warn } = console;
    console.warn = (...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.startsWith("[landing]")) {
        logged.push(line);
      }
      warn(...args);
    };

    const queue = landingQueue();
    /**
     * A landing of one new commit on origin's main as the clone last
     * fetched it; `inTurn` runs as the landing's turn gates, after the push
     * check and before the push.
     */
    const landing = async (
      name: string,
      inTurn?: () => Promise<void>,
      armed?: () => void
    ) => {
      await run("git fetch -q origin");
      const made = (
        await Bun.$`git -C ${clone} ${IDENTITY} commit-tree -p refs/remotes/origin/main -m ${name} HEAD^{tree}`.text()
      ).trim();
      await Bun.$`git -C ${clone} checkout -q --detach ${made}`.quiet();
      const before = { pushes, logged: logged.length };
      armed?.();
      const started = performance.now();
      const outcome = await land("main", {
        check: async (turn) => {
          if (turn) {
            await inTurn?.();
          }
        },
        logsUrl: `https://hub.probe.test/session/${name}`,
        queue,
        run,
        turn: { who: name },
      });
      const head = (await Bun.$`git -C ${clone} rev-parse HEAD`.text()).trim();
      return {
        head,
        ms: Math.round(performance.now() - started),
        outcome,
        pushed: pushes - before.pushes,
        tried: logged.slice(before.logged),
      };
    };
    const shown = (leg: Awaited<ReturnType<typeof landing>>) =>
      `outcome ${JSON.stringify(leg.outcome)}; pushes ${leg.pushed}; ${leg.ms} ms; logged ${leg.tried.join(" || ") || "none"}`;

    try {
      fault = { kind: "http", status: 500 };
      const a = await landing("leg-a");
      check(
        "(a) a push answered HTTP 500 once, then taken, lands after two pushes, the first logged as tried again",
        a.outcome.kind === "landed" &&
          (await tip(ORIGIN)) === a.head &&
          a.pushed === 2 &&
          a.tried.length === 1 &&
          (a.tried[0] ?? "").includes("try 1 of 4") &&
          (a.tried[0] ?? "").includes("HTTP 500"),
        `${shown(a)}; main ${await tip(ORIGIN)} (HEAD ${a.head})`
      );

      fault = { kind: "ng", reason: "Internal Server Error" };
      const b = await landing("leg-b");
      check(
        "(b) a push GitHub's way refused `(Internal Server Error)` once, then taken, lands after two pushes, logged with GitHub's words",
        b.outcome.kind === "landed" &&
          (await tip(ORIGIN)) === b.head &&
          b.pushed === 2 &&
          b.tried.length === 1 &&
          (b.tried[0] ?? "").includes("(Internal Server Error)"),
        `${shown(b)}; main ${await tip(ORIGIN)} (HEAD ${b.head})`
      );

      // (c): THEIRS is origin's main and one commit more, which the clone
      // holds, so git says non-fast-forward rather than fetch first; origin's
      // fetch never shows it, so the landing reads no race.
      const mainBefore = await tip(ORIGIN);
      await Bun.$`git -C ${seed} pull -q ${originUrl} main && git -C ${seed} ${IDENTITY} commit -q --allow-empty -m theirs && git -C ${seed} push -q -f ${http.dir(THEIRS)} main`.quiet();
      await Bun.$`git -C ${clone} fetch -q ${http.dir(THEIRS)} main:refs/probe/theirs`.quiet();
      const c = await landing("leg-c", () => {
        theirs = true;
        return Promise.resolve();
      });
      theirs = false;
      check(
        "(c) a push refused as not a fast-forward is refused at once at the push, in git's words, with no wait and nothing tried again",
        c.outcome.kind === "refused" &&
          c.outcome.step === "push" &&
          c.outcome.detail.includes("non-fast-forward") &&
          c.tried.length === 0 &&
          c.ms < AT_ONCE_MS &&
          (await tip(ORIGIN)) === mainBefore,
        `${shown(c)}; main ${await tip(ORIGIN)} (was ${mainBefore})`
      );

      fault = { kind: "ng", reason: "pre-receive hook declined" };
      const d = await landing("leg-d");
      check(
        "(d) a push refused with the remote's reason is refused at once, one push sent, in words naming it",
        d.outcome.kind === "refused" &&
          d.outcome.step === "push" &&
          d.outcome.detail.includes("pre-receive hook declined") &&
          d.pushed === 1 &&
          d.tried.length === 0 &&
          d.ms < AT_ONCE_MS &&
          (await tip(ORIGIN)) === mainBefore,
        `${shown(d)}; main ${await tip(ORIGIN)} (was ${mainBefore})`
      );

      const e = await landing("leg-e", undefined, () => {
        fetchFaults = 1;
      });
      check(
        "(e) the landing's fetch answered HTTP 500 once is tried again, logged, and the landing lands",
        e.outcome.kind === "landed" &&
          (await tip(ORIGIN)) === e.head &&
          fetchFaults === 0 &&
          e.tried.length === 1 &&
          (e.tried[0] ?? "").includes("the fetch of main") &&
          (e.tried[0] ?? "").includes("500"),
        `${shown(e)}; main ${await tip(ORIGIN)} (HEAD ${e.head})`
      );
    } finally {
      console.warn = warn;
      await closeGitDoor(id);
      proxy.stop(true);
      http.stop();
    }
  },
};

export default spec;
