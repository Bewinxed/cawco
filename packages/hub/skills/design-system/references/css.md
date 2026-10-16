# Tokens and CSS

The system is written to modern CSS (Projects spec §5.7). `tokens.json` is the one source; `tokens.css` is generated from it by `design_write` and never written by hand.

## tokens.json

The W3C Design Tokens (DTCG) format, 2025.10: groups are objects, a token is an object with `$value`, and `$type` set on a group reaches every token inside it.

```json
{
  "color": {
    "$type": "color",
    "ink": {
      "$value": "oklch(24% 0.03 255)",
      "$description": "Body text and icons.",
      "$extensions": { "dev.cawco": { "dark": "oklch(94% 0.01 255)" } }
    },
    "ink-quiet": { "$value": "oklch(from {color.ink} l c h / 0.64)" }
  },
  "size": {
    "$type": "dimension",
    "body": { "$value": "clamp(1rem, 0.94rem + 0.3vw, 1.125rem)" }
  }
}
```

- **Names** are the project's roles. Each token becomes `--<last segment>` (`color.ink` → `--ink`), so last segments are unique across the file.
- **`$value`** is the CSS text itself: `oklch(…)`, `clamp(…)`, `color-mix(…)`, `200ms`, `cubic-bezier(…)`, `0 1px 2px oklch(…)`.
- **References** `{group.name}` become `var(--name)`, so a derived value keeps following its base in both schemes.
- **Variants** sit in `$extensions["dev.cawco"]`: `dark` (a colour's becomes `light-dark(light, dark)`; any other token's goes under `:root.dark`), `coarse` (under `(pointer: coarse)`), `compact` (coarse pointer, width under 640px).

## The CSS rules

- **Colour**: every colour in `oklch()`. Related colours are derived, not stored again: relative colour (`oklch(from {color.ink} l c h / 0.6)`) for a tint, shade or alpha of one colour, `color-mix(in oklch, {color.a} 30%, {color.b})` for a blend of two.
- **Schemes**: `tokens.css` declares `color-scheme: light dark` on `:root`; each colour role carries its `dark` value, so `light-dark()` follows the person's scheme.
- **Type**: a fluid scale in `clamp()`, every middle value with a `rem` term (`clamp(1.5rem, 1.2rem + 1.5vw, 2.25rem)`) so zoom still scales it. DESIGN.md's rules set `text-wrap: balance` on headings and `text-wrap: pretty` on running text.
- **Space and size**: steps in `clamp()`, with container units (`cqi`) where a step follows its container; components use logical properties (`margin-inline`, `padding-block`, `inset-inline-start`) and intrinsic sizing (`min-content`, `fit-content`, `minmax()`).
- **Layers**: `tokens.css` is `@layer tokens`. The project's stylesheet names its order once (`@layer tokens, base, components, utilities;`) and imports the tokens into theirs (`@import "../design/tokens.css" layer(tokens);`); components sit under `@scope`.
- **Motion**: durations and curves are tokens; any movement is opt-in, inside `@media (prefers-reduced-motion: no-preference)`.
