/**
 * The Apple platform of the token build (build-tokens.ts runs it beside the
 * CSS platform, from the same source and the same Style Dictionary config).
 *
 * The Apple apps are UIKit. Colours: every colour token becomes one
 * asset-catalog colour set with an Any and a Dark appearance, plus a `UIColor`
 * accessor in `Palette` that resolves against the trait collection it is drawn
 * in. A token's light value is its `$value`; its dark value is
 * `$extensions["dev.cawco"].dark` when authored, else `$value` evaluated with
 * every reference in its dark value: exactly how `light-dark()` and `var()`
 * resolve in the dashboard's cascade. The CSS colour forms the source uses
 * (oklch, hex, `transparent`, `color-mix(in <space>, …)`, relative
 * `oklch(from … )` with `calc()`) are evaluated here, converted to Display P3
 * and gamut-mapped with CSS Color 4's algorithm.
 *
 * Everything else becomes a Swift constant in a namespace per group: points
 * for dimensions (1rem = 16pt), seconds for durations, `UIFont.Weight`,
 * `TimingCurve` for cubic Béziers, font stacks, and `TypeRole`s. A `clamp()`
 * (fluid on the web) is its min...max range. Media variants (`coarse`,
 * `compact`) are separate constants with that suffix. A shadow is its list of
 * `ShadowLayer`s and a gradient its `Gradient` stops, each colour an `Ink`
 * with its light and dark Display P3 values (`light-dark()` read per
 * appearance). Transitions are CSS composites with no Apple counterpart (the
 * motion tokens they are built from are emitted) and are not emitted.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Color from "colorjs.io";
import type {
  Dictionary,
  PlatformConfig,
  TransformedToken,
} from "style-dictionary/types";
import { isProductToken } from "./token-groups";

const EXT = "dev.cawco";
const REM = 16;
const CATALOG = "Resources/Tokens.xcassets";
const AUTHOR = { author: "xcode", version: 1 };

/** Token groups and the Swift namespace each becomes. */
const NAMESPACES: Record<string, string> = {
  color: "Palette",
  font: "FontFamily",
  type: "TypeScale",
  space: "Space",
  radius: "Radius",
  size: "Size",
  effect: "Effect",
  motion: "Motion",
  shadow: "Shadow",
};

/** CSS composites the Apple platform does not carry. */
const NOT_APPLE = new Set(["transition"]);

const WEIGHTS: Record<string, string> = {
  "100": ".ultraLight",
  "200": ".thin",
  "300": ".light",
  "400": ".regular",
  "500": ".medium",
  "600": ".semibold",
  "700": ".bold",
  "800": ".heavy",
  "900": ".black",
};

const WHITESPACE = /\s/;
const CALL = /^([a-z-]+)\((.*)\)$/s;
const ARITH_TOKENS = /\d*\.?\d+(?:e[+-]?\d+)?[a-z%]*|[a-z]+|[-+*/()]/gi;
const NUMBER = /^(\d*\.?\d+(?:e[+-]?\d+)?)([a-z%]*)$/i;
const NAME = /^[a-z]+$/i;
const REF = /^\{([^}]+)\}$/;
const VIEWPORT_TERM = /^(-?\d*\.?\d+)(?:vi|vw)$/;
const REFS = /\{([^}]+)\}/g;
const MIX_SPACE = /^in\s+([a-z0-9-]+)$/;
const KEBAB = /-([a-z0-9])/g;
const SWIFT_ID = /^[a-z][A-Za-z0-9]*$/;
const QUOTES = /^["']|["']$/g;
const BACKSLASH = /\\/g;
const DOUBLE_QUOTE = /"/g;
const FONT_REF = /^\{font\.([^}]+)\}$/;
const EM = /[^r]em$/;
const DECLARED = /static let (\w+)/;
const LENGTH = /^-?\d*\.?\d+(?:px|rem)?$/;

type Mode = "light" | "dark";

interface Variants {
  coarse?: string;
  compact?: string;
  dark?: string;
}

function variantsOf(token: TransformedToken): Variants {
  return (token.original.$extensions?.[EXT] ?? {}) as Variants;
}

