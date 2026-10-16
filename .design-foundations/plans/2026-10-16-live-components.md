# Live components, option C: the project's real components, run by the project's own toolchain

Spec for PRD D29 after the owner's pick ("Ok do C"). Written 2026-10-16 from the PRD (§4 D18, D19, D24–D29; §5.7; §5.10; §11 2026-10-13 to 2026-10-16), the prior-art report (`assets/22627679/docs/research/live-components-prior-art.md`), the merged spec (`assets/8866317b/live-components-merged-spec.md`), and the sources cited inline. A claim with no URL is marked **own call**. Decisions that wait on the Opus spike in workspace fd865b51 are marked **spike (n)** with the branch taken if the answer is "no".

## 0. The invariant, and the answer in one paragraph

**A component exists once, as the project's real file. Everything the panel shows is an instance of that file, mounted by the project's own toolchain.** Nothing is re-coded per variant, per screen, or per render; nothing is described twice in a second format.

The answer: a **sheet** is a Component Story Format (CSF 3) file next to the component, in the project's own language (`EventCard.stories.ts`, no JSX in a Svelte project): a default export naming the component, one named export per variant with its `args`. A **screen** is a real component in the project (`Screen.svelte`, `Screen.tsx`, `Screen.vue`) that composes other real components, and it gets a sheet like any component. The daemon runs the project's own dev toolchain inside the workspace (Vite first; Astro, Nuxt and Next through their programmatic APIs) with one CawCo plugin added at start, keeps it alive with no agent involved, and serves a page that mounts every story of a sheet side by side. The hub shows that page through the preview proxy it already has, with the overlay it already injects: picks, pins, comments and Pencil ink work on it unchanged. A tap inside a render carries `file:line:column` from the framework's own dev metadata (Svelte) or from a `data-insp-path` stamp (React, Vue, Solid, Preact, Qwik, Astro). The person edits props and variants directly (CawCo writes `args` back into the story file, as Storybook's "save from controls" does); everything inside a component or a screen template is a pin the agent acts on. CawCo learns components and their props from source with each framework's docgen. There is no CawCo design format, no mockup library, no handover.

## 1. Composition: where a screen or a variant sheet lives, and in what format

**Recommendation.** Two file kinds, both the project's own code, nothing else:

| Thing | File | Format | Who writes it |
|---|---|---|---|
| Variant sheet (one component, N states) | `<Component>.stories.ts` (or `.js`) beside the component | CSF 3: `export default { component }`, `export const Roomy = { args: {…} }` | The agent; `args` also written by CawCo from the person's edits (§5) |
| Screen (several components composed) | `<Screen>.svelte` / `.tsx` / `.vue` wherever the project keeps screens | The framework's own component | The agent, from pins |
| States of a screen | `<Screen>.stories.ts` | CSF 3, same as above | The agent and CawCo |

A story's `args` are the instance's props; a `render` is allowed only in the framework's own idiom (Svelte: `render: (args) => ({ Component, props: args })`; React: JSX, because JSX is that project's language). Slot content in a sheet is either a string prop (an arg) or belongs in a screen component.

**Why CSF.** It is the one existing, non-proprietary, cross-framework format for "this component in this state", and it is already the project's language:

