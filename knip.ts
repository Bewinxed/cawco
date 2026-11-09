/**
 * Knip (knip.dev), `bun run knip`: dead files, exports, types and
 * dependencies. Every line that is not Knip's default says why, with the line
 * that loads or runs what it names.
 *
 * A `.ts` file, not `knip.jsonc`, for the `.svelte` compiler below:
 * knip.dev/features/compilers, "Since compilers are functions, the Knip
 * configuration file must be a dynamic `.js` or `.ts` file."
 */
import type { KnipConfig } from "knip";

/*
 * The `.svelte` compiler. Knip's own (node_modules/knip/dist/plugins/svelte/
 * compiler.js) hands on a file's script imports and the `import()` calls in
 * its template expressions, nothing more. A namespace's members used in
 * markup, `import * as Dialog from "#lib/components/ui/dialog/index.js"` and
 * then `<Dialog.Root>`, are then never seen, and every member a
 * components/ui barrel exports reads as unused. This one hands on the same,
 * plus `Ns.Member` for each member of an imported namespace the file names:
 * as a tag (`<Dialog.Root`), in a template expression
 * (`as={ContextMenu.Content}`) or in a script's code (`typeof
 * Tooltip.Content`). Knip records that as a use of the member, as it does
 * in a `.ts` file. knip.dev/features/compilers: "Built-in compilers can be
 * overridden, and additional compilers can be added."
 *
 * Knip's package `exports` (".", "./config", "./session") leave out its
 * compiler helpers, so their regexes are copied here, each named with its
 * source, with the `u` flag the lint asks for (under which EXPRESSION's
 * literal braces are escaped). Its third part, the imports of a `<style lang="scss|less|stylus">`
 * (compilers/style-preprocessors.js), is left out: no `.svelte` file here
 * sets a style `lang`.
 */
// node_modules/knip/dist/compilers/compilers.js:3-9
const SCRIPT =
  /<script(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)(?<!\/)>([\s\S]*?)<\/script>/giu;
