/**
 * The Memory view's states (apps/dashboard ViewMemory.stories.ts) drawn
 * from fixture project folders, through the hub's own code: each folder
 * under `apps/dashboard/src/lib/cawco/memory/fixtures/<state>/` is a
 * project's memory as the hub's folder holds it (AGENTS.md, `knowledge/`,
 * `memory/inbox/`, `memory/archive/`, `memory/proposals/`), with
 * `hub.json` the rows the hub keeps beside it (each brief's carried lines,
 * the curator routine's newest run, whether Jev is on, each file's last
 * commit, the clock). The page and every file are what the
 * hub's `memoryPage` and `memoryFile` answer for it
 * (memory-view.ts), and each proposal's card what core's
 * `presentPermission` draws from the hub's `proposalInput`. Written beside
 * the folder as `<state>.json`.
 *
 *   bun scripts/memory-fixtures.ts          # write every state
 *   bun scripts/memory-fixtures.ts --check  # fail when a written state is stale
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  MEMORY_PROPOSAL_TOOL,
  type MemoryCurator,
  presentPermission,
} from "../packages/core/src/index";
import type { BriefUse } from "../packages/hub/src/db/memory-facts";
import {
  briefWhole,
  type Note,
  type Proposal,
  parseNote,
  proposalInput,
} from "../packages/hub/src/memory";
import { factKey, parseFactFile } from "../packages/hub/src/memory-facts";
import {
  type MemorySources,
  memoryFile,
  memoryPage,
} from "../packages/hub/src/memory-view";

const ROOT = join(import.meta.dir, "..");
const FIXTURES = join(ROOT, "apps/dashboard/src/lib/cawco/memory/fixtures");

/** What `hub.json` holds: the hub's rows beside the folder. */
interface HubRows {
  /** One brief's carried line: its task, when, the file, the fact's words, and the files its task named (a brand kit file is carried whole). */
  briefs?: {
    at: string;
    context?: string[];
    fact: string;
    path: string;
    taskId: string;
    title: string;
  }[];
  /** Each file's last commit, ISO; its history is that one commit unless `commits` says more. */
  changed?: Record<string, string>;
  commits?: Record<string, { at: string; author: string; message: string }[]>;
  curator?:
    | (Omit<MemoryCurator, "last" | "nextSlot"> & {
        last:
          | (Omit<
              NonNullable<MemoryCurator["last"]>,
              "endedAt" | "startedAt"
            > & {
              endedAt: string | null;
              startedAt: string;
            })
          | null;
        nextSlot: string;
      })
    | null;
  jev?: boolean;
  /** When each of the person's AGENTS.md notes was committed, in order. */
  notesAt?: string[];
  now: string;
  /** The hub's refusal: the page was not answered. */
  problem?: string;
  project: string;
  projectId: string;
}

/** Every file under `dir`, by its path from `base`. */
const filesUnder = (dir: string, base: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const at = join(dir, name);
        return statSync(at).isDirectory()
          ? filesUnder(at, base)
          : [relative(base, at)];
      })
    : [];

const notesIn = (folder: string, dir: string): Note[] =>
  filesUnder(join(folder, dir), folder)
    .filter((path) => path.endsWith(".md"))
    .sort()
    .flatMap((path) => {
      const note = parseNote(path, readFileSync(join(folder, path), "utf8"));
      return note ? [note] : [];
    });