- Its home repo defines it as "an open standard for UI component examples based on JavaScript ES6 modules", "Non-proprietary. CSF doesn't require any vendor-specific libraries", and lists consumers beyond Storybook: "Tools: Storybook, WebComponents.dev, Components.studio, RedwoodJS, UXPin" (https://github.com/ComponentDriven/csf). Judged on the facts: it is a de-facto standard owned by Storybook (the repo note says its code "lives in the Storybook monorepo"), not a W3C or ECMA document. It is still the only format with more than one implementation.
- Storybook: "It's an open standard based on ES6 modules that is portable beyond Storybook"; the default export's `component` field "is required and used by addons for automatic prop table generation"; stories are objects: `export const Primary: Story = { args: { primary: true } }` (https://storybook.js.org/docs/api/csf).
- Other consumers: Ladle "supports Component Story Format … developed as a drop-in replacement of Storybook" (https://ladle.dev/blog/introducing-ladle/; React only); portable stories "convert this story context into an appropriately renderable component … a React story becomes a React component, a Vue story becomes a Vue component" for Playwright CT, Vitest and Jest (https://storybook.js.org/blog/portable-stories-for-playwright-ct/); Chromatic snapshots stories (https://chromatic.com/docs/storybook).
- CSF Next (factories: `definePreview → preview.meta → meta.story`) is "a preview feature and (though unlikely) the API may change" (https://storybook.js.org/docs/api/csf/csf-next). CawCo reads CSF 3 and does not emit CSF Next until it leaves preview. **Own call.**

**Why not JSX in Svelte.** The owner's rule, and CSF does not need it: a Svelte story is `args` on a `component`; a composition is a `.svelte` file. `@storybook/addon-svelte-csf`'s `.stories.svelte` syntax is not used: it is a Vite plugin plus runtime that must be installed into the project (prior-art report §2), and CSF `.stories.ts` is the same shape in every framework. One path.

**Why not a CawCo tree, Plasmic/Builder JSON, or pen.dev's `.pen`.** Plasmic and Builder store the composed screen in their own cloud JSON and render it through an "app host" page in the user's React app (Plasmic: "The app host will run Plasmic Studio within your React app", https://docs.plasmic.app/learn/code-components/); Webflow DevLink and Framer only take components registered with a declaration file or `addPropertyControls` (https://developers.webflow.com/code-components/importing/quick-start.md, https://www.framer.com/developers/property-controls); pen.dev's "Code → Design: Recreate existing components on the pen.dev canvas" is the recreation the owner rejected (https://docs.pencil.dev/design-and-code/design-to-code); Paper's "Use your code components" is a roadmap item (https://paper.design/roadmap). Every one of them is React-only or recreates. CSF needs none of that.

**A project that already has Storybook** already has sheets: CawCo lists its `*.stories.*` files and mounts them. Project-level decorators from `.storybook/preview` are not applied: portable stories docs, "The project-level annotations … are not applied automatically" (https://storybook.js.org/docs/8/api/portable-stories/portable-stories-playwright). A component that needs one (a theme provider) names it in the sheet's `decorators`, which CawCo does apply, story-level and meta-level. **Own call.**

**How the person's edits reach the file.** Props, variant, slot text that is a prop: CawCo rewrites that story's `args` object literal in place (§5). Order of stories, a new story, a duplicate, a deleted story: CawCo edits the exports (append, remove, reorder) the way Storybook does — "The new or modified story will appear as a code change in that component's CSF file and will be automatically formatted to match the code style and formatting of your project" (https://storybook.js.org/blog/interactive-story-generation/). Everything inside a component or a screen's template is a pin for the agent (choice 1 in "Choices for the owner" is whether CawCo also splices templates).

## 2. Running it: the stage

**Recommendation.** One **stage** per workspace, owned by the daemon's supervisor, running the project's own toolchain in the project's own runtime inside the workspace sandbox, with one CawCo plugin added at start and nothing installed into the project.

**Start.** The daemon writes `.cawco/stage/host.mjs` (CawCo's embedded script, git-excluded) and spawns it with the runtime the lockfile implies: `bun` if `bun.lock`/`bun.lockb`, else `node`. The host runs in the project's runtime and imports the project's own `vite`/`astro`/`nuxt`/`next` from the workspace's `node_modules`; CawCo's binary only supervises. **Own call**, and it makes spike (5)'s question (can the compiled Bun binary `import()` a runtime-written `.mjs`?) moot: the binary never imports the toolchain. If the spike shows the binary can, the design stays as written: the project's Vite version must not be coupled to CawCo's process.

**Per toolchain, how the plugin gets in without editing the user's config:**

| Toolchain | How the host starts it | Source |
|---|---|---|
| Vite (incl. SvelteKit, Vue, React, Solid, Preact, Qwik, Lit) | `createServer({ configFile: <project's>, plugins: [cawcoStage()] })`; inline config is merged with the file's | Vite JavaScript API: `createServer(inlineConfig)`, "any valid user config options, plus `mode` and `configFile`" (https://vite.dev/guide/api-javascript). Storybook does the same: "it automatically merges the configuration into its own" (https://storybook.js.org/docs/builders/vite). Measured on CawCo's own SvelteKit dashboard (Vite 8.3.2, Kit 3.0.0): the project's config and plugins unchanged, its tokens, fonts and Tailwind apply, no Kit page or globals appear. A project config that demands environment (the dashboard's needs `CAWCO_DEV_HUB_URL`) gets it from the stage's environment. |
| Astro | `dev({ root, vite: { plugins: [cawcoStage()] } })` | "Programmatic Astro API (experimental)": `dev(inlineConfig: AstroInlineConfig) => Promise<DevServer>` (https://docs.astro.build/en/reference/programmatic-reference/). Experimental: pinned per Astro major, re-checked on upgrade. |
| Nuxt | `loadNuxt({ dev: true, overrides: { modules: [cawcoNuxtModule] } })`, the module calling `addVitePlugin` | Nuxt Kit `loadNuxt(loadOptions)`, "`overrides`: Configuration applied above every layer, including the root project's own `nuxt.config`" (https://nuxt.com/docs/api/kit/programmatic) |
| Next.js | `next({ dev: true, dir, conf: { ...loaded, turbopack: { rules: codeInspectorPlugin({ bundler: 'turbopack' }) } } })` and `app.getRequestHandler()` | Custom server: `conf` is "The same object you would use in `next.config.js`" (https://nextjs.org/docs/pages/guides/custom-server); code-inspector's Turbopack form for Next ≥ 15.3 is `turbopack: { rules: codeInspectorPlugin({ bundler: 'turbopack' }) }` (https://www.npmjs.com/package/vite-code-inspector-plugin). The stage page is served by the host's own HTTP handler in front of Next's request handler, and it imports the story module through Next's dev compiler; no route or file is added to the project. **Spike (6)** covers code-inspector in fresh Vite React/Vue apps, not Next; Next is a second probe before it is promised. |
| Angular CLI, plain webpack, anything else | **Refused by name**: "Live components need a Vite, Astro, Nuxt or Next.js dev toolchain; this project uses Angular CLI." | Angular's `ng serve` has no public plugin API; the two tools that stamp Angular templates do it by a custom builder in `angular.json` ("This uses a custom dev-server builder to inject `data-click-to-source` into templates", https://github.com/mattkawczynski/click-to-source) or by monkey-patching `fs.readFileSync` ("Intercepts Angular compiler's HTML template reads via `fs.readFileSync` monkey-patch", https://github.com/ALittleFox/dom-xray). Neither is a path CawCo should run in a user's project. If the owner wants these stacks shown without source mapping, that is the fallback question in §10. |

**What the plugin serves** (measured by the spike, `assets/011cb811/docs/spikes/component-stage.md`):
- **The page is `GET /@cawco/sheet?file=<repo-relative .stories.ts>`.** Not under `/__cawco/`: the hub answers that prefix itself on every preview origin (`RESERVED = "/__cawco/"`, `packages/hub/src/preview.ts`), so a page there is a 404 through the hub. `/@cawco/` follows Vite's own convention for plugin-served paths (`/@vite/client`, `/@fs/`) and was measured working through both hops with no hub change (own call on the prefix). The plugin registers its middleware directly in `configureServer`, so it runs before SvelteKit's handler.
- **The shell** is the project's `app.html`/`index.html` markup, meta and links, with `%…%` placeholders stripped and **its inline `<script>`s dropped**: they are the app's contract with its root layout (the dashboard's holds every tap until the layout calls `releaseHeldTaps()`), and no layout mounts on a stage. External `src` scripts stay.
- **Global CSS comes from the root module's side-effect style imports** (SvelteKit's root `+layout.svelte`, e.g. `import "../app.css"`; a Vite SPA's `index.html` entry), imported by the sheet module without running the root module's own JS. app.html loads no CSS in SvelteKit.
- **The entry is a virtual `.js` module** (`/@id/__x00__cawco:sheet/<encoded file>.js`, served by `resolveId`/`load`), never an inline module script: an inline script's html-proxy id containing `.svelte` is claimed by vite-plugin-svelte.
- The module imports the story file, reads `default.component`, `default.args`, `default.decorators` and each named export's `args`/`render`/`decorators`, and mounts each story into its own frame, labelled `data-cawco-story="<export>"` and `data-cawco-source="<story file>:<line>:<col>"` (the export's position from the ESTree parse §5 already needs). Mount adapters are the only per-framework code: Svelte `mount(Component, { target, props })`, Vue `createApp(Component, props).mount(target)`, React `createRoot(target).render(createElement(Component, props))`, Solid `render`, Preact `render`.
- **HMR** needs no `server.hmr` setting through the hub (measured: 76 ms median direct, 83 ms through both hops, 0 reloads); a component edit is Svelte's own in-place swap, a story-file edit re-mounts its frames (65 ms).
- **It refuses `/__open-in-editor`** (404): Vite answers it for any path, `/etc/hostname` included, and it reaches anyone who can view the preview. The preview relay refuses editor-launch routes for every preview too.
- **Sheets live inside the project's source tree**, beside their components: SvelteKit narrows `server.fs.allow` to `src/` and friends, and `#` imports resolve from the importer's nearest `package.json`. `#lib` (Kit 3) or `$lib` (Kit 2) resolves; `$app/env`, `$app/environment` and `$app/state` resolve, with route data empty because no Kit router runs.
- **Runtime:** the host runs under `node` or `bun` per the lockfile; both render identically. Measured, bun's component-edit HMR is 298 ms against node's 76 ms (both inside the 1 s budget). CawCo's compiled binary can't load a project's Vite (`Cannot find module 'rolldown/parseAst'`), which settles spawning the project's runtime.
- **Non-Svelte source stamping** vendors only code-inspector's transform (`transformCode`, MIT, about 25 lines of plugin), not its client (595 KB) or its server. Measured 49/49 elements stamped in fresh Vite React and Vue apps through inline plugins only, configs untouched; the bundle is 5.85 MB minified because its core is pre-bundled with Babel and the Vue compiler.

**Lifecycle** (one supervisor rule set, no agent in the loop): start on the first `artifact_create(kind: "sheet")` or first open; `ready` within 60 s or `error`; health `GET /__cawco/health` every 15 s; restart ×3 with backoff then `error`; asleep after 30 min with no viewer and no agent read; wake on open; stop when the workspace is archived. Panel states: Starting ("Starting vite in `apps/dashboard`…"), Compiling, Error, Live, Asleep ("Waking…"). The stage listens on a port inside the workspace and is shown through the existing `port:<port>@<workspace>` preview source (`packages/agent/src/preview-bridge.ts`), so desktop and the iPad's web view get the same overlay-injected page.

**Errors to the agent.** The plugin turns Vite's error payload (`message`, `loc: { file, line, column }`, `frame`) into `status.errors` on the artifact; the hub delivers it on the same batched channel as pins (3 s quiet, at once during a turn). The overlay draws CawCo's error card over the dimmed last render; Vite's own overlay is off (`server.hmr.overlay: false`). **Spike (4)** proves compile errors are captured as JSON and cleared on the next good compile. If Vite's payload lacks `loc` for a framework, the error carries `file` from the failing module id and no line.

## 3. The canvas: instances and variants side by side

**Recommendation.** A sheet renders as one page: a horizontal row (wrapping) of frames, one frame per story, each labelled with the story's name, each hugging its content; a story's width is `parameters.viewport` when set (Storybook's own key), otherwise content width. This is what pen.dev and Paper show: component states laid out as separate frames on an artboard (Paper's documented workflow: "a `Component States` artboard detailing every default / hover / active state", https://github.com/gergelyszerovay/skills/blob/main/paper-to-react-workflow.md). Viewport presets (phone, tablet, desktop), light/dark and reduced-motion toggles are the panel's chrome (D18's list) and apply to the whole sheet: the stage page reads them from the URL and sets `color-scheme`, width and `prefers-reduced-motion` emulation via a wrapper class.

**On top of it, unchanged:** the overlay the hub already injects into every preview (`injectOverlay`, `packages/hub/src/preview.ts`). Picks (D19): the sheet is a choice, its stories the options; a pick stores `{ choice: <story file>, option: <export name> }` in the hub as today. Pins and comments (D20, tsk-3) anchor to elements by selector as today, plus `source` (§4). Pencil ink (D27) anchors to the deepest element under the stroke as today; its radial menu's Comment and Annotate produce pins carrying `source`. Nothing in D24–D27 changes.

**The Excalidraw canvas (D24) is not the venue.** It does not lay out live DOM; a sheet is a `preview`-class artifact. A session that wants to sketch over a sheet draws with ink (D27), or the agent puts a PNG of the sheet (`artifact_read(png: true)`) onto a canvas. Kept from the merged spec: no pan-and-zoom surface of CawCo's own.

## 4. Source mapping per framework, and what a pin carries

**Recommendation.**

| Framework | Element → source | Call site (which instance) | Source |
|---|---|---|---|
| Svelte 5 | `el.__svelte_meta.loc = { file, line, column }`, line 1-based and column 0-based (measured 5/5); dev compile only | the `component` entries of `__svelte_meta.parent` (Svelte's `dev_stack`), then the frame's `data-cawco-source` for the story: `mount()` pushes no story level (measured) | `svelte/src/internal/client/dev/elements.js` and vite-plugin-svelte's inspector (prior-art report §4: `file_loc = ${file}:${line + 1}:${column + 1}`, commit `4158aa2` walks `parent` to "where a component is used"). **Spike (3)** checks accuracy and the chain. If `loc` is off for some elements: fall back to the plugin's stamp (next row) for Svelte too, one mechanism for all. |
| React 18/19, Preact, Solid, Qwik, Vue 3, Astro | `data-insp-path="<file>:<line>:<column>:<tag>"` stamped by code-inspector's transforms (MIT), vendored into the stage plugin | component roots read `props['data-insp-path']`, so a root element carries the call site | prior-art report §6; React 19 "Remove `__self` and `__source` location from elements … all the places using it like the `_debugSource` on Fiber" (https://github.com/facebook/react/pull/28265) broke every fiber-reading tool (list in that thread: react-dev-inspector, locatorjs, code-inspector, click-to-component…); compile-time stamping "is the only approach that works reliably across React 18, React 19, and all modern bundlers" (https://github.com/ivanstnsk/xray). Vue's own inspector "records source locations from Vue's compiled render output with Vite source maps, and uses dev-only `data-v-inspector` DOM markers as a fallback" (https://github.com/webfansplz/vite-plugin-vue-inspector); the stamp is the simpler, uniform one. |
| Angular | none | none | refused in §2 |

**The pin payload**, one shape for every artifact kind:

```json
{
  "artifact": "<id>",
  "sheet": { "file": "src/lib/cawco/transcript/EventCard.stories.ts", "story": "Roomy" },
  "anchor": { "selector": "…", "box": { "x": 0, "y": 0, "w": 0, "h": 0 } },
  "source": { "file": "src/lib/cawco/transcript/EventCard.svelte", "line": 42, "column": 6 },
  "chain": [
    { "component": "EventCard", "file": "…/EventCard.svelte", "line": 1, "column": 0 },
    { "component": "Roomy", "file": "…/EventCard.stories.ts", "line": 18, "column": 2 }
  ],
  "text": "heavier"
}
```

`source` is the tapped element's own tag (1-based line and column, converted at read time); `chain` is the ancestors from the element's component up to the story, so an agent can tell "inside EventCard" from "the story's args". Both are re-read from the DOM after every HMR update, so a pin made before an edit still names the right element after it. A comment therefore reads "`EventCard.svelte:42:6` inside story Roomy: heavier".

`source` is the first element in the chain whose file exists on disk: a virtual component (an `unplugin-icons` icon's `~icons/…svelte`) gives way to its call site.

**Open in editor** (`/__open-in-editor`) is not built and is refused (§2): the stage runs on the daemon's machine, the dashboard on the person's; the pin's `file:line:column` is shown and copyable, and the agent gets it verbatim. **Own call.**

## 5. Editing: direct, or a pin

**Recommendation.** The person edits **the instance** directly; **the inside** of a component becomes a pin.

| Edit | How | Lands in |
|---|---|---|
| A prop value, a variant (enum prop), a boolean, a string slot | Inspector control (right panel; bottom sheet on phones); live via HMR-less re-mount with new props; **Save** writes the story's `args` | the story file, by CawCo |
| New story from the current controls; duplicate; delete; reorder | Inspector buttons | the story file, by CawCo (append/remove/move an export) |
| Pick between stories | Tap the frame's pick control (D19) | the hub's picks |
| Text, spacing, colour, order *inside* a component; add or remove a component inside a screen; slot content that is markup | Tap → pin with `source`; type the note; Send | a pin the agent applies to the component or screen file |

**Why this line.** Every established tool that takes real code components edits props visually and leaves the inside to code: Framer "Property Controls allow users to pass properties (or props) to a code component through the Framer interface … it's up to you to decide which Property Controls to add" (https://www.framer.com/developers/property-controls); Plasmic registers props and "slots" and configures them "on the right panel" (https://docs.plasmic.app/learn/registering-code-components/); Builder: "If you have a prop you'd like to make editable in the Visual Editor, be sure to define an input for it" (https://www.builder.io/c/docs/custom-components-intro); Webflow DevLink declares `props: { text: props.Text(…), variant: props.Variant(…) }` (https://developers.webflow.com/code-components/importing/quick-start.md). Only Onlook writes inside components, and only JSX through Babel (prior-art report §1); the report found no formatting-preserving printer for Svelte.

**Writing `args` back.** Storybook has done this since 8.1: "You can also update a control's value, then save the changes to the story. The story file's code will be updated for you" (https://storybook.js.org/docs/essentials/controls); its PR notes "This feature only works with stories defined in CSF3!" (https://github.com/storybookjs/storybook/pull/26827). CawCo does the same: parse the story file with an ESTree parser in the host, find the named export's `args` object literal, replace it with a printed literal using the file's quote and indent style, write, let HMR redraw. Values are JSON-serialisable or identifiers already in scope (a fixture import); a function value is left as is and the control is read-only for it. **Own call** on the mechanism; the precedent is Storybook's.

## 6. Knowing the components and their props

**Recommendation.** Derive from source inside the stage, with the tool each framework's Storybook already uses; nothing is declared by hand.

| Framework | Tool | What it reads | Source |
|---|---|---|---|
| Svelte 5 | `svelte2tsx` + TypeScript's checker | the `$props()` type, including types imported from other files, and destructured defaults | Storybook svelte-vite `generateDocgen.ts`: extracts `propsType` from svelte2tsx's render function, "Extract default values from: `let { = , ... }: = $props();`" (https://github.com/storybookjs/storybook/blob/a14aa35f/code/frameworks/svelte-vite/src/plugins/generateDocgen.ts); its PR replaced `sveltedoc-parser` because that "only supports JSDocs, not TypeScript types" (https://github.com/storybookjs/storybook/discussions/21826) |
| Vue 3 | `vue-component-meta` | "props, events, slots, and exposed" with `type`, `default`, `required`, `description` | npm README (https://www.npmjs.com/package/vue-component-meta); Storybook: "a tool maintained by the Vue team … recommended for most projects" (https://storybook.js.org/docs/get-started/frameworks/vue3-vite) |
| React, Preact, Solid | `react-docgen`, falling to `react-docgen-typescript` when a prop type is unresolvable | TS/PropTypes props, defaults, JSDoc | Storybook: "React: react-docgen (default) or react-docgen-typescript" (https://storybook.js.org/docs/api/arg-types) |

The output shape is Storybook's `argTypes`/`PropertyMeta` shape: `{ name, type, defaultValue, required, description, options? }`; an enum or string-literal union becomes the variant control; a `Snippet`/`ReactNode`/slot becomes "slot: content is a pin". These tools are CawCo's dependencies bundled into `host.mjs`, resolving `typescript`, `svelte`, `vue` from the project's `node_modules` (they are peer deps of those tools). To prove: that bundle runs in both `node` and `bun` against a project that has `typescript` installed; a project without `typescript` gets props from JSDoc only, said so in the inspector ("types unknown: add TypeScript or JSDoc"), not hidden.

**Discovery.** Components are every `.svelte`/`.vue` file under the project's source root and every `.tsx`/`.jsx` with a capitalised export that docgen recognises, excluding routes (`routes/`, `pages/`, `app/` folders of the framework) and `node_modules`. The list and each file's props are cached by content hash and refreshed on that file's HMR update. Existing `*.stories.*` files are indexed as sheets. The agent reads it with `components_list` (§10's tools) and the dashboard's "Add story / New sheet" picker uses the same list. **Own call** on the globs; the precedent is Storybook's `stories` globs and vue-component-meta's "supports … components from `.vue`, `.ts`, `.tsx`, `.js`, and `.jsx` files".

## 7. Projects with no code yet

Under C there is no second format to draw in. The owner picked option 1 (2026-10-16).

1. **Code from the first screen (recommended).** The person or Caw names the stack once (D18 already asks before building a design system); the agent scaffolds the project's framework with its own tool (`npm create vite@latest`, `npx sv create`, …) and every component is a real file from day one. Sheets, pins and picks apply at once; the first components are plain shapes and text. Costs: a framework is chosen before any pixel; a scaffold's `node_modules` in the workspace. Gives: no handover, ever; this spec's one path.
2. **A design tool over its MCP, as D18 already allows.** pen.dev or Paper as a project MCP server; explorations saved to `design/explorations/` with a link back; when code starts, the agent ports from the design file (pen.dev documents this: "Design → Code: Generate components from pen.dev designs", https://docs.pencil.dev/design-and-code/design-to-code). Costs: two truths until the port; the tool's own iPad/Pencil story (not checked here); the port is a one-time agent task per component. Gives: a drawing surface before any stack exists.
3. **Penpot (option A)** lost on the facts the owner already has (no iPad/Pencil, no embedding, a Docker stack). Not re-opened.

A CawCo-owned design body for the no-code phase (the merged spec's §1–§2) stays rejected.

## 8. Non-web stacks: what C gives them

- **Flutter**: the stage is `flutter widget-preview start`, which "launches a local server and opens a real-time preview environment in your browser" for widgets marked `@Preview` (prior-art report §8, docs.flutter.dev). `@Preview` functions are Flutter's sheet; the daemon supervises the command like Vite; the overlay goes on top; pins carry the preview name, no `file:line` (Flutter renders to a canvas, there is no DOM to stamp). The API "is not stable and will change" (api.flutter.dev); pinned per Flutter release.
- **React Native**: through the web. Storybook's `react-native-web-vite` framework exists (prior-art report §7a); a RN project with `react-native-web` and Vite gets sheets, mapping and props like any React project. Without it: nothing.
- **SwiftUI, Compose**: nothing live. Their previews are IDE-bound (Xcode Previews, Android Studio; report §8). C gives them the *concept*: `#Preview` blocks and `@Preview` composables are the sheet, rendered on the Mac/simulator through the existing snapshot path (Anbar's probe kit), shown as pictures in the panel with pins by box; no source mapping. Said plainly in the panel: "Snapshot, not live".

## 9. Tokens: where the W3C Design Tokens format fits

The DTCG Design Tokens Format Module 2025.10 is the first stable version: "This specification is considered stable", a "Final Community Group Report 28 October 2025", JSON files, with reference implementations in "Style Dictionary, Tokens Studio, and Terrazzo" and support from "Penpot, Figma, Sketch, Framer, Knapsack, Supernova, and zeroheight" (https://www.designtokens.org/tr/2025.10/format/; https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/). It is not a W3C Recommendation ("It is not a W3C Standard nor is it on the W3C Standards Track").

Where it fits, in three places and no more:

1. **Rendering**: nowhere. A sheet renders with the project's real CSS; tokens reach it however the project ships them (CawCo's own: `design/tokens/cawco.tokens.json` → `bun run tokens` → `tokens.css`, per the repo's CLAUDE.md).
2. **The inspector**: a prop whose type is a colour, length or font role offers the names from the project's `**/*.tokens.json` (DTCG) when one exists, so a person picks `color.accent`, not a hex; the arg is written as the token's name and the component resolves it. Without a tokens file, a plain control.
3. **§5.7 design systems**: the agentic design-system build writes its tokens as a DTCG file and generates the CSS from it, instead of CSS alone. One-line change to §5.7's "The artifact" bullet.

## 10. What this replaces in CawCo today

Cutover, one path, the old one deleted:

| Today | Under C |
|---|---|
| D29 text: "Svelte only", "No dev server for the agent to keep alive", compile location "the owner's pick" | Every toolchain in §2's table; the **daemon** keeps the toolchain alive; the compile runs in the workspace, settled |
| The "dev server or folder" `preview` as the way an agent shows a component it made (§5.10 D29 paragraph) | `artifact_create(kind: "sheet", file)`; `preview` (dir/port) stays for whole running apps and static folders, never for showing a component |
| The OpenUI mockup library (decision log 2026-10-15): `packages/core/src/mockups.ts` (883 lines), `packages/hub/src/mockups.ts` (744), `apps/dashboard/src/lib/cawco/views/openui/mockup/*`, `routes/(app)/motion/oui-mockup`, `system: "cawco"`, `design/manifest.json` specimens, `generateSystemPrompt` for mockups | Deleted. A mocked screen is a real screen component plus a sheet. OpenUI stays only for agent-made data views (option D's remit: "Ask Caw for a view", blocks). §5.7's "Mockups" bullet is rewritten to point at sheets. |
| The merged spec's design bodies, `<design>` markup, `design/components/*.design.html`, `design_library`, `component_switch`, the handover and parity render | Not built |
| The `design-explore` skill's "one static page of only the changed components" built by hand in a dev route (the 15,000-line defect) | The skill writes a sheet; the stage mounts the real components |
| "An agent reads an existing component and recreates it anywhere" | Rejected; the file is the component |

**Tools** (written with `writing-for-agents`, CLI equivalents under the same role checks): `artifact_create(kind: "sheet", file)` → id, route, the stories found and their props; `artifact_update(id, args: { story, values })` → the rewritten story, or `(id, story: { add | duplicate | remove | move })`; `artifact_read(id)` → stories, args, props schema, picks, pins with `source` and `chain`, stage `status`/`errors`, `png?`; `components_list()` → §6's list. `artifact_show`, `artifact_promote`, `comment_*` unchanged.

**Toolchains that take no plugin** (Angular CLI, plain webpack, custom servers; the owner, 2026-10-16: "Just use ur own canvas with some html or json or whatever? Cmon"): the agent shows those projects' components as an HTML `page` artifact that loads the project's built CSS, with picks, pins and ink as on any page, and no `file:line`. No stage, no adapter.

## 11. In the PRD

The D29 row and the §5.10 paragraph are in `2026-10-06-projects.md`, with the decisions below.

## Decided by the owner (2026-10-16)

1. **Structural edits inside a screen** (add, remove, reorder a component; markup in a slot) are pins the agent applies to the screen's file. CawCo writes only story `args` and story exports; it never splices a template.
2. **A project with no code yet** starts as real code from the first screen: the stack is named once and the agent scaffolds it with the framework's own tool (§7, option 1).
3. **A toolchain that takes no plugin** shows components as an HTML `page` artifact on the project's CSS (§10).

## What must be proven

Measurable, with pass conditions. 1 to 5 were measured by the spike (workspace fd865b51, `assets/011cb811/docs/spikes/component-stage.md`) and passed, with the corrections now in §2 and §4; the build proves 6 to 9.

1. **Spike (1).** Vite started programmatically from `apps/dashboard` with the stage plugin serves `/__cawco/sheet?file=src/lib/cawco/transcript/EventCard.stories.ts`; `$lib`, `$app/*`, Tailwind and `tokens.css` resolve; kit's handler does not answer `/__cawco/*`. Pass: the page renders two `EventCard` instances with the fixtures' props, no 404, no kit error page.
2. **Spike (2).** HMR through the hub's preview: an edit to `EventCard.svelte` redraws both frames without reload in < 1 s on the desktop and in the iPad web view; the HMR socket connects through the proxy. Pass: measured latency, zero full reloads.
3. **Spike (3).** `__svelte_meta.loc` + 1 matches the source for five inner elements; `parent` reaches the story mount. Pass: 5/5 lines and columns, chain of length ≥ 2.
4. **Spike (4).** A syntax error in `EventCard.svelte` arrives at the hub as `{ file, line, column, message, frame }` within 3 s and clears on the fix. Pass: both events observed.
5. **Spike (6), extended.** code-inspector's transforms injected into fresh Vite React and Vue apps through the inline plugin only (configs untouched) stamp `data-insp-path` on 95 % of elements; a Next 15.3+ app through `next({ conf })` with the Turbopack rule stamps too (not in the spike; a second probe).
6. **Args write-back.** Changing a variant in the inspector and saving rewrites exactly that story's `args` in `EventCard.stories.ts` (diff touches only that literal; quote style and indent preserved; the file still type-checks with `svelte-check`), and HMR redraws. Pass: `git diff --stat` shows one file, the literal's lines only.
7. **Docgen in the host.** `host.mjs` bundled with svelte2tsx, vue-component-meta and react-docgen lists `EventCard`'s props with types, defaults and the `density` enum under both `node` and `bun`; a Vue and a React sample likewise. Pass: three correct schemas, < 2 s per file cold, < 200 ms warm.
8. **Lifecycle.** The stage is alive 30 min after the last read with no viewer and asleep at 31; after `kill -9` the next open renders within the warm budget; archive stops it. Pass: supervisor log lines for each transition.
9. **The owner's scenario, live, once:** the transcript cards. The agent writes `EventCard.stories.ts` with two stories (compact, roomy) on `cards.fixtures.ts`; the owner opens it on the iPad, picks roomy, pins the title with the Pencil; the agent edits `EventCard.svelte` at the pin's line; both frames redraw; the owner changes `density` in the inspector and saves; the story file shows the change. Zero re-coded lines, no dev route, no agent keeping a server alive.
