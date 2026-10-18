/**
 * The replay that picks the memory thresholds' defaults (hub config.ts
 * `MEMORY_ARCHIVE_DAYS`, `MEMORY_FILE_CHARS`): the curator run's archive and
 * fold decisions (memory-facts.ts `unusedFacts`, a file past its budget)
 * run over this repository's own curated tier, at each candidate threshold,
 * counting what each would archive or fold.
 *
 * This repository has no `knowledge/` of its own, so its curated docs stand
 * in: every bullet line of CLAUDE.md, ARCHITECTURE.md, DESIGN.md,
 * PRODUCT.md, JOURNEY.md, WORDS.md and the Projects PRD is a fact, each
 * `##` section of a doc a topic file. A line's `since` is the day git blame
 * dates it. Its uses are the later commits whose message shares two of its
 * words or more (memory.ts's own test for a note sharing a line's subject):
 * the work that would have needed it in a brief. Today is the newest
 * commit's day.
 *
 *   bun scripts/probe-kit/run.ts memory-replay
 */
import { join } from "node:path";
import {
  dayOf,
  type FactLine,
  parseFactFile,
  renderFact,
  unusedFacts,
  wordsOf,
} from "../../../packages/hub/src/memory-facts";
import { type Kit, ROOT, type Spec } from "../kit";

const DOCS = [
  "CLAUDE.md",
  "ARCHITECTURE.md",
  "DESIGN.md",
  "PRODUCT.md",
  "JOURNEY.md",
  "WORDS.md",
  ".design-foundations/plans/2026-10-06-projects.md",
];
/** The candidate thresholds: days unused before archiving, and a file's budget in characters. */
const ARCHIVE_DAYS = [14, 30, 45, 60, 90, 180];
const FILE_CHARS = [4000, 6000, 8000, 12_000, 16_000];
/**
 * Words a commit shares with a line to count as a use of it: memory.ts
 * `relatedLines`'s two, and stricter, since a commit's subject words recur
 * across a project far more than a brief's Jev-filtered lines do.
 */
const SHARED = [2, 3, 4];
/** A stand-in note id for the replay's lines: the shape a fact line needs. */
const SOURCE = "n-20260101-000000-000000";
const BULLET = /^\s*[-*] (.+)$/;
const SECTION = /^##\s+(.+)$/;
const BLAME_LINE = /^[0-9a-f]{40} \d+ (\d+)/;
const AUTHOR_TIME = /^author-time (\d+)$/;

interface Topic {
  lines: { since: string; text: string }[];
  path: string;
}

/** A doc's bullet lines by `##` section, each dated by the commit git blame gives it. */
const topicsOf = async (doc: string): Promise<Topic[]> => {
  const blame = await Bun.$`git blame --line-porcelain -- ${doc}`
    .cwd(ROOT)
    .quiet()
    .text();
  const dated = new Map<number, string>();
  let line = 0;
  for (const row of blame.split("\n")) {
    const at = BLAME_LINE.exec(row);
    if (at) {
      line = Number(at[1]);
      continue;
    }
    const time = AUTHOR_TIME.exec(row);
    if (time) {
      dated.set(line, dayOf(new Date(Number(time[1]) * 1000)));
    }
  }
  const source = await Bun.file(join(ROOT, doc)).text();
  const topics: Topic[] = [];
  let topic: Topic = { path: `${doc}#top`, lines: [] };
  for (const [index, row] of source.split("\n").entries()) {
    const heading = SECTION.exec(row);
    if (heading) {
      topics.push(topic);
      topic = { path: `${doc}#${heading[1]?.trim()}`, lines: [] };
      continue;
    }
    const bullet = BULLET.exec(row);
    const since = dated.get(index + 1);
    if (bullet?.[1] && since) {
      topic.lines.push({ text: bullet[1].replace(/[()]/g, ""), since });
    }
  }
  topics.push(topic);
  return topics.filter((each) => each.lines.length > 0);
};

/** Every commit, oldest first: its day and its message's words. */
const commitsOf = async (): Promise<{ day: string; words: Set<string> }[]> => {
  const log = await Bun.$`git log --reverse --format=%x1e%at%x1f%s%n%b`
    .cwd(ROOT)
    .quiet()
    .text();
  return log
    .split("\x1e")
    .filter(Boolean)
    .map((entry) => {
      const [time = "0", message = ""] = entry.split("\x1f");
      return {
        day: dayOf(new Date(Number(time) * 1000)),
        words: wordsOf(message),
      };
    });
};

const run = async (kit: Kit) => {
  const topics = (await Promise.all(DOCS.map(topicsOf))).flat();
  const commits = await commitsOf();
  const today = commits.at(-1)?.day ?? dayOf(new Date());
  /** A line's last use: the newest later commit sharing `shared` of its words or more. */
  const lastUseOf = (fact: FactLine, least: number): Date | undefined => {
    const words = wordsOf(fact.text);
    for (let at = commits.length - 1; at >= 0; at -= 1) {
      const commit = commits[at];
      if (!commit || commit.day <= fact.since) {
        return;
      }
      let shared = 0;
      for (const word of words) {
        shared += commit.words.has(word) ? 1 : 0;
      }
      if (shared >= least) {
        return new Date(`${commit.day}T00:00:00Z`);
      }
    }
  };
  const files = topics.map((topic) =>
    parseFactFile(
      `knowledge/${topic.path}.md`,
      `${topic.path}\n\n${topic.lines
        .map((line) =>
          renderFact({ text: line.text, since: line.since, from: [SOURCE] })
        )
        .join("\n")}\n`
    )
  );
  const facts = files.flatMap((file) => file.facts);
  const [oldest] = facts.map((fact) => fact.since).sort();
  kit.note(
    `replay: ${facts.length} lines in ${files.length} topic files from ${DOCS.length} docs, ${commits.length} commits; lines dated ${oldest} to ${today}`
  );
  for (const least of SHARED) {
    const uses = new Map(facts.map((fact) => [fact, lastUseOf(fact, least)]));
    const used = [...uses.values()].filter(Boolean).length;
    const counts = ARCHIVE_DAYS.map((days) => {
      const archived = files
        .flatMap((file) =>
          unusedFacts(file, (fact) => uses.get(fact), today, days)
        )
        .flat().length;
      return `${days} days ${archived} (${((archived / facts.length) * 100).toFixed(1)}%)`;
    });
    kit.note(
      `replay archive, a use is a later commit sharing ${least}+ words (${used} of ${facts.length} lines used again): ${counts.join(", ")}`
    );
  }
  for (const chars of FILE_CHARS) {
    const over = files.filter((file) => file.content.length > chars);
    kit.note(
      `replay fold at ${chars} characters: ${over.length} of ${files.length} files (${over.map((file) => `${file.path} ${file.content.length}`).join(", ") || "none"})`
    );
  }
  kit.check(
    "the replay read the curated tier and its history",
    facts.length > 0 && commits.length > 0,
    `${facts.length} lines, ${commits.length} commits`
  );
};

export default { name: "memory-replay", run } satisfies Spec;
