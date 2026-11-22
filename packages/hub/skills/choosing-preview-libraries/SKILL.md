---
name: choosing-preview-libraries
description: "Picks the library a preview draws each kind of content with (Markdown, maths, code, diagrams, charts, slides), names it in the design's package.json, and dresses it in CawCo's look. Triggers when an agent is about to make a preview, a design on the design graph, a design folder, a page or a mockup that shows any of that content. Also triggers when a design's create answers Vite's \"Failed to resolve import\"."
---

# Choosing preview libraries

A design folder installs only Vite, the framework plugin its files need, and what its own `package.json` names. Every package a page imports is one you name there, and a page that imports one is a `dir` with that `package.json` at its top.

## In a project

The project's libraries come first: read its `package.json` and draw each kind of content with what it already depends on, at the version it pins. The house picks below fill what the project has none for, and every page with no project behind it.

## The house picks

CawCo draws with these itself, so a page built on them matches it.

| Content | Name in `package.json` | Import, and with it |
| --- | --- | --- |
| Markdown and maths, a plain or React page | `"@pierre/words": "^0.3.0"` | `import { renderToHtml } from "@pierre/words"`, then `new TextDecoder().decode(renderToHtml(text, { math: true }))`; maths is TeX between `$` or `$$`, drawn as SVG |
| Markdown and maths, a Svelte page | `"svelte-words": "^0.2.0"` and `"@pierre/words": "^0.3.0"` | `import { Markdown } from "svelte-words"`, then `<Markdown source={text} options={{ math: true }} />` |
| Code | `"@pierre/highlights": "^0.4.0"` | `import { codeToHtml } from "@pierre/highlights"`, then `new TextDecoder().decode(codeToHtml(code, { lang, theme }))` |
| Diagrams and charts | `"pele": "^1.13.0"` | `import { render } from "pele"`, then `render(source, { fontFamily }).svg`, the source in Mermaid syntax; a chart is a `pie` or an `xychart-beta` |
| Slide decks (no house pick) | `"reveal.js": "^6.0.2"` | `import Reveal from "reveal.js"` and `import "reveal.js/reveal.css"`, then `new Reveal({ embedded: true }).initialize()` over `.reveal > .slides > section` |

Words and Highlights hand back bytes that the next call overwrites: decode each result before the next render.

## Dress it in CawCo's look

1. Copy `kit/house.css` and `kit/code-theme.json` from this skill's folder into the design folder.
2. Link the sheet from the page: `<link rel="stylesheet" href="./house.css">`. It declares CawCo's tokens (`--color-*`, `--font-*`, `--radius-*`, `--text-*`) for both schemes, the code colours Highlights' house theme reads, and Pele's look on every drawing it makes.
3. Highlight code with the house theme: `import theme from "./code-theme.json"`, passed as `theme`.
4. Give Pele the page's face: `fontFamily: getComputedStyle(element).fontFamily`, so its labels measure in the font they draw in.
5. Style prose and slides with the tokens, as `color: var(--color-ink-strong)` and `font-family: var(--font-sans)`.

Done when every package the page imports is named in its `package.json`, and the create answers no `errors`.
