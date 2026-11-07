/**
 * Part of `bun run check`: every CawCo tool refuses an argument it does not
 * take (hub mcp-tool.ts `tool`), so a misspelt setting is said to the agent
 * that sent it, never dropped while the agent believes it took effect.
 *
 * 1. `tool()` itself: an unknown key is refused, the refusal naming the key
 *    and every argument the tool takes; the key CawCo's OpenCode plugin
 *    stamps into a call (`STAMPED_KEY`) passes and never reaches the tool's
 *    run; a known key passes; a tool's own input error is its whole answer.
 * 2. No listed tool's schema says `additionalProperties: false`: OpenCode's
 *    input repair deletes every key such a schema does not name, the stamp
 *    among them, so the refusal is the hub's, at the call.
 * 3. An `admin_*` write with an argument it does not take, or one of the
 *    wrong type, is refused at once with the tool's own refusal, and no ask
 *    is recorded for the person; a good one is recorded.
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

expect(
  plain.refusal({ colour: "red", shde: 2 }) ===
    ("refused" in misspelt ? misspelt.refused : undefined),
  "pick_colour's refusal() is not the words its call throws"
);
expect(
  plain.refusal({ colour: "red", [STAMPED_KEY]: {} }) === undefined,
  `pick_colour's refusal() refuses ${STAMPED_KEY}`
);

const { listRoleTools, standIn } =
  await import("../packages/hub/src/role-budgets");
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
for (const [name, schema] of listed) {
  expect(
    schema.additionalProperties !== false,
    `${name}'s schema says additionalProperties: false, so OpenCode's input repair would delete ${STAMPED_KEY}`
  );
}

const asked: Record<string, unknown>[] = [];
const ASKED = "Asked the person.";
const { mcp, rows, close } = standIn({
  credentialActor: () => rows.find((row) => row.id === "worker"),
  askPerson: (_actor, _name, input) => {
    asked.push(input);
    return Promise.resolve(ASKED);
  },
});
const WRITE = "admin_claude_settings_write";
const adminCall = async (args: Record<string, unknown>) => {
  const answer = await mcp.call(null, WRITE, args, "Bearer stand-in");
  const text = answer.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
  return { refused: !!answer.isError, text };
};
const good = { action: "put", name: "env", settings: {}, reason: "A check." };
try {
  const misspeltWrite = await adminCall({ ...good, setings: {} });
  expect(
    misspeltWrite.refused &&
      misspeltWrite.text.includes('"setings"') &&
      misspeltWrite.text.includes(`${WRITE} takes: action,`) &&
      asked.length === 0,
    `${WRITE} with "setings" was not refused at once, or an ask was recorded: ${JSON.stringify({ ...misspeltWrite, asked })}`
  );
  const mistyped = await adminCall({ ...good, name: 5 });
  expect(
    mistyped.refused && mistyped.text.includes("name") && asked.length === 0,
    `${WRITE} with a number for name was not refused at once, or an ask was recorded: ${JSON.stringify({ ...mistyped, asked })}`
  );
  const recorded = await adminCall(good);
  expect(
    !recorded.refused && recorded.text === ASKED && asked.length === 1,
    `${WRITE} with good arguments was not asked of the person: ${JSON.stringify({ ...recorded, asked })}`
  );
} finally {
  close();
}

if (failures.length > 0) {
  console.error(`tool-input-check: ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}
console.log(
  `tool-input-check: tool() refuses unknown keys, admits ${STAMPED_KEY}; ${listed.size} listed tools' schemas leave it to OpenCode; a bad admin write is refused before any ask`
);
