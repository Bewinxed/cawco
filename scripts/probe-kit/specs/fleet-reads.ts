/**
 * Every file of a fleet skill a harness loads is readable, and read only,
 * from inside every workspace boundary (core paths.ts `fleetSyncedPaths`, and
 * in a clone `placedSyncedPaths`).
 *
 * A fleet skill is a relative link into the tree store beside its dir
 * (`~/.claude/skills/<name>` → `../.cawco-trees/skills/<name>-<8 hex>`,
 * agent tree-swap.ts). A Claude session on an account runs with
 * `CLAUDE_CONFIG_DIR` at the account's dir, whose `skills` the boundary binds
 * at the account's own name, so the link resolved beside that name, where no
 * store was: on 2026-10-16 every leaf read `$CLAUDE_CONFIG_DIR/skills/
 * interface-craft/` as "No such file or directory". pi keeps its own copy in
 * its agent dir, inside a credential store the boundary hid whole. A skill
 * bound to a project is placed in each delegate's clone
 * (`.claude/skills/<name>` → `.claude/.cawco-trees/skills/<tree>`), which the
 * delegate could write.
 *
 * A scratch fleet (real hub, agent and sessiond; each harness against the
 * mock) carries a skill with a sub-file, and one bound to a project, each
 * from a `.tar.gz` this spec serves. One delegate per harness (Claude Code on
 * the account, OpenCode, pi) runs one shell command in its workspace that,
 * through every name its harness hands a skill out by (Claude Code:
 * `~/.claude/skills` and `$CLAUDE_CONFIG_DIR/skills`; OpenCode: Claude Code's
 * dir, which it reads; pi: `~/.pi/agent/skills`) and through its clone's
 * `.claude/skills` for the placed one:
 *
 * (a) reads SKILL.md and `reference/detail.md`, each answering its own
 *     content;
 * (b) appends to `reference/detail.md`, makes a new file in the skill, and
 *     moves the skill's entry away, each refused as a read-only file system
 *     (EROFS, Linux) or not permitted (EPERM, macOS); every copy on the host
 *     unchanged after.
 *
 * (c) pi's agent dir follows `PI_CODING_AGENT_DIR`, as pi's own
 *     `getAgentDir` does: sessiond and the agent started again with it set,
 *     the fleet writes pi's skills there, a pi delegate reads them there and
 *     cannot write them, and the dir's `models.json` stays hidden as a
 *     credential store.
 *
 * It delegates, so it runs as a `host` check:
 *
 *   bun scripts/probe-kit/run.ts fleet-reads
 */
