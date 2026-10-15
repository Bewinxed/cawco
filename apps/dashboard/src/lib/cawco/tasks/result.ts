/**
 * What a task's result is, so the task sheet shows the thing itself and
 * never its file: an output an attempt handed in (the task file's
 * `outputs:`, copied into `assets/<task>/`) is read by what it is, by its
 * extension, and drawn as that: a document as a document, a page as a page,
 * a mockup through the project's mockup renderer, data as what it says.
 */

/** The kinds of result the sheet draws, each its own way. */
export type ResultKind =
  "document" | "page" | "mockup" | "data" | "table" | "picture" | "text";

/** What each kind is called above it: the reader's word, never the file's. */
export const KIND_WORD: Record<ResultKind, string> = {
  document: "Document",
  page: "Page",
  mockup: "Mockup",
  data: "Data",
  table: "Table",
  picture: "Picture",
  text: "Text",
};

const EXTENSION = /\.([a-z0-9]+)$/i;
const BY_EXTENSION: Record<string, ResultKind> = {
  md: "document",
  markdown: "document",
  mdx: "document",
  txt: "document",
  html: "page",
  htm: "page",
  oui: "mockup",
  json: "data",
  csv: "table",
  tsv: "table",
  svg: "picture",
  png: "picture",
  jpg: "picture",
  jpeg: "picture",
  gif: "picture",
  webp: "picture",
};

export const resultKind = (path: string): ResultKind =>
  BY_EXTENSION[EXTENSION.exec(path)?.[1]?.toLowerCase() ?? ""] ?? "text";

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const TITLE_LINE = /^title:\s*["']?(.+?)["']?\s*$/m;
const OPENS_ON_HEADING = /^\s*#{1,6}\s/;

/**
 * A document's body without its front matter, and the title that front
 * matter gives it (a post's `title:`) where the body does not open on a
 * heading of its own, which says it already.
 */
export const documentOf = (
  text: string
): { body: string; title: string | null } => {
  const front = FRONT_MATTER.exec(text);
  if (!front) {
    return { body: text, title: null };
  }
  const body = text.slice(front[0].length);
  return {
    body,
    title: OPENS_ON_HEADING.test(body)
      ? null
      : (TITLE_LINE.exec(front[1])?.[1] ?? null),
  };
};

// --- data: JSON as what it says ---------------------------------------------

export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };

export interface JsonRecord {
  [key: string]: Json;
}

export const isRecord = (value: Json): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const CAMEL = /([a-z0-9])([A-Z])/g;
const SEPARATORS = /[_-]+/g;

/** A key as a label: `scheduled_at` and `scheduledAt` read "Scheduled at". */
export const keyLabel = (key: string): string => {
  const words = key
    .replace(CAMEL, "$1 $2")
    .replace(SEPARATORS, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
};

/** The keys a record's own name is under, in the order they are tried. */
const NAME_KEYS = ["title", "name", "headline", "subject", "label"];

/** A record's own name, when it carries one: shown as its heading, not as a row. */
export const nameKeyOf = (record: JsonRecord): string | null =>
  NAME_KEYS.find((key) => typeof record[key] === "string") ?? null;

/** A list every item of which is a record of plain values: drawn as a table. */
export const tableOf = (
  items: Json[]
): { columns: string[]; rows: JsonRecord[] } | null => {
  if (items.length === 0 || !items.every(isRecord)) {
    return null;
  }
  const rows = items as JsonRecord[];
  const plain = rows.every((row) =>
    Object.values(row).every(
      (value) => value === null || !(typeof value === "object")
    )
  );
  if (!plain) {
    return null;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return columns.length > 0 && columns.length <= 6 ? { columns, rows } : null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const URL_LIKE = /^https?:\/\/\S+$/;

/** A plain value in words: a date as a date, a yes/no as one, nothing as "None". */
export const plainWords = (value: Json): string => {
  if (value === null) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  if (typeof value === "string" && ISO_DATE.test(value)) {
    const at = new Date(value);
    if (!Number.isNaN(at.getTime())) {
      return value.length > 10
        ? at.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : at.toLocaleDateString(undefined, { dateStyle: "medium" });
    }
  }
  return String(value);
};

export const isUrl = (value: Json): value is string =>
  typeof value === "string" && URL_LIKE.test(value);

// --- tables: CSV and TSV ----------------------------------------------------

const CARRIAGE_RETURN = /\r$/;

/** A CSV or TSV file's rows, quoted fields kept whole; the first row heads the table. */
export const parseDelimited = (text: string, tab: boolean): string[][] => {
  const separator = tab ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(CARRIAGE_RETURN, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((each) => each.some((cell) => cell.trim()));
};
