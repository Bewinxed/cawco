/**
 * Inside a Linux workspace's boundary every write reaches real disk or fails
 * at once naming its path: nothing a command writes is kept in the sandbox's
 * memory and lost when the boundary closes (agent boundary-policy.ts
 * `srtSettings` and `readOnlyDeniesBwrap`, the bwrap srt runs). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model). This spec delegates, so its fleet cuts a workspace: it runs on the
 * host, outside every boundary.
 *
 * One delegate, in a clone of this repository at the commit under test, runs
 * a background task and, once its completion notice has come, reads the
 * task's output file with its shell; then runs one command in its boundary,
 * then holds its turn on a long `sleep` there (so no quiet turn fails its
 * item and retires its workspace while the spec looks), and the spec closes
 * the boundary:
 *
 * - the background task's completion notice names its output file under the
 *   workspace's ro claude-tmp, and the shell reads it after the notice
 *   (before the fix the CLI wrote it under its agent's temp dir, the host's
 *   `/tmp` on the owner's machine, which the boundary hides: "No such file or
 *   directory"; agent claude.ts `sessionEnv`, core paths.ts
 *   `workspaceClaudeTmpDir`). The agent and sessiond run without the fleet's
 *   `CLAUDE_CODE_TMPDIR`, so the CLI's comes from the harness alone;
 * - a write to `~/.cache/cawco-orchestrator/probe-x`, under the read-denied
 *   home dir, by Node's fs under bun (whose error names the path, where
 *   Ubuntu's uutils `mkdir` says only "mkdir: Read-only file system"), fails
 *   with EROFS naming the target or a dir on its way to it, at or under
 *   `~/.cache` (before the fix it succeeded into the sandbox's memory);
 * - a write to `$TMPDIR` and one to the clone succeed, and both files are on
 *   the host's disk after the boundary's process is gone;
 * - `bun install --frozen-lockfile` in the clone finishes;
 * - `git commit` in the clone finishes, and the commit is in the clone's log
 *   on the host;
 * - the boundary's `HTTPS_PROXY` and `ALL_PROXY` name the srt host's relay
 *   with no credential (agent proxy-relay.ts), and curl from that URL, which
 *   presents none, reaches example.com: what a Chromium started there needs
 *   (before the relay srt's URLs carried its token as userinfo, which
 *   Chromium drops, and its pages were refused 407; the workspace spec
 *   `boundary-proxy` drives the Chromium itself);
 * - `bunx --bun` runs a package's `#!/usr/bin/env node` bin under Bun, as on
 *   the host: it reads `process.versions.bun`, and imports `bun:sqlite` as a
 *   SvelteKit vite.config does (before the fix Bun could not make its node
 *   shim in the read-only `/tmp`, so the bin ran under Node and the import
 *   failed with ERR_UNSUPPORTED_ESM_URL_SCHEME; agent bun-node-shim.ts).
 *
 *   bun scripts/probe-kit/run.ts boundary-writes
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isBoundaryOf } from "../../../packages/agent/src/proc-id";
import { RELAY_URL } from "../../../packages/agent/src/proxy-relay";
import { isAlive, signal } from "../../../packages/core/src/signal";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
/** A cold install fetches every package into the scratch fleet's empty cache. */
const INSTALL_MS = 900_000;
const TAG = "PROBE-WRITES";
const END = "WRITES-END";
const SCRATCH_FILE = "probe-scratch.txt";
const CLONE_FILE = "probe-clone.txt";
const COMMIT_SUBJECT = "Probe commit inside the boundary";
/** Under the home dir, outside every path the boundary lets a command write. */
const HOME_TARGET = ".cache/cawco-orchestrator/probe-x";
/** Node's fs error for a write refused as read-only, and the path it names. */
const EROFS_PATH = /EROFS: read-only file system, \w+ '([^']+)'/;
/** `process.versions.bun` under Bun; under Node the bin says "none-" and Node's version. */
const BUN_VERSION = /^\d+\.\d+\.\d+/;

/** `marker` spelled apart in a command, so only the command's output carries it whole. */
const apart = (marker: string): string =>
  `"${marker.slice(0, 3)}""${marker.slice(3)}"`;

/**
 * The home write: its dir made and the file written by Node's fs, whose error
 * names the path it could not make ("EROFS: read-only file system, mkdir
 * '<path>'"), then its message on stderr.
 */
const HOME_WRITE = `const fs = require("node:fs"); const path = require("node:path"); const target = process.argv[1]; try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, "probe\\n"); } catch (error) { console.error(error.message); process.exit(1); }`;