import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  CLAUDE_DIR_NAME,
  projectClaudeRelative,
  TREE_STORE_DIR,
} from "../../../packages/core/src/claude-dirs";
import {
  type Harness,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const SKILL = "probe-reads";
/** The same files, bound to the project and placed in each clone. */
const PLACED = "probe-placed";
/** Each file's whole content: a word the command that reads it never spells. */
const SKILL_TOKEN = "skillmd-7c41e2";
const DETAIL_TOKEN = "detail-93b0af";
const DETAIL = "reference/detail.md";
/** The models file the mock's pi provider is in (scratch-fleet.ts `furnish`). */
const PI_MODELS = "models.json";
/** A refusal to write: Linux binds the trees read only, Seatbelt denies the write. */
const REFUSED = /Read-only file system|Operation not permitted/;
/** How long a command waits for the fleet to place the project's skill in its clone. */
const PLACED_WAIT_S = 100;
/**
 * What a command leaves in its clone once it has read and tried to write
 * every skill, and what it then waits for before it ends: the spec reads the
 * clone's placed copy between the two. An item's end retires its workspace,
 * clone and all (hub work-items.ts `settle`), and a mock answers in
 * milliseconds, so the clone is read while the command still holds the turn.
 */
const DONE_MARK = ".probe-reads-done";
const RELEASE_MARK = ".probe-reads-release";
/** How long a command waits for the spec to read its clone. */
const RELEASE_WAIT_S = 200;

/** Where one leg reads a skill: a dir as the shell names it, and the skill's name there. */
interface Root {
  readonly dir: string;
  readonly skill: string;
}

/** One delegate: its harness, and the roots it reads through. */
interface Leg {
  readonly harness: Harness;
  /** Paths the boundary hides, each read and expected refused. */
  readonly hidden?: Record<string, string>;
  readonly key: string;
  readonly roots: Record<string, Root>;
}

const placedRoot: Root = {
  dir: `$PWD/${projectClaudeRelative("skills")}`,
  skill: PLACED,
};

const LEGS: Leg[] = [
  {
    key: "claude",
    harness: "claude",
    roots: {
      home: { dir: `$HOME/${CLAUDE_DIR_NAME}/skills`, skill: SKILL },
      account: { dir: "$CLAUDE_CONFIG_DIR/skills", skill: SKILL },
      placed: placedRoot,
    },
  },
  {
    key: "opencode",
    harness: "opencode",
    roots: {
      home: { dir: `$HOME/${CLAUDE_DIR_NAME}/skills`, skill: SKILL },
      placed: placedRoot,
    },
  },
  {
    key: "pi",
    harness: "pi",
    roots: {
      home: { dir: "$HOME/.pi/agent/skills", skill: SKILL },
      placed: placedRoot,
    },
  },
];

/** pi's agent dir for leg (c), under the fleet's home. */
const piElsewhere = (home: string) => join(home, "pi-elsewhere");

const envLeg = (home: string): Leg => ({
  key: "pienv",
  harness: "pi",
  roots: { env: { dir: join(piElsewhere(home), "skills"), skill: SKILL } },
  hidden: { models: join(piElsewhere(home), PI_MODELS) },
});

const tagOf = (key: string) => `PROBE-READS-${key.toUpperCase()}:`;
const TAG = /PROBE-READS-([A-Z]+):/;

/**
 * One line per probe, `FR|<leg>|<root>|<what>|<answer>`, its prefix spelled
 * apart in the command, so only the command's output carries it.
 */
const line = (key: string, root: string, what: string) =>
  `echo "F""R|${key}|${root}|${what}|$(printf '%s' "$r" | tr '\\n|' '  ' | head -c 300)"`;

const commandFor = (leg: Leg): string => {
  const waitPlaced = Object.values(leg.roots).includes(placedRoot)
    ? [
        `for i in $(seq ${PLACED_WAIT_S * 2}); do [ -e "${placedRoot.dir}/${PLACED}/SKILL.md" ] && break; sleep 0.5; done`,
      ]
    : [];
  return [
    ...waitPlaced,
    `r="$CLAUDE_CONFIG_DIR"`,
    line(leg.key, "env", "config"),
    ...Object.entries(leg.roots).flatMap(([root, { dir, skill }]) => {
      const at = `${dir}/${skill}`;
      return [
        `r=$(cat "${at}/SKILL.md" 2>&1)`,
        line(leg.key, root, "read-skill"),
        `r=$(cat "${at}/${DETAIL}" 2>&1)`,
        line(leg.key, root, "read-detail"),
        `if r=$( { printf x >> "${at}/${DETAIL}"; } 2>&1 ); then r=WROTE; fi`,
        line(leg.key, root, "append-detail"),
        `if r=$( { : > "${at}/probe-new.md"; } 2>&1 ); then r=WROTE; fi`,
        line(leg.key, root, "new-file"),
        `if r=$(mv "${at}" "${at}.moved" 2>&1); then r=WROTE; fi`,
        line(leg.key, root, "move-entry"),
      ];
    }),
    ...Object.entries(leg.hidden ?? {}).flatMap(([what, path]) => [
      `r=$(cat "${path}" 2>&1)`,
      line(leg.key, "hidden", what),
    ]),
    `: > "$PWD/${DONE_MARK}"`,
    `for i in $(seq ${RELEASE_WAIT_S * 2}); do [ -e "$PWD/${RELEASE_MARK}" ] && break; sleep 0.5; done`,
    `echo "F""R|${leg.key}|end|end|done"`,
  ].join("; ");
};

/** The shell tool a harness offers, and its input for `command`. */
const shellCall = (
  offered: readonly string[],
  command: string
): { name: string; input: object } | undefined => {
  if (offered.includes("Bash")) {
    return {
      name: "Bash",
      input: { command, description: "Read the fleet skill", timeout: 300_000 },
    };
  }
  if (offered.includes("shell")) {
    return { name: "shell", input: { command, timeout: 300_000 } };
  }
  return offered.includes("bash")
    ? { name: "bash", input: { command } }
    : undefined;
};

const legs = new Map<string, Leg>();
const steps = new Map<
  string,
  { finished?: boolean; offered?: string[]; ran?: boolean; searched?: boolean }
>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Each delegate runs its one command, then finishes its item if finish_item is offered. */
const respond = (request: Seen): Reply => {
  const key = request.tools
    ? TAG.exec(request.all)?.[1]?.toLowerCase()
    : undefined;
  const leg = key ? legs.get(key) : undefined;
  if (!(key && leg)) {
    return text(request.tools ? "ok" : "Probe title");
  }
  const step = steps.get(key) ?? {};
  steps.set(key, step);
  step.offered = request.toolNames;
  if (!step.ran) {
    const shell = shellCall(request.toolNames, commandFor(leg));
    if (!shell) {
      return text("No shell tool is offered.");
    }
    step.ran = true;
    return call(shell.name, shell.input);
  }
  const finish = request.toolNames.find((name) => name.endsWith("finish_item"));
  if (!step.finished && finish) {
    step.finished = true;
    return call(finish, {
      headline: "Read the skill.",
      summary: "Read the skill.",
    });
  }
  if (
    !(step.finished || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return call("ToolSearch", {
      query: "select:mcp__cawco__finish_item",
      max_results: 1,
    });
  }
  return text("Done.");
};

/** The answers of leg `key`'s command, by `<root>|<what>`, read from the request that carried its output. */
const answersOf = (body: string, key: string): Map<string, string> => {
  const found = new Map<string, string>();
  // In a request body as JSON: a line ends at an escaped newline or a quote.
  const each = new RegExp(
    `FR\\|${key}\\|([a-z]+)\\|([a-z-]+)\\|((?:[^"\\\\]|\\\\[^n])*)`,
    "g"
  );
  for (const match of body.matchAll(each)) {
    found.set(`${match[1]}|${match[2]}`, (match[3] ?? "").trim());
  }
  return found;
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A skill folder with its sub-file, packed as the hub fetches a URL source. */
const pack = async (sandbox: string, name: string): Promise<void> => {
  const folder = join(sandbox, "skill-source", name);
  await mkdir(join(folder, "reference"), { recursive: true });
  await writeFile(
    join(folder, "SKILL.md"),
    `---\nname: ${name}\ndescription: A skill whose sub-file a workspace reads.\n---\n\n${SKILL_TOKEN}\n`
  );
  await writeFile(join(folder, DETAIL), `${DETAIL_TOKEN}\n`);
  await Bun.$`tar -czf ${join(sandbox, `${name}.tar.gz`)} -C ${join(sandbox, "skill-source")} ${name}`.quiet();
};

/** The copy at `path` is a link into its dir's tree store, holding the sub-file as packed. */
const linkedCopy = async (path: string, name: string) => {
  const link = await lstat(path).catch(() => undefined);
  const target = link?.isSymbolicLink() ? await readlink(path) : "";
  const detail = await readFile(join(path, DETAIL), "utf8").catch(() => "");
  return {
    ok:
      target.includes(`${TREE_STORE_DIR}/skills/${name}-`) &&
      detail === `${DETAIL_TOKEN}\n`,
    words: `${path}: ${target || "no link"}`,
  };
};

/** A copy as packed, with nothing written into it: its sub-file's bytes and no new file. */
const untouched = async (path: string): Promise<boolean> =>
  (await readFile(join(path, DETAIL), "utf8").catch(() => "")) ===
    `${DETAIL_TOKEN}\n` &&
  !(await lstat(join(path, "probe-new.md")).then(
    () => true,
    () => false
  )) &&
  !(await lstat(`${path}:is([data-moved], [data-slot="moved"])`).then(
    () => true,
    () => false
  ));

/** A delegate per leg, in a project of `src` under `parent`; each one's workspace path by leg. */
const delegate = async (
  fleet: Fleet,
  parent: string,
  src: string,
  among: readonly Leg[]
): Promise<Map<string, string>> => {
  const paths = new Map<string, string>();
  for (const leg of among) {
    legs.set(leg.key, leg);
    // biome-ignore lint/performance/noAwaitInLoops: one delegate at a time, each its own workspace
    const started = await fleet.api<{ workspaceId: string }>(
      "/api/work-items",
      {
        parentInstanceId: parent,
        title: `Read the skill, ${leg.key}`,
        prompt: `${tagOf(leg.key)} read the fleet skills.`,
        harness: leg.harness,
        model: MODEL[leg.harness],
        cwd: src,
      }
    );
    const [row] = fleet.query<{ path: string }>(
      "SELECT path FROM workspaces WHERE id = ?",
      started.workspaceId
    );
    paths.set(leg.key, row?.path ?? "");
  }
  return paths;
};

/** What leg `key` asked the mock, for a leg whose command's output never came: its tools, its requests, how the last one ended. */
const unanswered = (fleet: Fleet, key: string): string => {
  const step = steps.get(key);
  const asked = fleet.seen.filter(
    (one) => one.tools && TAG.exec(one.all)?.[1]?.toLowerCase() === key
  );
  const last = asked.at(-1);
  return `ran: ${Boolean(step?.ran)}; offered: ${step?.offered?.join(", ") ?? "no request seen"}; ${asked.length} request(s), the last ${last?.afterTool ? "after a tool" : "not after a tool"}, ending: ${last?.body.slice(-600) ?? "none"}`;
};

/** What one leg left: its command's answers, and its clone's placed copy as the host held it then. */
interface Answered {
  readonly answers?: Map<string, string>;
  readonly leg: Leg;
  readonly placed?: {
    readonly kept: boolean;
    readonly layout: { ok: boolean; words: string };
  };
}

/**
 * Leg `leg`'s clone read on the host while its command waits
 * ({@link DONE_MARK}, {@link RELEASE_MARK}), then its answers, once a request
 * carries its command's output: any request whose body holds the command's
 * last line, spelled whole only in its output (a harness may add words of its
 * own after the tool's result).
 */
const watch = async (
  fleet: Fleet,
  leg: Leg,
  clone: string | undefined
): Promise<Answered> => {
  const copy =
    leg.roots.placed && clone
      ? join(clone, projectClaudeRelative("skills", PLACED))
      : undefined;
  let placed: Answered["placed"];
  if (clone) {
    await until(
      `${leg.key}'s command at its wait`,
      () => existsSync(join(clone, DONE_MARK)),
      Boolean,
      600_000
    ).catch(() => undefined);
    placed = copy
      ? { layout: await linkedCopy(copy, PLACED), kept: await untouched(copy) }
      : undefined;
    await writeFile(join(clone, RELEASE_MARK), "").catch(() => undefined);
  }
  const carried = await until(
    `${leg.key}'s command output`,
    () =>
      fleet.seen.find((one) => one.body.includes(`FR|${leg.key}|end|end|done`)),
    Boolean,
    600_000
  ).catch(() => undefined);
  return {
    leg,
    ...(carried ? { answers: answersOf(carried.body, leg.key) } : {}),
    ...(placed ? { placed } : {}),
  };
};

/** (a) and (b) for each leg, every leg watched at once ({@link watch}). */
const judge = async (
  kit: Kit,
  fleet: Fleet,
  among: readonly Leg[],
  clones: ReadonlyMap<string, string>
) => {
  const all = await Promise.all(
    among.map((leg) => watch(fleet, leg, clones.get(leg.key)))
  );
  for (const one of all) {
    report(kit, fleet, one);
  }
};

/** One leg's checks, from what {@link watch} read. */
const report = (kit: Kit, fleet: Fleet, { answers, leg, placed }: Answered) => {
  if (placed) {
    kit.check(
      `${leg.key}: the project's skill is placed in its clone, a link into the clone's tree store, unchanged on the host after the command`,
      placed.layout.ok && placed.kept,
      `${placed.layout.words}; ${placed.kept ? "kept" : "changed"}`
    );
  }
  if (!answers) {
    kit.check(
      `${leg.key}: the delegate's command ran in its workspace`,
      false,
      unanswered(fleet, leg.key)
    );
    return;
  }
  if (leg.key === "claude") {
    const config = answers.get("env|config") ?? "";
    kit.check(
      "claude: the delegate runs on the account, its CLAUDE_CONFIG_DIR an account's dir",
      config.includes("/accounts/"),
      config || "unset"
    );
  }
  for (const [root, { skill }] of Object.entries(leg.roots)) {
    const of = (what: string) => answers.get(`${root}|${what}`) ?? "";
    kit.check(
      `${leg.key} (${root}): (a) ${skill}'s SKILL.md and ${DETAIL} read inside the workspace, each its own content`,
      of("read-skill").includes(SKILL_TOKEN) &&
        of("read-detail") === DETAIL_TOKEN,
      `SKILL.md: ${of("read-skill").slice(-160)}; ${DETAIL}: ${of("read-detail")}`
    );
    kit.check(
      `${leg.key} (${root}): (b) an append to ${DETAIL}, a new file in the skill and moving the skill's entry away are each refused (EROFS or EPERM)`,
      REFUSED.test(of("append-detail")) &&
        REFUSED.test(of("new-file")) &&
        REFUSED.test(of("move-entry")),
      `append: ${of("append-detail")}; new file: ${of("new-file")}; move: ${of("move-entry")}`
    );
  }
  for (const what of Object.keys(leg.hidden ?? {})) {
    const answer = answers.get(`hidden|${what}`) ?? "";
    kit.check(
      `${leg.key}: (c) the agent dir's ${PI_MODELS} stays hidden as a credential store`,
      answer !== "" && !answer.includes("mockpi"),
      answer || "no answer"
    );
  }
};

const spec: Spec = {
  name: "fleet-reads",
  run: async (kit) => {
    const { check } = kit;
    if (process.platform === "linux") {
      const nested =
        await Bun.$`bwrap --unshare-user --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc true`
          .quiet()
          .nothrow();
      if (nested.exitCode !== 0) {
        check(
          "0: a workspace boundary can start here (run this spec on the host, not inside a workspace)",
          false,
          nested.stderr.toString().trim()
        );
        return;
      }
    }
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    await pack(fleet.sandbox, SKILL);
    await pack(fleet.sandbox, PLACED);
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) =>
        new Response(
          Bun.file(join(fleet.sandbox, new URL(request.url).pathname.slice(1)))
        ),
    });
    const put = async (name: string, extra: object = {}) => {
      const response = await fetch(`${fleet.base}/api/fleet/skills/${name}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: `http://127.0.0.1:${server.port}/${name}.tar.gz`,
          ...extra,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      check(
        `the hub takes ${name}`,
        response.ok,
        `${response.status} ${await response.text()}`
      );
    };
    const boot = async () => {
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("agent");
      await fleet.agentUp();
    };

    try {
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();

      // A project, its lead, and the skills: one for every session, one
      // bound to the project.
      const src = join(fleet.sandbox, "src");
      await mkdir(src, { recursive: true });
      await writeFile(
        join(home, ".gitconfig"),
        "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
      );
      await Bun.$`sh -c ${"git init -q -b main && echo reads > README.md && git add -A && git commit -qm 'First commit'"}`
        .cwd(src)
        .env({ ...process.env, HOME: home })
        .quiet();
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name: "Reads",
        machineId: MACHINE,
        cwd: src,
      });
      await put(SKILL);
      await put(PLACED, { projectId: project.id });

      // Written on the machine for Claude Code (OpenCode reads it) and pi,
      // each a link into its dir's tree store.
      const copies = [
        join(home, CLAUDE_DIR_NAME, "skills", SKILL),
        join(home, ".pi", "agent", "skills", SKILL),
      ];
      const layout = () =>
        Promise.all(copies.map((path) => linkedCopy(path, SKILL)));
      const written = await until(
        "the skill written for Claude Code and pi",
        layout,
        (rows) => rows.every((row) => row.ok),
        240_000
      ).catch(layout);
      check(
        "the skill is written for Claude Code and pi, each a link into its dir's tree store",
        written.every((row) => row.ok),
        written.map((row) => row.words).join("; ")
      );

      const parent = await fleet.spawn("claude", "Parent", src, {
        projectId: project.id,
      });
      const clones = await delegate(fleet, parent, src, LEGS);
      await judge(kit, fleet, LEGS, clones);
      const kept = await Promise.all(copies.map(untouched));
      check(
        "(b) the machine's copies are unchanged: no byte appended, no new file, nothing moved",
        kept.every(Boolean),
        copies
          .map((path, at) => `${path}: ${kept[at] ? "kept" : "changed"}`)
          .join("; ")
      );

      // (c) pi's agent dir elsewhere: sessiond and the agent started again
      // with PI_CODING_AGENT_DIR, the mock's models carried there.
      const elsewhere = piElsewhere(home);
      await mkdir(elsewhere, { recursive: true });
      await copyFile(
        join(home, ".pi", "agent", PI_MODELS),
        join(elsewhere, PI_MODELS)
      );
      await fleet.stop("agent");
      await fleet.stop("sessiond");
      fleet.env.PI_CODING_AGENT_DIR = elsewhere;
      await boot();
      const moved = await until(
        "the skill written into pi's agent dir elsewhere",
        () => linkedCopy(join(elsewhere, "skills", SKILL), SKILL),
        (row) => row.ok,
        240_000
      ).catch(() => linkedCopy(join(elsewhere, "skills", SKILL), SKILL));
      check(
        "(c) with PI_CODING_AGENT_DIR set, the fleet writes pi's skill there, a link into that dir's tree store",
        moved.ok,
        moved.words
      );
      const leg = envLeg(home);
      const lead = await fleet.spawn("claude", "Parent again", src, {
        projectId: project.id,
      });
      const envClone = await delegate(fleet, lead, src, [leg]);
      await judge(kit, fleet, [leg], envClone);
      check(
        "(c) pi's skill in the agent dir elsewhere is unchanged on the host",
        await untouched(join(elsewhere, "skills", SKILL)),
        envClone.get(leg.key) ?? ""
      );
    } finally {
      await server.stop(true);
    }
  },
};

export default spec;
