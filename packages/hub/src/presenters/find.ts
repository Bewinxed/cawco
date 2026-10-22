/**
 * `find` as an agent reads it (find-tool.ts): each hit a line, best first,
 * by its kind, title and where it is, how long ago, the words that matched,
 * and the handle `around` (or the hit's own tool) takes back; `around`'s
 * turns, a line each. The detailed form is the hits as JSON, every id whole.
 */
import { ago, count, handle, lines, quote } from "./words";

/** A task hit's id, `<project>:tsk-1`. */
const TASK_HIT = /:(tsk-\d+)$/;
/** A whole id. */
const WHOLE_ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/;
/** A whole id in brackets, as find's `where` names a project or session. */
const BRACKETED_ID = /\(([0-9a-f]{8})-[0-9a-f-]{27}\)/g;

/** A hit's id as its tools take it back: a full id's handle; a task's (`<project>:tsk-1`) its task id. */
const idWords = (id: string): string => {
  const task = TASK_HIT.exec(id);
  if (task?.[1]) {
    return task[1];
  }
  return WHOLE_ID.test(id) ? handle(id) : id;
};

/** A ref, `<hit id>#<record>`, as `around` takes it back: each half's handle. */
const refWords = (ref: string): string => {
  const [id, docId] = ref.split("#");
  return docId === undefined
    ? idWords(ref)
    : `${idWords(id ?? "")}#${handle(docId)}`;
};

/** Where a hit is, its ids as handles. */
const whereWords = (where: string): string =>
  where.replace(BRACKETED_ID, "($1)");

/** `when`, as find writes it (`2026-10-22 06:03Z`), as how long ago. */
const whenWords = (when: string | null | undefined, now: number): string =>
  when ? ago(Date.parse(when.replace(" ", "T")), now) : "at no time it knows";

interface Hit {
  excerpt?: string;
  id: string;
  kind: string;
  moments?: {
    excerpt?: string;
    ref: string;
    when: string | null;
    who: string;
  }[];
  ref?: string;
  title: string;
  when: string | null;
  where: string;
  who?: string;
}

interface Turn {
  here?: true;
  ref?: string;
  text: string;
  when?: string | null;
  who: string;
}

/** What a search answers. */
interface Searched {
  has_more: boolean;
  hits: Hit[];
  next_cursor: string | null;
  note?: string;
  total: number;
  unsearched?: string[];
}

/** What `around` answers. */
interface Around {
  around: { id: string; kind: string; title: string; where: string };
  note?: string;
  turns: Turn[];
}

const hitLine = (hit: Hit, now: number): string =>
  `- ${hit.kind} ${quote(hit.title, 120)}${hit.where ? ` · ${whereWords(hit.where)}` : ""} · ${whenWords(hit.when, now)}${hit.who ? ` · ${hit.who}` : ""}${hit.excerpt ? `: ${quote(hit.excerpt, 240)}` : ""} · ${hit.ref ? `around takes ${refWords(hit.ref)}` : `id ${idWords(hit.id)}`}`;

const turnLine = (turn: Turn, now: number): string =>
  `- ${turn.here ? "▶ " : ""}${turn.who}${turn.when ? `, ${whenWords(turn.when, now)}` : ""}: ${quote(turn.text, 2000)}${turn.ref ? ` (${refWords(turn.ref)})` : ""}`;

/** `find`: a page of hits, or the turns `around` one. */
export const findWords = (answer: Searched | Around): string => {
  const now = Date.now();
  if ("around" in answer) {
    return lines(
      `${answer.around.kind} ${quote(answer.around.title, 120)} ${idWords(answer.around.id)}${answer.around.where ? ` · ${whereWords(answer.around.where)}` : ""}:`,
      answer.turns.map((turn) => turnLine(turn, now)),
      answer.note
    );
  }
  return lines(
    answer.hits.length === 0
      ? "No hits."
      : `${count(answer.total, "hit")}, best first:`,
    answer.hits.map((hit) => hitLine(hit, now)),
    answer.note,
    answer.has_more &&
      answer.next_cursor &&
      `next_cursor: ${answer.next_cursor}`,
    !!answer.unsearched?.length &&
      `Not searched, or searched short: ${answer.unsearched.join("; ")}.`
  );
};
