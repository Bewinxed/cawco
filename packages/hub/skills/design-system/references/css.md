# Tokens and CSS

The tokens are conformant W3C Design Tokens (DTCG) 2025.10: the Format and Color modules for the values, the Resolver module for themes. `design_write` settles them, checks them against the DTCG's JSON Schemas and generates `tokens.css` from them; nobody writes `tokens.css` by hand.

## The files

- `tokens.resolver.json`: the resolver (start from [templates/tokens.resolver.json](../templates/tokens.resolver.json)). Its set names `tokens.json`; each theme is a modifier whose default context is the base and whose other context names a file in `themes/`. The modifier's `$extensions["dev.cawco"].contexts` says how CawCo's stylesheet draws each context: `{ "scheme": "dark" }` (colours become `light-dark()`; give `"selector"` when a non-colour token changes too) or `{ "media": "(pointer: coarse)" }`.
- `tokens.json`: the base set, every token with its own `$type`.
- `themes/<context>.tokens.json`: a context's overrides, the same paths as in `tokens.json`, only the tokens that change.

```json
{
  "color": {
    "ink": {
      "$type": "color",
      "$value": { "colorSpace": "oklch", "components": [0.24, 0.03, 255] },
      "$description": "Body text and icons."
    },
    "ink-quiet": {
      "$type": "color",
      "$value": { "colorSpace": "oklch", "components": [0.24, 0.03, 255], "alpha": 0.64 },
      "$extensions": { "dev.cawco": { "css": "oklch(from {color.ink} l c h / 0.64)" } }
    }
  },
  "size": {
    "body": {
      "$type": "dimension",
      "$value": { "value": 1, "unit": "rem" },
      "$extensions": { "dev.cawco": { "css": "clamp(1rem, 0.94rem + 0.3vw, 1.125rem)" } }
    }
  }
}
```

- **Names** are the project's roles. Each token becomes `--<last segment>` (`color.ink` → `--ink`), so last segments are unique across the files.
- **`$value`** is the spec's type: a colour `{ colorSpace, components, alpha?, hex? }` (oklch lightness 0–1), a dimension `{ value, unit }` in `px` or `rem`, a duration `{ value, unit }` in `ms` or `s`, a cubic Bézier `[x1, y1, x2, y2]`, a font family an array of names, a shadow `{ color, offsetX, offsetY, blur, spread, inset? }` or a list of them, a typography `{ fontFamily, fontSize, fontWeight, letterSpacing, lineHeight }`. A reference `"{group.name}"` is a value too.
- **A recipe** is the CSS a token keeps in `$extensions["dev.cawco"].css` when its CSS says more than a static value: a relative colour or `color-mix()` that follows its base, a fluid `clamp()`, a `calc()` over other tokens. The stylesheet writes the recipe; `design_write` computes the token's `$value` from it, in the base and in every context, so write any value of the right type and the hub puts the computed one in. A `clamp()`'s value is its floor.
- **References** `{group.name}` become `var(--name)` in the stylesheet, so a derived value keeps following its base in every context.

## The CSS rules

- **Colour**: every colour in `oklch()`. Related colours are derived, not stored again: relative colour (`oklch(from {color.ink} l c h / 0.6)`) for a tint, shade or alpha of one colour, `color-mix(in oklch, {color.a} 30%, {color.b})` for a blend of two, each as a recipe.
- **Schemes**: `tokens.css` declares `color-scheme: light dark` on `:root`; the dark theme's file gives each colour role its dark value, so `light-dark()` follows the person's scheme.
- **Type**: a fluid scale in `clamp()` recipes, every middle value with a `rem` term (`clamp(1.5rem, 1.2rem + 1.5vw, 2.25rem)`) so zoom still scales it. DESIGN.md's rules set `text-wrap: balance` on headings and `text-wrap: pretty` on running text.
- **Space and size**: steps in `clamp()`, with container units (`cqi`) where a step follows its container; components use logical properties (`margin-inline`, `padding-block`, `inset-inline-start`) and intrinsic sizing (`min-content`, `fit-content`, `minmax()`).
- **Layers**: `tokens.css` is `@layer tokens`. The project's stylesheet names its order once (`@layer tokens, base, components, utilities;`) and imports the tokens into theirs (`@import "../design/tokens.css" layer(tokens);`); components sit under `@scope`.
- **Motion**: durations and curves are tokens; any movement is opt-in, inside `@media (prefers-reduced-motion: no-preference)`.
