/**
 * The one evaluator of the CSS a token system is written in: what a token's
 * CSS form comes to as a colour or a number, as the browser's cascade would
 * resolve it. The token build reads it twice: to compute a derived token's
 * static DTCG `$value` from its CSS form (design-tokens.ts `settle`), and to
 * give the Apple apps their values (apps/dashboard/scripts/
 * build-tokens-apple.ts).
 *
 * The forms it reads: oklch, hex, rgb, `transparent`, `color-mix(in <space>,
 * …)`, relative `oklch(from … )` with `calc()`, `light-dark()`, a flat
 * `linear-gradient()`, and lengths, durations and numbers with `calc()`,
 * `clamp()` and `min()`. References (`{group.name}`) are followed under the
 * context being read: a context's own CSS for a token when it has one, else
 * the token's base CSS.
 */
import Color from "colorjs.io";

const REM = 16;
const WHITESPACE = /\s/;
const CALL = /^([a-z-]+)\((.*)\)$/s;
const ARITH_TOKENS = /\d*\.?\d+(?:e[+-]?\d+)?[a-z%]*|[a-z]+|[-+*/()]/gi;
const NUMBER = /^(\d*\.?\d+(?:e[+-]?\d+)?)([a-z%]*)$/i;
const NAME = /^[a-z]+$/i;
const REF = /^\{([^}]+)\}$/;
const VIEWPORT_TERM = /^(-?\d*\.?\d+)(?:vi|vw)$/;
const REFS = /\{([^}]+)\}/g;
const MIX_SPACE = /^in\s+([a-z0-9-]+)$/;
const MINUS_TERM = /\s*-\s*/g;

/** A token as the evaluator reads it: its base CSS and each context's own. */
export interface CssToken {
  /** The CSS form in its base set. */
  css: string;
  /** The custom property's name. */
  name: string;
  /** A context's CSS form where it differs from the base (`dark`, `coarse`). */
  variants: Partial<Record<string, string>>;
}

/** Splits at `sep` outside parentheses and braces; " " means any whitespace. */
export function splitTop(s: string, sep: "," | " "): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "}") {
      depth -= 1;
    }
    const cut = sep === " " ? WHITESPACE.test(ch) : ch === sep;
    if (depth === 0 && cut) {
      if (cur.trim()) {
        out.push(cur.trim());
      }
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) {
    out.push(cur.trim());
  }
  return out;
}

/** `name(args)` when the whole string is one call. */
export function call(s: string): { name: string; args: string } | undefined {
  const m = CALL.exec(s);
  if (!m) {
    return;
  }
  let depth = 0;
  for (let i = m[1].length; i < s.length; i += 1) {
    if (s[i] === "(") {
      depth += 1;
    } else if (s[i] === ")") {
      depth -= 1;
      if (depth === 0 && i !== s.length - 1) {
        return;
      }
    }
  }
  return { name: m[1], args: m[2] };
}

/** Base units: px for lengths (rem at 16), seconds for time, % as a fraction. */
function unit(n: number, u: string, where: string): number {
  switch (u) {
    case "":
    case "px":
    case "em":
    case "s":
      return n;
    case "rem":
      return n * REM;
    case "ms":
      return n / 1000;
    case "%":
      return n / 100;
    default:
      throw new Error(`${where}: unit "${u}" has no static value`);
  }
}

