/**
 * A project's mockups (Projects spec §5.7, "Design files"): OpenUI Lang
 * programs that draw a screen that does not exist yet, over the project's
 * own mockup library (`@cawco/core/mockups`), drawn in its design system.
 *
 * - **The library comes from `design/`**: `design/manifest.json` names the
 *   token CSS, the roles the primitives draw with, the assets and the
 *   component specimens. Built here on demand, kept by the content's hash:
 *   a change to the manifest, a CSS file or a template builds it again, and
 *   nothing else does. A project with no `design/` gets the primitives,
 *   neutral. A manifest that cannot be drawn with is refused with every
 *   reason, never drawn in part.
 * - **The project's CSS is read for a shadow root**, where the dashboard
 *   draws a mockup apart from its own page: `:root`, `html` and `body` are
 *   the shadow root's host; its `@font-face` fonts are taken out and given
 *   names of their own (a font the dashboard also names never changes the
 *   dashboard's text), and each `url()` is a file of `design/` served from
 *   here. Nothing in it reaches outside the project: `@import` and an
 *   outside URL are refused.
 * - **A specimen's template** draws, and does nothing else: its elements
 *   and attributes are checked against `SPECIMEN_ELEMENTS` and
 *   `specimenAttributeProblem`, every `{{prop}}` is one its manifest
 *   declares, and every `asset:<name>` one of its assets.
 * - **A mockup is checked** like a view (openui.ts): its size, no URL, no
 *   markup, no action, no Query or Mutation; and a component the library
 *   does not have is refused by name, never dropped, so no mockup is ever
 *   shown with a hole in it.
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";
import {
  ASSET_REF,
  type DesignManifest,
  designFileUrl,
  designManifest,
  MOCKUP_SOURCE_MAX,
  type MockupDesign,
  type MockupFont,
  type MockupRole,
  type MockupSpecimen,
  mockupSpec,
  type ProjectMockups,
  RESERVED_NAMES,
  SPECIMEN_ELEMENTS,
  SPECIMEN_PLACEHOLDER,
  specimenAttributeProblem,
} from "@cawco/core/mockups";
import {
  createParser,
  type LibraryJSONSchema,
  type ParseResult,
} from "@openuidev/lang-core";
import { Elysia, t } from "elysia";
import { CLOUD_MARKER, refuse, unsafe } from "./openui";
import {
  FolderRefusal,
  readFolderBytes,
  readFolderFile,
  refused,
} from "./project-folder";

// lang-core's runtime telemetry is opt-in; this process turns it off
// outright all the same, before any prompt is generated here.
process.env.OPENUI_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";

const DESIGN = "design";
const MANIFEST = `${DESIGN}/manifest.json`;
/** The largest font or image a mockup draws. */
const DESIGN_FILE_LIMIT = 10 * 1024 * 1024;

const FONT_TYPES: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
};
const extension = (path: string): string =>
  posix.extname(path).slice(1).toLowerCase();

interface Built extends ProjectMockups {
  components: string[];
  /** The design's files a mockup may load, `design/…`. */
  files: Set<string>;
  parse: (source: string) => ParseResult;
}

/** `path` named by `from` (the manifest, or a CSS file), as a path in the folder; null when it leaves `design/`. */
const inDesign = (from: string, path: string): string | null => {
  const joined = posix.normalize(posix.join(posix.dirname(from), path));
  return joined.startsWith(`${DESIGN}/`) ? joined : null;
};

/** Refuses a design with every reason it cannot be drawn with. */
const refuseDesign = (problems: string[]): never => {
  throw new FolderRefusal(
    422,
    problems.length === 1
      ? `The project's design cannot draw a mockup: ${problems[0]}`
      : `The project's design cannot draw a mockup:\n- ${problems.slice(0, 12).join("\n- ")}`
  );
};

/** A text file of the folder, or null when it is not there. */
const readText = async (
  projectId: string,
  path: string
): Promise<string | null> => {
  try {
    return (await readFolderFile(projectId, path)).content;
  } catch (error) {
    if (error instanceof FolderRefusal && error.status === 404) {
      return null;
    }
    throw error;
  }
};

