# Tokens in a Tailwind theme

In a Tailwind v4 project the theme is the token file: each variable its `@theme` blocks declare is a token, named as Tailwind writes it (`--color-ink`), and the utilities it makes (`bg-ink`, `rounded-card`) are how the code uses it. The system names that stylesheet where the project keeps it. `design/` holds no copy of a token: no `tokens.json`, no resolver, no `themes/`, no `tokens.css`, no `tokens.ts`, no `sources`.

These steps take the place of the main file's steps 2, 3, 7 and 8, and step 6 writes the project's `SKILL.md` from [templates/SKILL.tailwind.md](../templates/SKILL.tailwind.md).

## Steps

1. **Name the theme.** Find the stylesheet Tailwind must load to see the whole theme: the project's entry (the file with `@import "tailwindcss"` and its `@theme` blocks, the one `components.json` or the framework's root layout names), or a file that declares the whole theme by itself. Write `manifest.json` from [templates/manifest.tailwind.json](../templates/manifest.tailwind.json), `tailwind` that file's path from the repository root, with `design_write`. The hub loads it with Tailwind's own loader. Done when `design_write` answers with `design/manifest.json` among `written` and "Its tokens: N theme variables in <path>"; a theme that does not load answers with Tailwind's message, and a path with no theme says it declares none.
2. **Copy the brand's files** the project keeps nowhere in its code (a brand kit's faces and marks from `knowledge/brand/`, the folder's `assets/`) into `design/fonts/` and `design/assets/` with `from`. Fonts and images the app already serves stay where they are. Done when every brand file the material names is in the repository.
3. **Cite the theme** in `DESIGN.md` (step 4): each answer names its tokens as Tailwind writes them and their `file:line` in the theme (`src/app.css:42`, `--color-ink`, `bg-ink`). A decision page pick (step 5) is written into the theme, in your own commit, with the card's id in a comment above the token. Done when every token an answer names has its line.
4. **Show the foundations as a states file** on the project's stage: `Foundations.stories.ts` beside the project's components, one story per section of [visual-foundations.md](visual-foundations.md), each drawing its tokens with the project's own classes in both schemes, every specimen labelled with its variable. The project's own build compiles it, so it needs no copy of the tokens. Open it with the `design-graph` skill (`artifact_create({ kind: "component", name: "foundations", title: "Foundations", does: "judge", ask: "Judge the foundations in both schemes: pin any token that reads wrong", file: ["<path>/Foundations.stories.ts:<Section>", …] })`, each section's story named) and name the file in the project's `SKILL.md`. Done when every namespace the theme declares appears on it and both schemes read cleanly.

The app already loads its theme, so step 8's import has nothing to add.

## Adding a token

A token goes into the theme before the first class that uses it, in the commit of the work that needs it: under Tailwind's namespace for its kind, named for its role.

| Kind | Namespace |
| --- | --- |
| Colour | `--color-*` |
| Font family, weight | `--font-*`, `--font-weight-*` |
| Font size, line height, letter spacing | `--text-*`, `--leading-*`, `--tracking-*` |
| Spacing | `--spacing-*` |
| Radius | `--radius-*` |
| Shadow | `--shadow-*`, `--inset-shadow-*`, `--drop-shadow-*` |
| Blur | `--blur-*` |
| Easing, animation | `--ease-*`, `--animate-*` |
| Breakpoint, container | `--breakpoint-*`, `--container-*` |

Tailwind's docs list every namespace (tailwindcss.com/docs/theme, "Theme variable namespaces"). A token that repeats another's value is the existing token, used again.

The hub runs none of the project's JavaScript: a theme key a `@plugin` or `@config` adds is one it cannot read. Declare every token in `@theme`.

## Props that take a token

A component prop that offers the system's names in a design graph's inspector is typed with one of three aliases. Declare them once, in a module the components share:

```ts
export type TokenColor = `--color-${string}`;
export type TokenFont = `--font-${string}`;
export type TokenSize = `--${"spacing" | "radius" | "text" | "container" | "breakpoint"}-${string}`;
```

The stage reads the theme the manifest names and offers each prop its kind's names, read live. A picked name is the variable, used as `var(<name>)`. A project with a `prefix(tw)` writes the prefix into each: `` `--tw-color-${string}` ``.
