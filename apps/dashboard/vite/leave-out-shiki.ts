/**
 * Leaves Shiki, and the two theme catalogs, out of the build.
 *
 * `@pierre/diffs` imports `shiki/*`, `@pierre/theming/themes` and
 * `@pierre/highlights/themes/loader` from its Shiki backend and its theme
 * resolver. The dashboard runs it on the Highlights backend and registers its
 * own theme (`preferredHighlighter: "highlights"`,
 * lib/components/features/diff-theme.svelte.ts), so none of that runs. But the
 * library picks its backend from that string at run time, so the bundler
 * cannot know, and emitted every grammar (~243 chunks), every theme (~76) and
 * Shiki's core on each build.
 *
 * This plugin resolves those specifiers to a stub, when the importer is inside
 * `@pierre/diffs` or `@pierre/theming`. The stub throws if anything calls into
 * it. Upstream issue: https://github.com/pierrecomputer/pierre/issues/1253
 *
 * Delete this whole file, and its line in vite.config.ts, once `@pierre/diffs`
 * ships a Highlights-only entry.
 */
import type { Plugin } from "vite";

const STUB_ID = "\0cawco:shiki-left-out";

/** What the library's own files import: Shiki's packages, and the two catalogs. */
const LEFT_OUT =
  /^(?:shiki(?:\/|$)|@shikijs\/|@pierre\/theming\/themes$|@pierre\/highlights\/themes\/loader$)/u;
const STUB_FILTER = /^\0cawco:shiki-left-out$/u;
const LIBRARY_FILE = /[\\/]@pierre[\\/](?:diffs|theming)[\\/]/u;

/**
 * Every name the library's files import from the left-out specifiers (a static
 * import of a name the stub lacks fails the build; a dynamic import's names
 * are read at run time). Each throws when called or read.
 */
const NAMES = [
  "createCssVariablesTheme",
  "createHighlighterCore",
  "EncodedTokenMetadata",
  "INITIAL",
  "bundledLanguages",
  "createOnigurumaEngine",
  "createJavaScriptRegexEngine",
];

const STUB_SOURCE = [
  "const refuse = () => {",
  `  throw new Error("Shiki is left out of this build; @pierre/diffs runs on its Highlights backend (see apps/dashboard/vite/leave-out-shiki.ts).");`,
  "};",
  "const left = new Proxy(refuse, { get: refuse, apply: refuse, construct: refuse });",
  ...NAMES.map((name) => `export const ${name} = left;`),
  "export default left;",
].join("\n");

export const leaveOutShiki = (): Plugin => ({
  name: "cawco:leave-out-shiki",
  enforce: "pre",
  resolveId: {
    filter: { id: LEFT_OUT },
    handler(_id, importer) {
      return importer && LIBRARY_FILE.test(importer) ? STUB_ID : null;
    },
  },
  load: {
    filter: { id: STUB_FILTER },
    handler: () => STUB_SOURCE,
  },
});
