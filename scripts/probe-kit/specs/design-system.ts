/**
 * A builder writes a project's design system with `design_write`, and the
 * hub keeps the folder contract (design-system plan §2, slice 1). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model, which plays the builder's calls), a worker session in a project on
 * a fixture repository (two stylesheets, a font, a logo), one run each:
 *
 * 1. The first build writes design/ at the repository's root: DESIGN.md,
 *    tokens.json, tokens.css, manifest.json, SKILL.md,
 *    specimens/index.html, and the material in fonts/ and assets/, the
 *    font and the logo byte-identical; the answer lists nothing missing.
 * 2. Every token in tokens.json has a source in manifest.json.
 * 3. tokens.css is the generator's output for tokens.json, byte for byte,
 *    and the manifest's fingerprint of every file it wrote matches.
 * 4. A tokens.json with a token the manifest gives no source is refused,
 *    naming it, and nothing changes on disk.
 * 5. After the person edits DESIGN.md and commits it, a second build keeps
 *    their DESIGN.md and lists it as kept, while its new tokens.json is
 *    written and tokens.css regenerated from it.
 *
 *   bun scripts/probe-kit/run.ts design-system
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one call at a time, as the builder makes them
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  designTokensCss,
  fingerprint,
  tokenPaths,
} from "../../../packages/hub/src/design-system";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { FONT } from "./web/oui-mockup/bytes";

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

/** The builder's tokens, in the fixture's own role names. */
const TOKENS = {
  color: {
    $type: "color",
    paper: {
      $value: "oklch(98.4% 0.004 85)",
      $extensions: { "dev.cawco": { dark: "oklch(19.6% 0.009 265)" } },
    },
    ink: {
      $value: "oklch(26.4% 0.022 265)",
      $description: "Body text and icons.",
      $extensions: { "dev.cawco": { dark: "oklch(93.4% 0.007 90)" } },
    },
    "ink-quiet": { $value: "oklch(from {color.ink} l c h / 0.64)" },
    accent: { $value: "oklch(56.6% 0.18 260)" },
  },
  font: {
    $type: "fontFamily",
    "body-face": { $value: '"Harbour Round", sans-serif' },
  },
  size: {
    $type: "dimension",
    body: { $value: "clamp(1rem, 0.95rem + 0.25vw, 1.125rem)" },
    gap: { $value: "clamp(0.875rem, 0.8rem + 0.4cqi, 1rem)" },
    "radius-card": { $value: "0.75rem" },
  },
  shadow: {
    $type: "shadow",
    card: { $value: "0 1px 3px oklch(0% 0 0 / 0.12)" },
  },
  motion: {
    quick: { $type: "duration", $value: "160ms" },
    settle: { $type: "cubicBezier", $value: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  },
};
const SOURCES: Record<string, string> = {
  "color.paper": "styles/base.css:2 (--paper: #fbfaf7), dark styles/base.css:9",
  "color.ink": "styles/base.css:3 (--ink: #1f2430), dark styles/base.css:10",
  "color.ink-quiet":
    "derived from color.ink: styles/components.css has no quiet ink, decision page card quiet-ink",
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
    line: { $value: "color-mix(in oklch, {color.ink} 14%, {color.paper})" },
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

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The builder's `design_write` of `files`, asked in the worker's session: what the tool answered. */
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

    // The fixture repository: two stylesheets, a font, a logo.
    const repo = join(fleet.sandbox, "harbour");
    const font = await readFile(FONT);
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

    const made = await fleet.api<{ id?: string; project?: { id: string } }>(
      "/api/projects",
      { name: "Harbour", machineId: MACHINE, cwd: repo, caw: false }
    );
    const projectId = made.project?.id ?? made.id ?? "";
    const worker = await fleet.spawn("claude", "Design builder", repo, {
      projectId,
    });

    const design = (path: string) => join(repo, "design", path);
    const bytesOf = (path: string) =>
      readFile(design(path)).catch(() => Buffer.alloc(0));
    const textOf = async (path: string) => (await bytesOf(path)).toString();

    // ── 1–3: the first build ───────────────────────────────────────────
    const first = await builderWrites(kit, fleet, worker, [
      { path: "manifest.json", content: json({ sources: SOURCES }) },
      { path: "tokens.json", content: json(TOKENS) },
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
    const parts = [
      "DESIGN.md",
      "tokens.json",
      "tokens.css",
      "manifest.json",
      "SKILL.md",
      "specimens/index.html",
      "fonts/harbour-round.woff2",
      "assets/logo.svg",
    ];
    const present = await Promise.all(
      parts.map(async (path) => (await bytesOf(path)).byteLength > 0)
    );
    const fontBack = await bytesOf("fonts/harbour-round.woff2");
    kit.check(
      "1: the first build writes design/ at the repository's root with its parts, the font and logo byte-identical, nothing missing",
      present.every(Boolean) &&
        fontBack.equals(font) &&
        (await textOf("assets/logo.svg")) === LOGO &&
        firstAnswer.missing?.length === 0,
      `present ${parts.filter((_, i) => present[i]).join(", ")}; missing in answer ${JSON.stringify(firstAnswer.missing)}; font equal ${fontBack.equals(font)}; answer “${first.slice(0, 300)}”`
    );

    const tokens = JSON.parse(await textOf("tokens.json"));
    const manifest = JSON.parse(await textOf("manifest.json")) as {
      sources: Record<string, string>;
      files: Record<string, string>;
    };
    const paths = tokenPaths(tokens);
    const unsourced = paths.filter((path) => !manifest.sources[path]);
    kit.check(
      "2: every token in tokens.json has a source in manifest.json",
      paths.length === Object.keys(SOURCES).length && unsourced.length === 0,
      `${paths.length} tokens, unsourced: ${unsourced.join(", ") || "none"}`
    );

    const generated = await designTokensCss(tokens);
    const onDisk = await textOf("tokens.css");
    const fingerprints = await Promise.all(
      Object.entries(manifest.files).map(
        async ([path, print]) => fingerprint(await bytesOf(path)) === print
      )
    );
    kit.check(
      "3: tokens.css is the generator's output byte for byte, and every fingerprint matches its file",
      onDisk === generated &&
        onDisk.includes("light-dark(") &&
        fingerprints.length === parts.length - 1 &&
        fingerprints.every(Boolean),
      `equal ${onDisk === generated} (${onDisk.length} vs ${generated.length} bytes); ${fingerprints.filter(Boolean).length} of ${fingerprints.length} fingerprints match`
    );
    await writeFile(join(kit.out, "tokens.css"), onDisk);

    // ── 4: a token with no source ──────────────────────────────────────
    const before = await textOf("tokens.json");
    const refused = await builderWrites(kit, fleet, worker, [
      { path: "tokens.json", content: json(SECOND_TOKENS) },
    ]);
    kit.check(
      "4: a token the manifest gives no source is refused by name, and nothing changes",
      refused.includes("Nothing was written") &&
        refused.includes("color.line") &&
        (await textOf("tokens.json")) === before,
      `design_write said “${refused.slice(0, 300)}”`
    );

    // ── 5: the person edits DESIGN.md; a second build keeps it ─────────
    await writeFile(design("DESIGN.md"), PERSON_DESIGN);
    await git("add -A");
    await git("commit -qm 'Design system, and my words in DESIGN.md'");
    const second = await builderWrites(kit, fleet, worker, [
      { path: "manifest.json", content: json({ sources: SECOND_SOURCES }) },
      { path: "tokens.json", content: json(SECOND_TOKENS) },
      {
        path: "DESIGN.md",
        content: "# Harbour design system\n\nThe builder's second guide.\n",
      },
    ]);
    const secondAnswer = answerOf(second);
    const regenerated = await designTokensCss(
      JSON.parse(await textOf("tokens.json"))
    );
    const css = await textOf("tokens.css");
    kit.check(
      "5: a second build keeps the person's DESIGN.md and lists it as kept, while tokens.json and tokens.css move on",
      (await textOf("DESIGN.md")) === PERSON_DESIGN &&
        (secondAnswer.kept ?? []).some(
          (file) => file.path === "design/DESIGN.md"
        ) &&
        css === regenerated &&
        css.includes("--line: color-mix("),
      `DESIGN.md kept ${(await textOf("DESIGN.md")) === PERSON_DESIGN}; kept in answer ${JSON.stringify(secondAnswer.kept?.map((file) => file.path))}; tokens.css regenerated ${css === regenerated}; answer “${second.slice(0, 300)}”`
    );
  },
};
export default spec;
