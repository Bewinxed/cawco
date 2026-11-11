/**
 * An agent's block in its reply (tsk-330): a fenced code block whose info
 * string is `openui name="…"`, holding an OpenUI Lang program over the block
 * library (views-library.ts `blockLibrary`). The transcript draws it in
 * place of the code; a later fence under the same name in the same
 * conversation is its newer version. A fence with no name, or a name it
 * can't read, stays code.
 *
 * Kept as an artifact, a block is a `page` whose program is the block's
 * (hub decision-program.ts reads which library a program is written over
 * from its root, {@link programLibraryOf}), named by its name's slug
 * ({@link inlineBlockSlug}), so the transcript knows the artifact again.
 */

/** A block's fence language. */
export const INLINE_BLOCK_LANG = "openui";

/** The longest name a block takes, as the person reads it. */
const NAME_MAX = 80;

const SPACES = /\s+/gu;
/** `name="…"` in a fence's info string, after its language. */
const NAME = /(?:^|\s)name\s*=\s*"([^"\n]*)"/u;

/**
 * The name a fence gives its block, from its language and the rest of its
 * info string (marked's `lang` and streamdown's `meta`); null when the fence
 * is no block: another language, no name, or an empty one.
 */
export const inlineBlockName = (
  lang: string | undefined,
  meta: string | undefined
): string | null => {
  if (lang !== INLINE_BLOCK_LANG) {
    return null;
  }
  const name = NAME.exec(meta ?? "")?.[1]
    ?.replace(SPACES, " ")
    .trim();
  return name ? name.slice(0, NAME_MAX) : null;
};

/** One block in a text, in order: its name and its program as written. */
export interface InlineBlockFence {
  name: string;
  source: string;
}

/** A fence's opening or closing line: up to three spaces, then three or more backticks or tildes. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const SPACE = /\s/u;

/** A fence being read: its marker, its block's name (null: no block), and its lines so far. */
interface OpenFence {
  lines: string[];
  marker: string;
  name: string | null;
}

/** The fence `line` opens, or null when it opens none. */
const opened = (line: string): OpenFence | null => {
  const fence = FENCE.exec(line);
  if (!fence) {
    return null;
  }
  const info = (fence[2] ?? "").trim();
  const space = info.search(SPACE);
  return {
    marker: fence[1] ?? "```",
    name: inlineBlockName(
      space === -1 ? info : info.slice(0, space),
      space === -1 ? "" : info.slice(space + 1)
    ),
    lines: [],
  };
};

/** Whether `line` closes fence `open`: a marker at least as long, and nothing after it. */
const closes = (line: string, open: OpenFence): boolean => {
  const fence = FENCE.exec(line);
  return (
    !!fence?.[1]?.startsWith(open.marker) && (fence[2] ?? "").trim() === ""
  );
};

/**
 * Every block `text` holds, in order: each fenced code block whose info
 * string names a block ({@link inlineBlockName}), with its program. A fence
 * still open at the text's end (a reply being written) counts, its program
 * as far as it goes. Cheap on a text with none: one `includes`.
 */
export const inlineBlocksIn = (text: string): InlineBlockFence[] => {
  if (!text.includes(INLINE_BLOCK_LANG)) {
    return [];
  }
  const found: InlineBlockFence[] = [];
  const keep = (fence: OpenFence) => {
    if (fence.name) {
      found.push({ name: fence.name, source: fence.lines.join("\n") });
    }
  };
  let open: OpenFence | null = null;
  for (const line of text.split("\n")) {
    if (!open) {
      open = opened(line);
    } else if (closes(line, open)) {
      keep(open);
      open = null;
    } else {
      open.lines.push(line);
    }
  }
  if (open) {
    keep(open);
  }
  return found;
};

const SLUG = /[^a-z0-9]+/gu;
const SLUG_ENDS = /^-+|-+$/gu;

/** The artifact name a block is kept under: its name in lowercase words joined by dashes. */
export const inlineBlockSlug = (name: string): string =>
  name.toLowerCase().replace(SLUG, "-").replace(SLUG_ENDS, "").slice(0, 63) ||
  "block";

/** `root = Name(` at a statement's start: the component a program's root is. */
const ROOT = /^\s*root\s*=\s*([A-Za-z_][\w]*)\s*\(/mu;

/**
 * The library a page's program is written over, by its root's component: a
 * decision page's root is `Decisions`; a block's is `Column`. Any other
 * root is read as a decision page's, whose checks name what is wrong.
 */
export const programLibraryOf = (program: string): "decisions" | "block" =>
  ROOT.exec(program)?.[1] === "Column" ? "block" : "decisions";