/**
 * A package in `$TMPDIR` with two `#!/usr/bin/env node` bins, each run by
 * `bunx --bun`: one says the Bun it runs under ("none" and Node's version
 * under Node), one imports `bun:sqlite` and says a query's answer, or the
 * import's error code. The markers are spelled apart in the files too.
 */
const BUNX = `mkdir -p "$TMPDIR/bunx-probe/node_modules/.bin" && cd "$TMPDIR/bunx-probe" && echo '{"name":"bunx-probe","private":true}' > package.json
cat > node_modules/.bin/probe-runtime <<'BIN'
#!/usr/bin/env node
console.log("BUNX" + "-RUNTIME:" + (process.versions.bun ?? "none-" + process.version));
BIN
cat > node_modules/.bin/probe-sqlite <<'BIN'
#!/usr/bin/env node
import("bun:sqlite").then(({ Database }) => console.log("BUNX" + "-SQLITE:" + new Database(":memory:").query("select 1 as one").get().one), (error) => console.log("BUNX" + "-SQLITE:" + error.code));
BIN
chmod +x node_modules/.bin/probe-runtime node_modules/.bin/probe-sqlite
bunx --bun probe-runtime 2>&1; bunx --bun probe-sqlite 2>&1; cd - > /dev/null`;

/** The delegate's one command: each write, the install and the commit, each followed by its exit. */
const COMMAND = [
  `bun -e '${HOME_WRITE}' "$HOME/${HOME_TARGET}" 2> "$TMPDIR/home.err"; echo ${apart("HOME-WRITE:")}$?; cat "$TMPDIR/home.err"`,
  `echo kept > "$TMPDIR/${SCRATCH_FILE}"; echo ${apart("SCRATCH-WRITE:")}$? ${apart("SCRATCH-AT:")}"$TMPDIR"`,
  `echo kept > ${CLONE_FILE}; echo ${apart("CLONE-WRITE:")}$?`,
  `bun install --frozen-lockfile > "$TMPDIR/install.log" 2>&1; echo ${apart("INSTALLED:")}$?; tail -n 3 "$TMPDIR/install.log"`,
  `git add ${CLONE_FILE} && git commit -qm '${COMMIT_SUBJECT}' 2>&1; echo ${apart("COMMITTED:")}$?`,
  `echo ${apart("HTTPS_PROXY-IS:")}"$HTTPS_PROXY" ${apart("ALL_PROXY-IS:")}"$ALL_PROXY"; echo ${apart("PROXY-CURL:")}"$(curl -sS -o /dev/null -w '%{http_code}' https://example.com/ 2>&1 | tr ' ' _)"`,
  BUNX,
  `echo ${apart(END)}`,
].join("\n");

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** A Bash call, as the delegate's model makes it. */
const bash = (input: Record<string, unknown>): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name: "Bash", input: { timeout: 600_000, ...input } },
});

/** The CLI's answer to a Bash call it runs in the background. */
const BG_STARTED = "Command running in background";
/** The output file the CLI's completion notice names. */
const BG_OUTPUT_FILE = /<output-file>([^<]+)<\/output-file>/;
/** Each line of the output file as the session's shell reads it, after this. */
const BG_LINE = "READ> ";
/** The fleet's own `CLAUDE_CODE_TMPDIR` left out of a service's environment. */
const NO_CLAUDE_TMP = { CLAUDE_CODE_TMPDIR: undefined };

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(`${TAG}:`)) {
    return text("ok");
  }
  // A background task first, read by the session's shell once its completion
  // notice has come; then the one command.
  if (!request.all.includes(BG_STARTED)) {
    return bash({
      command: `echo ${apart("BG-PAYLOAD:")}kept`,
      description: "Write a background task's output",
      run_in_background: true,
    });
  }
  const notice = BG_OUTPUT_FILE.exec(request.all)?.[1];
  if (notice === undefined) {
    return bash({ command: "sleep 2", description: "Wait for the notice" });
  }
  if (!request.all.includes("BG-READ:")) {
    return bash({
      command: `cat '${notice}' 2>&1 | sed 's/^/${BG_LINE}/'; echo ${apart("BG-READ:")}\${PIPESTATUS[0]}`,
      description: "Read the background task's output",
    });
  }
  if (!request.all.includes(END)) {
    return bash({
      command: COMMAND,
      description: "Write, install and commit inside the boundary",
    });
  }
  // Its turn held in the boundary until the spec has closed it and read the
  // disk: a "Done." would end it, and the third quiet turn in a row fails the
  // item (hub work-items.ts `QUIET_TURNS`), which can close the boundary
  // before the spec looks. Held again after the close, in the boundary the
  // next command starts.
  return bash({ command: "sleep 3600", description: "Hold the turn" });
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** The tracked tree of the commit under test, one commit in a repository of its own. */
const makeRepo = async (fleet: Fleet): Promise<string> => {
  const repo = join(fleet.sandbox, "cockpit");
  const env = { ...process.env, HOME: fleet.env.HOME as string };
  await Bun.$`mkdir -p ${repo} && git -C ${ROOT} archive HEAD | tar -x -C ${repo}`.quiet();
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'Snapshot'`
    .cwd(repo)
    .env(env)
    .quiet();
  return repo;
};

/** What the command said after `marker`, up to the end of its word. */
const after = (said: string, marker: string): string | undefined =>
  new RegExp(`${marker}(\\S*)`).exec(said)?.[1];

/** The boundary's proxy URLs name its relay with no credential, and a client presenting none gets out through it. */
const checkRelay = (kit: Kit, said: string): void => {
  const proxyAt = after(said, "HTTPS_PROXY-IS:");
  const allProxyAt = after(said, "ALL_PROXY-IS:");
  const proxyCurl = after(said, "PROXY-CURL:");
  kit.check(
    `the boundary's proxy URLs name its relay with no credential (${RELAY_URL}), and a client that presents none (curl, from that URL) reaches example.com over CONNECT: 200`,
    proxyAt === RELAY_URL && allProxyAt === RELAY_URL && proxyCurl === "200",
    JSON.stringify({ proxyAt, allProxyAt, proxyCurl })
  );
};

