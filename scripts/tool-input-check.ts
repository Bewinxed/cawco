/**
 * Part of `bun run check`: every CawCo tool refuses an argument it does not
 * take (hub mcp-tool.ts `tool`), so a misspelt setting is said to the agent
 * that sent it, never dropped while the agent believes it took effect.
 *
 * 1. `tool()` itself: an unknown key is refused, the refusal naming the key
 *    and every argument the tool takes; the key CawCo's OpenCode plugin
 *    stamps into a call (`STAMPED_KEY`) passes and never reaches the tool's
 *    run; a known key passes; a tool's own input error is its whole answer.
 * 2. Every tool a session is listed says so in the schema its harness reads:
 *    `additionalProperties: false`, the stamp admitted by
 *    `patternProperties` alone (OpenCode's input repair keeps every key of
 *    such a schema).
 *
 *   bun scripts/tool-input-check.ts
 */
import { z } from "zod";
import { STAMPED_KEY, sentence, tool } from "../packages/hub/src/mcp-tool";

const failures: string[] = [];
const expect = (ok: boolean, what: string) => {
  if (!ok) {
    failures.push(what);
  }
};

/** What a call answered, or the words it was refused with. */
const outcome = async (
  call: Promise<unknown>
): Promise<{ refused: string } | { answered: unknown }> => {
  try {
    return { answered: await call };
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
};

let ran: unknown;
const plain = tool(
  "pick_colour",
  "A stand-in tool.",
  { colour: z.string(), shade: z.number().optional() },
  (args) => {
    ran = args;
    return Promise.resolve("ok");
  },
  sentence,
  { inputHelp: "Name a colour." }
);

const misspelt = await outcome(plain.call({ colour: "red", shde: 2 }));
expect(
  "refused" in misspelt,
  "pick_colour ran with `shde`, a key it does not take"
);
if ("refused" in misspelt) {
  expect(
    misspelt.refused.includes('"shde"'),
    `the refusal does not name "shde": ${misspelt.refused}`
  );
  expect(
    misspelt.refused.includes("pick_colour takes: colour, shade."),
    `the refusal does not list what pick_colour takes: ${misspelt.refused}`
  );
  expect(
    misspelt.refused.endsWith("Name a colour."),
    `the refusal does not end with the tool's input help: ${misspelt.refused}`
  );
}

ran = undefined;
const stamped = await outcome(
  plain.call({
    colour: "red",
    [STAMPED_KEY]: { credential: "cawco_s_x", call: "c1" },
  })
);
expect(
  "answered" in stamped,
  `a call carrying ${STAMPED_KEY} was refused: ${"refused" in stamped ? stamped.refused : ""}`
);
expect(
  JSON.stringify(ran) === JSON.stringify({ colour: "red" }),
  `pick_colour's run was handed ${JSON.stringify(ran)}, not its own arguments alone`
);

ran = undefined;
const known = await outcome(plain.call({ colour: "red", shade: 3 }));
expect("answered" in known, "a call of known keys was refused");
expect(
  JSON.stringify(ran) === JSON.stringify({ colour: "red", shade: 3 }),
  `pick_colour's run was handed ${JSON.stringify(ran)} for {colour, shade}`
);

const formatted = tool(
  "read_colour",
  "A stand-in tool with a record to give.",
  {},
  () => Promise.resolve({ colour: "red" }),
  () => "red"
);
const none = await outcome(formatted.call({ format: "detailed" }));
expect(
  "refused" in none &&
    none.refused.includes('"format"') &&
    none.refused.includes("read_colour takes: response_format."),
  `read_colour's refusal of "format" lacks the key or response_format: ${JSON.stringify(none)}`
);

const OWN_ERROR = "Colour not set. Name one colour.";
const own = tool(
  "set_colour",
  "A stand-in tool with its own input error.",
  { colour: z.string({ error: OWN_ERROR }) },
  () => Promise.resolve("ok"),
  sentence,
  { inputError: OWN_ERROR }
);
const ownRefusal = await outcome(own.call({ colour: "red", hue: 1 }));
expect(
  "refused" in ownRefusal && ownRefusal.refused === OWN_ERROR,
  `set_colour's refusal is not its own input error whole: ${JSON.stringify(ownRefusal)}`
);

const { listRoleTools } = await import("../packages/hub/src/role-budgets");
const { createAsks } = await import("../packages/hub/src/asks");
const listed = new Map<string, Record<string, unknown>>();
for (const { tools } of listRoleTools()) {
  for (const one of tools) {
    listed.set(one.name, one.inputSchema as Record<string, unknown>);
  }
}
for (const one of createAsks({} as never).tools(undefined)) {
  listed.set(one.name, one.inputSchema);
}
const pattern = `^${STAMPED_KEY}$`;
listed.set(plain.name, plain.inputSchema);
listed.set(own.name, own.inputSchema);
for (const [name, schema] of listed) {
  const patterns = schema.patternProperties as
    Record<string, unknown> | undefined;
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  expect(
    schema.additionalProperties === false &&
      Object.keys(patterns ?? {}).join() === pattern &&
      !(STAMPED_KEY in properties),
    `${name}'s schema does not refuse unknown keys with ${STAMPED_KEY} admitted by pattern alone: ${JSON.stringify({ additionalProperties: schema.additionalProperties, patternProperties: patterns })}`
  );
}

if (failures.length > 0) {
  console.error(`tool-input-check: ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}
console.log(
  `tool-input-check: tool() refuses unknown keys, admits ${STAMPED_KEY}; ${listed.size} listed tools' schemas say so`
);
