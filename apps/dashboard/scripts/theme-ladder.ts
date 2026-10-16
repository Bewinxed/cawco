/**
 * Prints what the Tailwind theme holds (`bun run tokens -- --ladder`), for a
 * reader writing utilities: every spacing and radius key with its value, the
 * literal keys, every `@utility` and `@custom-variant`, and the key count of
 * each namespace. A key whose token switches with a context (a coarse
 * pointer, a narrow window) is marked: no literal maps to it.
 */
import type {
  TailwindTheme,
  TokenView,
  ViewToken,
} from "../../../packages/hub/src/design-tokens";

const VARIANTS = "src/lib/tokens/variants.css";
const REFERENCE = /^\{([^}]+)\}$/;
const VAR = /var\(--([a-z0-9-]+)\)/g;
const CUSTOM_VARIANT = /@custom-variant ([a-z0-9-]+)/g;

/** A token's value at rest: its DTCG value, references followed to the value they name. */
function restingValue(token: ViewToken, view: TokenView): string {
  const raw = (token.original.original as { $value: unknown }).$value;
  if (typeof raw === "string") {
    const ref = REFERENCE.exec(raw);
    const named = ref ? view.byPath.get(ref[1]) : undefined;
    return named ? restingValue(named, view) : raw;
  }
  if (raw && typeof raw === "object" && "value" in raw && "unit" in raw) {
    const { value, unit } = raw as { value: number; unit: string };
    return `${value}${unit}`;
  }
  return JSON.stringify(raw);
}

/** What a context's CSS for a token comes to, its references followed. */
function contextValue(css: string, view: TokenView): string {
  return css.replace(VAR, (whole, name: string) => {
    const token = view.tokens.find((t) => t.name === name);
    return token ? restingValue(token, view) : whole;
  });
}

export async function printLadder(
  theme: TailwindTheme,
  view: TokenView
): Promise<void> {
  const line = (s: string) => process.stdout.write(`${s}\n`);
  for (const ns of ["spacing", "radius"]) {
    line(`\n## ${ns} keys`);
    for (const { key, token } of theme.keys.get(ns) ?? []) {
      const contexts = Object.entries(token.variants).flatMap(([name, css]) =>
        css !== undefined &&
        view.contexts.some((c) => c.name === name && "media" in c.condition)
          ? [`${name} ${contextValue(css, view)}`]
          : []
      );
      const mark = theme.switched.has(token.name)
        ? `  SWITCHED${contexts.length ? ` (${contexts.join(", ")})` : " (reads a switched token)"}`
        : "";
      line(
        `${ns === "spacing" ? "" : "rounded-"}${key} = ${restingValue(token, view)}${mark}`
      );
    }
  }
  line("\n## literal keys");
  for (const [ns, list] of theme.literals) {
    line(`${ns}: ${list.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  line("\n## @utility");
  line(theme.utilities.join(" "));
  line("\n## @custom-variant");
  const variants = Bun.file(VARIANTS);
  const text = (await variants.exists()) ? await variants.text() : "";
  line([...text.matchAll(CUSTOM_VARIANT)].map(([, name]) => name).join(" "));
  line("\n## keys per namespace");
  for (const [ns, list] of theme.keys) {
    line(`${ns}: ${list.length}`);
  }
}
