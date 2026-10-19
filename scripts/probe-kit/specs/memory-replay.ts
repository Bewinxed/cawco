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
 * Today's lines were all last written within a couple of months, so the
 * archive is also measured over the docs' whole git history: every bullet
 * line they ever held lives from the commit that added it to the one that
 * removed it (or today). For each threshold, a line is archived when it goes
 * that many days with no use; it was needed again when a use follows within
 * its life. Archived and needed again is what a threshold costs.
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

const COMMIT = "\x1e";
const BULLET_CHANGE = /^([+-])\s*[-*] (.+)$/;
const DAY_MS = 86_400_000;

/** A bullet line's life in the docs: from the day a commit added it to the day one removed it, or today. */
interface Life {
  from: number;
  to: number;
  words: Set<string>;
}

/** The bullet lines one commit's diff added and removed, by their words. */
const bulletChanges = (
  diff: string[]
): { added: Set<string>; removed: Set<string> } => {
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const row of diff) {
    const change = BULLET_CHANGE.exec(row);
    if (change?.[2] && !row.startsWith("+++") && !row.startsWith("---")) {
      (change[1] === "+" ? added : removed).add(change[2].trim());
    }
  }
  return { added, removed };
};

/** Every bullet line the docs ever held, by its words, with its life: adds and removals read from their whole history. */
const livesOf = async (today: number): Promise<Life[]> => {
  const log =
    await Bun.$`git log --reverse --no-renames --unified=0 --format=${COMMIT}%at -p -- ${DOCS}`
      .cwd(ROOT)
      .quiet()
      .text();
  const alive = new Map<string, number>();
  const lives: Life[] = [];
  for (const commit of log.split(COMMIT).filter(Boolean)) {
    const [time = "0", ...diff] = commit.split("\n");
    const day = Number(time) * 1000;
    const { added, removed } = bulletChanges(diff);
    for (const text of removed) {
      const from = alive.get(text);
      if (from !== undefined && !added.has(text)) {
        lives.push({ from, to: day, words: wordsOf(text) });
        alive.delete(text);
      }
    }
    for (const text of added) {
      if (!alive.has(text)) {
        alive.set(text, day);
      }
    }
  }
  for (const [text, from] of alive) {
    lives.push({ from, to: today, words: wordsOf(text) });
  }
  return lives;
};

/**
 * What archiving after `days` unused would have done over the lives:
 * how many lines it archived, and how many of those a later use within
 * their life needed again.
 */
const archiveCost = (
  lives: Life[],
  uses: Map<Life, number[]>,
  days: number
): { archived: number; neededAgain: number } => {
  let archived = 0;
  let neededAgain = 0;
  for (const life of lives) {
    const points = [life.from, ...(uses.get(life) ?? []), life.to];
    let went = false;
    let needed = false;
    for (let at = 1; at < points.length; at += 1) {
      const gap = (points[at] ?? 0) - (points[at - 1] ?? 0);
      if (gap >= days * DAY_MS) {
        went = true;
        needed ||= at < points.length - 1;
      }
    }
    archived += went ? 1 : 0;
    neededAgain += needed ? 1 : 0;
  }
  return { archived, neededAgain };
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
  const lives = await livesOf(Date.parse(`${today}T23:59:59Z`));
  const dated = commits.map((commit) => ({
    at: Date.parse(`${commit.day}T12:00:00Z`),
    words: commit.words,
  }));
  const first = new Date(Math.min(...lives.map((life) => life.from)));
  kit.note(
    `replay over the docs' history: ${lives.length} bullet lines ever held, from ${dayOf(first)} to ${today}; ${lives.filter((life) => life.to - life.from >= 90 * DAY_MS).length} lived 90 days or more`
  );
  for (const least of SHARED) {
    const uses = new Map(
      lives.map((life) => [
        life,
        dated
          .filter((commit) => {
            if (commit.at <= life.from || commit.at > life.to) {
              return false;
            }
            let shared = 0;
            for (const word of life.words) {
              shared += commit.words.has(word) ? 1 : 0;
            }
            return shared >= least;
          })
          .map((commit) => commit.at),
      ])
    );
    const costs = ARCHIVE_DAYS.map((days) => {
      const { archived, neededAgain } = archiveCost(lives, uses, days);
      return `${days} days: ${archived} archived, ${neededAgain} needed again`;
    });
    kit.note(
      `replay history, a use is a commit sharing ${least}+ words: ${costs.join("; ")}`
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