const STYLE =
  /<style(?![\w-])((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/style>/giu;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENT = /^[ \t]*\/\/.*$/gmu;
const IMPORT =
  /(?<![.\w$#])import\b(?!\s*\.)(?:\s*\(\s*['"][^'"]+['"][^)]*\)|(?!\s*\()[^'"]+['"][^'"]+['"])/gu;
// node_modules/knip/dist/compilers/svelte.js:2-5
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;
const DYNAMIC_IMPORT =
  /(?<![.\w$#])import(?:\s|\/\/[^\r\n\u2028\u2029]*(?:[\r\n\u2028\u2029]|$)|\/\*[\s\S]*?(?:\*\/|$))*\((?:\s|\/\/[^\r\n\u2028\u2029]*(?:[\r\n\u2028\u2029]|$)|\/\*[\s\S]*?(?:\*\/|$))*(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\$]|\$(?!\{))*`)[^)]*\)/gu;
const EXPRESSION = /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/gu;
const NON_CODE =
  /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\$]|\$(?!\{))*`|\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$)/gu;
// The namespace an import statement binds, a tag naming a member, and a member read in code.
const NAMESPACE = /\*\s*as\s+([A-Za-z_$][\w$]*)/u;
const TAG_MEMBER = /<([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/gu;
const MEMBER = /(?<![\w$.#])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/gu;

/** Code with its strings and comments blanked, offsets kept (svelte.js `dynamicImportsWithinTemplate`). */
const codeOf = (text: string): string =>
  text.replace(NON_CODE, (match) => " ".repeat(match.length));

const svelte = (text: string): string => {
  const scripts = [...text.matchAll(SCRIPT)].map((match) => match[2] ?? "");
  // compilers.js `importsWithinScripts`
  const imports = scripts.flatMap(
    (body) =>
      body.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "").match(IMPORT) ??
      []
  );
  const template = text
    .replace(SCRIPT, "")
    .replace(STYLE, "")
    .replace(HTML_COMMENT, "");
  const expressions = [...template.matchAll(EXPRESSION)].map(
    (match) => match[0]
  );
  // svelte.js `dynamicImportsWithinTemplate`
  const dynamicImports = template.includes("import")
    ? expressions.flatMap((expression) => {
        const code = codeOf(expression);
        return [...expression.matchAll(DYNAMIC_IMPORT)]
          .filter((match) => code.startsWith("import", match.index))
          .map((match) => match[0]);
      })
    : [];
  const namespaces = new Set(
    imports.flatMap((statement) => statement.match(NAMESPACE)?.[1] ?? [])
  );
  const members = new Set<string>();
  const add = (matches: Iterable<RegExpMatchArray>): void => {
    for (const [, namespace = "", member] of matches) {
      if (namespaces.has(namespace)) {
        members.add(`${namespace}.${member}`);
      }
    }
  };
  if (namespaces.size > 0) {
    add(template.matchAll(TAG_MEMBER));
    for (const code of [...expressions, ...scripts]) {
      add(codeOf(code).matchAll(MEMBER));
    }
  }
  return [...imports, ...dynamicImports, ...members].join(";\n");
};

export default {
  // knip.dev/reference/configuration: "Exit with non-zero code (1) if there are any configuration hints".
  treatConfigHintsAsErrors: true,
  // The `.svelte` compiler above, in place of Knip's own.
  compilers: { svelte },
  // includeEntryExports stays off for ".", apps/dashboard (*.stories.ts export what packages/agent/src/stage-host/host.ts loads by path) and packages/jsonl-parser (a published library); every other packages/* workspace turns it on.
  workspaces: {
    ".": {
      entry: [
        // golar's CLI reads golar.config.ts from its cwd (node_modules/golar/dist/cli.js:15), run at scripts/check.ts:427 and scripts/lint/golar-lint.ts:66.
        "golar.config.ts",
        // scripts/check.ts:458
        "scripts/lint/golar-lint.ts",
        // scripts/check.ts:570
        "scripts/lint/biome-plugins.ts",
        // scripts/check.ts:533
        "scripts/case-clash-check.ts",
        // Run by hand, and by a branch written with the old token names after it rebases.
        "scripts/codemods/tokens-to-theme.ts",
        "scripts/codemods/tokens-to-theme.proof.ts",
        "scripts/codemods/theme-prune.ts",
        "scripts/codemods/theme-unify.ts",
        "scripts/codemods/theme-audit.ts",
        "scripts/codemods/type-roles.ts",
        "scripts/codemods/style-spaces.ts",
        // scripts/check.ts
        "scripts/shell-bodies-check.ts",
        // scripts/check.ts, beside spacing-ratchet.ts
        "scripts/tailwind-draws-check.ts",
        // Never imported: `golar tsc -b` type-checks its `@ts-expect-error` lines, the tool door's proof (scripts/lib/tool-call.ts).
        "scripts/lib/tool-call.fixtures.ts",
        // scripts/check.ts:538
        "scripts/runtime-bundles-check.ts",
        // scripts/check.ts, beside css-scope-check.ts
        "scripts/browser-core-check.ts",
        // scripts/check.ts:555
        "scripts/style-residual-check.ts",
        // scripts/check.ts:556
        "scripts/relics-check.ts",
        // scripts/check.ts:557
        "scripts/style-greps.ts",
        // scripts/check.ts:558
        "scripts/tool-answer-check.ts",
        "scripts/route-families-check.ts",
        // scripts/check.ts:559
        "scripts/icon-imports-check.ts",
        // scripts/check.ts:560
        "scripts/docker-client-check.ts",
        // scripts/check.ts, beside docker-client-check.ts
        "scripts/browser-image-check.ts",
        // scripts/check.ts:561
        "scripts/fixed-ports-check.ts",
        // scripts/check.ts:562
        "scripts/border-width-check.ts",
        // scripts/check.ts:570
        "scripts/patched-dependencies-check.ts",
        // scripts/check.ts:622
        "scripts/surface-briefs-check.ts",
        // scripts/check.ts:639
        "scripts/setup-draft-check.ts",
        // scripts/check.ts:575
        "scripts/page-imports-check.ts",
        // scripts/check.ts:576
        "scripts/preview-switcher-check.ts",
        // scripts/check.ts:632
        "scripts/resolution-check.ts",
        // scripts/check.ts:655
        "scripts/git-door-words-check.ts",
        // scripts/ship.sh:108
        "scripts/release.ts",
        // scripts/ship.sh:44
        "scripts/republish.ts",
        // scripts/release-setup.sh:27
        "scripts/release-setup.ts",
        // scripts/release.ts:471
        "scripts/build-binary.ts",
        // scripts/release.ts:897
        "scripts/binary/build-e2e.ts",
        // scripts/release.ts:533
        "scripts/binary/info-plist.ts",
        // The standalone binary's entry and its worker threads, each a Bun.build entrypoint: scripts/build-binary.ts:376-390.
        "scripts/binary/{entry,test-entry,transcript-worker,process-table-worker,loop-watch-worker,stores-worker}.ts",
        // Put in place of the `socket-activation` package by the binary build: scripts/build-binary.ts:518.
        "scripts/binary/socket-activation.ts",
        // Loaded in place of core clock.ts by the end-to-end test builds: scripts/build-binary.ts:527.
        "scripts/binary/test-clock.ts",
        // Loaded in place of agent harnesses/index.ts by the test builds: scripts/build-binary.ts:560.
        "scripts/binary/test-harnesses.ts",
        // Each bundled by `bun build` and run on the rig's machines: scripts/binary/e2e-test.sh machine_helpers.
        "scripts/binary/e2e-{start-session,stop-session,during-install}.ts",
        // scripts/binary/e2e-test.sh:255
        "scripts/binary/e2e-fixture.ts",
        // scripts/binary/smoke-test.sh:170
        "scripts/binary/smoke-browser.ts",
        // A Claude Code hook a person installs: scripts/hooks/README.md:30.
        "scripts/hooks/delegate-nudge.ts",
        // Run on obelisk by artifacts/srt-eval/run-mac-checks.sh:192 and artifacts/srt-eval/mac-boundary-check.sh:23.
        "artifacts/srt-eval/home-toolchains.ts",
      ],
      // The root workspace's code is scripts/ (golar.config.ts and
      // artifacts/srt-eval/home-toolchains.ts join as entries, an entry being
      // a project file already). Left out: the design previews, mocks, the
      // rest of artifacts, assets and .design-foundations (outside the
      // owner's scope; nothing in packages or apps imports them), apps/apple
      // (Swift, on hold), and the fixtures (inputs the checks read, not code
      // run). `.svelte` is listed because the root's svelte devDependency
      // enables the Svelte compiler here, and a project without its extension
      // draws a configuration hint.
      project: [
        "scripts/**/*.{js,mjs,cjs,ts,mts,cts,svelte}",
        "!scripts/**/fixtures/**",
      ],
      // The types TypeScript reads for golar.config.ts:81's import of the
      // sibling index.mjs. Knip resolves that import to the .mjs itself
      // (node_modules/knip/dist/util/resolve.js:8 tries .mjs first), so it
      // never sees the declaration read; no entry or plugin names it.
      ignoreFiles: ["scripts/lint/design/index.d.mts"],
      // Declared at the root only so the type declarations of installed
      // packages that import them undeclared resolve to the checkout's copy,
      // each mapped by name in tsconfig.paths.json (bunfig.toml:1-17 and
      // tsconfig.paths.json:1-16 say why; scripts/resolution-check.ts holds
      // it). No source imports them and Knip reads no `paths` as a use, so
      // only these exact names are ignored.
      ignoreDependencies: [
        // tsconfig.paths.json:20-24: Node's builtins as @types/node and bun-types name them bare.
        "buffer",
        "events",
        "process",
        "punycode",
        "string_decoder",
        // tsconfig.paths.json:30 (gaxios)
        "undici-types",
        // tsconfig.paths.json:35 (mermaid)
        "type-fest",
        // tsconfig.paths.json:37 (remark-parse, remark-stringify)
        "vfile",
        // tsconfig.paths.json:39-45 (@earendil-works/pi-coding-agent)
        "@earendil-works/pi-agent-core",
        "@earendil-works/pi-codemode",
        "@earendil-works/pi-tui",
        // tsconfig.paths.json:48 and bunfig.toml:1-3 (vaul-svelte, huntabyte/vaul-svelte#130)
        "bits-ui",
      ],
    },
    "apps/dashboard": {
      entry: [
        // Never imported: `golar tsc -b` reads it, the drift proof of its stored-shapes.ts (packages/hub/scripts/stored-shapes.ts).
        "src/lib/cawco/stored-shapes.proof.ts",
        // Every states file under src/, found by its name by the component canvas's stage host: packages/agent/src/stage-host/host.ts:2358 (core stage.ts:568 STORY_FILE).
        "src/**/*.stories.{ts,js,tsx,jsx}",
        // The states files' preview file, read by the stage host by its name: packages/agent/src/stage-host/host.ts `previewFile`.
        ".storybook/preview.ts",
        // The decision host page's Bun.build entrypoints, the host and an HTML page's dials: packages/hub/src/decision-host.ts:281.
        "src/lib/cawco/decisions/host/host.ts",
        "src/lib/cawco/decisions/host/dials.ts",
        // The decision host's sheet, compiled by Tailwind from its path: packages/hub/src/decision-host.ts:44.
        "src/lib/cawco/decisions/host/host.css",
        // `$app/env` in the decision host's build, a Bun plugin's resolve Knip does not follow: packages/hub/src/decision-host.ts `appEnv`.
        "src/lib/cawco/decisions/host/app-env.ts",
        // `$app/env` in the address preview build, an alias Knip does not follow: scripts/address-preview.vite.ts:42-43.
        "src/lib/cawco/address/flow/kit-env.ts",
        // scripts/check.ts:544
        "scripts/specificity-trap.ts",
        // scripts/check.ts:545
        "scripts/lib-import-check.ts",
        // scripts/check.ts:546
        "scripts/svelte-unused-css.ts",
        // scripts/check.ts:547
        "scripts/spacing-ratchet.ts",
        // scripts/check.ts:582
        "scripts/css-layers-check.ts",
        // scripts/check.ts:595
        "scripts/role-order.ts",
      ],
      project: [
        // Knip's default, with the extensions its Svelte and Tailwind compilers add here.
        "**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,svelte,css}",
        // The Tailwind theme and the selection sheet are written by hand; `bun run variants` writes variants.css (scripts/build-variants.ts:32).
        "!src/lib/tokens/{theme.css,selection.css,variants.css}",
        // Written by scripts/house-faces.ts:40.
        "!src/house-faces/**",
        // The planted mistakes scripts/outro-reads-check.ts reads, not code run.
        "!scripts/fixtures/**",
      ],
      // The types TypeScript reads for the sibling .js modules that
      // src/lib/cawco/own-origin.ts:2 and vite.config.ts:26 import. Knip resolves each import to
      // the .js itself (node_modules/knip/dist/util/resolve.js:6 tries .js
      // first), so it never sees the declaration read; no entry or plugin
      // names it.
      ignoreFiles: ["public-origin.d.ts"],
      vite: {
        // The app's own config, and the address flow's design preview build: scripts/address-preview.vite.ts:8 and src/lib/cawco/address/flow/public/README.md:27 tell a person to build it.
        config: ["vite.config.ts", "scripts/address-preview.vite.ts"],
      },
    },
    "packages/agent": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
      entry: [
        // Never imported: `golar tsc -b` reads it, the drift proof of its stored-shapes.ts (packages/hub/scripts/stored-shapes.ts).
        "src/stored-shapes.proof.ts",
        // Spawned as plain Bun by the boundary: src/boundary.ts:3612; bundled for Linux at scripts/build-binary.ts:182.
        "src/boundary-host.ts",
        // Run as plain Bun as each workspace's judge: src/boundary.ts:684.
        "src/boundary-judge.ts",
        // Run as plain Bun by a macOS workspace's `log` shim: src/boundary.ts:1552.
        "src/boundary-log.ts",
        // A Worker started from its path: src/stores/client.ts:29.
        "src/stores/worker.ts",
        // Resolved for `cawco:pi-runtime` by the binary build: scripts/build-binary.ts:490.
        "src/standalone-setup.ts",
        // The canvas host page's Bun.build entrypoint: packages/hub/src/canvas-host.ts:91.
        "src/canvas-host/host.tsx",
        // The file viewer's Bun.build entrypoint: packages/core/src/file-viewer.ts `buildViewerScript`.
        "src/file-viewer/viewer.ts",
      ],
      // Read by Bun.resolveSync (src/preview-overlay/glyphs.ts:21), which
      // Knip does not follow (it follows require.resolve and
      // import.meta.resolve: knip.dev/explanations/entry-files).
      ignoreDependencies: ["@iconify-json/solar"],
    },
    "apps/cawrier": {
      // `cloudflare:workers` (src/pairing.ts:11, src/seats.ts:13) is a workerd
      // built-in module, not the `cloudflare` package. Knip 6.43.0 strips it
      // to `cloudflare` and reports it unlisted; the change that skips
      // `cloudflare:` specifiers (webpro-nl/knip#2106) was closed unmerged.
      ignoreDependencies: ["cloudflare"],
    },
    "packages/hub": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
      // knip.dev/reference/configuration: "In files with multiple exports, some of them might be used only internally. If these exports should not be reported, there is a `ignoreExportsUsedInFile` option available." Here for interfaces and types only: createServer's declared type reaches types no file imports (db/index.ts's DbShape names MemoryVersion, MemoryDocRow, SkillVersion and HookVersionMaterial; server.ts BridgedHeldPlace; project-delegate-types.ts DelegateCatalog), and `tsc -b` refuses them unexported with TS4023/TS4058 ("Exported variable 'createServer' has or is using name … but cannot be named"); they are named schemas in openapi.json too. Knip counts a type that another used export of its file names only under this option (node_modules/knip/dist/graph/analyze.js:39-42, `isReferencedInUsedExport`).
      ignoreExportsUsedInFile: { interface: true, type: true },
      entry: [
        // Never imported: `golar tsc -b` reads it, the drift proof of its stored-shapes.ts (packages/hub/scripts/stored-shapes.ts).
        "src/db/stored-shapes.proof.ts",
        // Inlined into every decision page as its script: src/decision-page.ts:123.
        "skills/decision-page/kit/page.js",
        // The decision-page skill tells the agent to run it: skills/decision-page/SKILL.md:74.
        "skills/decision-page/scripts/preview.mjs",
        // The decision-page skill tells the agent it records a mockup as a webm clip: skills/decision-page/SKILL.md:74.
        "skills/decision-page/scripts/record.mjs",
      ],
      project: [
        // Knip's default.
        "**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}",
      ],
    },
    "packages/core": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
      // A wire type a frame or a schema names beside it stays exported: `tsc -b` refuses an unexported type an exported one names (TS4023), and they are named schemas in openapi.json.
      ignoreExportsUsedInFile: { interface: true, type: true },
    },
    "packages/cli": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
    },
    "packages/sessiond": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
    },
    "packages/jsonl-parser": {
      // knip.dev/reference/configuration: "By default, Knip does not report unused exports in entry files." This package is a library published as @cawco/jsonl-parser (its package.json `publishConfig`, `files` and tsdown build), and its README's Usage documents what ".", "./fts5" and "./opencode" export as its API: public, used or not inside the repo.
      includeEntryExports: false,
    },
    "packages/icons": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
    },
    "packages/auth": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
    },
    site: {
      entry: [
        // site/DEPLOY.md:75
        "scripts/import-caw.mjs",
        // site/DEPLOY.md:82
        "scripts/lift-devices.mjs",
        // site/DEPLOY.md:85
        "scripts/og.mjs",
        // The hairline figure the hairline skill's look.mjs loads: site/DEPLOY.md:79-80.
        "art/fleet.js",
      ],
    },
  },
} satisfies KnipConfig;