/** The command's output, from its first marker on. */
const outputOf = (said: string): string =>
  said.slice(said.indexOf("HOME-WRITE:"), said.indexOf(END) + END.length);

/**
 * The background task's output, as the session's shell read it after the
 * CLI's completion notice, in the workspace's ro claude-tmp (core paths.ts
 * `workspaceClaudeTmpDir`, under the fleet's HOME, not this process's).
 */
const checkBackgroundRead = (
  kit: Kit,
  said: string,
  home: string,
  workspaceId: string
): void => {
  const outputFile = BG_OUTPUT_FILE.exec(said)?.[1];
  const claudeTmp = join(
    home,
    ".cawco",
    "workspaces",
    workspaceId,
    "ro",
    "claude-tmp"
  );
  kit.check(
    "the CLI's completion notice names an output file under the workspace's ro claude-tmp",
    outputFile?.startsWith(`${claudeTmp}/`) === true,
    `notice named ${outputFile ?? "no output file"}; the workspace's claude-tmp: ${claudeTmp}`
  );
  const exit = after(said, "BG-READ:");
  const read = said
    .split("\n")
    .filter((line) => line.startsWith(BG_LINE))
    .map((line) => line.slice(BG_LINE.length));
  kit.check(
    "the session's shell reads a background task's output file after its completion notice",
    exit === "0" && read.includes("BG-PAYLOAD:kept"),
    `notice named ${outputFile ?? "no output file"}; cat exit ${exit ?? "unread"}: ${JSON.stringify(read.join(" | ").slice(0, 300))}`
  );
};

