/**
 * A Tailwind v4 theme as a design system's token source: the stylesheet a
 * project's `design/manifest.json` names (`tailwind`), loaded by Tailwind
 * itself, and its theme variables read off the design system Tailwind
 * builds. Nothing is parsed here and nothing is written: the project's
 * stylesheet stays the one place a token is declared.
 *
 * Tailwind's loader is `__unstable__loadDesignSystem` (its maintainers:
 * "the Core API is not considered stable for now", tailwindlabs/tailwindcss
 * discussion #19092), the call prettier-plugin-tailwindcss and the language
 * server load a project with, each with loaders of its own as here. This is
 * the one module that calls it; `tailwindcss` is pinned to an exact version
 * in this package's manifest, and what is read off the design system is
 * typed by Tailwind's own declaration of it, so an upgrade that moves it
 * fails the type check here.
 *
 * Every stylesheet is read through `read`, a path from the root of the place
 * the project is (its repository, which may be on another machine), so
 * nothing here touches a disk. Tailwind's own stylesheets are the pinned
 * package's, embedded, so a clone with no `node_modules` loads. A project's
 * JavaScript (`@plugin`, `@config`) is never run: each loads as a plugin
 * that adds nothing, so a theme key only a plugin adds is not read.
 */
import type { TokenType } from "@cawco/core/stage";
// The POSIX path functions with no Node built-in, so the reader runs in a
// browser (the design board) as in the binary.
import { posix } from "pathe";
import { __unstable__loadDesignSystem } from "tailwindcss";
// Text imports: the bundler embeds Tailwind's four stylesheets, so the
// compiled binary and the stage host load them with no package on disk.
import index from "tailwindcss/index.css" with { type: "text" };
import preflight from "tailwindcss/preflight.css" with { type: "text" };
import theme from "tailwindcss/theme.css" with { type: "text" };
import utilities from "tailwindcss/utilities.css" with { type: "text" };

/**
 * A stylesheet's text by its path from the root (or an absolute path inside
 * it); undefined when there is no such file. A file that is there and
 * cannot be read throws, saying why.
 */
export type ReadSheet = (path: string) => Promise<string | undefined>;

export interface TailwindTheme {
  /** Every stylesheet read, the entry first, by path from the root; Tailwind's own as `tailwindcss/<file>`. */
  files: string[];
  /** The names each token type offers, by Tailwind's own namespaces, as variables (`--color-tx`). */
  names: Record<TokenType, string[]>;
  /** Every theme variable Tailwind holds once the entry is loaded, as it writes them (`--color-tx`), in its order. */
  tokens: string[];
}

/** The design system Tailwind builds, as its package declares it. */
type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;
type Namespace =
  Parameters<DesignSystem["theme"]["keysInNamespaces"]>[0] extends Iterable<
    infer K
  >
    ? K
    : never;

/**
 * The theme namespaces each token type's names come from: Tailwind's own
 * (`--font` leaves `--font-weight-*` out). A project types a prop that
 * takes them with a template literal over the same namespaces
 * (`--color-${string}`).
 */
export const TOKEN_NAMESPACES = {
  TokenColor: ["--color"],
  TokenFont: ["--font"],
  TokenSize: ["--spacing", "--radius", "--text", "--container", "--breakpoint"],
} as const satisfies Record<TokenType, readonly Namespace[]>;

const OWN = "tailwindcss";
/** The base Tailwind's own stylesheets load from: no folder of the project's. */
const OWN_BASE = "\0tailwindcss";
/** The pinned package's stylesheets, by file. */
const OWN_SHEETS: Record<string, string> = {
  "index.css": index,
  "preflight.css": preflight,
  "theme.css": theme,
  "utilities.css": utilities,
};

const EXTENSION = /\.[a-z]+$/iu;

/** `name` with `.css` added when it has no extension. */
const asSheet = (name: string): string =>
  EXTENSION.test(name) ? name : `${name}.css`;

/** One of the pinned package's stylesheets by its file (`index.css`, `theme`). */
const ownSheet = (file: string, id: string) => {
  const name = asSheet(file || "index.css");
  const content = OWN_SHEETS[name];
  if (content === undefined) {
    throw new Error(
      `${id} is no stylesheet of tailwindcss ${Object.keys(OWN_SHEETS).join(", ")}.`
    );
  }
  return { path: `${OWN}/${name}`, base: OWN_BASE, content };
};

