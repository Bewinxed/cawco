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

import { fencedBlocks } from "./markdown-code";
import { nameSlug } from "./name-slug";

/** A block's fence language. */
export const INLINE_BLOCK_LANG = "openui";

/** The longest name a block takes, as the person reads it. */
const NAME_MAX = 80;

const SPACES = /\s+/gu;
/** `name="…"` in a fence's info string, after its language. */
const NAME = /(?:^|\s)name\s*=\s*"([^"\n]*)"/u;

/**
 * The name a fence gives its block, from its language and the rest of its
 * info string (its first word, and what follows it); null when the fence
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
  return fencedBlocks(text).flatMap((block) => {
    const name = inlineBlockName(block.lang, block.meta);
    return name ? [{ name, source: block.code }] : [];
  });
};

/** The artifact name a block is kept under: its name as a slug (name-slug.ts). */
export const inlineBlockSlug = (name: string): string =>
  nameSlug(name) || "block";

/** `root = Name(` at a statement's start: the component a program's root is. */
const ROOT = /^\s*root\s*=\s*([A-Za-z_][\w]*)\s*\(/mu;

/**
 * The library a page's program is written over, by its root's component: a
 * decision page's root is `Decisions`; a block's is `Column`. Any other
 * root is read as a decision page's, whose checks name what is wrong.
 */
export const programLibraryOf = (program: string): "decisions" | "block" =>
  ROOT.exec(program)?.[1] === "Column" ? "block" : "decisions";

/**
 * Where a file a block's Image, Video or Audio names is read: an absolute
 * path on the machine of the session that wrote it (hub `GET
 * /api/agents/:machineId/media`, as `show_image` shows one), or a path in
 * its project's folder (`GET /api/projects/:id/folder/raw`, as a report's
 * outputs are drawn). Kept as a page, the hub copies each beside the page.
 */
export type BlockFile =
  { on: "machine"; path: string } | { on: "folder"; path: string };

/** A scheme at a name's start (`https:`, `data:`, `file:`): a web address, never a file. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
const DOT_SLASH = /^(?:\.\/)+/u;

/** Where `file` is read from; null when it names no file a block may show: empty, a web address, or a path that climbs (`..`). */
export const blockFile = (file: string): BlockFile | null => {
  const path = file.trim();
  if (
    !path ||
    SCHEME.test(path) ||
    path.startsWith("//") ||
    path.split("/").includes("..")
  ) {
    return null;
  }
  return path.startsWith("/")
    ? { on: "machine", path }
    : { on: "folder", path: path.replace(DOT_SLASH, "") };
};
