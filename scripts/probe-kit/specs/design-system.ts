/**
 * A builder writes a project's design system with `design_write`, and the
 * hub keeps the folder contract (design-system plan §2, slice 1): conformant
 * DTCG 2025.10 tokens, themes through a resolver, tokens.css generated. On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model, which plays the builder's calls), two legs, one run each:
 *
 * - **repository**: a worker in a project on a fixture repository (two
 *   stylesheets, a font, a logo); design/ lands at the repository's root.
 * - **hub folder**: a worker in a project with no repository, working in
 *   the project's folder on the hub; design/ lands there, committed.
 *
 * In each leg:
 *
 * 1. The first build writes design/'s parts (DESIGN.md, tokens.resolver.json,
 *    tokens.json, themes/dark.tokens.json, tokens.css, manifest.json,
 *    SKILL.md, specimens/index.html) and the material in fonts/ and assets/,
 *    the font and the logo byte-identical; the answer lists nothing missing.
 *    In the folder, the folder's git log names the commit.
 * 2. Every token in every token file has a source in manifest.json.
 * 3. tokens.css is the generator's output for the files on disk, byte for
 *    byte; the files pass the DTCG 2025.10 schemas; the recipe token
 *    `color.ink-quiet` has its `$value` computed (the ink at 0.64 alpha), and
 *    the dark file has gained its dark value; every fingerprint matches.
 * 4. A token the manifest gives no source is refused by name, and nothing
 *    changes on disk.
 * 5. After the person edits DESIGN.md (a commit in the repository, the
 *    folder editor's write in the folder), a second build keeps it and
 *    lists it as kept, while its new token moves tokens.css on.
 *
 *   bun scripts/probe-kit/run.ts design-system
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one call at a time, as the builder makes them
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildDesignTokens,
  fingerprint,
} from "../../../packages/hub/src/design-system";
import {
  schemaProblems,
  tokensIn,
} from "../../../packages/hub/src/dtcg-resolver";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { FONT } from "./design-bytes";

const WRITE = "mcp__cawco__design_write";
const CALL = /PROBE-CALL:(\d+)/g;
const ABOUT = /design|refus|mcp|tool/i;

/** The mock model as the builder: `PROBE-CALL:<n>` is the call asked for under that number. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(CALL)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

const BASE_CSS = `:root {
  --paper: #fbfaf7;
  --ink: #1f2430;
  --accent: #2f6fde;
  --gap: 1rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #15171c;
    --ink: #eceae4;
  }
}
@font-face {
  font-family: "Harbour Round";
  src: url("../fonts/harbour-round.woff2") format("woff2");
}
body {
  font-family: "Harbour Round", sans-serif;
  font-size: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
}
`;
const COMPONENTS_CSS = `.card {
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  padding: 1.5rem;
}
.button {
  transition: background 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
`;
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#2f6fde"/></svg>\n`;

const oklch = (l: number, c: number, h: number, alpha?: number) => ({
  colorSpace: "oklch",
  components: [l, c, h],
  ...(alpha === undefined ? {} : { alpha }),
});
const recipe = (css: string) => ({ "dev.cawco": { css } });

/** The builder's base set, in the fixture's own role names, DTCG 2025.10 values. */
const TOKENS = {
  color: {
    paper: { $type: "color", $value: oklch(0.984, 0.004, 85) },
    ink: {
      $type: "color",
      $value: oklch(0.264, 0.022, 265),
      $description: "Body text and icons.",
    },
    // A recipe: the builder's value is a placeholder the hub computes.
    "ink-quiet": {
      $type: "color",
      $value: oklch(0, 0, 0),
      $extensions: recipe("oklch(from {color.ink} l c h / 0.64)"),
    },
    accent: { $type: "color", $value: oklch(0.566, 0.18, 260) },
  },
  font: {
    "body-face": {
      $type: "fontFamily",
      $value: ["Harbour Round", "sans-serif"],
    },
  },
  size: {
    body: {
      $type: "dimension",
      $value: { value: 1, unit: "rem" },
      $extensions: recipe("clamp(1rem, 0.95rem + 0.25vw, 1.125rem)"),
    },
    gap: {
      $type: "dimension",
      $value: { value: 0.875, unit: "rem" },
      $extensions: recipe("clamp(0.875rem, 0.8rem + 0.4cqi, 1rem)"),
    },
    "radius-card": { $type: "dimension", $value: { value: 0.75, unit: "rem" } },
  },
  shadow: {
    card: {
      $type: "shadow",
      $value: {
        color: oklch(0, 0, 0, 0.12),
        offsetX: { value: 0, unit: "px" },
        offsetY: { value: 1, unit: "px" },
        blur: { value: 3, unit: "px" },
        spread: { value: 0, unit: "px" },
      },
    },
  },
  motion: {
    quick: { $type: "duration", $value: { value: 160, unit: "ms" } },
    settle: { $type: "cubicBezier", $value: [0.2, 0.8, 0.2, 1] },
  },
};
const DARK = {
  color: {
    paper: { $type: "color", $value: oklch(0.196, 0.009, 265) },
    ink: { $type: "color", $value: oklch(0.934, 0.007, 90) },
  },
};
const RESOLVER = {
  $schema: "https://www.designtokens.org/schemas/2025.10/resolver.json",
  name: "Harbour",
  version: "2025.10",
  sets: { base: { sources: [{ $ref: "tokens.json" }] } },
  modifiers: {
    theme: {
      contexts: {
        light: [],
        dark: [{ $ref: "themes/dark.tokens.json" }],
      },
      default: "light",
      $extensions: { "dev.cawco": { contexts: { dark: { scheme: "dark" } } } },
    },
  },
  resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }],
};
const SOURCES: Record<string, string> = {
  "color.paper": "styles/base.css:2 (--paper: #fbfaf7), dark styles/base.css:9",
  "color.ink": "styles/base.css:3 (--ink: #1f2430), dark styles/base.css:10",
  "color.ink-quiet":
    "derived from color.ink: the material has no quiet ink, decision page card quiet-ink",
  "color.accent": "styles/base.css:4 (--accent: #2f6fde)",
  "font.body-face": 'styles/base.css:18 (font-family: "Harbour Round")',
  "size.body": "styles/base.css:19 (font-size: clamp(…))",
  "size.gap": "styles/base.css:5 (--gap: 1rem)",
  "size.radius-card": "styles/components.css:2 (border-radius: 12px)",
  "shadow.card": "styles/components.css:3 (box-shadow)",
  "motion.quick": "styles/components.css:7 (160ms)",
  "motion.settle": "styles/components.css:7 (cubic-bezier(0.2, 0.8, 0.2, 1))",
};
const SECOND_TOKENS = {
  ...TOKENS,
  color: {
    ...TOKENS.color,
    line: {
      $type: "color",
      $value: oklch(0, 0, 0),
      $extensions: recipe(
        "color-mix(in oklch, {color.ink} 14%, {color.paper})"
      ),
    },
  },
};
const SECOND_SOURCES = {
  ...SOURCES,
  "color.line":
    "styles/components.css:3 (the card's edge), mixed from ink and paper",
};

