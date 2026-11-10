/**
 * A state's props as the Dials face's rows (the owner's pick, 2026-11-10:
 * the artifact panel's Inspect folds into Dials): each prop the stage's
 * docgen read, as the dial of its kind, so the props and the agent's dials
 * read down one grid with one set of controls. A slot and a code-typed prop
 * have no row (they stay pins); a prop the agent already made a dial for
 * (its `arg` target) shows once, as the dial.
 */
import type { PropMeta } from "@cawco/core/stage";
import { controlOf } from "../preview/sheet-inspector.svelte";
import type { DialValue, DialValues, GraphDial } from "./dials";

/** A default's quotes, as docgen writes it (`"neutral"`). */
const QUOTES = /^["'`]|["'`]$/gu;

/** A prop as the dial of its kind; none for a slot or a code-typed prop. */
function dialOf(prop: PropMeta): GraphDial | null {
  const target = { arg: prop.name };
  switch (controlOf(prop)) {
    case "segments":
    case "select":
      return {
        kind: "select",
        name: prop.name,
        options: (prop.options ?? []).map(String),
        target,
      };
    case "switch":
      return { kind: "toggle", name: prop.name, target };
    case "number":
      return { kind: "number", name: prop.name, target };
    case "text":
      return {
        kind: "text",
        name: prop.name,
        ...(prop.options?.length ? { options: prop.options.map(String) } : {}),
        target,
      };
    case "slot":
    case "code":
      return null;
  }
}

/** The props the face lists, each as the dial of its kind, in the component's order. */
export function propDials(
  props: readonly PropMeta[],
  dials: readonly GraphDial[]
): GraphDial[] {
  const dialed = new Set(
    dials.flatMap((dial) => ("arg" in dial.target ? [dial.target.arg] : []))
  );
  return props
    .filter((prop) => !dialed.has(prop.name))
    .map(dialOf)
    .filter((dial) => dial !== null);
}

/** A default as docgen writes it, read as the value it is: a boolean, a number, or words without their quotes. */
const defaultOf = (prop: PropMeta): DialValue | undefined => {
  const raw = prop.defaultValue?.trim();
  if (raw === undefined || raw === "") {
    return;
  }
  if (raw === "true" || raw === "false") {
    return raw === "true";
  }
  if (prop.type.name === "number" && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return raw.replaceAll(QUOTES, "");
};

/**
 * Each prop's value as the state mounts it from its file: its args (the
 * story's over the meta's), else the component's default; an enum's as its
 * option's words, as its select names it.
 */
export function savedOf(
  props: readonly PropMeta[],
  args: Record<string, unknown>
): DialValues {
  const saved: DialValues = {};
  for (const prop of props) {
    const value = prop.name in args ? args[prop.name] : defaultOf(prop);
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string"
    ) {
      saved[prop.name] = prop.type.name === "enum" ? String(value) : value;
    }
  }
  return saved;
}
