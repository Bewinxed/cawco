/**
 * A spin-off's Discard never loses its worktree's work (agent carry.ts,
 * session.ts `#removeWorktree`, core `CONTROL_SPIN_OFF_HELD`). On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model);
 * a spin-off runs on its machine's host, so no boundary is needed.
 *
 * Spin-off S, with a worktree of its own cut from a repository with no
 * remote, commits a file and leaves a changed and an untracked file there.
 * (a) `spinOffHeld`, asked as the dashboard's Discard question asks it,
 *     names its worktree, 1 commit on no remote, 2 changed files.
 * (b) Discarding S removes the worktree, and a carry in ~/.cawco/carries
 *     named by S holds the commit (a bundle naming HEAD, a patch adding the
 *     file) and the uncommitted diff (the changed and the untracked file),
 *     with a README; git no longer lists the worktree.
 * (c) Spin-off C, its worktree untouched: `spinOffHeld` names nothing held,
 *     and its Discard removes the worktree with no carry.
 *
 *   bun scripts/probe-kit/run.ts spin-off-carry
 */
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = "PROBE-SPIN-CARRY";
const DONE = "DONE-SPIN-CARRY";

const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(TAG))) {
    return { everyMs: 5, words: ["ok"] };
  }
  if (request.all.includes(DONE)) {
    return { everyMs: 5, words: ["done"] };
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "Bash",
      input: {
        command: [
          "echo 'made by spin' > spin.txt",
          "git add spin.txt",
          "git -c user.name=Spin -c user.email=s@probe.test commit -qm 'Spin-off commit'",
          "echo 'changed by spin' > README.md",
          "echo 'loose by spin' > loose.txt",
          `echo ${DONE}`,
        ].join(" && "),
        description: "Commit and change files",
      },
    },
  };
};

interface Held {
  ahead: number;
  dirty: number;
  holds: string;
  path: string;
}

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A machine control asked as a dashboard asks it, over its own socket; its `control_result`. */
const controlReply = async (
  fleet: Fleet,
  method: string,
  args: unknown[]
): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
  const socket = new WebSocket(
    `${fleet.base.replace("http", "ws")}/ws/dashboard`
  );
  await new Promise<void>((done, fail) => {
    socket.onopen = () => done();
    socket.onerror = () => fail(new Error("the dashboard socket did not open"));
  });
  const requestId = crypto.randomUUID();
  try {
    return await new Promise((done, fail) => {
      const timer = setTimeout(
        () => fail(new Error(`${method} had no answer in 30s`)),
        30_000
      );
      socket.onmessage = (event) => {
        const frame = JSON.parse(String(event.data)) as {
          payload?: {
            kind?: string;
            requestId?: string;
            ok: boolean;
            result?: unknown;
            error?: string;
          };
        };
        if (
          frame.payload?.kind === "control_result" &&
          frame.payload.requestId === requestId
        ) {
          clearTimeout(timer);
          done(frame.payload);
        }
      };
      socket.send(
        JSON.stringify({
          verb: "control",
          machineId: MACHINE,
          requestId,
          payload: { requestId, method, args },
        })
      );
    });
  } finally {
    socket.close();
  }
};

