/**
 * A task's description as its sheet draws it: markdown, with what its words
 * name drawn as the transcript draws them (references.ts): a decision card
 * the task waits on, named by its question in quotes, becomes that card's
 * chip; a task id (`tsk-12`) its task's chip; a path in the project's
 * folder (`research/life/portrait.md`) a link to that file beside the view.
 * Links its writer made, code spans and fenced code stay as written.
 *
 * A card is matched only by the exact question of a wait the task carries
 * (`waits_on`), so nothing is guessed from words alone.
 */
import { referenceLink } from "@cawco/core/references";
import { outsideCode } from "../outside-code";
import { folderFileHref } from "../project-tasks";

interface Waited {
  href: string;
  kind: string;
  label: string;
}

/** A link a writer made: left whole. */
const LINK = /(\[[^\]]*\]\([^)]*\))/u;
/** A task id standing alone: `tsk-12`. */
const TASK = /(?<![\w/-])(tsk-\d{1,9})(?![\w-])/giu;
/**
 * A path in the project's folder: two or more parts joined by slashes, the
 * last with an extension (`research/web/linkedin.md`); never a URL's tail.
 */
const PATH =
  /(?<![\w/.:-])((?:[\w-][\w.-]*\/)+[\w-][\w.-]*\.[a-z0-9]{1,8})(?![\w/])/giu;
/** Straight or curly quotes round a run of words. */
const QUOTED = /["“]([^"”\n]{3,300})["”]/gu;

const cardHref = /^cawco:decision\//u;

/** `text` as markdown with what it names drawn as chips and links. */
export function describedMarkdown(
  text: string,
  { projectId, waits }: { projectId: string; waits: readonly Waited[] }
): string {
  const cards = new Map(
    waits
      .filter((wait) => wait.kind === "card" && cardHref.test(wait.href))
      .map((wait) => [wait.label.trim(), wait.href])
  );
  /** Each rewrite in turn, over the words no link holds yet. */
  const steps: ((words: string) => string)[] = [
    (words) =>
      words.replace(QUOTED, (whole, said: string) => {
        const href = cards.get(said.trim());
        return href ? `[${said.trim()}](${href})` : whole;
      }),
    (words) =>
      words.replace(TASK, (id: string) =>
        referenceLink("task", id.toLowerCase(), id)
      ),
    (words) =>
      words.replace(
        PATH,
        (path: string) => `[\`${path}\`](${folderFileHref(projectId, path)})`
      ),
  ];
  const unlinked = (run: string, step: (words: string) => string): string =>
    run
      .split(LINK)
      .map((part, i) => (i % 2 === 1 ? part : step(part)))
      .join("");
  return outsideCode(text, (run) =>
    steps.reduce((done, step) => unlinked(done, step), run)
  );
}
