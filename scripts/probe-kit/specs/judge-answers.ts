/**
 * A workspace's judge answers every call its hook hands it, one after
 * another as a delegate's turn makes them, each well inside the hook's own
 * limit (agent boundary.ts `hookScript`, boundary-judge.ts). On the Mac
 * (2026-10-25, workspace-any-folder on 779056e68) seven of some 270 Bash
 * calls in a row waited the hook's whole 80 s and were refused, the calls
 * either side of each answered in a tenth of a second. This spec's first
 * run there (541bfae5e) stalled 3 of 3000: each hook held its connection
 * to the judge, the judge held the accepted end, nothing was queued on
 * either, and the hook read on for the judge's end of the connection,
 * which never came. The answer now ends at the judge's end mark
 * (boundary-judge.ts `ANSWER_END`), and no reader waits for the end.
 *
 * The real hook (perl, as boundary.ts writes it) and the real judge (its
 * two scripts in the workspace's state dir, on bun, as armHook starts it),
 * under this run's own HOME, with no boundary around them. Each call is a
 * Bash call as Claude Code hands it: its JSON on the hook's stdin, the
 * workspace's prefix in `CLAUDE_CODE_SHELL_PREFIX`.
 *
 * - j1. {@link CALLS} calls through the hook in a row: each is allowed
 *   (exit 0, nothing said) within {@link CALL_MS}.
 * - j2. The same calls through a client that speaks the hook's wire and
 *   says when each step of it is done (connected, sent, each chunk of the
 *   answer, its end mark, or the connection's end): each is answered whole
 *   within {@link CALL_MS}.
 *
 * A call still waiting at {@link CALL_MS} is read where it stands before it
 * is ended: the step it waits in (j2), the judge's and the client's sockets
 * (lsof), and the kernel's queues on each (netstat on macOS, ss on Linux):
 * whether the judge accepted the connection, holds its bytes unread, or
 * wrote no answer. All of it goes to the spec's output folder,
 * `stalls.txt`.
 *
 *   bun scripts/probe-kit/run.ts judge-answers
 */
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { listedPid } from "../../../packages/core/src/signal";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");

/** How many calls each leg hands in a row: past three times the 3000 that stalled three times on the Mac. */
const CALLS = 10_000;

/** How long one call may take before it is read as stalled: the judge answers in under a millisecond, and a loaded Mac starts perl within a second or two. */
const CALL_MS = 10_000;

/** How many stalls each leg reads before it stops counting them. */
const STALLS_READ = 4;

/**
 * The hook's wire, spoken by a client that says each step on stderr with
 * its time: the call's JSON and the prefix in hex on two lines, then the
 * answer read a chunk at a time up to its end mark (a NUL), or the
 * connection's end.
 */
const STEPPED = `use strict; use Socket; use Time::HiRes qw(time);
my ($path, $prefix) = @ARGV;
my $call = do { local $/; <STDIN> };
$call =~ tr/\\r\\n/  /;
sub said { printf STDERR "%.3f %s\\n", time, $_[0] }
socket(my $s, PF_UNIX, SOCK_STREAM, 0) or die "socket: $!";
said("socket");
connect($s, pack_sockaddr_un($path)) or die "connect: $!";
said("connected");
select((select($s), $| = 1)[0]);
print $s $call, "\\n", unpack('H*', $prefix), "\\n" or die "print: $!";
said("sent");
my $answer = '';
while (1) {
  my $n = sysread($s, my $chunk, 65536);
  die "read: $!" unless defined $n;
  if ($n == 0) { said("end"); last }
  $answer .= $chunk;
  said("read $n");
  if ($answer =~ s/\\0.*\\z//s) { said("end mark"); last }
}
print STDOUT $answer;
`;

interface Ran {
  ms: number;
  out: string;
  said: string;
  status: number | null;
}

/** A Bash call's hook input, as Claude Code 2.1 hands a PreToolUse hook one. */
const callJson = (clone: string, n: number): string =>
  JSON.stringify({
    session_id: "probe-judge",
    transcript_path: join(clone, "probe.jsonl"),
    cwd: clone,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: `echo call-${n}`, description: "Probe call" },
    tool_use_id: `toolu_probe_${n}`,
  });

