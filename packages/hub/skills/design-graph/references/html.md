# A design folder on the design graph

A **design folder** is a design the hub keeps and serves itself: your page, or a folder of files or code, run by Vite on the hub's machine and opened on the design graph with no project behind it. It is your choice for three cases: work with no project behind it, a stack with no stage (`design-explore`, "Where the graph runs"), and an idea you judge throwaway. Every other design, a new part included, is a live story in the project's own language and framework (the steps in `SKILL.md`).

## Pick the form

You choose the form the work needs:

- **One page**: `html`, a whole document. It is the folder's `index.html`.
- **A folder of files**: `dir`, absolute, on your machine, holding `index.html` at its top and whatever it loads (styles, pictures, scripts). Served as they are.
- **A folder of code**: the same `dir`, its `index.html` loading a module (`<script type="module" src="./main.tsx">`) that mounts a React or Svelte component or a small app, or plain TypeScript. Its npm imports are named in a `package.json` at its top; the stage installs them. React for `.jsx`/`.tsx` files, Svelte for `.svelte` files and Vite itself are added when the package.json names none, and a `vite.config` of your own at its top replaces the one the hub writes.

Leave `node_modules` and `.git` out of the folder: the stage installs its own.

## Mark what you made

A design is a **screen** unless you mark it: the graph draws a screen at its widths and in light or dark. Content that a person reads rather than operates takes `content` on the create:

- `"document"`: prose, with any diagrams, maths and code inside it;
- `"chart"`: one chart or a few beside each other;
- `"deck"`: slides.

The graph shows marked content at the panel's own width, in the person's own scheme, with comments and your dials; it offers no widths and no light or dark. Write it to read at that one width: a document holds its text to a column of about 70ch, a chart fills the width it gets, a deck scales its slides to the frame. The mark stands across `artifact_update` until you send another; `"screen"` takes it off.

## Packages

The stage installs only Vite, the framework plugin and what the folder's `package.json` names. Before a page imports a package, read the `choosing-preview-libraries` skill: the library for each kind of content, its `package.json` line, and CawCo's look for it.

## Open it

`artifact_create({ kind: "component", name, title, does: "judge", ask, html })`, or with `dir`, and `content` for a document, chart or deck. Directions are one form each: `directions: [{ html, name, line }, { dir, name, line }]`, `html` and `dir` left out of the call; each direction is a folder of its own, and their package.json files name the same range for any package they share.

The create answers `errors`: every compile error in the pages and what they import, compiled before any browser loads them. A folder that can't install (a package.json that doesn't parse, a package that isn't there) refuses the create in the installer's words.

## Change it in place

`artifact_update({ id, html })`, `{ id, dir }`, or `{ id, directions }` naming the whole design again: its files are replaced in place, and the person's open panel takes the change by Vite's hot reload, their picks and pins kept. No version is kept; to compare alternatives, open directions. The answer's `errors` names each compile error, which the page shows in its frame as Vite's error overlay until your next update compiles. `artifact_create` again under the same `name` does the same.

## Write the page for the graph

A screen is written for the graph's widths and schemes; marked content keeps to its one width (above).

- **One page is one state.** The graph draws it at its widths (390, 768, 1440, 1920) as the frame's own viewport, so the page's media queries and `vw` answer each one; a width wider than the panel is scaled to fit. The page scrolls inside the frame as on a device. Write it responsive, never at one fixed width.
- **Dark is the page's CSS.** The graph's scheme reaches the page as its preferred colour scheme: style dark with `@media (prefers-color-scheme: dark)` or `light-dark()` under `:root { color-scheme: light dark }`. A script's `matchMedia` hears the browser's own scheme in Chromium, so keep the scheme in CSS. A page that names no dark draws light in both.
- **A dial is a CSS variable.** Each dial's target is `{ cssVar: "--radius" }`, set on the page's root; the page reads it (`border-radius: var(--radius)`) and declares its default on `:root`, which the dial shows as written. An `arg` dial is refused: a page has no props.
- **Real words, product-shaped data**, as on any design: real names, counts and the longest text a user has.
- **State that lasts, and the person's files**: a page that keeps state across reloads and devices, or opens a file the person hands it, reads `references/page-store.md` first.

## What comes back

`artifact_read` answers their pins, their dial values (`dials`), with directions their `picked`, and the stage's `errors`. A pin anchors on the element they pointed at and carries no `file:line`: find the element by what the pin names. The hub draws no frame of the page and keeps no render report, so read it yourself before you open it: a screen at each width and in both schemes, marked content at the panel's width (600, and 390 for a phone) in both. Save into code, the Animation face, Compare and the states' Map stay with live stories: a page has no states file to write and no move to play.
