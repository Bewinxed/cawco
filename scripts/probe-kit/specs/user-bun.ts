/**
 * Every Bun CawCo runs against a person's project or workspace is the
 * machine's own: the first `bun` on the PATH its services were installed
 * with (agent user-bun.ts), never the runtime a binary install embeds. On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model) whose services run with a stand-in `bun` first on their PATH: a
 * shell script in the fleet HOME's `~/.bun/bin` that writes each call (its
 * working dir and arguments) to {@link LOG_NAME} in the workspaces' cache,
 * which every boundary writes, then runs the real bun. It answers
 * `--revision` with {@link STAND_IN_REVISION} itself, so the `--bun` node
 * shim it names is the stand-in's own and the host's stays as it is. This
 * spec delegates and starts stages, so its fleet cuts workspaces: it runs on
 * the host, outside every boundary.
 *
 * With the stand-in on PATH:
 *
 * - A, a workspace's install: a delegate in a TypeScript project (its
 *   bun.lock, CawCo's own gate shape in its gate.md, scripts/probe-kit
 *   gate.ts `JS_GATE`) runs `bun install --frozen-lockfile` in its
 *   workspace: the stand-in records it there, in the delegate's clone.
 * - A, the `--bun` node shim the agent makes for workspaces (bun-node-shim.ts)
 *   links to the stand-in.
 * - A, the landing gate: the delegate commits and finishes; its item lands
 *   with the three declared steps passing, and the stand-in recorded
 *   `install --frozen-lockfile`, `run lint:changed` and `run typecheck`, each
 *   run in a clone, not the project's checkout.
 * - A, on OpenCode and pi: a delegate on each says which bun its shell finds
 *   (`command -v bun`, the stand-in) and runs the same install through its
 *   harness's shell tool (OpenCode's `shell`, pi's `bash`), recorded in its
 *   own clone, so every harness's sessions see the same bun.
 * - B, a sheet's stage: a session in a Vite + Svelte checkout (its bun.lock,
 *   nothing installed) makes a component canvas; its stage is live, and the
 *   stand-in recorded the stage clone's `install --frozen-lockfile` and the
 *   stage host (`.cawco/stage/host.mjs`).
 *
 * Then the agent is started again with no bun on its PATH (every dir holding
 * one left out, the stand-in removed). It runs on its own bun still, as
 * CawCo's own scripts do (agent boundary.ts `bunScriptRuntime`), so its
 * workspaces' boundaries start:
 *
 * - C, the landing gate: a second delegate commits and finishes; its
 *   finish_item answer says it did not land, its first step `bun install
 *   --frozen-lockfile` failing with exit 127, the shell's "no such command",
 *   and it does not land: not done, its commit not on main (what the
 *   delegate does after is its own; the hub fails an item that ends three
 *   turns without finish_item).
 * - D, a sheet's stage: a session in a Vite + Svelte checkout that installs
 *   with npm makes a component canvas; artifact_create is refused with the
 *   stage's line, that it runs on this machine's own bun and its PATH has
 *   none (agent stage.ts), with bun's install command.
 *
 *   bun scripts/probe-kit/run.ts user-bun
 */
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { sheetWords } from "../../../packages/core/src/words/sheet";
import { workWords } from "../../../packages/core/src/words/work";
import {
  type Harness,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { declareGate, JS_GATE } from "../gate";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
/** The log the stand-in writes, in the fleet HOME's workspaces' cache (core paths.ts `workspaceCacheDir`). */
const LOG_NAME = "stand-in-bun.log";
/** What the stand-in answers `bun --revision` with: a commit no real bun names, so its node shim dir is its own. */
const STAND_IN_SHA = "5ca1ab1e0";
const STAND_IN_REVISION = `${Bun.version}+${STAND_IN_SHA}`;
/** Where the agent makes the `--bun` node shim for that revision (bun-node-shim.ts `BUN_NODE_ROOT`). */
const STAND_IN_SHIM = join(
  process.platform === "darwin" ? "/private/tmp" : "/tmp",
  `bun-node-${STAND_IN_SHA}`
);
/** How finish_item answers a failed gate (work-items.ts `gateFailedText`). */
const NOT_LANDED = "Not landed: the landing gate ran on";
/** The gate's declared steps (gate.ts `JS_GATE`), each a `bun …` command; the delegate's own install is its first. */
const [INSTALL = "", LINT = "", TYPECHECK = ""] = JS_GATE.split("\n").filter(
  (line) => line.startsWith("bun ")
);
/** What the stand-in records of a command: its arguments, after `bun `. */
const argsOf = (command: string): string => command.slice("bun ".length);
const STORY = "src/Card.stories.js";
const short = (said: string) => said.replaceAll(/\s+/g, " ").slice(0, 600);
const STATUS = /"status":"(\w+)"/;

type Tag = "A" | "C" | "O" | "P";
/** A delegate's prompt marker: the report its parent reads never carries it. */
const TAG = /PROBE-USERBUN-([ACOP]):/;
/** What each Claude Code delegate commits. */
const FILES: Record<"A" | "C", string> = {
  A: "src/a.ts",
  C: "src/c.ts",
};
/** The delegates on the other harnesses, which only install: OpenCode's, pi's. */
const HARNESS_OF: Record<"O" | "P", Harness> = { O: "opencode", P: "pi" };

/** `marker` spelled apart in a command, so only the command's output carries it whole. */
const apart = (marker: string): string =>
  `"${marker.slice(0, 3)}""${marker.slice(3)}"`;

const delegateSteps: Partial<
  Record<Tag, { finish?: boolean; searched?: boolean }>
> = {};

/** What each numbered message asks a session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const COMMAND = /PROBE-CALL:(\w+)/g;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The shell as each harness names it: Claude Code's Bash, pi's bash, OpenCode's shell. */
const SHELLS = ["Bash", "bash", "shell"];

/** What a delegate's shell says of the `bun` it finds, before it installs: `BUN-AT:<path>`. */
const BUN_AT = /BUN-AT:(\/[^\s"\\]*)/;
/** And of its PATH: `PATH-AT:<PATH>`. */
const PATH_AT = /PATH-AT:(\/[^\s"\\]*)/;

/**
 * An OpenCode or pi delegate's turns: the bun its shell finds, then the
 * project's install, through its harness's own shell tool, then done. Its
 * result is read from the request's body, where every harness's tool results
 * are; the call's own words spell each marker apart.
 */
const installTurn = (request: Seen, tag: "O" | "P"): Reply => {
  const shell = SHELLS.find((name) => request.toolNames.includes(name));
  if (request.body.includes(`INSTALLED-${tag}`) || !shell) {
    return text(
      shell ? "done" : `no shell is offered: ${request.toolNames.join(", ")}`
    );
  }
  return tool(shell, {
    command: `echo ${apart("BUN-AT")}:"$(command -v bun)"; echo ${apart("PATH-AT")}:"$PATH"; ${INSTALL}; echo ${apart(`INSTALLED-${tag}`)}`,
    description: "Install the project's dependencies",
  });
};

/** A Claude Code delegate's turns: A installs first, then each commits its file and finishes once. */
const delegateTurn = (request: Seen, tag: Tag): Reply => {
  if (tag === "O" || tag === "P") {
    return installTurn(request, tag);
  }
  delegateSteps[tag] ??= {};
  const step = delegateSteps[tag];
  if (tag === "A" && !request.all.includes("INSTALLED-A")) {
    return tool("Bash", {
      // `;`, not `&&`: a failed install moves on too, and the leg's check says so.
      command: `${INSTALL}; echo ${apart("INSTALLED-A")}`,
      description: "Install the project's dependencies",
    });
  }
  if (!request.all.includes(`COMMITTED-${tag}`)) {
    const path = FILES[tag];
    return tool("Bash", {
      command: [
        `printf '%s\\n' 'export const ${tag.toLowerCase()}: number = 1;' > ${path}`,
        `git add ${path}`,
        `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
        `echo ${apart(`COMMITTED-${tag}`)}`,
      ].join(" && "),
      description: "Commit",
    });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Committed ${FILES[tag]}.`,
      summary: `Committed ${FILES[tag]}.\n\n\`git log --oneline -1\` printed: Delegate commit ${tag}\n\nNot run: none.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** A session's numbered call, as session-sheet.ts makes them. */
const callTurn = (request: Seen, marker: string): Reply => {
  const ask = asks.get(marker);
  if (!ask) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${ask.name}`, max_results: 1 })
    : text(`${ask.name} is not offered`);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  if (marker) {
    return callTurn(request, marker);
  }
  const tag = TAG.exec(request.all)?.[1] as Tag | undefined;
  return tag ? delegateTurn(request, tag) : text("ok");
};

/** `files` written into `dir`, each folder made. */
const writeFiles = async (dir: string, files: Record<string, string>) => {
  await Promise.all(
    Object.entries(files).map(async ([file, body]) => {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), body);
    })
  );
};

/** A Vite + Svelte project with one card and its states file; `lock` makes its lockfile. */
const cards = (name: string): Record<string, string> => ({
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name,
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { plugins: [svelte()] };
`,
  "index.html": "<!doctype html><html><head></head><body></body></html>\n",
  "src/Card.svelte": `<script>
  let { title } = $props();
</script>

<h2>{title}</h2>
`,
  [STORY]: `import Card from "./Card.svelte";

export default { component: Card, args: { title: "Hello" } };

export const One = { args: {} };
`,
});

/** The landing gate's lines in a report or answer: every `- …` line under its heading. */
const gateLinesOf = (said: string): string[] => {
  const at = said.indexOf(`${workWords.gateHeading}\n`);
  if (at < 0) {
    return [];
  }
  const lines = said.slice(at).split("\n").slice(1);
  const end = lines.findIndex((line) => !line.startsWith("- "));
  return end < 0 ? lines : lines.slice(0, end);
};

interface Call {
  args: string;
  pwd: string;
}

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  const hostPath = fleet.env.PATH as string;
  const env = { ...process.env, HOME: home, PATH: hostPath };
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );

  // The stand-in, first on PATH.
  const standInDir = join(home, ".bun", "bin");
  const standIn = join(standInDir, "bun");
  const log = join(home, ".cawco", "workspace-cache", LOG_NAME);
  await mkdir(standInDir, { recursive: true });
  await mkdir(dirname(log), { recursive: true });
  const real = await realpath(process.execPath);
  const quote = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;
  await writeFile(
    standIn,
    [
      "#!/bin/sh",
      `printf '%s\\t%s\\n' "$PWD" "$*" >> ${quote(log)}`,
      `[ "$1" = --revision ] && { echo ${quote(STAND_IN_REVISION)}; exit 0; }`,
      `exec ${quote(real)} "$@"`,
      "",
    ].join("\n")
  );
  await chmod(standIn, 0o755);
  await rm(STAND_IN_SHIM, { recursive: true, force: true });
  const withStandIn = { PATH: `${standInDir}${delimiter}${hostPath}` };
  const calls = async (): Promise<Call[]> =>
    (await readFile(log, "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [pwd = "", args = ""] = line.split("\t");
        return { pwd, args };
      });
  const callsSaid = (list: Call[]) =>
    list.map((one) => `${one.pwd}: bun ${one.args}`).join(" | ");

  // The projects, laid out with the host's own bun before any service starts.
  const ts = join(fleet.sandbox, "code");
  await writeFiles(ts, {
    ".gitignore": "node_modules\n",
    "package.json": `${JSON.stringify(
      {
        name: "user-bun-probe",
        private: true,
        scripts: {
          "lint:changed": "tsc --noEmit -p . --pretty false",
          typecheck: "tsc --noEmit -p .",
        },
        devDependencies: { typescript: "5.9.3" },
      },
      null,
      2
    )}\n`,
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: "esnext", target: "es2022" }, include: ["src"] }, null, 2)}\n`,
    "src/index.ts": "export const ok = true;\n",
  });
  await Bun.$`bun install --lockfile-only --no-progress`
    .cwd(ts)
    .env(env)
    .quiet();
  const commitAll = (dir: string) =>
    Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
      .cwd(dir)
      .env(env)
      .quiet();
  await commitAll(ts);
  const bunCards = join(fleet.sandbox, "cards");
  await writeFiles(bunCards, cards("user-bun-cards"));
  await Bun.$`bun install --lockfile-only --no-progress`
    .cwd(bunCards)
    .env(env)
    .quiet();
  await commitAll(bunCards);
  const npmCards = join(fleet.sandbox, "npm-cards");
  await writeFiles(npmCards, cards("user-bun-npm-cards"));
  await Bun.$`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`
    .cwd(npmCards)
    .env(env)
    .quiet();
  await commitAll(npmCards);

  fleet.launch("sessiond", [], withStandIn);
  await fleet.sessiondUp();
  fleet.launch("hub", [], withStandIn);
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], withStandIn);
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "User bun",
    machineId: "scratch-fleet",
    cwd: ts,
  });
  await declareGate(fleet.base, project.id, JS_GATE);
  const parent = await fleet.spawn("claude", "Parent", ts, {
    projectId: project.id,
  });
  const itemOf = (id: string) =>
    fleet.query<{ error: string | null; result: string | null; state: string }>(
      "SELECT state, error, result FROM work_items WHERE id = ?",
      id
    )[0];
  const delegate = (tag: Tag, harness: Harness = "claude") =>
    fleet.api<{ workItemId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `User bun ${tag}`,
      prompt: `PROBE-USERBUN-${tag}: do the probe's steps.`,
      harness,
      model: MODEL[harness],
      cwd: ts,
    });
  const realTs = await realpath(ts);
  const inClone = (one: Call) => one.pwd !== ts && one.pwd !== realTs;

  // A: the delegate's own install, in its workspace.
  const a = await delegate("A");
  await until(
    "A's install ran",
    () => fleet.seen.some((one) => one.all.includes("INSTALLED-A")),
    Boolean,
    600_000
  ).catch(() => false);
  const installed = (await calls()).filter(
    (one) => one.args === argsOf(INSTALL) && inClone(one)
  );
  check(
    "A: the delegate's `bun install --frozen-lockfile` in its workspace ran the PATH's bun, in its clone",
    installed.length === 1,
    callsSaid(await calls())
  );
  const shimBun = await readlink(join(STAND_IN_SHIM, "bun")).catch(
    () => "none"
  );
  check(
    "A: the --bun node shim the agent made for workspaces links to the PATH's bun",
    shimBun === (await realpath(standIn)),
    `${STAND_IN_SHIM}/bun -> ${shimBun}`
  );

  // A: the landing gate's steps.
  const aRow = await until(
    "A's item ended",
    () => itemOf(a.workItemId),
    (row) => ["done", "failed", "cancelled"].includes(row?.state ?? ""),
    600_000
  );
  const aLines = gateLinesOf(aRow.result ?? "");
  check(
    "A: its item lands with the declared install, lint:changed and typecheck passing",
    aRow.state === "done" &&
      aLines.length === 3 &&
      aLines[0]?.startsWith(`- ${INSTALL}: pass`) === true &&
      aLines[1]?.startsWith(`- ${LINT}: pass`) === true &&
      aLines[2]?.startsWith(`- ${TYPECHECK}: pass`) === true &&
      (aRow.result ?? "").includes(workWords.landedOn("main")),
    `${aRow.state} ${aRow.error ?? ""}\n${(aRow.result ?? "").slice(0, 1200)}`
  );
  const afterGate = (await calls()).filter(inClone);
  const ran = (args: string) =>
    afterGate.filter((one) => one.args === args).length;
  check(
    "A: the gate's steps ran the PATH's bun, in a clone: a second install, then run lint:changed and run typecheck",
    ran(argsOf(INSTALL)) >= 2 &&
      ran(argsOf(LINT)) >= 1 &&
      ran(argsOf(TYPECHECK)) >= 1,
    callsSaid(afterGate)
  );

  // A, on OpenCode and pi: each delegate's own install, in its own clone.
  for (const tag of ["O", "P"] as const) {
    const harness = HARNESS_OF[tag];
    // biome-ignore lint/performance/noAwaitInLoops: one delegate at a time, each install told apart by the clones before it
    const clonesBefore = new Set((await calls()).map((one) => one.pwd));
    await delegate(tag, harness);
    const result = await until(
      `${tag}'s install ran`,
      () => fleet.seen.find((one) => one.body.includes(`INSTALLED-${tag}`)),
      Boolean,
      600_000
    ).catch(() => undefined);
    const found = result ? BUN_AT.exec(result.body)?.[1] : undefined;
    const path = result ? PATH_AT.exec(result.body)?.[1] : undefined;
    const own = (await calls()).filter(
      (one) =>
        one.args === argsOf(INSTALL) &&
        inClone(one) &&
        !clonesBefore.has(one.pwd)
    );
    check(
      `A: a ${harness} delegate's \`${INSTALL}\` in its workspace ran the PATH's bun, in its own clone`,
      found === standIn && own.length >= 1,
      `its shell found bun at ${found ?? (result ? "none" : "(it never ran)")}, the stand-in is ${standIn}; its PATH ${path ?? "unread"}; ${callsSaid(await calls())}`
    );
  }

  // B: a sheet's stage.
  const session = await fleet.spawn("claude", "Cards", bunCards);
  const call = async (n: string, name: string, input: object, who: string) => {
    asks.set(n, { name, input: { response_format: "detailed", ...input } });
    await fleet.send(who, `PROBE-CALL:${n}`);
    return (await until(
      `${name}'s answer`,
      () => answered.get(n),
      Boolean,
      300_000
    ).catch(() => "no answer")) as string;
  };
  const before = (await calls()).length;
  const created = await call(
    "b",
    "mcp__cawco__artifact_create",
    {
      kind: "component",
      name: "cards",
      file: STORY,
      does: "judge",
      ask: "Judge the card in each of its states",
    },
    session
  );
  check(
    "B: artifact_create(kind: component) answers its stage live",
    created.match(STATUS)?.[1] === "live",
    short(created)
  );
  const staged = (await calls()).slice(before);
  const realCards = await realpath(bunCards);
  const stageClone = (one: Call) =>
    one.pwd !== bunCards && one.pwd !== realCards;
  check(
    "B: the stage clone's install and the stage host ran the PATH's bun, in the stage clone",
    staged.some((one) => one.args === argsOf(INSTALL) && stageClone(one)) &&
      staged.some(
        (one) => one.args === ".cawco/stage/host.mjs" && stageClone(one)
      ),
    callsSaid(staged)
  );

  // No bun on the agent's PATH.
  await fleet.stop("agent");
  await rm(standIn, { force: true });
  const noBun = hostPath
    .split(delimiter)
    .filter((dir) => dir && !existsSync(join(dir, "bun")))
    .join(delimiter);
  fleet.launch("agent", [], { PATH: noBun });
  await fleet.agentUp();

  // C: the landing gate refuses at its install.
  const c = await delegate("C");
  const answer = await until(
    "C's finish_item answered",
    () =>
      fleet.seen.find(
        (one) =>
          one.afterTool &&
          one.all.includes("PROBE-USERBUN-C") &&
          one.all.includes(NOT_LANDED)
      )?.all,
    Boolean,
    600_000
  ).catch(() => "");
  const said = answer.slice(answer.indexOf(NOT_LANDED));
  // Exit 127: the shell found no such command (POSIX, "Command Search and Execution").
  check(
    "C: with no bun on PATH, finish_item says it did not land: its install step failed with exit 127, no bun to run",
    said
      .split("\n")
      .some((line) => line.startsWith(`- ${INSTALL}: fail (exit 127`)),
    short(said) || "no answer read"
  );
  // What the delegate does once it is refused is its own (the hub fails an
  // item that ends three turns without finish_item); that it did not land is
  // the gate's, with no bun to run its install.
  const cRow = itemOf(c.workItemId);
  const mainLog = (
    await Bun.$`git log --format=%s main`
      .cwd(join(fleet.sandbox, "hub", "git", `${project.id}.git`))
      .nothrow()
      .quiet()
      .text()
  ).split("\n");
  check(
    "C: its item did not land: not done, and its commit is not on main",
    cRow?.state !== "done" && !mainLog.includes("Delegate commit C"),
    `${JSON.stringify(cRow)}; main: ${mainLog.filter(Boolean).join(" | ")}`
  );

  // D: a sheet's stage refuses with its line.
  const npmSession = await fleet.spawn("claude", "npm cards", npmCards);
  const refused = await call(
    "d",
    "mcp__cawco__artifact_create",
    {
      kind: "component",
      name: "npm-cards",
      file: STORY,
      does: "judge",
      ask: "Judge the card in each of its states",
    },
    npmSession
  );
  check(
    "D: with no bun on PATH, artifact_create of a sheet is refused with the stage's line and bun's install command",
    refused.includes(sheetWords.noBun),
    short(refused)
  );

  await rm(STAND_IN_SHIM, { recursive: true, force: true });
};

export default {
  name: "user-bun",
  host: "it delegates and starts stages, so its fleet cuts workspaces",
  run,
} satisfies Spec;