/** The fixture state, as the hub would answer it. */
const stateOf = (name: string) => {
  const folder = join(FIXTURES, name);
  const rows = JSON.parse(
    readFileSync(join(folder, "hub.json"), "utf8")
  ) as HubRows;
  const at = (iso: string | undefined | null): Date | null =>
    iso ? new Date(iso) : null;
  const agentsPath = join(folder, "AGENTS.md");
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  const knowledge = filesUnder(join(folder, "knowledge"), folder)
    .sort()
    .map((path) => ({
      path,
      content: readFileSync(join(folder, path), "utf8"),
      changedAt: at(rows.changed?.[path]),
    }));
  const proposals = filesUnder(join(folder, "memory/proposals"), folder)
    .sort()
    .map((path) => {
      const proposal = JSON.parse(
        readFileSync(join(folder, path), "utf8")
      ) as Proposal;
      return { ...proposal, projectId: rows.projectId };
    });
  // The person's notes' days, as git blame dates their first lines.
  const agentsBlame = new Map<number, Date>();
  const lines = agents.split("\n");
  const heading = lines.findIndex((line) => line.trim() === "## Notes");
  let note = 0;
  for (
    let index = heading + 1;
    heading >= 0 && index < lines.length;
    index += 1
  ) {
    if (lines[index]?.startsWith("- ")) {
      const day = at(rows.notesAt?.[note]);
      if (day) {
        agentsBlame.set(index + 1, day);
      }
      note += 1;
    }
  }
  const briefs: BriefUse[] = (rows.briefs ?? []).map((brief) => {
    const fact = parseFactFile(
      brief.path,
      knowledge.find((file) => file.path === brief.path)?.content ?? ""
    ).facts.find((each) => each.text === brief.fact);
    if (!fact) {
      throw new Error(
        `${name}/hub.json: a brief carries "${brief.fact}", which ${brief.path} does not hold`
      );
    }
    return {
      at: new Date(brief.at),
      taskId: brief.taskId,
      title: brief.title,
      path: brief.path,
      key: factKey(brief.fact),
      chars: fact.raw.length + 1,
      // The room the brief had for fact lines, as contextFor reckons it.
      room: briefWhole(agents, knowledge, new Set(brief.context ?? [])).room,
    };
  });
  const curator = rows.curator
    ? {
        ...rows.curator,
        nextSlot: Date.parse(rows.curator.nextSlot),
        last: rows.curator.last
          ? {
              ...rows.curator.last,
              startedAt: Date.parse(rows.curator.last.startedAt),
              endedAt: rows.curator.last.endedAt
                ? Date.parse(rows.curator.last.endedAt)
                : null,
            }
          : null,
      }
    : null;
  const src: MemorySources = {
    now: new Date(rows.now),
    jev: rows.jev ?? true,
    agents,
    agentsBlame,
    agentsChangedAt: at(rows.changed?.["AGENTS.md"]),
    inbox: notesIn(folder, "memory/inbox"),
    archived: notesIn(folder, "memory/archive"),
    knowledge,
    proposals,
    briefs: briefs.sort((a, b) => b.at.getTime() - a.at.getTime()),
    curator,
  };
  const paths = [
    ...(agents ? ["AGENTS.md"] : []),
    ...knowledge.map((file) => file.path),
  ];
  const histories = Object.fromEntries(
    paths.map((path) => [
      path,
      (
        rows.commits?.[path] ??
        (rows.changed?.[path]
          ? [
              {
                at: rows.changed[path],
                author: "You",
                message: `${path}: changed`,
              },
            ]
          : [])
      ).map((commit, index) => ({
        sha: factKey(`${path}:${index}:${commit.at}`).padEnd(40, "0"),
        author: commit.author,
        date: commit.at,
        message: commit.message,
      })),
    ])
  );
  return {
    page: rows.problem ? null : memoryPage(src),
    problem: rows.problem ?? null,
    files: Object.fromEntries(
      paths.map((path) => [path, memoryFile(src, path)])
    ),
    histories,
    asks: Object.fromEntries(
      proposals.map((proposal) => {
        const input = proposalInput(proposal, rows.project);
        return [
          proposal.id,
          {
            heard: 0,
            input,
            instanceId: proposal.id,
            requestId: proposal.id,
            raisedAt: Date.parse(proposal.time),
            toolName: MEMORY_PROPOSAL_TOOL,
            presentation: presentPermission(MEMORY_PROPOSAL_TOOL, input, {
              asker: proposal.by,
              project: rows.project,
              current: () => undefined,
              memory: () => undefined,
              projectName: () => rows.project,
            }),
          },
        ];
      })
    ),
  };
};

const check = process.argv.includes("--check");
const states = readdirSync(FIXTURES)
  .filter((name) => statSync(join(FIXTURES, name)).isDirectory())
  .sort();
const stale: string[] = [];
for (const name of states) {
  const out = join(FIXTURES, `${name}.json`);
  const text = `${JSON.stringify(stateOf(name), null, 2)}\n`;
  if (check) {
    // Its words as the formatter leaves them: the same JSON, whatever its layout.
    if (
      !existsSync(out) ||
      JSON.stringify(JSON.parse(readFileSync(out, "utf8"))) !==
        JSON.stringify(JSON.parse(text))
    ) {
      stale.push(relative(ROOT, out));
    }
  } else {
    // biome-ignore lint/performance/noAwaitInLoops: one file at a time, in order
    await writeFile(out, text);
    console.log(`wrote ${relative(ROOT, out)}`);
  }
}
if (!check) {
  // As the repository formats its files (fmt.ts), so a written state is the file lint keeps.
  Bun.spawnSync(
    [
      "bun",
      "scripts/fmt.ts",
      ...states.map((name) => relative(ROOT, join(FIXTURES, `${name}.json`))),
    ],
    { cwd: ROOT }
  );
}
if (check && stale.length > 0) {
  console.error(
    `Stale memory fixtures: ${stale.join(", ")}. Run bun scripts/memory-fixtures.ts.`
  );
  process.exit(1);
}
if (check) {
  console.log(`${states.length} memory fixture states match their folders`);
}
