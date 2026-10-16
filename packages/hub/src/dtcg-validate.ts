/**
 * Every token's `$value` held to its `$type`'s shape in the W3C Design
 * Tokens Format Module 2025.10 (https://www.designtokens.org/tr/2025.10/format/#types),
 * read before anything evaluates a value: a dimension is `{ value, unit }`,
 * never the string `"640px"` that once reached the stylesheet's
 * serialiser as `undefined.toPrecision` (d2cd27d1a, `c-caw-panel-h`).
 *
 * A `$type` set on a group is its tokens' own unless they set one; a value
 * may be an alias (`"{group.token}"`) wherever a value may stand, the
 * whole value or a part of a composite. Each problem names the file, the
 * token's path and what is wrong:
 *
 *   cawco.tokens.json size.c-caw-panel-h: a dimension is { value, unit } (unit px or rem), got the string "640px"
 */

type Json = Record<string, unknown>;

const REF = /^\{[^{}]+\}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const isObject = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isRef = (v: unknown): boolean => typeof v === "string" && REF.test(v);
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** The Color Module's colour spaces (2025.10 §4.1). */
const COLOUR_SPACES = new Set([
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d65",
  "xyz-d50",
]);
const FONT_WEIGHTS = new Set([
  "thin",
  "hairline",
  "extra-light",
  "ultra-light",
  "light",
  "normal",
  "regular",
  "book",
  "medium",
  "semi-bold",
  "demi-bold",
  "bold",
  "extra-bold",
  "ultra-bold",
  "black",
  "heavy",
  "extra-black",
  "ultra-black",
]);
const STROKE_STYLES = new Set([
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "outset",
  "inset",
]);

