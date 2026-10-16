/**
 * Every file of a fleet skill a harness loads is readable, and read only,
 * from inside every workspace boundary (core paths.ts `fleetSyncedPaths`).
 *
 * A fleet skill is a relative link into the tree store beside its dir
 * (`~/.claude/skills/<name>` → `../.cawco-trees/skills/<name>-<8 hex>`,
 * agent tree-swap.ts). A Claude session on an account runs with
 * `CLAUDE_CONFIG_DIR` at the account's dir, whose `skills` the boundary binds
 * at the account's own name, so the link resolved beside that name, where no
 * store was: on 2026-10-16 every leaf read `$CLAUDE_CONFIG_DIR/skills/
 * interface-craft/` as "No such file or directory". pi keeps its own copy in
 * `~/.pi/agent/skills`, inside a credential store the boundary hid whole.
 *
 * A scratch fleet (real hub, agent and sessiond; each harness against the
 * mock) carries one skill with a sub-file, from a `.tar.gz` this spec serves.
 * Then one delegate per harness (Claude Code on the account, OpenCode, pi)
 * runs one shell command in its workspace that, through every name its
 * harness hands a skill out by (Claude Code: `~/.claude/skills` and
 * `$CLAUDE_CONFIG_DIR/skills`; OpenCode: Claude Code's dir, which it reads;
 * pi: `~/.pi/agent/skills`):
 *
 * (a) reads SKILL.md and `reference/detail.md`, each answering its own
 *     content;
 * (b) appends to `reference/detail.md` and makes a new file in the skill,
 *     each refused as a read-only file system (EROFS, Linux) or not
 *     permitted (EPERM, macOS); the host's copy unchanged after.
 *
 * It delegates, so it runs as a `host` check:
 *
 *   bun scripts/probe-kit/run.ts fleet-reads
 */
import { lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { FleetSyncReport } from "../../../packages/core/src/fleet";
import { TREE_STORE_DIR } from "../../../packages/core/src/paths";
import {
  type Harness,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Spec } from "../kit";

const SKILL = "probe-reads";
/** Each file's whole content: a word the command that reads it never spells. */
const SKILL_TOKEN = "skillmd-7c41e2";
const DETAIL_TOKEN = "detail-93b0af";
const DETAIL = "reference/detail.md";
const TAG = /PROBE-READS-(claude|opencode|pi):/;
/** A refusal to write: Linux binds the trees read only, Seatbelt denies the write. */
const REFUSED = /Read-only file system|Operation not permitted/;

/** Each harness's shell tool, as `send-backgrounds` drives it. */
const SHELL: Record<
  Harness,
  (command: string) => { name: string; input: object }
> = {
  claude: (command) => ({
    name: "Bash",
    input: { command, description: "Read the fleet skill" },
  }),
  opencode: (command) => ({ name: "shell", input: { command } }),
  pi: (command) => ({ name: "bash", input: { command } }),
};

/** The skill dirs each harness hands its model, as the shell names them. */
const ROOTS: Record<Harness, Record<string, string>> = {
  claude: {
    home: `$HOME/${CLAUDE_DIR_NAME}/skills`,
    account: "$CLAUDE_CONFIG_DIR/skills",
  },
  opencode: { home: `$HOME/${CLAUDE_DIR_NAME}/skills` },
  pi: { home: "$HOME/.pi/agent/skills" },
};

/**
 * One line per probe, `FR|<harness>|<root>|<what>|<answer>`, its prefix
 * spelled apart in the command, so only the command's output carries it.
 */
const line = (harness: Harness, root: string, what: string, answer: string) =>
  `echo "F""R|${harness}|${root}|${what}|$(printf '%s' "${answer}" | tr '\\n|' '  ' | head -c 300)"`;

const commandFor = (harness: Harness): string =>
  [
    `echo "F""R|${harness}|env|config|$CLAUDE_CONFIG_DIR"`,
    ...Object.entries(ROOTS[harness]).flatMap(([root, dir]) => {
      const detail = `"${dir}/${SKILL}/${DETAIL}"`;
      const fresh = `"${dir}/${SKILL}/probe-new.md"`;
      return [
        `r=$(cat "${dir}/${SKILL}/SKILL.md" 2>&1)`,
        line(harness, root, "read-skill", "$r"),
        `r=$(cat ${detail} 2>&1)`,
        line(harness, root, "read-detail", "$r"),
        `if r=$( { printf x >> ${detail}; } 2>&1 ); then r=WROTE; fi`,
        line(harness, root, "append-detail", "$r"),
        `if r=$( { : > ${fresh}; } 2>&1 ); then r=WROTE; fi`,
        line(harness, root, "new-file", "$r"),
      ];
    }),
    `echo "F""R|${harness}|end|end|done"`,
  ].join("; ");

const steps: Partial<
  Record<Harness, { finished?: boolean; ran?: boolean; searched?: boolean }>
> = {};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Each delegate runs its one command, then finishes its item if it is offered. */
const respond = (request: Seen): Reply => {
  const harness = request.tools
    ? (TAG.exec(request.all)?.[1] as Harness | undefined)
    : undefined;
  if (!harness) {
    return text(request.tools ? "ok" : "Probe title");
  }
  const step = steps[harness] ?? {};
  steps[harness] = step;
  if (!step.ran) {
    step.ran = true;
    return { everyMs: 5, words: [], tool: SHELL[harness](commandFor(harness)) };
  }
  const finish = request.toolNames.find((name) => name.endsWith("finish_item"));
  if (!step.finished && finish) {
    step.finished = true;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: finish,
        input: { headline: "Read the skill.", summary: "Read the skill." },
      },
    };
  }
  if (
    !(step.finished || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "ToolSearch",
        input: { query: "select:mcp__cawco__finish_item", max_results: 1 },
      },
    };
  }
  return text("Done.");
};

