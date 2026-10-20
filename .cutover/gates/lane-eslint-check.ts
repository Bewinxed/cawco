// The lanes' one ESLint gate (delta Q). Run from the repository root:
//   L=<lane> bun .cutover/gates/lane-eslint-check.ts
// Passes when every ESLint problem left in the lane's files is either a
// `contract:` line in .cutover/lanes/<lane>.md (same path, line and rule) or a
// no-unknown-classes message naming a class the shared stylesheets select.
// The contracts phase owns both of those after the merge.
import { existsSync, readFileSync } from "node:fs";
import { loadLane, reportList } from "./lane-list.ts";

const IMPORTANT = /!$/;
const NEGATIVE = /^-/;
const DASHBOARD = /^apps\/dashboard\//;
const QUOTED_NAME = /^"([^"]+)"/;

const lane = loadLane();
const listOk = reportList(lane);
const { laneText } = lane;
const declared = new Set(
  [...laneText.matchAll(/^contract:\s*(\S+):(\d+)\s+(\S+)/gm)].map(
    (match) => `${match[1]}:${match[2]} ${match[3]}`
  )
);

// Delta T: names the lane declares under `## Theme additions` (`theme: utility
// <name>`, `theme: animate <name>`, `theme: variant <name>`) are added to the
// theme in one commit at integration, so their classes are known by then.
const themeNames = [
  ...laneText.matchAll(
    /^theme:\s*(utility|animate|variant|component)\s+(\S+)/gm
  ),
];
const themeUtilities = new Set(
  themeNames.flatMap(([, kind, name]) => {
    if (kind === "variant") {
      return [];
    }
    return kind === "animate" ? [`animate-${name}`] : [name];
  })
);
const themeVariants = themeNames
  .filter(([, kind]) => kind === "variant")
  .map(([, , name]) => name);
// Size utilities name the theme key (`max-w-c-measure`, `shadow-knob`), and every
// token gets its theme key at integration: the lane's own `token: --<name>` lines,
// and the names integration's tokens commit (b16e59a24) already merged by value
// and role.
const mergedTokens = [
  "c-measure",
  "c-measure-short",
  "c-measure-meta",
  "c-textarea-max-h",
  "c-config-max-w",
  "c-new-session-w",
  "c-number-field-w",
  "c-screen-margin",
  "c-edge-fade-len",
  "c-btn-min-w",
  "c-board-col-min",
  "c-board-col-max",
  "c-page-column-w",
  "c-page-line",
  "hover-panel-max",
  "text-field-floor",
  "c-sheet-max-h",
  "shadow-knob",
];
const tokenNames = new Set([
  ...mergedTokens,
  ...[...laneText.matchAll(/^token:\s*--([\w-]+)/gm)].map((match) => match[1]),
]);
const namesToken = (segment: string): boolean =>
  [...tokenNames].some(
    (name) => segment === name || segment.endsWith(`-${name}`)
  );
// Tailwind's important modifier (`name!`) and a negative (`-name`) still name the utility.
const segmentsOf = (cls: string): string[] =>
  cls.split(":").map((segment) => segment.replace(IMPORTANT, ""));
const declaredByTheme = (cls: string): boolean =>
  segmentsOf(cls).some(
    (segment) =>
      themeUtilities.has(segment.replace(NEGATIVE, "")) ||
      [...themeUtilities].some(
        (name) => name.endsWith("-*") && segment.startsWith(name.slice(0, -1))
      ) ||
      themeVariants.includes(segment)
  );
const namedByToken = (cls: string): boolean =>
  segmentsOf(cls).some((segment) => namesToken(segment.replace(NEGATIVE, "")));

// A lane may delete a shared sheet (wave 2 dissolves both); a deleted one names nothing.
const sheetPaths = [
  "apps/dashboard/src/lib/cawco/spawn/ns-theme.css",
  "apps/dashboard/src/lib/components/features/workflows/workflows.css",
].filter((path) => existsSync(path));
const sheetText = sheetPaths
  .map((path) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))
  .join("\n");
const sheetClasses = new Set(
  [...sheetText.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1])
);

// ESLint's config covers the dashboard's source: the lane's present files under
// apps/dashboard/src; a listed sheet its config does not match is skipped by
// --no-warn-ignored rather than reported as a fatal problem.
const files = lane.dashboardSrc.map((path) => path.replace(DASHBOARD, ""));
if (files.length === 0) {
  console.log(
    listOk
      ? "no files under apps/dashboard/src to lint\neslint-clean"
      : "list-failed"
  );
  process.exit(listOk ? 0 : 1);
}
const run = Bun.spawnSync(
  [
    "bunx",
    "eslint",
    "-f",
    "json",
    "--no-warn-ignored",
    "--rule",
    "shadcn/no-restyle: off",
    ...files,
  ],
  { cwd: "apps/dashboard", stdout: "pipe", stderr: "pipe" }
);
const stderr = run.stderr.toString().trim();
if (stderr) {
  console.log(`eslint stderr:\n${stderr.slice(-1500)}`);
}

let results: {
  filePath: string;
  messages: { line: number; ruleId: string | null; message: string }[];
}[];
try {
  results = JSON.parse(run.stdout.toString());
} catch {
  console.log("eslint-did-not-run");
  process.exit(1);
}

const undeclared: string[] = [];
let contracts = 0;
let sheet = 0;
let theme = 0;
let token = 0;
for (const file of results) {
  const path = `apps/dashboard/${file.filePath.split("/apps/dashboard/").pop()}`;
  for (const message of file.messages) {
    const rule = message.ruleId ?? "fatal";
    if (declared.has(`${path}:${message.line} ${rule}`)) {
      contracts += 1;
      continue;
    }
    const name = message.message.match(QUOTED_NAME)?.[1];
    if (
      rule === "shadcn/no-unknown-classes" &&
      name &&
      sheetClasses.has(name)
    ) {
      sheet += 1;
      continue;
    }
    if (rule === "shadcn/no-unknown-classes" && name && declaredByTheme(name)) {
      theme += 1;
      continue;
    }
    if (rule === "shadcn/no-unknown-classes" && name && namedByToken(name)) {
      token += 1;
      continue;
    }
    undeclared.push(
      `${path}:${message.line} ${rule} ${message.message.slice(0, 140)}`
    );
  }
}

const clean = listOk
  ? `eslint-clean (${contracts} declared contract, ${sheet} shared-sheet, ${theme} theme-addition, ${token} token-key)`
  : "list-failed";
console.log(
  undeclared.length
    ? `${undeclared.join("\n")}\nundeclared-problems ${undeclared.length}`
    : clean
);
process.exit(undeclared.length || !listOk ? 1 : 0);
