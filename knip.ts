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
        // golar's CLI reads golar.config.ts from its cwd (node_modules/golar/dist/cli.js:15), run at scripts/check.ts and scripts/lint/golar-lint.ts.
        "golar.config.ts",
        // scripts/check.ts
        "scripts/lint/golar-lint.ts",
        // scripts/check.ts
        "scripts/lint/biome-plugins.ts",
        // scripts/check.ts
        "scripts/case-clash-check.ts",
        // scripts/check.ts, beside compress-answer-check.ts
        "scripts/shell-bodies-check.ts",
        // scripts/check.ts, beside compress-answer-check.ts
        "scripts/type-roles-check.ts",
        // scripts/check.ts, beside type-roles-check.ts
        "scripts/routine-report-check.ts",
        // Never imported: `golar tsc -b` type-checks its `@ts-expect-error` lines, the tool door's proof (scripts/lib/tool-call.ts).
        "scripts/lib/tool-call.fixtures.ts",
        // scripts/check.ts
        "scripts/runtime-bundles-check.ts",
        // scripts/check.ts, beside css-scope-check.ts
        "scripts/import-rules-check.ts",
        // scripts/check.ts, beside css-scope-check.ts
        "scripts/escape-hatch-ratchet.ts",
        // scripts/check.ts, beside css-scope-check.ts
        "scripts/stale-references-check.ts",
        // scripts/check.ts, beside css-scope-check.ts
        "scripts/browser-core-check.ts",
        // scripts/check.ts
        "scripts/style-residual-check.ts",
        // scripts/check.ts
        "scripts/relics-check.ts",
        // scripts/check.ts
        "scripts/style-greps.ts",
        // scripts/check.ts
        "scripts/tool-answer-check.ts",
        "scripts/route-families-check.ts",
        // scripts/check.ts
        "scripts/icon-imports-check.ts",
        // scripts/check.ts
        "scripts/docker-client-check.ts",
        // scripts/check.ts, beside docker-client-check.ts
        "scripts/browser-image-check.ts",
        // scripts/check.ts
        "scripts/fixed-ports-check.ts",
        // scripts/check.ts
        "scripts/border-width-check.ts",
        // scripts/check.ts
        "scripts/patched-dependencies-check.ts",
        // scripts/check.ts
        "scripts/design-sidecar-check.ts",
        // scripts/check.ts
        "scripts/design-budget-check.ts",
        // scripts/check.ts
        "scripts/surface-briefs-check.ts",
        // scripts/check.ts
        "scripts/setup-draft-check.ts",
        // scripts/check.ts
        "scripts/page-imports-check.ts",
        // scripts/check.ts
        "scripts/preview-switcher-check.ts",
        // scripts/check.ts
        "scripts/probe-words-check.ts",
        // scripts/check.ts
        "scripts/probe-waits-check.ts",
        // scripts/check.ts
        "scripts/probe-groups-check.ts",
        "scripts/probe-creates-check.ts",
        "scripts/probe-reads-check.ts",
        "scripts/probe-programs-check.ts",
        // scripts/check.ts, beside probe-programs-check.ts
        "scripts/decision-dials-check.ts",
        // scripts/check.ts
        "scripts/resolution-check.ts",
        // scripts/check.ts
        "scripts/call-cuts-check.ts",
        // scripts/check.ts, beside call-cuts-check.ts
        "scripts/tool-input-check.ts",
        // scripts/check.ts
        "scripts/git-door-words-check.ts",
        // scripts/check.ts
        "scripts/logs-trailer-check.ts",
        // scripts/check.ts
        "scripts/compress-answer-check.ts",
        // scripts/check.ts
        "scripts/open-at-check.ts",
        // scripts/ship.sh
        "scripts/release.ts",
        // scripts/ship.sh
        "scripts/republish.ts",
        // scripts/ship.sh
        "scripts/release-quota.ts",
        // scripts/release-setup.sh
        "scripts/release-setup.ts",
        // scripts/release.ts
        "scripts/build-binary.ts",
        // scripts/release.ts
        "scripts/binary/build-stage2.ts",
        // scripts/release.ts
        "scripts/binary/info-plist.ts",
        // The standalone binary's entry and its worker threads, each a Bun.build entrypoint: scripts/build-binary.ts-390.
        "scripts/binary/{entry,proof-entry,transcript-worker,process-table-worker,loop-watch-worker,stores-worker}.ts",
        // Put in place of the `socket-activation` package by the binary build: scripts/build-binary.ts.
        "scripts/binary/socket-activation.ts",
        // Loaded in place of core clock.ts by the stage 2 proof build: scripts/build-binary.ts.
        "scripts/binary/proof-clock.ts",
        // Loaded in place of sessiond list-pace.ts by the stage 2 proof build: scripts/build-binary.ts.
        "scripts/binary/proof-list-pace.ts",
        // Loaded in place of agent harnesses/index.ts by the proof builds: scripts/build-binary.ts.
        "scripts/binary/proof-harnesses.ts",
        // Each bundled by `bun build` and run on the rig's machines: scripts/binary/prove-stage2.sh.
        "scripts/binary/stage2-{start-session,stop-session,send,sends,signin,during-install,hook-calls,preview-port}.ts",
        // scripts/binary/prove-stage2.sh
        "scripts/binary/stage2-fixture.ts",
        // scripts/binary/prove-stage1.sh
        "scripts/binary/proof-browser.ts",
        // A Claude Code hook a person installs: scripts/hooks/README.md.
        "scripts/hooks/delegate-nudge.ts",
        // `--preload`ed into every scratch fleet service: scripts/scratch-fleet.ts and :1649.
        "scripts/scratch-fleet-leash.ts",
        "scripts/stand-ins/preload.ts",
        // Loaded by path in place of product modules: scripts/stand-ins/preload.ts-15.
        "scripts/stand-ins/{hub-upstreams,canvas-host-plugins}.ts",
        // Loaded by path in place of agent canvas-host/bound.ts: scripts/stand-ins/canvas-host-plugins.ts.
        "scripts/stand-ins/canvas-bound.ts",
        // The stored-shape check over a whole hub database, as packages/hub/src/stored-json.ts and packages/hub/scripts/stored-rows.ts name it.
        "scripts/stored-json-check.ts",
        // Spawned by the spec that proves the hub's one writer: scripts/probe-kit/specs/hub-one-writer.ts.
        "scripts/repair-account-history.ts",
        // The probe kit's runner: scripts/probe-kit/README.md.
        "scripts/probe-kit/run.ts",
        // Each spec imported by its name: scripts/probe-kit/run.ts and :128.
        "scripts/probe-kit/specs/*.ts",
        // Each web spec imported by its name: scripts/probe-kit/run.ts and :128.
        "scripts/probe-kit/specs/web/*.ts",
        // scripts/probe-kit/specs/browser-cap.ts
        "scripts/probe-kit/browser-cap-child.ts",
        // scripts/probe-kit/specs/fsevents-scope.ts-50
        "scripts/probe-kit/fsevents-browsers-child.ts",
        // scripts/probe-kit/specs/heavy-slots.ts and specs/probe-slots.ts
        "scripts/probe-kit/slot-child.ts",
        // scripts/probe-kit/specs/signal-wall.ts
        "scripts/probe-kit/signal-wall-child.ts",
        // scripts/probe-kit/specs/sleep-listener.ts
        "scripts/probe-kit/sleep-listener-child.ts",
        // scripts/probe-kit/specs/store-reads-loop.ts
        "scripts/probe-kit/store-reads-child.ts",
        // scripts/probe-kit/specs/hub-loop-ends.ts
        "scripts/probe-kit/hub-loop-child.ts",
        // scripts/probe-kit/specs/slow-hub-trial.ts
        "scripts/probe-kit/trial-verify-child.ts",
        // scripts/probe-kit/specs/tether.ts
        "scripts/probe-kit/tether-child.ts",
        // scripts/probe-kit/specs/atomic-writes.ts
        "scripts/probe-kit/atomic-writer.ts",
        // scripts/probe-kit/specs/host-lfs.ts
        "scripts/probe-kit/host-origin-git-env-child.ts",
        // scripts/probe-kit/specs/fsevents-scope.ts
        "scripts/probe-kit/fsevents-claude-args.ts",
        // A Bun.build entrypoint: scripts/probe-kit/decision-embeds.ts.
        "scripts/probe-kit/decision-pick-wiring.ts",
        // Each journey found by its file name and imported: scripts/probe-kit/journeys/run.ts, :20 and :43.
        "scripts/probe-kit/journeys/j*-*.ts",
        // Run on obelisk by artifacts/srt-eval/run-mac-checks.sh and artifacts/srt-eval/mac-boundary-check.sh.
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
      // The types TypeScript reads for golar.config.ts's import of the
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
      // Operating-system programs the probes run through Bun's `$`
      // (scripts/probe-kit/cloudflare-front.ts, specs/hub-loopback.ts,
      // specs/preview-socket.ts): no npm package provides them, and Knip's
      // default global list (ignoreGlobalBinaries) does not name these two.
      ignoreBinaries: ["openssl", "ss"],
    },
    "apps/dashboard": {
      entry: [
        // Never imported: `golar tsc -b` reads it, the drift proof of its stored-shapes.ts (packages/hub/scripts/stored-shapes.ts).
        "src/lib/cawco/stored-shapes.proof.ts",
        // Every states file under src/, found by its name by the component canvas's stage host: packages/agent/src/stage-host/host.ts (core stage.ts STORY_FILE).
        "src/**/*.stories.{ts,js,tsx,jsx}",
        // The states files' preview file, read by the stage host by its name: packages/agent/src/stage-host/host.ts `previewFile`.
        ".storybook/preview.ts",
        // The decision host page's Bun.build entrypoints, the host and an HTML page's dials: packages/hub/src/decision-host.ts.
        "src/lib/cawco/decisions/host/host.ts",
        "src/lib/cawco/decisions/host/dials.ts",
        // The decision host's sheet, compiled by Tailwind from its path: packages/hub/src/decision-host.ts.
        "src/lib/cawco/decisions/host/host.css",
        // `$app/env` in the decision host's build, a Bun plugin's resolve Knip does not follow: packages/hub/src/decision-host.ts `appEnv`.
        "src/lib/cawco/decisions/host/app-env.ts",
        // `$app/env` in the address preview build, an alias Knip does not follow: scripts/address-preview.vite.ts-43.
        "src/lib/cawco/address/flow/kit-env.ts",
        // scripts/check.ts
        "scripts/specificity-trap.ts",
        // scripts/check.ts
        "scripts/lib-import-check.ts",
        // scripts/check.ts
        "scripts/svelte-unused-css.ts",
        // scripts/check.ts
        "scripts/spacing-ratchet.ts",
      ],
      project: [
        // Knip's default, with the extensions its Svelte and Tailwind compilers add here.
        "**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,svelte,css}",
        // Written by `bun run tokens` (scripts/build-tokens.ts-102) and `bun run variants` (scripts/build-variants.ts).
        "!src/lib/tokens/{tokens.css,tokens.ts,theme.css,selection.css,variants.css}",
        // Written by scripts/house-faces.ts.
        "!src/house-faces/**",
        // The planted mistakes scripts/outro-reads-check.ts reads, not code run.
        "!scripts/fixtures/**",
      ],
      // The types TypeScript reads for the sibling .js modules that
      // src/lib/cawco/own-origin.ts, vite.config.ts and
      // scripts/binary/proof-relay.ts import. Knip resolves each import to
      // the .js itself (node_modules/knip/dist/util/resolve.js:6 tries .js
      // first), so it never sees the declaration read; no entry or plugin
      // names it.
      ignoreFiles: ["public-origin.d.ts", "inherited-relay.d.ts"],
      vite: {
        // The app's own config, and the address flow's design preview build: scripts/address-preview.vite.ts and src/lib/cawco/address/flow/public/README.md tell a person to build it.
        config: ["vite.config.ts", "scripts/address-preview.vite.ts"],
      },
    },
    "packages/agent": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
      entry: [
        // Never imported: `golar tsc -b` reads it, the drift proof of its stored-shapes.ts (packages/hub/scripts/stored-shapes.ts).
        "src/stored-shapes.proof.ts",
        // Spawned as plain Bun by the boundary: src/boundary.ts; bundled for Linux at scripts/build-binary.ts.
        "src/boundary-host.ts",
        // Run as plain Bun as each workspace's judge: src/boundary.ts.
        "src/boundary-judge.ts",
        // Run as plain Bun by a macOS workspace's `log` shim: src/boundary.ts.
        "src/boundary-log.ts",
        // A Worker started from its path: src/stores/client.ts.
        "src/stores/worker.ts",
        // Resolved for `cawco:pi-runtime` by the binary build: scripts/build-binary.ts.
        "src/standalone-setup.ts",
        // The canvas host page's Bun.build entrypoint: packages/hub/src/canvas-host.ts.
        "src/canvas-host/host.tsx",
        // CawCo's OpenCode plugin, a Bun.build entrypoint (src/harnesses/opencode-plugin.ts, scripts/build-binary.ts) that OpenCode loads from a directory.
        "src/harnesses/opencode-plugin-module.ts",
      ],
    },
    "packages/preview": {
      // knip.dev/reference/configuration: "When a repository (or workspace) is self-contained or private, you may want to include entry files when reporting unused exports". This package is private and consumed only inside the repo, so its `exports` map is no public API.
      includeEntryExports: true,
      // Read by Bun.resolveSync (src/overlay/glyphs.ts), which
      // Knip does not follow (it follows require.resolve and
      // import.meta.resolve: knip.dev/explanations/entry-files).
      ignoreDependencies: ["@iconify-json/solar"],
    },
    "apps/cawrier": {
      // `cloudflare:workers` (src/pairing.ts, src/seats.ts) is a workerd
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
        // Spawned by the release: scripts/release.ts.
        "scripts/wire-frames.ts",
        // Inlined into every decision page as its script: src/decision-page.ts.
        "skills/decision-page/kit/page.js",
        // The decision-page skill tells the agent to run it: skills/decision-page/SKILL.md.
        "skills/decision-page/scripts/preview.mjs",
        // The decision-page skill tells the agent it records a mockup as a webm clip: skills/decision-page/SKILL.md.
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
        // site/DEPLOY.md
        "scripts/import-caw.mjs",
        // site/DEPLOY.md
        "scripts/lift-devices.mjs",
        // site/DEPLOY.md
        "scripts/og.mjs",
        // The hairline figure the hairline skill's look.mjs loads: site/DEPLOY.md.
        "art/fleet.js",
      ],
    },
  },
} satisfies KnipConfig;
