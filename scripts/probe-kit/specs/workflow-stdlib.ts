/**
 * A workflow's typecheck knows the JavaScript standard library: a graph whose
 * compiled program throws an `Error`, compares through `JSON.stringify` and
 * reads through `String(...)` and `RegExp`, and a program that does the same,
 * both save with no problems. Without the lib files the hub answered the
 * dashboard's New graph with 400 "Line 8: Cannot find name 'Error'."
 *
 * A scratch fleet's hub. Three saves, each read back:
 * (a) the dashboard's New graph body as it posts it: a lone Start, whose
 *     program is `throw new Error("unwired:…")`;
 * (b) a graph whose branch cases compile to `JSON.stringify`, `String(...)`
 *     and `new RegExp(...)`;
 * (c) a program using `Error`, `JSON`, `String`, `Number`, an array's push
 *     and `Object.keys`.
 * Each answers 201 and reads back with no typecheck problem: (b) and (c)
 * with `problems: []`, (a) with only its graph's own "An End must be
 * reachable from Start."
 * (d) The hub started again with its lib folder pointed at an empty one
 *     (stand-ins/workflow-lib.ts): the program's save is refused 400 with one
 *     problem, the checker's setup named broken and the compiler's
 *     "Cannot find global type 'Array'", never a clean check.
 *
 * The released binary's typecheck is proven by its own build:
 * `bun scripts/build-binary.ts linux-x64 <out> 0.1.0-dev dev --proof`, then
 * `HOME=<dir with "binary" in it> <out> proof-worker`, whose program leans on
 * the same library (scripts/binary/proof-runtime.ts).
 *
 *   bun scripts/probe-kit/run.ts workflow-stdlib
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BROKEN_CHECKER } from "../../../packages/core/src/workflow-sandbox";
import type { Kit, Spec } from "../kit";

/** The dashboard's New workflow → New graph body. */
const NEW_GRAPH = {
  nodes: [
    {
      id: "start-probe",
      title: "Start",
      position: { x: 80, y: 120 },
      kind: "start",
      inputs: [],
    },
  ],
  edges: [],
};

/** Branch cases that compile to JSON.stringify, String(...).includes and RegExp. */
const BRANCH_GRAPH = {
  nodes: [
    {
      id: "start-1",
      title: "Start",
      position: { x: 80, y: 120 },
      kind: "start",
      inputs: [{ name: "topic", label: "Topic", type: "text", required: true }],
    },
    {
      id: "branch-1",
      kind: "branch",
      title: "Which topic?",
      position: { x: 320, y: 120 },
      cases: [
        { port: "exact", when: { op: "eq", path: "topic", value: "stdlib" } },
        {
          port: "mentions",
          when: { op: "contains", path: "topic", value: "lib" },
        },
        {
          port: "pattern",
          when: { op: "matches", path: "topic", value: "^s" },
        },
        { port: "else" },
      ],
    },
    {
      id: "end-1",
      kind: "end",
      title: "End",
      position: { x: 560, y: 120 },
      outputs: { topic: "inputs.topic" },
    },
  ],
  edges: [
    {
      id: "e1",
      from: { node: "start-1", port: "out" },
      to: { node: "branch-1" },
    },
    ...["exact", "mentions", "pattern", "else"].map((port, index) => ({
      id: `e${index + 2}`,
      from: { node: "branch-1", port },
      to: { node: "end-1" },
    })),
  ],
};

const PROGRAM = `import { z } from "zod";

export const inputs = z.object({ count: z.string() });

export default async function (w: Workflow<typeof inputs>) {
  const count = Number(w.inputs.count);
  if (Number.isNaN(count)) {
    throw new Error(\`Not a number: \${JSON.stringify(w.inputs.count)}\`);
  }
  const seen: string[] = [];
  seen.push(String(count), ...Object.keys(w.inputs));
  return { seen: JSON.parse(JSON.stringify(seen)) as string[] };
}
`;

/** A lone Start's one problem: the graph is unfinished, not its program wrong. */
const UNFINISHED = "An End must be reachable from Start.";

interface Saved {
  id: string;
  problems?: unknown[];
}

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();

    const saves: [string, string, Record<string, unknown>, unknown[]][] = [
      [
        "a",
        "the dashboard's New graph (Error)",
        { name: "Untitled workflow", graph: NEW_GRAPH },
        [{ message: UNFINISHED }],
      ],
      [
        "b",
        "a branch graph (JSON.stringify, String, RegExp)",
        { name: "Stdlib graph", graph: BRANCH_GRAPH },
        [],
      ],
      [
        "c",
        "a program (Error, JSON, String, Number, push, Object.keys)",
        { name: "Stdlib program", program: PROGRAM },
        [],
      ],
    ];
    const reads = await Promise.all(
      saves.map(async ([, , body]) => {
        const saved = await fleet
          .api<Saved>("/api/workflows", body)
          .catch((error: Error) => error);
        return saved instanceof Error
          ? saved
          : fleet
              .api<Saved>(`/api/workflows/${saved.id}`)
              .catch((error: Error) => error);
      })
    );
    for (const [index, [leg, label, , kept]] of saves.entries()) {
      const read = reads[index] as Saved | Error;
      kit.check(
        `${leg}: ${label} saves and reads back with ${kept.length ? JSON.stringify(kept) : "no problems"}`,
        !(read instanceof Error) &&
          JSON.stringify(read.problems) === JSON.stringify(kept),
        read instanceof Error
          ? read.message
          : `problems ${JSON.stringify(read.problems)}`
      );
    }

    // (d) a hub whose lib folder is empty: the checker's setup is broken.
    const emptyLib = join(fleet.sandbox, "empty-lib");
    await mkdir(emptyLib, { recursive: true });
    await fleet.stop("hub");
    fleet.standIns.workflowLib = emptyLib;
    fleet.launch("hub");
    await fleet.hubUp();
    const refused = await fetch(`${fleet.base}/api/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Broken checker", program: PROGRAM }),
    });
    const said = await refused.text();
    const { problems } = JSON.parse(said) as {
      problems?: { message: string }[];
    };
    kit.check(
      "d: with no lib files the save is refused with one problem naming the checker's setup",
      refused.status === 400 &&
        problems?.length === 1 &&
        problems[0].message.startsWith(BROKEN_CHECKER) &&
        problems[0].message.includes("Cannot find global type 'Array'"),
      `${refused.status} ${said}`
    );
  } finally {
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default { name: "workflow-stdlib", run } satisfies Spec;
