/**
 * The Apple platform of the token build (build-tokens.ts runs it beside the
 * CSS platform, from the same token system).
 *
 * The Apple apps are UIKit. Colours: every colour token becomes one
 * asset-catalog colour set with an Any and a Dark appearance, plus a `UIColor`
 * accessor in `Palette` that resolves against the trait collection it is drawn
 * in. A token's values are read from its CSS form (the hub's token view,
 * packages/hub/src/design-tokens.ts): its light value its base CSS, its dark
 * value the dark context's CSS when that differs, else the base CSS
 * evaluated with every reference in its dark value: exactly how
 * `light-dark()` and `var()` resolve in the dashboard's cascade. The CSS is
 * evaluated by the hub's one evaluator (packages/hub/src/design-css.ts),
 * converted to Display P3 and gamut-mapped with CSS Color 4's algorithm.
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
import type Color from "colorjs.io";
import type {
  Dictionary,
  PlatformConfig,
  TransformedToken,
} from "style-dictionary/types";
import {
  CssEvaluator,
  call,
  splitTop,
} from "../../../packages/hub/src/design-css";
import type {
  TokenView,
  ViewToken,
} from "../../../packages/hub/src/design-tokens";
import { isProductToken } from "./token-groups";

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

const REF = /^\{([^}]+)\}$/;
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

/** The token view, read through the hub's evaluator. */
class Tokens extends CssEvaluator {
  private readonly view: TokenView;

  constructor(view: TokenView) {
    super((path) => view.byPath.get(path), view.darkContexts);
    this.view = view;
  }

  /** A token's CSS form and its contexts', by the token Style Dictionary parsed. */
  own(token: TransformedToken): ViewToken {
    const own = this.view.byPath.get(token.path.join("."));
    if (!own) {
      throw new Error(`${token.name}: not in the token view`);
    }
    return own;
  }

  /** The base CSS of the token `ref` names. */
  css(ref: string, where: string): string {
    return this.token(ref, where).css.trim();
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
export const colourSetsAction = (view: TokenView) => ({
  do: (dictionary: Dictionary, platform: PlatformConfig): void => {
    const tokens = new Tokens(view);
    const catalog = join(platform.buildPath ?? "", CATALOG);
    rmSync(catalog, { recursive: true, force: true });
    mkdirSync(catalog, { recursive: true });
    writeFileSync(join(catalog, "Contents.json"), json({ info: AUTHOR }));
    for (const token of colourTokens(dictionary)) {
      const dir = join(catalog, `${token.name}.colorset`);
      const path = token.path.join(".");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "Contents.json"),
        json({
          colors: [
            appearance(tokens.colourOf(path, "light", token.name), false),
            appearance(tokens.colourOf(path, "dark", token.name), true),
          ],
          info: AUTHOR,
        })
      );
    }
  },
  undo: (_dictionary: Dictionary, platform: PlatformConfig) => {
    rmSync(join(platform.buildPath ?? "", CATALOG), {
      recursive: true,
      force: true,
    });
  },
});

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
    value = tokens.css(ref[1], where);
  }
  return splitTop(value, ",").map((f) => f.replace(QUOTES, ""));
}

function swiftString(s: string): string {
  return `"${s.replace(BACKSLASH, "\\\\").replace(DOUBLE_QUOTE, '\\"')}"`;
}

/** The letter-spacing a type role is set with, named by its token: its
    DTCG `letterSpacing`, when that references a `track-*`. */
const TRACK_REF = /^\{type\.(track-[a-z0-9-]+)\}$/;

function roleTracking(
  token: TransformedToken,
  tokens: Tokens,
  where: string
): string {
  const spacing = (token.original.$value as { letterSpacing?: unknown })
    .letterSpacing;
  if (typeof spacing !== "string") {
    return "";
  }
  const ref = TRACK_REF.exec(spacing);
  if (!ref?.[1]) {
    throw new Error(
      `${where}: letterSpacing must reference a type.track-* token`
    );
  }
  tokens.token(`type.${ref[1]}`, where);
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
  tokens.token(`font.${familyRef[1]}`, where);
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
    return shadowLayers(tokens.css(ref[1], where), tokens, where);
  }
  return splitTop(s, ",").flatMap((layer) => {
    const inner = REF.exec(layer);
    if (inner) {
      return shadowLayers(tokens.css(inner[1], where), tokens, where);
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

/**
 * A number token. One with a night value is a pair, read under the drawing's
 * traits (CawCoDesign/Ink.swift `SchemeValue`), as a colour resolves.
 */
function numberDeclaration(
  token: TransformedToken,
  tokens: Tokens,
  one: (line: string, extra?: string[]) => Declaration
): Declaration {
  const name = swiftName(token.name);
  const where = token.name;
  const own = tokens.own(token);
  const light = swiftNumber(tokens.numeric(own.css.trim(), where));
  const { dark } = own.variants;
  if (dark === undefined) {
    return one(`public static let ${name}: Double = ${light}`);
  }
  const night = swiftNumber(tokens.numeric(String(dark), where));
  return one(
    `public static let ${name} = SchemeValue(light: ${light}, dark: ${night})`,
    ["By day and by night: read it with `value(for:)`."]
  );
}

function declare(token: TransformedToken, tokens: Tokens): Declaration[] {
  const name = swiftName(token.name);
  const raw = tokens.own(token).css.trim();
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
      } else if (call(raw)?.name === "min") {
        out.push(
          one(
            `public static let ${name}: Double = ${swiftNumber(tokens.cap(raw, where))}`,
            [
              "At most this, in points: on the web the least of it and a share of its container (min).",
            ]
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
      const { variants } = tokens.own(token);
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
      return [numberDeclaration(token, tokens, one)];
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

/** Each Swift namespace's declarations, in token order. */
function namespaces(
  dictionary: Dictionary,
  tokens: Tokens
): Map<string, Declaration[]> {
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
  return groups;
}

export const swiftFormat =
  (view: TokenView) =>
  ({ dictionary }: { dictionary: Dictionary }): string => {
    const groups = namespaces(dictionary, new Tokens(view));
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
  };