const spec: Spec = {
  name: "spin-off-carry",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    const carries = join(home, ".cawco", "carries");

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const src = join(fleet.sandbox, "spin-src");
    await mkdir(src, { recursive: true });
    await Bun.$`sh -c ${"git init -q -b main && echo spin > README.md && git add -A && git -c user.name=Owner -c user.email=o@probe.test commit -qm 'First commit'"}`
      .cwd(src)
      .quiet();

    /** The worktree git lists for `instanceId`'s spin-off (named by its first 8 characters). */
    const worktreeOf = async (instanceId: string): Promise<string> => {
      const listed = (
        await Bun.$`git -C ${src} worktree list --porcelain`.quiet()
      ).text();
      return (
        listed
          .split("\n")
          .find(
            (line) =>
              line.startsWith("worktree ") &&
              line.endsWith(`-${instanceId.slice(0, 8)}`)
          )
          ?.slice("worktree ".length) ?? ""
      );
    };
    const held = async (instanceId: string): Promise<Held | null> => {
      const reply = await controlReply(fleet, "spinOffHeld", [instanceId]);
      if (!reply.ok) {
        throw new Error(`spinOffHeld: ${reply.error}`);
      }
      return reply.result as Held | null;
    };
    const discard = (instanceId: string) =>
      fleet.post({
        verb: "stop",
        machineId: MACHINE,
        instanceId,
        requestId: crypto.randomUUID(),
        payload: { instanceId, discard: true },
      });
    const carriesOf = async (instanceId: string): Promise<string[]> =>
      (await readdir(carries).catch(() => [] as string[]))
        .filter((name) => name.startsWith(`${instanceId}-`))
        .map((name) => join(carries, name));

    // ── S: a worktree holding a commit and two changed files ────────────
    const s = await fleet.spawn("claude", "Probe spin-off carry", src, {
      scratch: { worktree: true },
    });
    const sTree = await until(
      "S's worktree",
      () => worktreeOf(s),
      (path) => path.length > 0,
      60_000
    );
    await fleet.send(s, `${TAG}: commit a file and leave two changes.`);
    await until(
      "S committed and left its changes",
      () => existsSync(join(sTree, "loose.txt")),
      (done) => done,
      120_000
    );
    const sHeld = await held(s);
    check(
      "(a) spinOffHeld names S's worktree: 1 commit on no remote, 2 changed files",
      sHeld?.path === sTree &&
        sHeld.ahead === 1 &&
        sHeld.dirty === 2 &&
        sHeld.holds === "1 commit on no remote, 2 changed files",
      JSON.stringify(sHeld)
    );

    await discard(s);
    await until(
      "S's worktree removed",
      () => existsSync(sTree),
      (stands) => !stands,
      90_000
    );
    const [carry = ""] = await carriesOf(s);
    const heads = carry
      ? (
          await Bun.$`git bundle list-heads ${join(carry, "commits.bundle")}`
            .quiet()
            .nothrow()
        ).text()
      : "";
    const patches = carry
      ? await Array.fromAsync(new Bun.Glob("commits/*.patch").scan(carry))
      : [];
    const patch = patches[0]
      ? await Bun.file(join(carry, patches[0])).text()
      : "";
    check(
      "(b) a carry named by S holds its commit: a bundle naming HEAD, a patch adding spin.txt",
      heads.includes(" HEAD") &&
        patches.length === 1 &&
        patch.includes("Spin-off commit") &&
        patch.includes("+made by spin"),
      `carry ${carry || "none"}; heads ${heads.trim()}; patches ${patches.join(", ")}`
    );
    const diff = carry
      ? await Bun.file(join(carry, "uncommitted.patch"))
          .text()
          .catch(() => "")
      : "";
    check(
      "(b) the carry holds S's uncommitted diff, README.md changed and loose.txt added, and a README",
      diff.includes("+changed by spin") &&
        diff.includes("+loose by spin") &&
        diff.includes("loose.txt") &&
        existsSync(join(carry, "README.md")),
      diff.slice(0, 800)
    );
    check(
      "(b) git no longer lists S's worktree",
      (await worktreeOf(s)) === "",
      await worktreeOf(s)
    );

    // ── C: a worktree holding nothing ───────────────────────────────────
    const c = await fleet.spawn("claude", "Probe spin-off clean", src, {
      scratch: { worktree: true },
    });
    const cTree = await until(
      "C's worktree",
      () => worktreeOf(c),
      (path) => path.length > 0,
      60_000
    );
    const cHeld = await held(c);
    check(
      "(c) spinOffHeld names nothing held in C's worktree",
      cHeld?.path === cTree && cHeld.ahead === 0 && cHeld.dirty === 0,
      JSON.stringify(cHeld)
    );
    await discard(c);
    await until(
      "C's worktree removed",
      () => existsSync(cTree),
      (stands) => !stands,
      90_000
    );
    check(
      "(c) C's Discard wrote no carry",
      (await carriesOf(c)).length === 0,
      (await carriesOf(c)).join(", ")
    );
  },
};

export default spec;
