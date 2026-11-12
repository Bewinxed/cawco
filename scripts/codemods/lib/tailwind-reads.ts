// biome-ignore-all lint/performance/useTopLevelRegex: a one-shot codemod helper, run by hand, never on a hot path.
// biome-ignore-all lint/suspicious/noBitwiseOperators: Tailwind's theme options are bit flags (INLINE), cleared as it does.
/**
 * Which theme keys the classes in a set of files read, found with Tailwind
 * itself the way scripts/lint/design/tailwind.mjs loads it (and
 * theme-prune.ts's step 1 asks it): a candidate class is compiled, and the
 * theme keys its rules look up are noted. A utility that asks for a key's
 * value inline (a shadow, whose colour it sets) does not mark it used, so the
 * theme's lookups are watched as well, and every inline key is made readable.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../lib/repo-files";

interface Node {
  kind: string;
}
interface Options {
  options: number;
  value: string;
}
interface DesignSystem {
  candidatesToAst: (candidates: string[]) => Node[][];
  theme: {
    values: Map<string, Options>;
    markUsedVariable: (key: string) => boolean;
    get: (themeKeys: string[]) => unknown;
    resolve: (value: string | null, themeKeys: string[]) => unknown;
    resolveValue: (value: string | null, themeKeys: string[]) => unknown;
    resolveWith: (value: string | null, themeKeys: string[]) => unknown;
  };
}

/** Candidate class strings in a text, as Tailwind's scanner cuts them. */
export const CANDIDATE =
  /(?:\[[^\]\s"'`]*\]|\(--[\w-]*\)|[^\s"'`<>(){}=,;|\\[\]])+/gu;
const TRAIL = /[.:,;]+$/u;
const LEAD = /^(?:class:|[.:]+)/u;
/** A dot in a class is a quarter step (`p-3.25`): between digits. Any other is a property access or a file name. */
const STRAY_DOT = /(?<!\d)\.|\.(?!\d)/u;
/** Tailwind's classes are lower case outside a bracketed value; a camelCase word is an identifier. */
const IDENTIFIER = /[A-Z]/u;

/** The forms a raw piece of text may be a class under. */
export const formsOf = (raw: string) => {
  const forms = new Set<string>([raw]);
  const trimmed = raw.replace(TRAIL, "");
  forms.add(trimmed);
  forms.add(trimmed.replace(LEAD, ""));
  forms.add(raw.replace(LEAD, ""));
  return [...forms].filter(
    (f) =>
      f.length > 1 &&
      f.length < 120 &&
      !STRAY_DOT.test(f) &&
      !IDENTIFIER.test(f.replace(/\[[^\]]*\]/gu, ""))
  );
};

const INLINE = 1;
const CONTAINER_VARIANT = /^(?:not-)?@(?:min-|max-)?(.+?)(?:\/.*)?$/u;

/** The theme keys a class reads, and the classes the files write. */
export async function classReads(texts: Map<string, string>) {
  const { ds } = (await import(
    pathToFileURL(join(ROOT, "scripts/lint/design/tailwind.mjs")).href
  )) as { ds: DesignSystem };
  const entries = ds.theme.values;
  for (const [, v] of entries) {
    v.options &= ~INLINE;
  }

  const asked: string[] = [];
  const markUsed = ds.theme.markUsedVariable.bind(ds.theme);
  ds.theme.markUsedVariable = (key: string) => {
    asked.push(key);
    return markUsed(key);
  };
  /** The key Tailwind's theme finds for a utility's value (`shadow` + `stat` is `--shadow-stat`). */
  const keyFor = (value: string | null, themeKeys: string[]) => {
    for (const themeKey of themeKeys) {
      const plain = value === null ? themeKey : `${themeKey}-${value}`;
      if (entries.has(plain)) {
        return plain;
      }
      const quarter = `${themeKey}-${value?.replaceAll(".", "_")}`;
      if (value?.includes(".") && entries.has(quarter)) {
        return quarter;
      }
    }
  };
  const getOriginal = ds.theme.get;
  ds.theme.get = (themeKeys: string[]) => {
    const key = themeKeys.find((k) => entries.has(k));
    if (key) {
      asked.push(key);
    }
    return getOriginal.call(ds.theme, themeKeys);
  };
  for (const name of ["resolve", "resolveValue", "resolveWith"] as const) {
    const original = ds.theme[name] as (...a: unknown[]) => unknown;
    ds.theme[name] = ((
      value: string | null,
      themeKeys: string[],
      ...rest: unknown[]
    ) => {
      const key = keyFor(value, themeKeys);
      if (key) {
        asked.push(key);
      }
      return original.call(ds.theme, value, themeKeys, ...rest);
    }) as never;
  }

  /** The theme keys one class reads; none when it is not a class. */
  const keysOf = (candidate: string): Set<string> => {
    asked.length = 0;
    let nodes: Node[] = [];
    try {
      nodes = ds.candidatesToAst([candidate])[0] ?? [];
    } catch {
      nodes = [];
    }
    if (nodes.length === 0) {
      return new Set();
    }
    const keys = new Set(asked);
    // A container-query variant reads `--container-<name>` without asking.
    for (const segment of candidate.split(":").slice(0, -1)) {
      const m = CONTAINER_VARIANT.exec(segment);
      if (m && entries.has(`--container-${m[1]}`)) {
        keys.add(`--container-${m[1]}`);
      }
    }
    return keys;
  };

  const candidateFiles = new Map<string, Set<string>>();
  for (const [path, text] of texts) {
    for (const m of text.matchAll(CANDIDATE)) {
      for (const form of formsOf(m[0])) {
        let files = candidateFiles.get(form);
        if (!files) {
          files = new Set();
          candidateFiles.set(form, files);
        }
        files.add(path);
      }
    }
  }
  /** Each candidate that reads a theme key, with the keys. */
  const readsOf = new Map<string, Set<string>>();
  for (const candidate of candidateFiles.keys()) {
    const keys = keysOf(candidate);
    if (keys.size > 0) {
      readsOf.set(candidate, keys);
    }
  }
  return { candidateFiles, keysOf, readsOf };
}