/** A package specifier split into its name and the path inside it: `@scope/pkg/a.css` is `@scope/pkg` and `a.css`. */
const packageOf = (id: string): { name: string; sub: string } => {
  const parts = id.split("/");
  const size = id.startsWith("@") ? 2 : 1;
  return {
    name: parts.slice(0, size).join("/"),
    sub: parts.slice(size).join("/"),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** An `exports` target under the conditions a stylesheet resolves with (Tailwind's own: `style`, then `default`). */
const styleTarget = (target: unknown): string | undefined => {
  if (typeof target === "string") {
    return target;
  }
  if (!isRecord(target)) {
    return;
  }
  return styleTarget(target.style) ?? styleTarget(target.default);
};

/** The target a manifest's `exports` gives `key` (`.` or `./a.css`) under the style conditions; undefined when it maps none. */
const exported = (exports: unknown, key: string): string | undefined => {
  const bySubpath =
    isRecord(exports) &&
    Object.keys(exports).some((one) => one.startsWith("."));
  if (bySubpath) {
    return styleTarget(exports[key]);
  }
  // A manifest whose `exports` is the package's one entry maps no sub-path.
  return key === "." ? styleTarget(exports) : undefined;
};

/** The file inside a package a stylesheet import names, by its manifest: `exports`, then `style`, then `index.css`; the path itself for a sub-path the manifest does not map. */
const fileInPackage = (manifest: unknown, sub: string): string => {
  const read = isRecord(manifest) ? manifest : {};
  const mapped = exported(read.exports, sub ? `./${sub}` : ".");
  if (mapped) {
    return posix.normalize(mapped);
  }
  if (sub) {
    return asSheet(sub);
  }
  return typeof read.style === "string"
    ? posix.normalize(read.style)
    : "index.css";
};

/** Whether a path from the root leaves it. */
const leaves = (path: string): boolean =>
  path === ".." || path.startsWith("../");

/** Each folder from `base` up to the root, `base` first. */
const foldersUp = (base: string): string[] => {
  const up = [base];
  let at = base;
  while (at !== posix.dirname(at)) {
    at = posix.dirname(at);
    up.push(at);
  }
  return up;
};

/**
 * Loads `entry` (a path from the root) as Tailwind does, and reads its
 * theme. Throws Tailwind's own message when the stylesheet does not load,
 * and names the import when a stylesheet it imports is not there.
 */
export async function readTailwindTheme(
  entry: string,
  read: ReadSheet
): Promise<TailwindTheme> {
  const files: string[] = [];

  const sheet = async (path: string, id: string, base: string) => {
    const content = await read(path);
    if (content === undefined) {
      throw new Error(
        base === "."
          ? `${id} is not in the repository.`
          : `${id}, imported from ${base}/, is not in the repository.`
      );
    }
    files.push(path);
    return { path, base: posix.dirname(path), content };
  };

  /** A bare import, looked for at `node_modules/<package>` in each folder from the importing one up to the root. */
  const fromPackages = async (id: string, base: string) => {
    const { name, sub } = packageOf(id);
    for (const folder of foldersUp(base)) {
      const home = posix.join(folder, "node_modules", name);
      const manifest = await read(posix.join(home, "package.json"));
      if (manifest === undefined) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(manifest);
      } catch {
        parsed = {};
      }
      return await sheet(
        posix.join(home, fileInPackage(parsed, sub)),
        id,
        base
      );
    }
    throw new Error(
      `${id}, imported from ${base === "." ? "the root" : `${base}/`}, is in no node_modules in the repository.`
    );
  };

  const loadStylesheet = async (id: string, base: string) => {
    if (base === OWN_BASE && !id.startsWith(`${OWN}`)) {
      const own = ownSheet(posix.normalize(id), id);
      files.push(own.path);
      return own;
    }
    if (id === OWN || id.startsWith(`${OWN}/`)) {
      const own = ownSheet(id.slice(OWN.length + 1), id);
      files.push(own.path);
      return own;
    }
    if (id.startsWith("/")) {
      return await sheet(posix.normalize(id), id, base);
    }
    if (id.startsWith(".")) {
      const path = posix.join(base, id);
      if (leaves(path)) {
        throw new Error(
          `${id}, imported from ${base}/, is outside the repository.`
        );
      }
      return await sheet(path, id, base);
    }
    return await fromPackages(id, base);
  };

  const design: DesignSystem = await __unstable__loadDesignSystem(
    // The entry as a relative import, so it is read from the root and never looked for as a package.
    `@import ${JSON.stringify(entry.startsWith("/") ? entry : `./${posix.normalize(entry)}`)};`,
    {
      base: ".",
      from: entry,
      loadStylesheet,
      // A project's JavaScript is never run: a plugin adds nothing, a config is empty.
      loadModule: (id, base, hint) =>
        Promise.resolve({
          path: id,
          base,
          module: hint === "plugin" ? () => undefined : {},
        }),
    }
  );

  /** A type's names: each key in its namespaces written back as its variable, the project's prefix and all. */
  const namesIn = (spaces: readonly Namespace[]): string[] =>
    spaces.flatMap((space) =>
      design.theme
        .keysInNamespaces([space])
        .map((key) => design.theme.prefixKey(`${space}-${key}`))
    );

  return {
    files,
    names: {
      TokenColor: namesIn(TOKEN_NAMESPACES.TokenColor),
      TokenFont: namesIn(TOKEN_NAMESPACES.TokenFont),
      TokenSize: namesIn(TOKEN_NAMESPACES.TokenSize),
    },
    tokens: [...design.theme.entries()].map(([key]) => key),
  };
}
