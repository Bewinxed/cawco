// The colour and size rule: a colour or a length on the dashboard is a
// token, never a literal (DESIGN.md: "Do not introduce one-off colours …
// spacing, radii … outside it; add a token to the JSON first"). The CSS
// half is Biome's (scripts/lint/no-raw-css-values.grit, over every
// stylesheet and `<style>`); this is the markup half, which Biome cannot
// read as CSS:
//
// - house/no-raw-class-values: a class whose arbitrary value
//   (`w-[52px]`, `bg-[#fff]`, `[color:red]`) holds a colour or a length
//   literal. It holds the kit (src/lib/components/ui) too, where
//   design/no-arbitrary-values is off: there an arbitrary value is built
//   from tokens (`max-h-[min(var(--a),var(--b))]`) or it is refused.
// - the inline style rule (shadcn.mjs no-inline-styles) reads a value
//   through `rawLengths` and `hasRawColor` below.
//
// The lengths a value may write as they are, the same in the grit rule:
// `0`; a hairline and its double (`1px`, `2px`, either sign, the house
// stroke widths, scripts/border-width-check.ts); one of the font's own
// units (`1em`, `1lh`, `1ex`, `1ch`, `1cap`, `1ic`), or a count of lines
// (`2lh`); and a share of the viewport or the container (`100dvh`,
// `55dvh`, `50cqb`), which is no fixed size, as a percentage is none.
//
// A colour literal is a hex, a colour function on literal channels or a
// named colour; `light-dark()` and `color-mix()` of tokens read the theme.
import { sitesOf } from "./classes.mjs";
import { isArbitraryValue, splitVariants } from "./tailwind.mjs";

const COLOR_FUNCTION =
  /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color)\(/iu;
const NAMED_COLORS = new Set(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " "
  )
);

const LEAVES = /[\s,()/]+/u;

/** Whether a CSS value names a colour outright (not through a variable). */
export function hasRawColor(value) {
  const text = value
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu, " ")
    .replace(/url\([^)]*\)/giu, " ")
    // A colour function whose channels are one variable reads the theme.
    .replace(
      /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(\s*var\([^()]*\)\s*(?:\/\s*(?:[\d.]+%?|var\([^()]*\)))?\s*\)/giu,
      " "
    )
    .replace(/var\([^)]*\)/giu, " ");
  if (COLOR_FUNCTION.test(text)) {
    return true;
  }
  return text
    .split(LEAVES)
    .some((leaf) => NAMED_COLORS.has(leaf.toLowerCase()));
}

const LENGTH =
  /(?<![\w.#-])-?(?:\d+\.?\d*|\.\d+)(?:px|em|rem|ch|ex|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|svi|svb|lvw|lvh|lvi|lvb|dvw|dvh|dvi|dvb|cqw|cqh|cqi|cqb|cqmin|cqmax|cm|mm|q|in|pt|pc)(?![\w-])/giu;
const ALLOWED_LENGTH =
  /^(?:-?0+(?:\.0+)?[a-z]+|-?[12]px|1(?:em|ex|ch|cap|ic)|\d+r?lh|-?(?:\d+\.?\d*|\.\d+)(?:vw|vh|vi|vb|vmin|vmax|[sld]v[whib]|cq[whib]|cqmin|cqmax))$/iu;

/** Each length literal a CSS value writes past the allowed ones. */
function rawLengths(value) {
  const text = value
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu, " ")
    .replace(/url\([^)]*\)/giu, " ");
  return (text.match(LENGTH) ?? []).filter((l) => !ALLOWED_LENGTH.test(l));
}

/** What a raw value writes, said for a finding: `52px`, `a colour`. */
export function rawLiteral(value) {
  const lengths = rawLengths(value);
  if (lengths.length > 0) {
    return `the length ${lengths.join(", ")}`;
  }
  return hasRawColor(value) ? "a raw colour" : null;
}

/** An arbitrary value's CSS: the brackets' text, `_` read as a space. */
function arbitraryCss(token) {
  const { base } = splitVariants(token);
  const open = base.indexOf("[");
  const close = base.lastIndexOf("]");
  return base
    .slice(open + 1, close)
    .replace(/(?<!\\)_/gu, " ")
    .replace(/\\_/gu, "_");
}

/** Each class whose arbitrary value writes a colour or a length literal. */
export function rawClassValues(model) {
  const findings = [];
  for (const site of sitesOf(model, { follow: false })) {
    for (const entry of site.entries) {
      const said = isArbitraryValue(entry.name)
        ? rawLiteral(arbitraryCss(entry.name))
        : null;
      if (said) {
        findings.push({
          start: entry.start,
          end: entry.end,
          message: `"${entry.name}" writes ${said}. A colour or a size is a token (design/tokens/cawco.tokens.json, then \`bun run tokens\`): use its utility or var(--…).`,
        });
      }
    }
  }
  return findings;
}