const QUOTED = /^(["'])(.*)\1$/s;
const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const NOT_SLUG = /[^a-z0-9]+/g;
const SLUG_ENDS = /^-|-$/g;
const COMMENT = /\/\*[\s\S]*?\*\//g;
const IMPORT = /@import\b/i;
const FONT_FACE = /@font-face\s*\{([^{}]*)\}/gi;
const URL_FN = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi;
const FIRST_URL = /url\(\s*(["']?)([^"')]*)\1\s*\)/i;
const FONT_PREFIX = /^font-/;
const OUTSIDE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const PRELUDE = /([^{};]+)\{/g;
const AT_RULE = /^\s*@/;
const SCOPE_RULE = /^\s*@scope\b/i;
const HOST_SELECTOR =
  /(^|[\s,>+~(])(:root|html|body)((?:[.#[:][^\s,>+~{()]*(?:\([^)]*\))?)*)(?=[\s,>+~){]|$)/gi;
const FAMILY_DECLARATION = /((?:font-family|font|--[\w-]+)\s*:)([^;{}]*)/gi;
/** A role's value is one CSS value: no second declaration, no block, nothing loaded. */
const NOT_ONE_VALUE = /[;{}]|url\s*\(/i;

const unquote = (value: string): string => value.trim().replace(QUOTED, "$2");
const escapeRegExp = (text: string): string =>
  text.replace(REGEXP_SPECIAL, "\\$&");
const slug = (text: string): string =>
  text.toLowerCase().replace(NOT_SLUG, "-").replace(SLUG_ENDS, "");

/** What reading the design's CSS gathers beside the CSS itself. */
interface CssRead {
  /** The design's files a mockup may load. */
  files: Set<string>;
  fonts: MockupFont[];
  /** Each font's family by the project's name for it, lower-cased: shared by every file. */
  named: Map<string, string>;
  problems: string[];
}

/** `target`, named by the CSS file at `from`, as a font or image of the design; null when it is neither, or outside. */
const designUrl = (
  from: string,
  target: string,
  types: Record<string, string>[]
): string | null => {
  const resolved = OUTSIDE.test(target) ? null : inDesign(from, target);
  return resolved && types.some((each) => each[extension(resolved)])
    ? resolved
    : null;
};

/** One @font-face rule's font: its family, its file and its other descriptors; problems for a src outside. */
const fontFace = (
  body: string,
  path: string,
  problems: string[]
): {
  descriptors: Record<string, string>;
  file: string | null;
  name: string;
} => {
  const descriptors: Record<string, string> = {};
  let name = "";
  let file: string | null = null;
  for (const declaration of body.split(";")) {
    const at = declaration.indexOf(":");
    const property = declaration.slice(0, at).trim().toLowerCase();
    const value = declaration.slice(at + 1).trim();
    if (at === -1 || !property) {
      continue;
    }
    if (property === "font-family") {
      name = unquote(value);
    } else if (property === "src") {
      const target = FIRST_URL.exec(value)?.[2] ?? "";
      file = designUrl(path, target, [FONT_TYPES]);
      if (!file) {
        problems.push(
          `${path}: a font's src must be a font file inside design/ (woff2, woff, ttf or otf), not “${target.slice(0, 80)}”.`
        );
      }
    } else {
      descriptors[property.replace(FONT_PREFIX, "")] = value;
    }
  }
  return { descriptors, file, name };
};

/** `prelude` (a selector, or an `@scope` rule's) with `:root`, `html` and `body` as the shadow root's host. */
const hostSelector = (prelude: string): string =>
  AT_RULE.test(prelude) && !SCOPE_RULE.test(prelude)
    ? prelude
    : prelude.replace(
        HOST_SELECTOR,
        (_all, before: string, _root: string, qualifiers: string) =>
          `${before}${qualifiers ? `:host(${qualifiers})` : ":host"}`
      );

/**
 * One CSS file of the design, read for the mockup's shadow root: its fonts
 * taken out into `out.fonts` with names of their own, its `url()`s the
 * design's files, `:root`/`html`/`body` the host. What would reach out is a
 * problem.
 */
const readCss = (
  text: string,
  path: string,
  projectId: string,
  hash: string,
  out: CssRead
): string => {
  const css = text.replace(COMMENT, "");
  if (IMPORT.test(css)) {
    out.problems.push(
      `${path} imports another file (@import): a mockup's CSS reaches nothing outside it, so put those rules in a file the manifest lists.`
    );
  }
  return css
    .replace(FONT_FACE, (_rule, body: string) => {
      const { descriptors, file, name } = fontFace(body, path, out.problems);
      if (name && file) {
        const key = name.toLowerCase();
        const family =
          out.named.get(key) ?? `mk-${hash.slice(0, 8)}-${slug(name)}`;
        out.named.set(key, family);
        out.fonts.push({ family, file, name, descriptors });
        out.files.add(file);
      }
      return "";
    })
    .replace(URL_FN, (whole, _quote: string, target: string) => {
      if (target.startsWith("data:")) {
        return whole;
      }
      const file = designUrl(path, target, [IMAGE_TYPES, FONT_TYPES]);
      if (!file) {
        out.problems.push(
          `${path}: url(${target.slice(0, 80)}) is not an image or font inside design/; a mockup loads nothing from outside the project.`
        );
        return 'url("")';
      }
      out.files.add(file);
      return `url("${designFileUrl(projectId, file)}")`;
    })
    .replace(PRELUDE, (_whole, prelude: string) => `${hostSelector(prelude)}{`);
};

/** `css` with every font of the design's named by its own family, in the declarations that name fonts. */
const renameFamilies = (css: string, named: Map<string, string>): string => {
  let renamed = css;
  for (const [name, family] of named) {
    const quoted = new RegExp(`(["'])${escapeRegExp(name)}\\1`, "gi");
    const bare = new RegExp(
      `(?<![\\w"'-])${escapeRegExp(name)}(?![\\w"'-])`,
      "gi"
    );
    renamed = renamed.replace(
      FAMILY_DECLARATION,
      (_all, property: string, value: string) =>
        `${property}${value.replace(quoted, `"${family}"`).replace(bare, `"${family}"`)}`
    );
  }
  return renamed;
};

/** Why a specimen's template may not be drawn, if it may not: what it holds that runs, loads or links, or names nothing declared. */
const templateProblems = async (
  name: string,
  html: string,
  props: Record<string, unknown>,
  assets: Set<string>
): Promise<{ problems: string[]; slot: boolean }> => {
  const problems: string[] = [];
  let slots = 0;
  // biome-ignore lint/correctness/noUndeclaredVariables: Bun's own HTML parser, a global of its runtime (bun-types)
  const rewriter = new HTMLRewriter().on("*", {
    element(element) {
      const tag = element.tagName.toLowerCase();
      if (!SPECIMEN_ELEMENTS.has(tag)) {
        problems.push(
          `${name}'s template holds <${tag}>, which a specimen does not draw: it may only hold markup that draws, nothing that runs, loads or submits.`
        );
      }
      if (tag === "slot") {
        slots += 1;
      }
      for (const [attribute, value] of element.attributes) {
        const why = specimenAttributeProblem(attribute, value);
        if (why) {
          problems.push(`${name}'s template: <${tag} ${attribute}>: ${why}.`);
        }
        const asset = ASSET_REF.exec(value)?.[1];
        if (asset && !assets.has(asset)) {
          problems.push(
            `${name}'s template names asset:${asset}, which the manifest's assets do not list.`
          );
        }
      }
    },
  });
  await rewriter.transform(new Response(html)).text();
  for (const match of html.matchAll(SPECIMEN_PLACEHOLDER)) {
    const prop = match[1] ?? "";
    if (!(prop in props)) {
      problems.push(
        `${name}'s template writes {{${prop}}}, which its props do not declare.`
      );
    }
  }
  if (slots > 1) {
    problems.push(
      `${name}'s template has ${slots} <slot>s: a specimen's children go in one place.`
    );
  }
  return { problems: [...new Set(problems)], slot: slots === 1 };
};

/** Every project's library, last built, by project: rebuilt only when its design's hash moves. */
const built = new Map<string, Built>();

/** The manifest, as text and as read; both null when the project has no design. */
const readManifest = async (
  projectId: string
): Promise<{ manifest: DesignManifest | null; text: string | null }> => {
  const text = await readText(projectId, MANIFEST);
  if (text === null) {
    return { text, manifest: null };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    refuseDesign([
      `${MANIFEST} is not JSON: ${error instanceof Error ? error.message : String(error)}.`,
    ]);
  }
  const parsed = designManifest.safeParse(raw);
  if (!parsed.success) {
    refuseDesign(
      parsed.error.issues.map(
        (issue) =>
          `${MANIFEST} ${issue.path.join(".") || "(the file)"}: ${issue.message}.`
      )
    );
  }
  return { text, manifest: parsed.data ?? null };
};

/** A project drawn as CawCo lists nothing of a design system of its own. */
const cawcoProblems = (manifest: DesignManifest | null): string[] => {
  if (manifest?.system !== "cawco") {
    return [];
  }
  const own = (["css", "roles", "specimens"] as const).filter(
    (key) => manifest[key] !== undefined
  );
  return own.length > 0
    ? [
        `${MANIFEST} names system "cawco" and also ${own.join(", ")}: a project drawn as CawCo draws with the dashboard's own tokens and components, so it lists no ${own.join(" or ")} of its own.`,
      ]
    : [];
};

/** Each of `paths` (named by the manifest) read whole, or a problem naming the one that is not a file of `design/`. */
const readDesignTexts = (
  projectId: string,
  paths: { label: string; path: string }[],
  problems: string[]
): Promise<{ label: string; path: string; text: string }[]> =>
  Promise.all(
    paths.map(async ({ label, path }) => {
      const at = inDesign(MANIFEST, path);
      const text = at ? await readText(projectId, at) : null;
      if (at === null || text === null) {
        problems.push(
          `${MANIFEST}: ${label} ${path} is not a file in design/.`
        );
        return null;
      }
      return { label, path: at, text };
    })
  ).then((read) => read.filter((each) => each !== null));

/** The roles the manifest maps, each one CSS value. */
const designRoles = (
  manifest: DesignManifest | null,
  problems: string[]
): Partial<Record<MockupRole, string>> => {
  const roles: Partial<Record<MockupRole, string>> = {};
  for (const [role, value] of Object.entries(manifest?.roles ?? {})) {
    if (NOT_ONE_VALUE.test(value)) {
      problems.push(
        `${MANIFEST} roles.${role}: “${value.slice(0, 80)}” is not one CSS value; write a value like var(--brand).`
      );
    } else {
      roles[role as MockupRole] = value;
    }
  }
  return roles;
};

/** The assets the manifest names, each an image of `design/`. */
const designAssets = (
  manifest: DesignManifest | null,
  files: Set<string>,
  problems: string[]
): ProjectMockups["assets"] => {
  const assets: ProjectMockups["assets"] = [];
  for (const asset of manifest?.assets ?? []) {
    const file = inDesign(MANIFEST, asset.file);
    if (!(file && IMAGE_TYPES[extension(file)])) {
      problems.push(
        `${MANIFEST} asset ${asset.name}: ${asset.file} is not an image inside design/ (png, jpg, webp, avif, gif or svg).`
      );
    } else if (assets.some((each) => each.name === asset.name)) {
      problems.push(`${MANIFEST} names the asset ${asset.name} twice.`);
    } else {
      assets.push({ name: asset.name, file, alt: asset.alt });
      files.add(file);
    }
  }
  return assets;
};

/** The specimens the manifest names, each with its checked template. */
const designSpecimens = async (
  manifest: DesignManifest | null,
  templates: Record<string, string>,
  assets: Set<string>,
  problems: string[]
): Promise<MockupSpecimen[]> => {
  const named = new Set<string>();
  const read = await Promise.all(
    (manifest?.specimens ?? []).map(async (specimen) => {
      if (RESERVED_NAMES.has(specimen.name)) {
        problems.push(
          `${MANIFEST}: the specimen ${specimen.name} takes a name the mockup library already has; name it for what it is in this project.`
        );
        return null;
      }
      if (named.has(specimen.name)) {
        problems.push(`${MANIFEST} names the specimen ${specimen.name} twice.`);
        return null;
      }
      named.add(specimen.name);
      const props = specimen.props ?? {};
      if ("children" in props) {
        problems.push(
          `${MANIFEST}: ${specimen.name} declares a prop named children; its children go where its template's <slot> is.`
        );
      }
      const checked = await templateProblems(
        specimen.name,
        templates[specimen.name] ?? "",
        props,
        assets
      );
      problems.push(...checked.problems);
      return {
        name: specimen.name,
        description: specimen.description,
        props,
        slot: checked.slot,
      };
    })
  );
  return read.filter((each) => each !== null);
};

/** Builds `projectId`'s library from its `design/`, or answers the one kept for the same content. */
export const projectMockups = async (projectId: string): Promise<Built> => {
  const { text: manifestText, manifest } = await readManifest(projectId);
  const problems = cawcoProblems(manifest);
  // The content the library is made from, read whole: its hash decides
  // whether the library kept for it still holds.
  const [cssFiles, templateFiles] = await Promise.all([
    readDesignTexts(
      projectId,
      (manifest?.css ?? []).map((path) => ({ label: "css", path })),
      problems
    ),
    readDesignTexts(
      projectId,
      (manifest?.specimens ?? []).map((each) => ({
        label: each.name,
        path: each.template,
      })),
      problems
    ),
  ]);
  if (problems.length > 0) {
    refuseDesign(problems);
  }
  const hash = createHash("sha256")
    .update(manifestText ?? "")
    .update(
      JSON.stringify([
        cssFiles.map((each) => [each.path, each.text]),
        templateFiles.map((each) => [each.label, each.text]),
      ])
    )
    .digest("hex");
  const kept = built.get(projectId);
  if (kept?.hash === hash) {
    return kept;
  }

  const files = new Set<string>();
  const fonts: MockupFont[] = [];
  const named = new Map<string, string>();
  const css = renameFamilies(
    cssFiles
      .map((each) =>
        readCss(each.text, each.path, projectId, hash, {
          files,
          fonts,
          named,
          problems,
        })
      )
      .join("\n"),
    named
  );

  const roles = designRoles(manifest, problems);
  const assets = designAssets(manifest, files, problems);
  const templates = Object.fromEntries(
    templateFiles.map((each) => [each.label, each.text])
  );
  const specimens = await designSpecimens(
    manifest,
    templates,
    new Set(assets.map((each) => each.name)),
    problems
  );
  if (problems.length > 0) {
    refuseDesign(problems);
  }

  const design: MockupDesign = {
    system: manifest?.system ?? null,
    assets: assets.map((each) => each.name),
    specimens,
  };
  const spec = mockupSpec(design);
  const parser = createParser(spec.schema as LibraryJSONSchema, spec.root);
  const made: Built = {
    hash,
    design,
    css,
    roles,
    fonts,
    assets,
    templates,
    prompt: spec.prompt,
    components: spec.components,
    files,
    parse: (source) => parser.parse(source),
  };
  built.set(projectId, made);
  return made;
};

/**
 * `raw` as a mockup of `projectId`'s, or a 422 {@link FolderRefusal} with
 * every reason: its size and code, then any Query or Mutation, then a
 * component its library does not have (by name), then the parser's other
 * errors.
 */
export const checkMockup = async (
  projectId: string,
  raw: string
): Promise<{ components: string[]; source: string }> => {
  const library = await projectMockups(projectId);
  const source = `${raw.trim()}\n`;
  if (source.length > MOCKUP_SOURCE_MAX) {
    refuse(
      [
        `The mockup is ${source.length} characters; one is ${MOCKUP_SOURCE_MAX} at most.`,
      ],
      "mockup"
    );
  }
  if (source.includes(CLOUD_MARKER)) {
    refuse(
      [
        `The mockup carries OpenUI Cloud markers (${CLOUD_MARKER}…): a mockup is a program alone, and runs no scripts.`,
      ],
      "mockup"
    );
  }
  const found = unsafe(source, "mockup");
  if (found.length) {
    refuse(found, "mockup");
  }
  const result = library.parse(source);
  const reads = [
    ...result.queryStatements.map(
      (query) =>
        `${query.statementId} = Query(…): a mockup reads nothing; write its sample data into the program.`
    ),
    ...result.mutationStatements.map(
      (mutation) =>
        `${mutation.statementId} = Mutation(…): a mockup does nothing, so it has no mutations.`
    ),
  ];
  if (reads.length) {
    refuse(reads, "mockup");
  }
  const unknown = [
    ...new Set(
      result.meta.errors
        .filter((error) => error.code === "unknown-component")
        .map((error) => error.component)
    ),
  ];
  if (unknown.length) {
    refuse(
      [
        `${unknown.join(", ")} ${unknown.length > 1 ? "are not components" : "is not a component"} of this project's mockups, so the mockup is not drawn. Draw ${unknown.length > 1 ? "them" : "it"} with these: ${library.components.join(", ")}.`,
      ],
      "mockup"
    );
  }
  const mistakes = result.meta.errors.map((error) =>
    error.statementId ? `${error.statementId}: ${error.message}` : error.message
  );
  if (!result.root && mistakes.length === 0) {
    mistakes.push(
      "The mockup draws nothing: it needs root = Stack(…), reaching every part of it."
    );
  }
  if (mistakes.length) {
    refuse([...new Set(mistakes)], "mockup");
  }
  return { source, components: library.components };
};

/** What the dashboard reads to draw a project's mockups. */
const libraryOut = (library: Built): ProjectMockups => ({
  hash: library.hash,
  design: library.design,
  css: library.css,
  roles: library.roles,
  fonts: library.fonts,
  assets: library.assets,
  templates: library.templates,
  prompt: library.prompt,
});

/**
 * The routes under `/api/projects/:id/mockups`: the project's library (its
 * design, its prompt), a mockup's check, and the design's fonts and images,
 * read-only. A standalone Elysia app so `server.ts` mounts it with one `.use()`.
 */
export const mockupRoutes = (projectExists: (id: string) => boolean) => {
  const known = (id: string): void => {
    if (!projectExists(id)) {
      throw new FolderRefusal(404, `The hub keeps no project ${id}.`);
    }
  };
  return new Elysia()
    .get("/api/projects/:id/mockups/library", async ({ params }) => {
      try {
        known(params.id);
        return libraryOut(await projectMockups(params.id));
      } catch (error) {
        return refused(error);
      }
    })
    .post(
      "/api/projects/:id/mockups/check",
      { body: t.Object({ source: t.String() }) },
      async ({ params, body }) => {
        try {
          known(params.id);
          return await checkMockup(params.id, body.source);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get(
      "/api/projects/:id/mockups/file",
      { query: t.Object({ path: t.String() }) },
      async ({ params, query }) => {
        try {
          known(params.id);
          const library = await projectMockups(params.id);
          if (!library.files.has(query.path)) {
            throw new FolderRefusal(
              404,
              `${query.path} is not a font or image this project's design names.`
            );
          }
          const { bytes } = await readFolderBytes(
            params.id,
            query.path,
            DESIGN_FILE_LIMIT
          );
          const ext = extension(query.path);
          return new Response(bytes, {
            headers: {
              "content-type":
                IMAGE_TYPES[ext] ??
                FONT_TYPES[ext] ??
                "application/octet-stream",
              "cache-control": "no-cache",
              "x-content-type-options": "nosniff",
              // An SVG opened on its own runs nothing.
              "content-security-policy":
                "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            },
          });
        } catch (error) {
          return refused(error);
        }
      }
    );
};