const FOUNDATIONS = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Harbour foundations</title>
<link rel="stylesheet" href="../tokens.css"></head>
<body style="background: var(--paper); color: var(--ink)"><h1>Harbour foundations</h1></body></html>
`;
const BUILDER_DESIGN =
  "# Harbour design system\n\nThe builder's first guide.\n";
const PERSON_DESIGN =
  "# Harbour design system\n\nThe person's own words: the accent is for actions only.\n";
const PARTS = [
  "DESIGN.md",
  "tokens.resolver.json",
  "tokens.json",
  "themes/dark.tokens.json",
  "tokens.css",
  "manifest.json",
  "SKILL.md",
  "specimens/index.html",
  "fonts/harbour-round.woff2",
  "assets/logo.svg",
];

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The builder's `design_write` of `files`, asked in `worker`'s session: what the tool answered. */
async function builderWrites(
  kit: Kit,
  fleet: KitFleet,
  worker: string,
  files: object[]
): Promise<string> {
  const marker = String(asks.size + 1);
  asks.set(marker, { name: WRITE, input: { files } });
  await fleet.send(worker, `PROBE-CALL:${marker}`);
  return await until(
    `the builder's design_write (${marker})`,
    () => answered.get(marker),
    Boolean,
    240_000
  ).catch(async (error: unknown) => {
    const said = `${await fleet.logs("hub")}\n${await fleet.logs("agent")}`;
    await writeFile(join(kit.out, "services.log"), said);
    const lines = said
      .split("\n")
      .filter((line) => ABOUT.test(line))
      .slice(-6)
      .join(" ⏎ ");
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; the model was asked ${fleet.seen.length} time(s); the services said: ${lines.slice(-1600)}`
    );
  });
}

/** The tool's JSON answer inside what the session read back, if it is one. */
const answerOf = (
  said: string
): { written?: string[]; kept?: { path: string }[]; missing?: string[] } => {
  const body = said.slice(said.indexOf("{"), said.lastIndexOf("}") + 1);
  // As the harness passed it on: the tool's text, or that text escaped once more.
  for (const text of [body, body.replaceAll('\\"', '"')]) {
    try {
      return JSON.parse(text) as ReturnType<typeof answerOf>;
    } catch {
      // the other reading
    }
  }
  return {};
};

interface Leg {
  /** Says the person's edit of DESIGN.md into the place, and commits it. */
  edit: (content: string) => Promise<void>;
  /** The place's newest commit subjects, newest first. */
  log: () => Promise<string>;
  name: string;
  /** Where design/ lands. */
  root: string;
  worker: string;
}

async function runLeg(
  kit: Kit,
  fleet: KitFleet,
  leg: Leg,
  font: Buffer
): Promise<void> {
  const design = (path: string) => join(leg.root, "design", path);
  const bytesOf = (path: string) =>
    readFile(design(path)).catch(() => Buffer.alloc(0));
  const textOf = async (path: string) => (await bytesOf(path)).toString();
  const build = () =>
    buildDesignTokens(async (path) => JSON.parse(await textOf(path)));
  const say = (n: number, claim: string) => `${leg.name} ${n}: ${claim}`;

  // ── 1–3: the first build ─────────────────────────────────────────────
  const first = await builderWrites(kit, fleet, leg.worker, [
    { path: "manifest.json", content: json({ sources: SOURCES }) },
    { path: "tokens.resolver.json", content: json(RESOLVER) },
    { path: "tokens.json", content: json(TOKENS) },
    { path: "themes/dark.tokens.json", content: json(DARK) },
    { path: "DESIGN.md", content: BUILDER_DESIGN },
    {
      path: "SKILL.md",
      content:
        "---\nname: harbour-design\ndescription: Harbour's design system. Use when building Harbour's screens.\n---\n\nRead DESIGN.md and tokens.css first.\n",
    },
    { path: "specimens/index.html", content: FOUNDATIONS },
    {
      path: "fonts/harbour-round.woff2",
      content: font.toString("base64"),
      encoding: "base64",
    },
    { path: "assets/logo.svg", content: LOGO },
  ]);
  const firstAnswer = answerOf(first);
  const present = await Promise.all(
    PARTS.map(async (path) => (await bytesOf(path)).byteLength > 0)
  );
  const fontBack = await bytesOf("fonts/harbour-round.woff2");
  const log = await leg.log();
  kit.check(
    say(
      1,
      "the first build writes design/'s parts and its material, the font and logo byte-identical, nothing missing, committed where the place commits"
    ),
    present.every(Boolean) &&
      fontBack.equals(font) &&
      (await textOf("assets/logo.svg")) === LOGO &&
      firstAnswer.missing?.length === 0 &&
      (leg.name !== "hub folder" ||
        log.includes("design: write the design system")),
    `present ${PARTS.filter((_, i) => present[i]).join(", ")}; missing in answer ${JSON.stringify(firstAnswer.missing)}; font equal ${fontBack.equals(font)}; log “${log.slice(0, 160)}”; answer “${first.slice(0, 300)}”`
  );

  const built = await build();
  const manifest = JSON.parse(await textOf("manifest.json")) as {
    files: Record<string, string>;
    sources: Record<string, string>;
  };
  const paths = [
    ...new Set(
      [...built.system.files]
        .filter(([path]) => path !== built.system.resolver)
        .flatMap(([, tree]) => [...tokensIn(tree)].map((token) => token.path))
    ),
  ];
  const unsourced = paths.filter((path) => !manifest.sources[path]);
  kit.check(
    say(2, "every token in every token file has a source in manifest.json"),
    paths.length === Object.keys(SOURCES).length && unsourced.length === 0,
    `${paths.length} token paths, unsourced: ${unsourced.join(", ") || "none"}`
  );

  const onDisk = await textOf("tokens.css");
  const base = JSON.parse(await textOf("tokens.json"));
  const dark = JSON.parse(await textOf("themes/dark.tokens.json"));
  const quiet = base.color["ink-quiet"].$value;
  const quietDark = dark.color?.["ink-quiet"]?.$value;
  const problems = schemaProblems(built.system);
  const fingerprints = await Promise.all(
    Object.entries(manifest.files).map(
      async ([path, print]) => fingerprint(await bytesOf(path)) === print
    )
  );
  kit.check(
    say(
      3,
      "tokens.css is the generator's output byte for byte, the files pass the DTCG 2025.10 schemas, the recipe's value is computed in both schemes, every fingerprint matches"
    ),
    onDisk === built.css &&
      onDisk.includes("--ink: light-dark(") &&
      onDisk.includes("--ink-quiet: oklch(from var(--ink) l c h / 0.64)") &&
      problems.length === 0 &&
      quiet.alpha === 0.64 &&
      Math.abs(quiet.components[0] - 0.264) < 1e-4 &&
      quietDark?.alpha === 0.64 &&
      Math.abs(quietDark.components[0] - 0.934) < 1e-4 &&
      built.changed.size === 0 &&
      fingerprints.length === PARTS.length - 1 &&
      fingerprints.every(Boolean),
    `equal ${onDisk === built.css} (${onDisk.length} vs ${built.css.length} bytes); schema problems ${problems.length} ${problems.slice(0, 2).join("; ")}; ink-quiet ${JSON.stringify(quiet)}, dark ${JSON.stringify(quietDark)}; settled again ${built.changed.size}; ${fingerprints.filter(Boolean).length} of ${fingerprints.length} fingerprints match`
  );
  await writeFile(
    join(kit.out, `${leg.name.replace(" ", "-")}-tokens.css`),
    onDisk
  );

  // ── 4: a token with no source ────────────────────────────────────────
  const before = await textOf("tokens.json");
  const refused = await builderWrites(kit, fleet, leg.worker, [
    { path: "tokens.json", content: json(SECOND_TOKENS) },
  ]);
  kit.check(
    say(
      4,
      "a token the manifest gives no source is refused by name, and nothing changes"
    ),
    refused.includes("Nothing was written") &&
      refused.includes("color.line") &&
      (await textOf("tokens.json")) === before,
    `design_write said “${refused.slice(0, 300)}”`
  );

  // ── 5: the person edits DESIGN.md; a second build keeps it ───────────
  await leg.edit(PERSON_DESIGN);
  const second = await builderWrites(kit, fleet, leg.worker, [
    { path: "manifest.json", content: json({ sources: SECOND_SOURCES }) },
    { path: "tokens.json", content: json(SECOND_TOKENS) },
    {
      path: "DESIGN.md",
      content: "# Harbour design system\n\nThe builder's second guide.\n",
    },
  ]);
  const secondAnswer = answerOf(second);
  const rebuilt = await build();
  const css = await textOf("tokens.css");
  kit.check(
    say(
      5,
      "a second build keeps the person's DESIGN.md and lists it as kept, while the new token moves tokens.css on"
    ),
    (await textOf("DESIGN.md")) === PERSON_DESIGN &&
      (secondAnswer.kept ?? []).some(
        (file) => file.path === "design/DESIGN.md"
      ) &&
      css === rebuilt.css &&
      css.includes("--line: color-mix("),
    `DESIGN.md kept ${(await textOf("DESIGN.md")) === PERSON_DESIGN}; kept in answer ${JSON.stringify(secondAnswer.kept?.map((file) => file.path))}; tokens.css regenerated ${css === rebuilt.css}; answer “${second.slice(0, 300)}”`
  );
}

const spec: Spec = {
  name: "design-system",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const font = await readFile(FONT);

    // ── The repository leg: two stylesheets, a font, a logo ──────────────
    const repo = join(fleet.sandbox, "harbour");
    await Bun.$`mkdir -p ${join(repo, "styles")} ${join(repo, "fonts")} ${join(repo, "brand")}`;
    await writeFile(join(repo, "styles/base.css"), BASE_CSS);
    await writeFile(join(repo, "styles/components.css"), COMPONENTS_CSS);
    await writeFile(join(repo, "fonts/harbour-round.woff2"), font);
    await writeFile(join(repo, "brand/logo.svg"), LOGO);
    const git = (args: string) =>
      Bun.$`git -c user.name=Owner -c user.email=owner@probe.test ${{ raw: args }}`
        .cwd(repo)
        .quiet();
    await Bun.$`git init -q -b main`.cwd(repo).quiet();
    await git("add -A");
    await git("commit -qm 'Harbour'");
    const inRepo = await fleet.api<{ id?: string; project?: { id: string } }>(
      "/api/projects",
      { name: "Harbour", machineId: MACHINE, cwd: repo, caw: false }
    );
    const repoProject = inRepo.project?.id ?? inRepo.id ?? "";
    await runLeg(
      kit,
      fleet,
      {
        name: "repository",
        root: repo,
        worker: await fleet.spawn("claude", "Design builder", repo, {
          projectId: repoProject,
        }),
        edit: async (content) => {
          await writeFile(join(repo, "design/DESIGN.md"), content);
          await git("add -A");
          await git("commit -qm 'My words in DESIGN.md'");
        },
        log: async () =>
          (await Bun.$`git log --format=%s -5`.cwd(repo).quiet()).text(),
      },
      font
    );

    // ── The hub-folder leg: a project with no repository ─────────────────
    const made = await fleet.api<{ id?: string; project?: { id: string } }>(
      "/api/projects",
      { name: "Harbour brand", caw: false }
    );
    const folderProject = made.project?.id ?? made.id ?? "";
    // Its folder is made on first read (project-folder.ts `listFolder`).
    await fleet.api(`/api/projects/${folderProject}/folder`);
    const folder = join(
      dirname(fleet.env.CAWCO_DB_PATH ?? ""),
      "projects",
      folderProject
    );
    await runLeg(
      kit,
      fleet,
      {
        name: "hub folder",
        root: folder,
        worker: await fleet.spawn("claude", "Brand builder", folder, {
          projectId: folderProject,
        }),
        // The person's edit through the folder editor, a commit as them.
        edit: async (content) => {
          const written = await fetch(
            `${fleet.base}/api/projects/${folderProject}/folder/file`,
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ path: "design/DESIGN.md", content }),
            }
          );
          if (!written.ok) {
            throw new Error(
              `the folder editor's write: ${written.status} ${await written.text()}`
            );
          }
        },
        log: async () =>
          (await Bun.$`git log --format=%s -5`.cwd(folder).quiet()).text(),
      },
      font
    );
  },
};
export default spec;
