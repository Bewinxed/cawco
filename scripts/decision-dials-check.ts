/**
 * `bun scripts/decision-dials-check.ts`: a decision page's dials, as far as
 * no browser is needed to tell (the rest is the `web decision-dials` probe
 * spec's, scripts/probe-kit/specs/web/decision-dials.ts).
 *
 * 1. The kit's page.html, which keeps `{{DIALS}}`, builds through the hub's
 *    `buildDecisionPage`, and so does it without: from cbd45f1b8 to
 *    adb12cab3 every page that kept the line was refused ("page.html shows
 *    /__cawco/decision/dials.js, which is not beside it") and no check
 *    noticed. Built, it loads the dials entry and never the host's sheet.
 * 2. The dials' own sheet (core decision-host.ts `dials.css`, page-css.ts
 *    `shadowSheet`) holds no `:root` and no `@property`, its root rules on
 *    the dials' root, and no `rem` outside a query's prelude.
 * 3. A program's Dials piece builds with controls the panel draws, and is
 *    refused naming each it doesn't: a spring, an easing, a list.
 * 4. A clip read with `direction: "alternate"` keeps it, an unknown one
 *    reads `normal`, and a clip's end counts each of its runs.
 *
 * Run by `bun run check` (scripts/check.ts); exits 1 naming each that fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIND_SEED } from "../packages/core/src/decides";
import { buildDecisionHost } from "../packages/core/src/decision-host";
import { DIALS_REM, DIALS_ROOT } from "../packages/core/src/dials-root";
import { clipEnd, stageReachedOf } from "../packages/core/src/stage-graph";
import { buildDecisionPage } from "../packages/hub/src/decision-page";
import {
  buildProgram,
  DECISION_ASSETS,
} from "../packages/hub/src/decision-program";

const ROOT = join(import.meta.dir, "..");
const KIT_PAGE = join(ROOT, "packages/hub/skills/decision-page/kit/page.html");
/** The kit's line that loads the dials, with its comment. */
const DIALS_LINE = /^.*\{\{DIALS\}\}.*$/mu;
/**
 * A length in rem outside a media or container query's prelude. A class
 * name that says a width (`.@max-table-34rem/table:hidden`, the kit
 * Table's fold) is no length: a rem after a dash is a selector's.
 */