const run = async (kit: Kit) => {
  const nested =
    await Bun.$`bwrap --unshare-user --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc true`
      .quiet()
      .nothrow();
  if (nested.exitCode !== 0) {
    kit.check(
      "0: a workspace boundary can start here (run this spec on the host, not inside a workspace)",
      false,
      nested.stderr.toString().trim()
    );
    return;
  }
  const fleet = await kit.fleet(respond);
  // The session's CLI gets its temp root from the agent's claude harness
  // alone, as on the owner's machine, whose agent runs with none: the fleet
  // sets one for every service (scratch-fleet.ts `claudeTmp`), which the
  // agent would hand the CLI before the fix, and the leg would pass unfixed.
  fleet.launch("sessiond", [], NO_CLAUDE_TMP);
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], NO_CLAUDE_TMP);
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );

  const repo = await makeRepo(fleet);
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Boundary writes",
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const started = await fleet.api<{ instanceId: string; workspaceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: "Boundary writes",
      prompt: `${TAG}: write, install and commit.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    }
  );
  const said =
    (await until(
      "the delegate's command finished",
      () => fleet.seen.find((one) => one.all.includes(END))?.all,
      Boolean,
      INSTALL_MS
    ).catch(() => undefined)) ?? "";
  const output = outputOf(said);
  kit.note(output.slice(0, 1200));
  const clone =
    fleet.query<{ path: string }>(
      "SELECT path FROM workspaces WHERE id = ?",
      started.workspaceId
    )[0]?.path ?? "";

  // The boundary closed: every process of its, as sessiond holds them, ended.
  const boundaries = (await fleet.heldProcs()).filter((proc) =>
    isBoundaryOf(proc.procId, started.workspaceId)
  );
  for (const proc of boundaries) {
    signal(proc.pid, "SIGTERM");
  }
  const closed = await until(
    "the workspace's boundary closed",
    () => boundaries.every((proc) => !isAlive(proc.pid)),
    Boolean,
    60_000
  ).catch(() => false);
  kit.check(
    "the workspace's boundary ran the command and then closed",
    boundaries.length > 0 && closed === true,
    `${boundaries.length} boundary processes: ${boundaries.map((proc) => `${proc.procId}@${proc.pid}`).join(", ") || "none"}`
  );

  const homeExit = after(said, "HOME-WRITE:");
  const homeErr = said.slice(
    said.indexOf("HOME-WRITE:"),
    said.indexOf("SCRATCH-WRITE:")
  );
  // The path the error names: the target or a dir on its way, at or under
  // ~/.cache (the first one the recursive mkdir could not make).
  const target = join(home, HOME_TARGET);
  const named = EROFS_PATH.exec(homeErr)?.[1];
  const onTheWay =
    named !== undefined &&
    (target === named || target.startsWith(`${named}/`)) &&
    (named === join(home, ".cache") ||
      named.startsWith(`${join(home, ".cache")}/`));
  kit.check(
    `a write to ~/${HOME_TARGET} fails with EROFS naming the target or a dir on its way, at or under ~/.cache`,
    homeExit !== undefined && homeExit !== "0" && onTheWay,
    `${homeErr.trim() || "unread"} (named: ${named ?? "no path"})`
  );
  kit.check(
    `nothing of ~/${HOME_TARGET} is on the host`,
    !existsSync(join(home, HOME_TARGET)),
    join(home, HOME_TARGET)
  );

  const scratch = after(said, "SCRATCH-AT:") ?? "";
  const scratchText = await readFile(join(scratch, SCRATCH_FILE), "utf8").catch(
    () => undefined
  );
  kit.check(
    "a write to $TMPDIR succeeds and is on the host's disk after the boundary closed",
    after(said, "SCRATCH-WRITE:") === "0" && scratchText === "kept\n",
    `exit ${after(said, "SCRATCH-WRITE:")}; ${join(scratch, SCRATCH_FILE)} on the host: ${JSON.stringify(scratchText)}`
  );
  const cloneText = await readFile(join(clone, CLONE_FILE), "utf8").catch(
    () => undefined
  );
  kit.check(
    "a write to the clone succeeds and is on the host's disk after the boundary closed",
    after(said, "CLONE-WRITE:") === "0" && cloneText === "kept\n",
    `exit ${after(said, "CLONE-WRITE:")}; ${join(clone, CLONE_FILE)} on the host: ${JSON.stringify(cloneText)}`
  );
  const installed = after(said, "INSTALLED:");
  kit.check(
    "bun install --frozen-lockfile in the clone finishes inside the boundary",
    installed === "0",
    said
      .slice(said.indexOf("INSTALLED:"), said.indexOf("COMMITTED:"))
      .trim()
      .slice(0, 400) || "unread"
  );
  const subject = (
    await Bun.$`git -C ${clone} log -1 --format=%s`.quiet().nothrow()
  ).stdout
    .toString()
    .trim();
  kit.check(
    "git commit in the clone finishes inside the boundary, and the commit is in the clone on the host",
    after(said, "COMMITTED:") === "0" && subject === COMMIT_SUBJECT,
    `exit ${after(said, "COMMITTED:")}; the clone's last commit on the host: ${JSON.stringify(subject)}`
  );
  checkRelay(kit, said);
  checkBackgroundRead(kit, said, home, started.workspaceId);
  const runtime = after(said, "BUNX-RUNTIME:");
  kit.check(
    "bunx --bun runs a #!/usr/bin/env node bin under Bun, which reads process.versions.bun",
    runtime !== undefined && BUN_VERSION.test(runtime),
    `process.versions.bun: ${runtime ?? "unread"}`
  );
  const sqlite = after(said, "BUNX-SQLITE:");
  kit.check(
    "bunx --bun runs a bin that imports bun:sqlite, as a SvelteKit vite.config does",
    sqlite === "1",
    `bun:sqlite query: ${sqlite ?? "unread"}`
  );
};

export default {
  name: "boundary-writes",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
