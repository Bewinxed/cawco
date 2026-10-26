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
  // includeEntryExports stays off for "." (probe specs under scripts/probe-kit/specs export what scripts/probe-kit/run.ts loads by path), apps/dashboard (*.stories.ts export what packages/agent/src/stage-host/host.ts loads by path) and packages/jsonl-parser (a published library); every other packages/* workspace turns it on.
  workspaces: {
    ".": {
      entry: [
        // golar's CLI reads golar.config.ts from its cwd (node_modules/golar/dist/cli.js:15), run at scripts/check.ts:427 and scripts/lint/golar-lint.ts:66.
        "golar.config.ts",
        // scripts/check.ts:459
        "scripts/lint/golar-lint.ts",
        // scripts/check.ts:534
        "scripts/case-clash-check.ts",
        // scripts/check.ts:539
        "scripts/runtime-bundles-check.ts",
        // scripts/check.ts:556
        "scripts/style-residual-check.ts",
        // scripts/check.ts:557
        "scripts/relics-check.ts",
        // scripts/check.ts:558
        "scripts/style-greps.ts",
        // scripts/check.ts:559
        "scripts/tool-answer-check.ts",
        // scripts/check.ts:560
        "scripts/icon-imports-check.ts",
        // scripts/check.ts:561
        "scripts/docker-client-check.ts",
        // scripts/check.ts:562
        "scripts/border-width-check.ts",
        // scripts/check.ts:575
        "scripts/page-imports-check.ts",
        // scripts/check.ts:576
        "scripts/preview-switcher-check.ts",
        // scripts/check.ts:580
        "scripts/probe-words-check.ts",
        // scripts/check.ts:586
        "scripts/probe-waits-check.ts",
        // scripts/check.ts:592
        "scripts/probe-groups-check.ts",
        // scripts/check.ts:626
        "scripts/resolution-check.ts",
        // scripts/ship.sh:86
        "scripts/release.ts",
        // scripts/ship.sh:36
        "scripts/release-quota.ts",
        // scripts/release-setup.sh:27
        "scripts/release-setup.ts",
        // scripts/release.ts:471
        "scripts/build-binary.ts",
        // scripts/release.ts:897
        "scripts/binary/build-stage2.ts",
        // scripts/release.ts:533
        "scripts/binary/info-plist.ts",
        // The standalone binary's entry and its worker threads, each a Bun.build entrypoint: scripts/build-binary.ts:376-390.
        "scripts/binary/{entry,proof-entry,transcript-worker,process-table-worker,loop-watch-worker,stores-worker}.ts",
        // Put in place of the `socket-activation` package by the binary build: scripts/build-binary.ts:518.
        "scripts/binary/socket-activation.ts",
        // Loaded in place of core clock.ts by the stage 2 proof build: scripts/build-binary.ts:527.
        "scripts/binary/proof-clock.ts",
        // Loaded in place of sessiond list-pace.ts by the stage 2 proof build: scripts/build-binary.ts:538.
        "scripts/binary/proof-list-pace.ts",
        // Loaded in place of agent harnesses/index.ts by the proof builds: scripts/build-binary.ts:560.
        "scripts/binary/proof-harnesses.ts",
        // Each bundled by `bun build` and run on the rig's machines: scripts/binary/prove-stage2.sh:289-290.
        "scripts/binary/stage2-{start-session,stop-session,send,sends,signin,during-install,hook-calls,preview-port}.ts",
        // scripts/binary/prove-stage2.sh:255
        "scripts/binary/stage2-fixture.ts",
        // scripts/binary/prove-stage1.sh:170
        "scripts/binary/proof-browser.ts",
        // A Claude Code hook a person installs: scripts/hooks/README.md:30.
        "scripts/hooks/delegate-nudge.ts",
        // `--preload`ed into every scratch fleet service: scripts/scratch-fleet.ts:1647 and :1649.
        "scripts/scratch-fleet-leash.ts",
        "scripts/stand-ins/preload.ts",
        // Loaded by path in place of product modules: scripts/stand-ins/preload.ts:14-15.
        "scripts/stand-ins/{hub-upstreams,canvas-host-plugins}.ts",
        // Loaded by path in place of agent canvas-host/bound.ts: scripts/stand-ins/canvas-host-plugins.ts:16.
        "scripts/stand-ins/canvas-bound.ts",
        // Spawned by the spec that proves the hub's one writer: scripts/probe-kit/specs/hub-one-writer.ts:34.
        "scripts/repair-account-history.ts",
        // The probe kit's runner: scripts/probe-kit/README.md:10.
        "scripts/probe-kit/run.ts",
        // Each spec imported by its name: scripts/probe-kit/run.ts:109 and :128.
        "scripts/probe-kit/specs/*.ts",
        // Each web spec imported by its name: scripts/probe-kit/run.ts:113 and :128.
        "scripts/probe-kit/specs/web/*.ts",
        // scripts/probe-kit/specs/browser-cap.ts:28
        "scripts/probe-kit/browser-cap-child.ts",
        // scripts/probe-kit/specs/fsevents-scope.ts:47-50
        "scripts/probe-kit/fsevents-browsers-child.ts",
        // scripts/probe-kit/specs/heavy-slots.ts:64 and specs/probe-slots.ts:41
        "scripts/probe-kit/slot-child.ts",
        // scripts/probe-kit/specs/signal-wall.ts:28
        "scripts/probe-kit/signal-wall-child.ts",
        // scripts/probe-kit/specs/sleep-listener.ts:33
        "scripts/probe-kit/sleep-listener-child.ts",
        // scripts/probe-kit/specs/store-reads-loop.ts:308
        "scripts/probe-kit/store-reads-child.ts",
        // scripts/probe-kit/specs/atomic-writes.ts:26
        "scripts/probe-kit/atomic-writer.ts",
        // scripts/probe-kit/specs/host-lfs.ts:223
        "scripts/probe-kit/host-origin-git-env-child.ts",
        // scripts/probe-kit/specs/fsevents-scope.ts:52
        "scripts/probe-kit/fsevents-claude-args.ts",
        // A Bun.build entrypoint: scripts/probe-kit/decision-embeds.ts:77.
        "scripts/probe-kit/decision-pick-wiring.ts",
        // Each journey found by its file name and imported: scripts/probe-kit/journeys/run.ts:13, :20 and :43.
        "scripts/probe-kit/journeys/j*-*.ts",
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
        // tsconfig.paths.json:32 (playwright-core, jsrepo)
        "zod",
        // tsconfig.paths.json:35-37 (jsrepo)
        "@clack/prompts",
        "fast-glob",
        "picocolors",
        // tsconfig.paths.json:39 (mermaid)
        "type-fest",
        // tsconfig.paths.json:41 (remark-parse, remark-stringify)
        "vfile",
        // tsconfig.paths.json:43-49 (@earendil-works/pi-coding-agent)
        "@earendil-works/pi-agent-core",
        "@earendil-works/pi-codemode",
        "@earendil-works/pi-tui",
        // tsconfig.paths.json:52 and bunfig.toml:1-3 (vaul-svelte, huntabyte/vaul-svelte#130)
        "bits-ui",
      ],
      // Operating-system programs the probes run through Bun's `$`
      // (scripts/probe-kit/cloudflare-front.ts:221, specs/hub-loopback.ts,
      // specs/preview-socket.ts): no npm package provides them, and Knip's
      // default global list (ignoreGlobalBinaries) does not name these two.
      ignoreBinaries: ["openssl", "ss"],
    },
    "apps/dashboard": {
      entry: [
        // Every states file under src/, found by its name by the component canvas's stage host: packages/agent/src/stage-host/host.ts:2358 (core stage.ts:568 STORY_FILE).
        "src/**/*.stories.{ts,js,tsx,jsx}",
        // The decision host page's Bun.build entrypoint: packages/core/src/decision-host.ts:263.
        "src/lib/cawco/decisions/host/host.ts",
        // The decision host's sheet, compiled by Tailwind from its path: packages/core/src/decision-host.ts:44.
        "src/lib/cawco/decisions/host/host.css",
        // `$app/env` in the address preview build, an alias Knip does not follow: scripts/address-preview.vite.ts:42-43.
        "src/lib/cawco/address/flow/kit-env.ts",
        // scripts/check.ts:545
        "scripts/specificity-trap.ts",
        // scripts/check.ts:546
        "scripts/lib-import-check.ts",
        // scripts/check.ts:547
        "scripts/svelte-unused-css.ts",
        // scripts/check.ts:548
        "scripts/spacing-ratchet.ts",
      ],
      project: [
        // Knip's default, with the extensions its Svelte and Tailwind compilers add here.
        "**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,svelte,css}",
        // Written by `bun run tokens` (scripts/build-tokens.ts:87-102) and `bun run variants` (scripts/build-variants.ts:32).
        "!src/lib/tokens/{tokens.css,tokens.ts,theme.css,selection.css,variants.css}",
        // Written by scripts/house-faces.ts:40.
        "!src/house-faces/**",
      ],
      // The types TypeScript reads for the sibling .js modules that
      // src/lib/cawco/own-origin.ts:2, vite.config.ts:26 and
      // scripts/binary/proof-relay.ts:9 import. Knip resolves each import to
      // the .js itself (node_modules/knip/dist/util/resolve.js:6 tries .js
      // first), so it never sees the declaration read; no entry or plugin
      // names it.
      ignoreFiles: ["public-origin.d.ts", "inherited-relay.d.ts"],
      vite: {
        // The app's own config, and the address flow's design preview build: scripts/address-preview.vite.ts:8 and src/lib/cawco/address/flow/public/README.md:27 tell a person to build it.
        config: ["vite.config.ts", "scripts/address-preview.vite.ts"],
      },
    },
    "packages/agent": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
      entry: [
        // Spawned as plain Bun by the boundary: src/boundary.ts:3612; bundled for Linux at scripts/build-binary.ts:182.
        "src/boundary-host.ts",
        // Run as plain Bun as each workspace's judge: src/boundary.ts:684.
        "src/boundary-judge.ts",
        // Run as plain Bun by a macOS workspace's `log` shim: src/boundary.ts:1552.
        "src/boundary-log.ts",
        // A Worker started from its path: src/loop-watch.ts:134.
        "src/loop-watch-worker.ts",
        // A Worker started from its path: src/stores/client.ts:29.
        "src/stores/worker.ts",
        // Resolved for `cawco:pi-runtime` by the binary build: scripts/build-binary.ts:490.
        "src/standalone-setup.ts",
        // The canvas host page's Bun.build entrypoint: packages/core/src/canvas-host.ts:91.
        "src/canvas-host/host.tsx",
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
      entry: [
        // Spawned by the release: scripts/release.ts:836.
        "scripts/wire-frames.ts",
        // Inlined into every decision page as its script: src/decision-page.ts:123.
        "skills/decision-page/kit/page.js",
        // Served to a decision page with Dials: packages/core/src/decision-host.ts:308.
        "skills/decision-page/kit/dials.js",
        // The decision-page skill tells the agent to run it: skills/decision-page/SKILL.md:74.
        "skills/decision-page/scripts/preview.mjs",
      ],
      project: [
        // Knip's default.
        "**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}",
        // DialKit, vendored unchanged from its npm package (skills/decision-page/kit/vendor/dialkit/VERSION): a dependency's code, not ours.
        "!skills/decision-page/kit/vendor/**",
      ],
    },
    "packages/core": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
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