/** How a got value reads in a sentence. */
function got(value: unknown): string {
  if (typeof value === "string") {
    return `the string ${JSON.stringify(value)}`;
  }
  if (Array.isArray(value)) {
    return `an array (${JSON.stringify(value).slice(0, 80)})`;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  return `${typeof value === "object" ? "" : `the ${typeof value} `}${JSON.stringify(value).slice(0, 80)}`;
}

/** A unit-bearing value `{ value, unit }` with a unit among `units`. */
const measure =
  (name: string, units: string[]) =>
  (value: unknown): string | null =>
    isObject(value) &&
    isNumber(value.value) &&
    typeof value.unit === "string" &&
    units.includes(value.unit)
      ? null
      : `a ${name} is { value, unit } (unit ${units.join(" or ")}), got ${got(value)}`;

const dimension = measure("dimension", ["px", "rem"]);
const duration = measure("duration", ["ms", "s"]);

function colour(value: unknown): string | null {
  const shape =
    "a color is { colorSpace, components } (and alpha 0–1, hex), got";
  if (!isObject(value)) {
    return `${shape} ${got(value)}`;
  }
  const { colorSpace, components, alpha, hex } = value;
  if (typeof colorSpace !== "string" || !COLOUR_SPACES.has(colorSpace)) {
    return `a color's colorSpace is one of the Color Module's, got ${got(colorSpace)}`;
  }
  if (!(
    Array.isArray(components) &&
    components.length === 3 &&
    components.every((c) => isNumber(c) || c === "none")
  )) {
    return `a color's components are three numbers (or "none"), got ${got(components)}`;
  }
  if (alpha !== undefined && !(isNumber(alpha) && alpha >= 0 && alpha <= 1)) {
    return `a color's alpha is a number from 0 to 1, got ${got(alpha)}`;
  }
  if (hex !== undefined && !(typeof hex === "string" && HEX.test(hex))) {
    return `a color's hex is #rrggbb, got ${got(hex)}`;
  }
  return null;
}

/** Each of a composite's fields held to its own check, aliases passing. */
function fields(
  name: string,
  value: unknown,
  shape: Record<string, (v: unknown) => string | null>,
  optional: string[] = []
): string | null {
  if (!isObject(value)) {
    return `a ${name} is { ${Object.keys(shape).join(", ")} }, got ${got(value)}`;
  }
  for (const [key, check] of Object.entries(shape)) {
    const part = value[key];
    if (part === undefined && optional.includes(key)) {
      continue;
    }
    if (part === undefined) {
      return `a ${name} has ${key}, and this one has none`;
    }
    const problem = isRef(part) ? null : check(part);
    if (problem) {
      return `its ${key}: ${problem}`;
    }
  }
  return null;
}

const number = (v: unknown) =>
  isNumber(v) ? null : `a number is a number, got ${got(v)}`;
const fontWeight = (v: unknown) =>
  (isNumber(v) && v >= 1 && v <= 1000) ||
  (typeof v === "string" && FONT_WEIGHTS.has(v))
    ? null
    : `a fontWeight is a number from 1 to 1000 or a weight's name, got ${got(v)}`;
const fontFamily = (v: unknown) =>
  typeof v === "string" ||
  (Array.isArray(v) && v.length > 0 && v.every((f) => typeof f === "string"))
    ? null
    : `a fontFamily is a name or a list of names, got ${got(v)}`;
const cubicBezier = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 4 &&
  v.every(isNumber) &&
  (v[0] as number) >= 0 &&
  (v[0] as number) <= 1 &&
  (v[2] as number) >= 0 &&
  (v[2] as number) <= 1
    ? null
    : `a cubicBezier is four numbers [x1, y1, x2, y2], x1 and x2 from 0 to 1, got ${got(v)}`;
const strokeStyle = (v: unknown) =>
  (typeof v === "string" && STROKE_STYLES.has(v)) ||
  fields("strokeStyle", v, {
    dashArray: (d) =>
      Array.isArray(d) && d.every((x) => isRef(x) || dimension(x) === null)
        ? null
        : `a dashArray is a list of dimensions, got ${got(d)}`,
    lineCap: (c) =>
      typeof c === "string" ? null : `a lineCap is a name, got ${got(c)}`,
  }) === null
    ? null
    : `a strokeStyle is one of solid, dashed, … or { dashArray, lineCap }, got ${got(v)}`;
const shadowLayer = (v: unknown) =>
  fields(
    "shadow",
    v,
    {
      color: colour,
      offsetX: dimension,
      offsetY: dimension,
      blur: dimension,
      spread: dimension,
      inset: (i) =>
        typeof i === "boolean" ? null : `inset is true or false, got ${got(i)}`,
    },
    ["inset"]
  );

/** Each `$type`'s check of a value that is not an alias. */
const CHECKS: Record<string, (value: unknown) => string | null> = {
  color: colour,
  dimension,
  duration,
  number,
  fontWeight,
  fontFamily,
  cubicBezier,
  strokeStyle,
  shadow: (v) => {
    const layers = Array.isArray(v) ? v : [v];
    for (const layer of layers) {
      const problem = isRef(layer) ? null : shadowLayer(layer);
      if (problem) {
        return problem;
      }
    }
    return null;
  },
  gradient: (v) => {
    if (!(Array.isArray(v) && v.length > 0)) {
      return `a gradient is a list of { color, position } stops, got ${got(v)}`;
    }
    for (const stop of v) {
      const problem = isRef(stop)
        ? null
        : fields("gradient stop", stop, {
            color: colour,
            position: (p) =>
              isNumber(p) && p >= 0 && p <= 1
                ? null
                : `a stop's position is a number from 0 to 1, got ${got(p)}`,
          });
      if (problem) {
        return problem;
      }
    }
    return null;
  },
  border: (v) =>
    fields("border", v, {
      color: colour,
      width: dimension,
      style: strokeStyle,
    }),
  transition: (v) =>
    fields("transition", v, {
      duration,
      delay: duration,
      timingFunction: cubicBezier,
    }),
  typography: (v) =>
    fields("typography", v, {
      fontFamily,
      fontSize: dimension,
      fontWeight,
      letterSpacing: dimension,
      lineHeight: number,
    }),
};

/** Every token in a tree with its path and its type (its own, else its nearest group's). */
function* typed(
  node: unknown,
  at: string[] = [],
  inherited?: string
): Generator<{ node: Json; path: string; type: string | undefined }> {
  if (!isObject(node)) {
    return;
  }
  const type = typeof node.$type === "string" ? node.$type : inherited;
  if ("$value" in node) {
    yield { node, path: at.join("."), type };
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (!key.startsWith("$")) {
      yield* typed(child, [...at, key], type);
    }
  }
}

/**
 * One file's problems: each token's value against its type. A token a
 * context file overrides without a `$type` has the type its path has in
 * any file (`types`).
 */
function treeProblems(
  tree: unknown,
  file: string,
  types: Map<string, string>
): string[] {
  const out: string[] = [];
  for (const { node, path, type: own } of typed(tree)) {
    const type = own ?? types.get(path);
    {
      const check = type ? CHECKS[type] : undefined;
      if (type && !check) {
        out.push(
          `${file} ${path}: $type "${type}" is not one of the format's types`
        );
        continue;
      }
      const problem = isRef(node.$value) ? null : check?.(node.$value);
      if (problem) {
        out.push(`${file} ${path}: ${problem}`);
      }
    }
  }
  return out;
}

/**
 * Every token value in a token system's files that its type's shape
 * refuses; none when each conforms. `files` is every file read, by path;
 * the resolver document itself holds no tokens and is passed over.
 */
export function valueProblems(
  files: Map<string, unknown>,
  resolverPath: string
): string[] {
  const trees = [...files].filter(([path]) => path !== resolverPath);
  const types = new Map<string, string>();
  for (const [, tree] of trees) {
    for (const { path, type } of typed(tree)) {
      if (type && !types.has(path)) {
        types.set(path, type);
      }
    }
  }
  return trees.flatMap(([path, tree]) => treeProblems(tree, path, types));
}