/** What the kernel and lsof say of the judge's sockets and the stalled client's. */
const standing = async (judge: number, client: number): Promise<string> => {
  const of = async (argv: string[]): Promise<string> => {
    const ran = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([
      new Response(ran.stdout).text(),
      new Response(ran.stderr).text(),
    ]);
    await ran.exited;
    return `$ ${argv.join(" ")}\n${out}${err}`;
  };
  const queues =
    process.platform === "darwin"
      ? ["netstat", "-f", "unix", "-an"]
      : ["ss", "-xanp"];
  return (
    await Promise.all([
      of(["lsof", "-nP", "-a", "-U", "-p", String(judge)]),
      of(["lsof", "-nP", "-a", "-U", "-p", String(client)]),
      of(queues),
    ])
  ).join("\n");
};

/**
 * `argv` with `input` on its stdin: its exit, stdout, stderr and time; one
 * still running at {@link CALL_MS} is read where it stands ({@link
 * standing}) into `stalls`, then ended.
 */
const callOnce = async (
  argv: string[],
  input: string,
  env: Record<string, string | undefined>,
  judge: number,
  stalls: string[]
): Promise<Ran> => {
  const started = performance.now();
  const proc = Bun.spawn(argv, {
    env,
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = new Response(proc.stdout).text();
  const said = new Response(proc.stderr).text();
  const exited = await readWithin(CALL_MS, () => proc.exited);
  const late = exited.kind === "unanswered";
  if (late) {
    stalls.push(await standing(judge, proc.pid));
    proc.kill("SIGKILL");
  }
  const status = await proc.exited;
  return {
    ms: Math.round(performance.now() - started),
    out: await out,
    said: await said,
    status: late ? null : status,
  };
};

/** One leg: {@link CALLS} calls in a row; how many were answered as `ok` says, the slowest, and what each stall read. */
const leg = async (
  call: (n: number) => Promise<{ ran: Ran; stalls: string[] }>,
  ok: (ran: Ran) => boolean
): Promise<{ bad: Ran[]; slowest: number; stalls: string[] }> => {
  const bad: Ran[] = [];
  const stalls: string[] = [];
  let slowest = 0;
  for (let n = 0; n < CALLS; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one call after another, as a turn makes them
    const { ran, stalls: read } = await call(n);
    slowest = Math.max(slowest, ran.ms);
    if (!ok(ran)) {
      bad.push(ran);
    }
    if (stalls.length < STALLS_READ) {
      stalls.push(...read);
    }
  }
  return { bad, slowest, stalls };
};

const run = async (kit: Kit) => {
  const { check, note } = kit;
  const home = process.env.HOME as string;
  Object.assign(process.env, {
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_RUNTIME_DIR: join(home, "run"),
    CAWCO_SESSIOND_ENDPOINT: join(home, "run", "sessiond.sock"),
  });
  delete process.env.CAWCO_WORKSPACE;
  await mkdir(join(home, "run"), { recursive: true, mode: 0o700 });
  const { executorUnsandboxed } =
    await import("../../../packages/agent/src/boundary");
  const paths = await import("../../../packages/core/src/paths");
  const { workspacePolicy } =
    await import("../../../packages/core/src/workspace-policy");
  const bun = Bun.which("bun") ?? process.execPath;

  // ── The workspace: its folder, records, executor, prefix, judge, hook ──
  const id = crypto.randomUUID();
  const clone = join(home, "clone");
  await mkdir(clone, { recursive: true });
  await writeFile(join(clone, "README.md"), "Judge.\n");
  await Bun.$`git init -q -b main && git add -A && git -c user.name=Probe -c user.email=probe@probe.test commit -qm 'First commit'`
    .cwd(clone)
    .quiet();
  const state = paths.workspaceStateDir(id);
  await mkdir(state, { recursive: true });
  const ref = { id, path: clone };
  const parts = await executorUnsandboxed(ref, "probe", listedPid(process.pid));
  await mkdir(parts.claudeTmp, { recursive: true, mode: 0o700 });
  await writeFile(parts.execAt, parts.exec);
  await chmod(parts.execAt, 0o755);
  await writeFile(parts.prefixAt, parts.prefix);
  await chmod(parts.prefixAt, 0o755);
  const policy = paths.workspacePolicyFile(id);
  await writeFile(
    policy,
    `${JSON.stringify(await workspacePolicy(ref), null, 2)}\n`
  );
  await copyFile(
    join(ROOT, "packages", "agent", "src", "boundary-judge.ts"),
    join(state, "boundary-judge.ts")
  );
  await copyFile(
    join(ROOT, "packages", "core", "src", "workspace-judge.ts"),
    join(state, "workspace-judge.ts")
  );
  // In the run's temp dir, as the workspace's socket dir is short: a socket's
  // path has a length limit (104 bytes on macOS).
  const socket = join(
    process.env.TMPDIR ?? "/tmp",
    `ja-${id.slice(0, 8)}.sock`
  );
  const script = join(state, "boundary-judge.ts");
  const judge = Bun.spawn(
    [
      bun,
      script,
      socket,
      parts.hookAt,
      "90",
      parts.execAt,
      parts.prefixAt,
      parts.claudeTmp,
      policy,
      "probe-build",
    ],
    { cwd: dirname(script), stdout: "pipe", stderr: "inherit" }
  );
  const ready = judge.stdout.getReader();
  await ready.read();
  ready.releaseLock();
  await writeFile(parts.hookAt, await parts.hook(socket));
  await chmod(parts.hookAt, 0o755);
  const stepped = join(home, "stepped.pl");
  await writeFile(stepped, STEPPED);
  const env = { ...process.env, CLAUDE_CODE_SHELL_PREFIX: parts.prefixAt };

  try {
    // ── j1: the hook itself ───────────────────────────────────────────
    const hooked = await leg(
      async (n) => {
        const stalls: string[] = [];
        const ran = await callOnce(
          ["/usr/bin/perl", "-T", parts.hookAt],
          callJson(clone, n),
          env,
          judge.pid,
          stalls
        );
        return { ran, stalls };
      },
      (ran) => ran.status === 0 && ran.out === ""
    );
    check(
      `j1: ${CALLS} Bash calls through the workspace's hook in a row are each allowed within ${CALL_MS / 1000} s`,
      hooked.bad.length === 0,
      `${hooked.bad.length} not: ${hooked.bad
        .slice(0, 3)
        .map(
          (one) =>
            `${one.status ?? "still waiting"} after ${one.ms} ms ${JSON.stringify(one.said.slice(0, 300))}`
        )
        .join("; ")}; slowest ${hooked.slowest} ms`
    );
    note(`j1: the slowest call took ${hooked.slowest} ms`);

    // ── j2: the same wire, each step said ─────────────────────────────
    const steps = await leg(
      async (n) => {
        const stalls: string[] = [];
        const ran = await callOnce(
          ["/usr/bin/perl", stepped, socket, parts.prefixAt],
          callJson(clone, n),
          env,
          judge.pid,
          stalls
        );
        return {
          ran,
          stalls: stalls.map(
            (one) => `the client's steps:\n${ran.said}\n${one}`
          ),
        };
      },
      (ran) => ran.status === 0 && ran.out === "0\n"
    );
    check(
      `j2: ${CALLS} calls on the hook's wire are each answered whole within ${CALL_MS / 1000} s`,
      steps.bad.length === 0,
      `${steps.bad.length} not: ${steps.bad
        .slice(0, 3)
        .map(
          (one) =>
            `${one.status ?? "still waiting"} after ${one.ms} ms, its steps ${JSON.stringify(one.said.slice(-400))}`
        )
        .join("; ")}; slowest ${steps.slowest} ms`
    );
    note(`j2: the slowest call took ${steps.slowest} ms`);

    const stalls = [...hooked.stalls, ...steps.stalls];
    if (stalls.length > 0) {
      await writeFile(
        join(kit.out, "stalls.txt"),
        stalls.join("\n\n──────── next stall\n\n")
      );
      note(
        `${stalls.length} stall(s) read where they stood: ${join(kit.out, "stalls.txt")}`
      );
    }
  } finally {
    judge.kill("SIGKILL");
    await judge.exited;
  }
};

const spec: Spec = {
  name: "judge-answers",
  ownHome:
    "it stands up a workspace's executor, hook and judge under its own HOME",
  run,
};
export default spec;