/** The answers of `harness`'s command, by `<root>|<what>`, read from the request that carried its output. */
const answersOf = (body: string, harness: Harness): Map<string, string> => {
  const found = new Map<string, string>();
  // In a request body as JSON: a line ends at an escaped newline or a quote.
  const each = new RegExp(
    `FR\\|${harness}\\|([a-z]+)\\|([a-z-]+)\\|((?:[^"\\\\]|\\\\[^n])*)`,
    "g"
  );
  for (const match of body.matchAll(each)) {
    found.set(`${match[1]}|${match[2]}`, (match[3] ?? "").trim());
  }
  return found;
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

    // The skill, served packed as the hub fetches a URL source.
    const source = join(fleet.sandbox, "skill-source", SKILL);
    await mkdir(join(source, "reference"), { recursive: true });
    await writeFile(
      join(source, "SKILL.md"),
      `---\nname: ${SKILL}\ndescription: A skill whose sub-file a workspace reads.\n---\n\n${SKILL_TOKEN}\n`
    );
    await writeFile(join(source, DETAIL), `${DETAIL_TOKEN}\n`);
    const archive = join(fleet.sandbox, `${SKILL}.tar.gz`);
    await Bun.$`tar -czf ${archive} -C ${join(fleet.sandbox, "skill-source")} ${SKILL}`.quiet();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(Bun.file(archive)),
    });

    try {
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();

      const response = await fetch(`${fleet.base}/api/fleet/skills/${SKILL}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: `http://127.0.0.1:${server.port}/${SKILL}.tar.gz`,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      check(
        "the hub takes the skill",
        response.ok,
        `${response.status} ${await response.text()}`
      );

      // Written on the machine for Claude Code (OpenCode reads it) and pi,
      // each a link into its dir's tree store.
      const copies = {
        claude: join(home, CLAUDE_DIR_NAME, "skills", SKILL),
        pi: join(home, ".pi", "agent", "skills", SKILL),
      };
      const layout = async () =>
        Promise.all(
          Object.entries(copies).map(async ([harness, path]) => {
            const link = await lstat(path).catch(() => undefined);
            const target = link?.isSymbolicLink() ? await readlink(path) : "";
            const detail = await readFile(join(path, DETAIL), "utf8").catch(
              () => ""
            );
            return {
              harness,
              ok:
                target.includes(`${TREE_STORE_DIR}/skills/${SKILL}-`) &&
                detail === `${DETAIL_TOKEN}\n`,
              words: `${harness}: ${target || "no link"}`,
            };
          })
        );
      const written = await until(
        "the skill written for Claude Code and pi",
        layout,
        (rows) => rows.every((row) => row.ok),
        240_000
      ).catch(layout);
      const report = (
        await fleet.api<{ fleet?: FleetSyncReport; machineId: string }[]>(
          "/api/agents"
        )
      ).find((row) => row.machineId === MACHINE)?.fleet;
      check(
        "the skill is written for Claude Code and pi, each a link into its dir's tree store",
        written.every((row) => row.ok),
        `${written.map((row) => row.words).join("; ")}; report ${JSON.stringify(report?.skills?.[SKILL])}`
      );

      // A project, its lead, and one delegate per harness.
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
      const parent = await fleet.spawn("claude", "Parent", src, {
        projectId: project.id,
      });
      const harnesses: Harness[] = ["claude", "opencode", "pi"];
      for (const harness of harnesses) {
        // biome-ignore lint/performance/noAwaitInLoops: one delegate at a time, each its own workspace
        await fleet.api("/api/work-items", {
          parentInstanceId: parent,
          title: `Read the skill on ${harness}`,
          prompt: `PROBE-READS-${harness}: read the fleet skill ${SKILL}.`,
          harness,
          model: MODEL[harness],
          cwd: src,
          checks: [{ name: "Probe check", command: "true" }],
        });
      }

      for (const harness of harnesses) {
        // biome-ignore lint/performance/noAwaitInLoops: each harness's answer read in turn, all running at once
        const carried = await until(
          `${harness}'s command output`,
          () =>
            fleet.seen.find(
              (one) =>
                one.afterTool &&
                TAG.exec(one.all)?.[1] === harness &&
                one.body.includes(`FR|${harness}|end|end|done`)
            ),
          Boolean,
          600_000
        ).catch(() => undefined);
        const answers = answersOf(carried?.body ?? "", harness);
        if (harness === "claude") {
          const config = answers.get("env|config") ?? "";
          check(
            "claude: the delegate runs on the account, its CLAUDE_CONFIG_DIR an account's dir",
            config.includes("/accounts/"),
            config || "unset"
          );
        }
        for (const root of Object.keys(ROOTS[harness])) {
          const of = (what: string) => answers.get(`${root}|${what}`) ?? "";
          check(
            `${harness} (${root}): (a) SKILL.md and ${DETAIL} read inside the workspace, each its own content`,
            of("read-skill").includes(SKILL_TOKEN) &&
              of("read-detail") === DETAIL_TOKEN,
            `SKILL.md: ${of("read-skill").slice(-120)}; ${DETAIL}: ${of("read-detail")}`
          );
          check(
            `${harness} (${root}): (b) an append to ${DETAIL} and a new file in the skill are refused (EROFS or EPERM)`,
            REFUSED.test(of("append-detail")) && REFUSED.test(of("new-file")),
            `append: ${of("append-detail")}; new file: ${of("new-file")}`
          );
        }
      }

      const after = await Promise.all(
        Object.values(copies).map((path) =>
          readFile(join(path, DETAIL), "utf8").catch(() => "")
        )
      );
      const fresh = await Promise.all(
        Object.values(copies).map((path) =>
          lstat(join(path, "probe-new.md")).then(
            () => true,
            () => false
          )
        )
      );
      check(
        "(b) the host's copies are unchanged: no byte appended, no new file",
        after.every((content) => content === `${DETAIL_TOKEN}\n`) &&
          !fresh.some(Boolean),
        `${after.map((content) => JSON.stringify(content)).join(", ")}; new files: ${fresh.join(", ")}`
      );
    } finally {
      await server.stop(true);
    }
  },
};

export default spec;