/** + - * / and parentheses over numbers with units and named channels. */
export function arith(
  expr: string,
  where: string,
  ident: (id: string) => number = (id) => {
    throw new Error(`${where}: unknown name "${id}"`);
  }
): number {
  const toks = expr.match(ARITH_TOKENS) ?? [];
  let i = 0;
  const next = (): string | undefined => {
    const t = toks[i];
    i += 1;
    return t;
  };
  const primary = (): number => {
    const t = next();
    if (t === "(") {
      const v = sum();
      if (next() !== ")") {
        throw new Error(`${where}: unbalanced "${expr}"`);
      }
      return v;
    }
    if (t === "-") {
      return -primary();
    }
    const num = NUMBER.exec(t ?? "");
    if (num) {
      return unit(Number(num[1]), num[2], where);
    }
    if (t && NAME.test(t)) {
      return ident(t);
    }
    throw new Error(`${where}: cannot read "${expr}"`);
  };
  const product = (): number => {
    let v = primary();
    while (toks[i] === "*" || toks[i] === "/") {
      const op = next();
      const r = primary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (toks[i] === "+" || toks[i] === "-") {
      const op = next();
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  if (i !== toks.length) {
    throw new Error(`${where}: cannot read "${expr}"`);
  }
  return v;
}

/**
 * Values of a token system's CSS, under a context: `base` (or any name the
 * tokens have no variant for) is the base set; a context named in
 * `darkContexts` also picks `light-dark()`'s second value.
 */
export class CssEvaluator {
  private readonly colours = new Map<string, Color>();
  private readonly lookup: (path: string) => CssToken | undefined;
  private readonly darkContexts: ReadonlySet<string>;

  constructor(
    lookup: (path: string) => CssToken | undefined,
    darkContexts: ReadonlySet<string>
  ) {
    this.lookup = lookup;
    this.darkContexts = darkContexts;
  }

  token(ref: string, where: string): CssToken {
    const token = this.lookup(ref);
    if (!token) {
      throw new Error(`${where}: unknown reference {${ref}}`);
    }
    return token;
  }

  /** A token's CSS under `mode`: its variant there, else its base CSS. */
  cssOf(ref: string, mode: string, where: string): string {
    const token = this.token(ref, where);
    return token.variants[mode] ?? token.css;
  }

  /** A token's colour under one context, as the cascade resolves it. */
  colourOf(ref: string, mode: string, where: string): Color {
    const key = `${ref}@${mode}`;
    let colour = this.colours.get(key);
    if (!colour) {
      colour = this.colour(this.cssOf(ref, mode, where), mode, ref);
      this.colours.set(key, colour);
    }
    return colour;
  }

  colour(raw: string, mode: string, where: string): Color {
    const s = raw.trim();
    const ref = REF.exec(s);
    if (ref) {
      return this.colourOf(ref[1], mode, where);
    }
    const fn = call(s);
    if (fn?.name === "color-mix") {
      return this.mix(fn.args, mode, where);
    }
    if (fn?.name === "light-dark") {
      const [light, dark] = splitTop(fn.args, ",");
      if (!(light && dark)) {
        throw new Error(`${where}: unsupported light-dark(${fn.args})`);
      }
      return this.colour(
        this.darkContexts.has(mode) ? dark : light,
        mode,
        where
      );
    }
    if (fn?.name === "oklch" && fn.args.trimStart().startsWith("from ")) {
      return this.relative(fn.args, mode, where);
    }
    if (fn?.name === "linear-gradient") {
      // A flat gradient (every stop the same colour) is that colour.
      const [first, ...rest] = splitTop(fn.args, ",").map((stop) =>
        this.colour(stop, mode, where)
      );
      if (!(first && rest.every((stop) => stop.equals(first)))) {
        throw new Error(
          `${where}: a gradient with distinct stops is not a colour`
        );
      }
      return first;
    }
    if (s.includes("{")) {
      throw new Error(`${where}: unsupported colour form "${s}"`);
    }
    return new Color(s);
  }

  /** CSS Color 5 color-mix(): percentages normalised, alpha-multiplied under 100%. */
  private mix(args: string, mode: string, where: string): Color {
    const [method, ...stops] = splitTop(args, ",");
    const space = MIX_SPACE.exec(method ?? "")?.[1];
    if (!space || stops.length !== 2) {
      throw new Error(`${where}: unsupported color-mix(${args})`);
    }
    const parsed = stops.map((stop) => {
      const parts = splitTop(stop, " ");
      const last = parts.at(-1) ?? "";
      const pct = last.endsWith("%")
        ? Number(last.slice(0, -1)) / 100
        : undefined;
      const body = pct === undefined ? stop : parts.slice(0, -1).join(" ");
      return { colour: this.colour(body, mode, where), pct };
    });
    const [a, b] = parsed;
    let p1 = a.pct;
    let p2 = b.pct;
    if (p1 === undefined && p2 === undefined) {
      p1 = 0.5;
      p2 = 0.5;
    } else if (p1 === undefined) {
      p1 = 1 - (p2 ?? 0);
    } else if (p2 === undefined) {
      p2 = 1 - p1;
    }
    const total = (p1 ?? 0) + (p2 ?? 0);
    if (total <= 0) {
      throw new Error(`${where}: color-mix percentages sum to zero`);
    }
    const mixed = Color.mix(a.colour, b.colour, (p2 ?? 0) / total, {
      space,
      outputSpace: space,
      premultiplied: true,
    });
    if (total < 1) {
      mixed.alpha = Number(mixed.alpha) * total;
    }
    return mixed;
  }

  /** oklch(from <colour> L C H [/ A]) with channel keywords and calc(). */
  private relative(args: string, mode: string, where: string): Color {
    const parts = splitTop(args, " ");
    const slash = parts.indexOf("/");
    const [, origin, L, C, H] = parts;
    const A = slash === -1 ? "alpha" : parts[slash + 1];
    if (!(origin && L && C && H) || (slash !== -1 && slash !== 5)) {
      throw new Error(`${where}: unsupported oklch(${args})`);
    }
    const base = this.colour(origin, mode, where).to("oklch");
    const [l, c, h] = base.coords;
    const channels: Record<string, number> = {
      l: Number(l ?? 0),
      c: Number(c ?? 0),
      h: Number(h ?? 0),
      alpha: Number(base.alpha),
    };
    const read = (authoredTok: string, full: number): number => {
      // A channel that is a token (the scrim's alpha, effect.scrim-mix)
      // reads as that token's own value.
      const ref = REF.exec(authoredTok);
      const tok = ref ? this.token(ref[1], where).css : authoredTok;
      if (tok in channels) {
        return channels[tok];
      }
      const inner = call(tok);
      const expr = inner?.name === "calc" ? inner.args : tok;
      if (!inner && tok.endsWith("%")) {
        return (Number(tok.slice(0, -1)) / 100) * full;
      }
      return arith(expr, where, (id) => {
        if (id in channels) {
          return channels[id];
        }
        throw new Error(`${where}: unknown channel "${id}"`);
      });
    };
    return new Color(
      "oklch",
      [read(L, 1), read(C, 0.4), read(H, 360)],
      read(A, 1)
    );
  }

  /** A length, duration or number in base units; references resolved under `mode`. */
  // biome-ignore lint/suspicious/noParametersOnlyUsedInRecursion: `mode` also picks each reference's CSS (cssOf)
  numeric(raw: string, where: string, mode = "base"): number {
    const s = raw.trim();
    const fn = call(s);
    const expr = fn?.name === "calc" ? fn.args : s;
    if (fn && fn.name !== "calc") {
      throw new Error(`${where}: "${s}" is not a single value`);
    }
    const substituted = expr.replace(
      REFS,
      (_, ref: string) =>
        `(${this.numeric(this.cssOf(ref, mode, where), where, mode)})`
    );
    return arith(substituted, where);
  }

  /**
   * A `min()` of a length and a share of its container (`%`), as the
   * length: the most the size may be. The container's side has no meaning
   * outside a layout, so a min() of anything else is refused.
   */
  cap(raw: string, where: string, mode = "base"): number {
    const fn = call(raw.trim());
    const fixed = fn
      ? splitTop(fn.args, ",").filter((arg) => !arg.includes("%"))
      : [];
    if (!(fn?.name === "min" && fixed.length === 1)) {
      throw new Error(`${where}: unsupported "${raw}"`);
    }
    return this.numeric(fixed[0], where, mode);
  }

  /** A size as min...max: one value is min == max, a clamp() its bounds. */
  range(raw: string, where: string): [number, number] {
    const s = raw.trim();
    const ref = REF.exec(s);
    if (ref) {
      return this.range(this.token(ref[1], where).css, where);
    }
    const fn = call(s);
    if (fn?.name === "clamp") {
      const [min, , max] = splitTop(fn.args, ",");
      if (!(min && max)) {
        throw new Error(`${where}: unsupported clamp(${fn.args})`);
      }
      return [this.numeric(min, where), this.numeric(max, where)];
    }
    const v = this.numeric(s, where);
    return [v, v];
  }

  /**
   * A clamp()'s preferred value, `<length> + <n>vi` (or `vw`), as points
   * plus points per point of viewport width; null for a fixed size.
   */
  fluid(
    raw: string,
    where: string
  ): { base: number; perViewport: number } | null {
    const s = raw.trim();
    const ref = REF.exec(s);
    if (ref) {
      return this.fluid(this.token(ref[1], where).css, where);
    }
    const fn = call(s);
    if (fn?.name !== "clamp") {
      return null;
    }
    const [, preferred] = splitTop(fn.args, ",");
    let base = 0;
    let perViewport = 0;
    for (const term of (preferred ?? "")
      .replace(MINUS_TERM, " + -")
      .split("+")) {
      const t = term.trim();
      const viewport = VIEWPORT_TERM.exec(t);
      if (viewport) {
        perViewport += Number(viewport[1]) / 100;
      } else if (t) {
        base += this.numeric(t, where);
      }
    }
    return { base, perViewport };
  }
}