const REM_LEFT = /(?<![=<>[\w.-])-?(?:\d+\.?\d*|\.\d+)rem(?![\w-])/u;

const wrong: string[] = [];
const said = (line: string) => console.log(`ok  ${line}`);
const fault = (line: string) => {
  console.log(`BAD ${line}`);
  wrong.push(line);
};
const expect = (line: string, ok: boolean, why: string) =>
  ok ? said(line) : fault(`${line}: ${why}`);

// 1. The kit's page, with {{DIALS}} and without.
const kit = readFileSync(KIT_PAGE, "utf8");
const sources = {
  image: async () => undefined,
  mockup: async () => undefined,
};
expect(
  "the kit's page.html keeps {{DIALS}}",
  DIALS_LINE.test(kit),
  "no {{DIALS}} line to build"
);
const withDials = await buildDecisionPage(kit, sources);
expect(
  "the kit's page.html with {{DIALS}} builds",
  "html" in withDials,
  "problem" in withDials ? withDials.problem : ""
);
if ("html" in withDials) {
  expect(
    "built, it loads the dials entry and never the host's sheet",
    withDials.html.includes(`src="${DECISION_ASSETS}dials.js"`) &&
      !withDials.html.includes(`${DECISION_ASSETS}host.css`),
    "the built head names host.css, or no dials.js"
  );
}
const without = await buildDecisionPage(kit.replace(DIALS_LINE, ""), sources);
expect(
  "the kit's page.html without {{DIALS}} builds, and loads no dials",
  "html" in without && !without.html.includes("dials.js"),
  "problem" in without ? without.problem : "it loads dials.js"
);

// 2. The dials' sheet.
const host = await buildDecisionHost();
const sheet = await host.get("dials.css")?.text();
const bodies = (sheet ?? "").replaceAll(/@(?:media|container)[^{]*\{/gu, "{");
expect(
  "dials.css holds no :root and no @property, its root rules on the dials' root",
  !!sheet &&
    !sheet.includes(":root") &&
    !sheet.includes("@property") &&
    sheet.includes(`[${DIALS_ROOT}]`),
  sheet ? "a :root or an @property stands in it" : "the host built no dials.css"
);
expect(
  `dials.css writes every rem as ${DIALS_REM}, outside a query's prelude`,
  !!sheet && !REM_LEFT.test(bodies) && sheet.includes(`var(${DIALS_REM})`),
  `a rem stands: …${bodies.match(REM_LEFT)?.[0] ?? ""}`
);

// 3. A Dials piece's controls.
const page = (
  config: string
) => `root = Decisions("Tune the card", [tune, card])
card = Dials("Card", ${config})
tune = Decision("feel", "Does the card feel right?", [yes, no], "It reads calm at 12.", [], [], false, null, "approach")
yes = Option("yes", "Yes", null, true, [], "Nothing more to tune.")
no = Option("no", "Not yet", null, false, [], "Another round of tuning.")
`;
const build = async (config: string): Promise<string | null> => {
  try {
    await buildProgram(
      page(config),
      async () => ({ bytes: new Uint8Array() }),
      (id) => id,
      KIND_SEED
    );
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
const drawn = await build(
  '{radius: [12, 0, 32], accent: "#e65d46", framed: true, label: "Card", tone: {type: "select", options: ["calm", "loud"], default: "calm"}, shadow: {blur: [8, 0, 40]}, nudge: {type: "pad", x: [0, -10, 10], y: [0, -10, 10]}, go: {type: "action", label: "Shake"}}'
);
expect(
  "a Dials piece of controls the panel draws builds",
  drawn === null,
  drawn ?? ""
);
const refused = await build(
  '{radius: [12, 0, 32], bounce: {type: "spring", stiffness: 300}, shadow: {curve: {type: "easing", default: "ease-out"}}, tags: ["a", "b"]}'
);
for (const [path, kind] of [
  ["bounce", '{type: "spring"}'],
  ["shadow.curve", '{type: "easing"}'],
  ["tags", "a list of words"],
] as const) {
  expect(
    `a Dials piece with ${kind} at ${path} is refused, naming it`,
    !!refused?.includes(`Dials "Card": ${path} is ${kind}, a control`),
    refused ?? "it built"
  );
}

// 4. A play's clip that runs there and back.
const reached = stageReachedOf({
  ask: 1,
  on: { file: "src/Dot.stories.ts", story: "Pulsed" },
  move: {
    from: "Rest",
    to: "Pulsed",
    length: 800,
    clips: [
      {
        id: "0",
        start: 0,
        delay: 0,
        direction: "alternate",
        duration: 400,
        easing: "linear",
        element: "Dot",
        property: "opacity",
        framed: false,
        frameCurve: null,
        group: null,
        iterations: 2,
        kind: "fade",
        legs: [],
        target: "e0",
        thing: "t0",
        values: [],
      },
      {
        id: "1",
        start: 0,
        delay: 0,
        direction: "sideways",
        duration: 100,
        easing: "linear",
        element: "Dot",
        property: "scale",
        iterations: 1,
        kind: "scale",
        target: "e0",
      },
    ],
  },
});
const [there, odd] = reached?.move?.clips ?? [];
expect(
  "a clip read with direction alternate keeps it, an unknown one reads normal",
  there?.direction === "alternate" && odd?.direction === "normal",
  `read ${there?.direction} and ${odd?.direction}`
);
expect(
  "a clip's end counts each of its runs: two of 400 ms end at 800",
  !!there && clipEnd(there) === 800,
  `ends at ${there ? clipEnd(there) : "nothing read"}`
);

if (wrong.length > 0) {
  console.error(`decision dials: ${wrong.length} failed`);
  process.exit(1);
}
console.log("decision dials: every leg holds");