function authored(token: TransformedToken): string {
  return String(token.original.$value).trim();
}

/** Splits at `sep` outside parentheses and braces; " " means any whitespace. */
function splitTop(s: string, sep: "," | " "): string[] {
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
function call(s: string): { name: string; args: string } | undefined {
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
      throw new Error(`${where}: unit "${u}" has no Apple value`);
  }
}

/** + - * / and parentheses over numbers with units and named channels. */
function arith(
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

class Tokens {
  readonly byPath = new Map<string, TransformedToken>();
  private readonly colours = new Map<string, Color>();

  constructor(dictionary: Dictionary) {
    for (const token of dictionary.allTokens) {
      this.byPath.set(token.path.join("."), token);
    }
  }

  lookup(ref: string, where: string): TransformedToken {
    const token = this.byPath.get(ref);
    if (!token) {
      throw new Error(`${where}: unknown reference {${ref}}`);
    }
    return token;
  }

  /** A token's colour under one scheme, as the dashboard's cascade resolves it. */
  colourOf(token: TransformedToken, mode: Mode): Color {
    const key = `${token.path.join(".")}@${mode}`;
    let colour = this.colours.get(key);
    if (!colour) {
      const { dark } = variantsOf(token);
      const raw =
        mode === "dark" && dark !== undefined ? dark : authored(token);
      colour = this.colour(raw, mode, token.name);
      this.colours.set(key, colour);
    }
    return colour;
  }

  colour(raw: string, mode: Mode, where: string): Color {
    const s = raw.trim();
    const ref = REF.exec(s);
    if (ref) {
      return this.colourOf(this.lookup(ref[1], where), mode);
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
      return this.colour(mode === "light" ? light : dark, mode, where);
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
  private mix(args: string, mode: Mode, where: string): Color {
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
  private relative(args: string, mode: Mode, where: string): Color {
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
    const read = (tok: string, full: number): number => {
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

  /** A length, duration or number in base units; references resolved. */
  numeric(raw: string, where: string): number {
    const s = raw.trim();
    const fn = call(s);
    const expr = fn?.name === "calc" ? fn.args : s;
    if (fn && fn.name !== "calc") {
      throw new Error(`${where}: "${s}" is not a single value`);
    }
    const substituted = expr.replace(REFS, (_, ref: string) => {
      const token = this.lookup(ref, where);
      return `(${this.numeric(authored(token), where)})`;
    });
    return arith(substituted, where);
  }

  /** A size as min...max: one value is min == max, a clamp() its bounds. */
  range(raw: string, where: string): [number, number] {
    const s = raw.trim();
    const ref = REF.exec(s);
    if (ref) {
      return this.range(authored(this.lookup(ref[1], where)), where);
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
      return this.fluid(authored(this.lookup(ref[1], where)), where);
    }
    const fn = call(s);
    if (fn?.name !== "clamp") {
      return null;
    }
    const [, preferred] = splitTop(fn.args, ",");
    let base = 0;
    let perViewport = 0;
    for (const term of (preferred ?? "")
      .replace(/\s*-\s*/g, " + -")
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

// MARK: - Colour sets

function component(n: number): string {
  return Math.min(1, Math.max(0, n)).toFixed(4);
}

function appearance(colour: Color, dark: boolean): object {
  const p3 = colour.to("p3").toGamut({ space: "p3", method: "css" });
  const [red, green, blue] = p3.coords.map((v) => Number(v ?? 0));
  return {
    ...(dark
      ? { appearances: [{ appearance: "luminosity", value: "dark" }] }
      : {}),
    color: {
      "color-space": "display-p3",
      components: {
        alpha: component(Number(colour.alpha)),
        blue: component(blue),
        green: component(green),
        red: component(red),
      },
    },
    idiom: "universal",
  };
}

function json(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function colourTokens(dictionary: Dictionary): TransformedToken[] {
  return dictionary.allTokens.filter(
    (t) => t.$type === "color" && isProductToken(t)
  );
}

/** Rewrites the asset catalog: one colour set per colour token, Any and Dark. */
function writeColourSets(
  dictionary: Dictionary,
  platform: PlatformConfig
): void {
  const tokens = new Tokens(dictionary);
  const catalog = join(platform.buildPath ?? "", CATALOG);
  rmSync(catalog, { recursive: true, force: true });
  mkdirSync(catalog, { recursive: true });
  writeFileSync(join(catalog, "Contents.json"), json({ info: AUTHOR }));
  for (const token of colourTokens(dictionary)) {
    const dir = join(catalog, `${token.name}.colorset`);
    mkdirSync(dir);
    writeFileSync(
      join(dir, "Contents.json"),
      json({
        colors: [
          appearance(tokens.colourOf(token, "light"), false),
          appearance(tokens.colourOf(token, "dark"), true),
        ],
        info: AUTHOR,
      })
    );
  }
}

export const colourSetsAction = {
  do: writeColourSets,
  undo: (_dictionary: Dictionary, platform: PlatformConfig) => {
    rmSync(join(platform.buildPath ?? "", CATALOG), {
      recursive: true,
      force: true,
    });
  },
};

// MARK: - Swift

function swiftName(name: string): string {
  const id = name.replace(KEBAB, (_, ch: string) => ch.toUpperCase());
  if (!SWIFT_ID.test(id)) {
    throw new Error(`${name}: not a Swift identifier ("${id}")`);
  }
  return id;
}

function swiftNumber(n: number): string {
  return `${Number(n.toFixed(6))}`;
}

/** A font stack, following references to the stack they name. */
function stack(raw: string, tokens: Tokens, where: string): string[] {
  let value = raw.trim();
  for (let ref = REF.exec(value); ref; ref = REF.exec(value)) {
    value = authored(tokens.lookup(ref[1], where));
  }
  return splitTop(value, ",").map((f) => f.replace(QUOTES, ""));
}

function swiftString(s: string): string {
  return `"${s.replace(BACKSLASH, "\\\\").replace(DOUBLE_QUOTE, '\\"')}"`;
}

/** The letter-spacing a type role is set with, named by its token:
    `$extensions["dev.cawco.type"].tracking`, a reference to a `track-*`. */
const TRACK_REF = /^\{type\.(track-[a-z0-9-]+)\}$/;

function roleTracking(
  token: TransformedToken,
  tokens: Tokens,
  where: string
): string {
  const authoredRef = token.original.$extensions?.["dev.cawco.type"]?.tracking;
  if (authoredRef === undefined) {
    return "";
  }
  const ref = TRACK_REF.exec(String(authoredRef));
  if (!ref?.[1]) {
    throw new Error(`${where}: tracking must reference a type.track-* token`);
  }
  tokens.lookup(`type.${ref[1]}`, where);
  return `, tracking: ${swiftName(ref[1])}`;
}

/** `400 {type.text-meta} / 1.35 {font.font-body}` as a TypeRole. */
function typeRole(
  raw: string,
  tokens: Tokens,
  where: string,
  tracking: string
): string {
  const parts = splitTop(raw, " ");
  const [weight, size, slash, leading, family] = parts;
  const familyRef = FONT_REF.exec(family ?? "");
  if (
    parts.length !== 5 ||
    slash !== "/" ||
    !(weight && WEIGHTS[weight]) ||
    !(size && leading && familyRef)
  ) {
    throw new Error(`${where}: unsupported typography "${raw}"`);
  }
  tokens.lookup(`font.${familyRef[1]}`, where);
  const [min, max] = tokens.range(size, where);
  const preferred = tokens.fluid(size, where);
  const fluid = preferred
    ? `, fluid: .init(base: ${swiftNumber(preferred.base)}, perViewport: ${swiftNumber(preferred.perViewport)})`
    : "";
  return `TypeRole(weight: ${WEIGHTS[weight]}, size: ${swiftNumber(min)}...${swiftNumber(max)}, leading: ${swiftNumber(tokens.numeric(leading, where))}, family: FontFamily.${swiftName(familyRef[1])}${fluid}${tracking})`;
}

/** A colour as an `Ink`: its light and dark values in Display P3. */
function ink(raw: string, tokens: Tokens, where: string): string {
  const p3 = (mode: Mode): string => {
    const colour = tokens.colour(raw, mode, where);
    const mapped = colour.to("p3").toGamut({ space: "p3", method: "css" });
    const [red, green, blue] = mapped.coords.map((v) => Number(v ?? 0));
    return `P3(${[red, green, blue, Number(colour.alpha)].map((v) => component(v)).join(", ")})`;
  };
  return `Ink(light: ${p3("light")}, dark: ${p3("dark")})`;
}

/** A CSS shadow list as `ShadowLayer`s, references followed. */
function shadowLayers(raw: string, tokens: Tokens, where: string): string[] {
  const s = raw.trim();
  if (s === "none") {
    return [];
  }
  const ref = REF.exec(s);
  if (ref) {
    return shadowLayers(authored(tokens.lookup(ref[1], where)), tokens, where);
  }
  return splitTop(s, ",").flatMap((layer) => {
    const inner = REF.exec(layer);
    if (inner) {
      return shadowLayers(
        authored(tokens.lookup(inner[1], where)),
        tokens,
        where
      );
    }
    const parts = splitTop(layer, " ");
    const inset = parts.includes("inset");
    const lengths: number[] = [];
    let colour: string | undefined;
    for (const part of parts.filter((p) => p !== "inset")) {
      if (LENGTH.test(part)) {
        lengths.push(tokens.numeric(part, where));
      } else if (colour === undefined) {
        colour = part;
      } else {
        throw new Error(`${where}: unsupported shadow "${layer}"`);
      }
    }
    const [x, y, blur = 0, spread = 0] = lengths;
    if (!colour || x === undefined || y === undefined || lengths.length > 4) {
      throw new Error(`${where}: unsupported shadow "${layer}"`);
    }
    const n = [x, y, blur, spread].map(swiftNumber);
    return [
      `ShadowLayer(x: ${n[0]}, y: ${n[1]}, blur: ${n[2]}, spread: ${n[3]}, ink: ${ink(colour, tokens, where)}, inset: ${inset})`,
    ];
  });
}

/** A top-to-bottom `linear-gradient()` as its `Gradient` stops. */
function gradient(raw: string, tokens: Tokens, where: string): string {
  const fn = call(raw.trim());
  if (fn?.name !== "linear-gradient") {
    throw new Error(`${where}: unsupported gradient "${raw}"`);
  }
  const stops = splitTop(fn.args, ",");
  for (const stop of stops) {
    // A direction or a stop position has no reading here yet: say so rather than guess.
    if (
      stop.startsWith("to ") ||
      stop.endsWith("deg") ||
      splitTop(stop, " ").at(-1)?.endsWith("%")
    ) {
      throw new Error(
        `${where}: only evenly spaced top-to-bottom stops are supported ("${stop}")`
      );
    }
  }
  return `Gradient(stops: [${stops.map((stop) => ink(stop, tokens, where)).join(", ")}])`;
}

interface Declaration {
  doc: string[];
  line: string;
}

function declare(token: TransformedToken, tokens: Tokens): Declaration[] {
  const name = swiftName(token.name);
  const raw = authored(token);
  const where = token.name;
  const doc = token.$description ? [token.$description] : [];
  const one = (line: string, extra: string[] = []): Declaration => ({
    doc: [...doc, ...extra],
    line,
  });
  switch (token.$type) {
    case "color":
      return [
        one(
          `public static let ${name} = Palette.named(${swiftString(token.name)})`
        ),
      ];
    case "dimension": {
      const out: Declaration[] = [];
      if (call(raw)?.name === "clamp") {
        const [min, max] = tokens.range(raw, where);
        out.push(
          one(
            `public static let ${name}: ClosedRange<Double> = ${swiftNumber(min)}...${swiftNumber(max)}`,
            ["Fluid on the web (clamp); its bounds in points."]
          )
        );
      } else {
        const em = EM.test(raw);
        out.push(
          one(
            `public static let ${name}: Double = ${swiftNumber(tokens.numeric(raw, where))}`,
            em ? ["In em: multiply by the font size for points."] : []
          )
        );
      }
      const variants = variantsOf(token);
      for (const key of ["coarse", "compact"] as const) {
        const value = variants[key];
        if (value !== undefined) {
          const suffix = key[0].toUpperCase() + key.slice(1);
          out.push({
            doc: [
              key === "coarse"
                ? `\`${name}\` under a coarse pointer (touch).`
                : `\`${name}\` under a coarse pointer or a window under 640pt wide.`,
            ],
            line: `public static let ${name}${suffix}: Double = ${swiftNumber(tokens.numeric(value, where))}`,
          });
        }
      }
      return out;
    }
    case "number":
      return [
        one(
          `public static let ${name}: Double = ${swiftNumber(tokens.numeric(raw, where))}`
        ),
      ];
    case "duration":
      return [
        one(
          `public static let ${name}: TimeInterval = ${swiftNumber(tokens.numeric(raw, where))}`,
          ["In seconds."]
        ),
      ];
    case "fontWeight": {
      const weight = WEIGHTS[raw];
      if (!weight) {
        throw new Error(`${where}: unsupported font weight "${raw}"`);
      }
      return [one(`public static let ${name}: UIFont.Weight = ${weight}`)];
    }
    case "cubicBezier": {
      const fn = call(raw);
      const points =
        fn?.name === "cubic-bezier" ? splitTop(fn.args, ",").map(Number) : [];
      if (points.length !== 4 || points.some(Number.isNaN)) {
        throw new Error(`${where}: unsupported curve "${raw}"`);
      }
      const [x1, y1, x2, y2] = points.map(swiftNumber);
      return [
        one(
          `public static let ${name} = TimingCurve(x1: ${x1}, y1: ${y1}, x2: ${x2}, y2: ${y2})`
        ),
      ];
    }
    case "fontFamily":
      return [
        one(
          `public static let ${name}: [String] = [${stack(raw, tokens, where).map(swiftString).join(", ")}]`
        ),
      ];
    case "typography":
      return [
        one(
          `public static let ${name} = ${typeRole(raw, tokens, where, roleTracking(token, tokens, where))}`
        ),
      ];
    case "shadow":
      return [
        one(
          `public static let ${name}: [ShadowLayer] = [${shadowLayers(raw, tokens, where).join(", ")}]`
        ),
      ];
    case "gradient":
      return [
        one(`public static let ${name} = ${gradient(raw, tokens, where)}`),
      ];
    default:
      throw new Error(`${where}: $type "${token.$type}" has no Apple mapping`);
  }
}

export function swiftFormat({
  dictionary,
}: {
  dictionary: Dictionary;
}): string {
  const tokens = new Tokens(dictionary);
  const groups = new Map<string, Declaration[]>();
  for (const token of dictionary.allTokens) {
    const [group] = token.path;
    if (NOT_APPLE.has(token.$type ?? "") || !isProductToken(token)) {
      continue;
    }
    const namespace = NAMESPACES[group];
    if (!namespace) {
      throw new Error(`${token.name}: group "${group}" has no Swift namespace`);
    }
    const list = groups.get(namespace) ?? [];
    list.push(...declare(token, tokens));
    groups.set(namespace, list);
  }
  const lines = [
    "// Generated by `bun run tokens` (apps/dashboard) from design/tokens/cawco.tokens.json.",
    "// Do not edit: change the token source and rebuild.",
    "",
    "import UIKit",
  ];
  for (const [namespace, declarations] of groups) {
    const seen = new Set<string>();
    lines.push("", `public enum ${namespace} {`);
    for (const { doc, line } of declarations) {
      const id = DECLARED.exec(line)?.[1] ?? line;
      if (seen.has(id)) {
        throw new Error(`${namespace}.${id}: two tokens share this name`);
      }
      seen.add(id);
      for (const d of doc) {
        lines.push(`    /// ${d}`);
      }
      lines.push(`    ${line}`);
    }
    lines.push("}");
  }
  lines.push("");
  return lines.join("\n");
}
