/**
 * A block an agent drew in its reply (tsk-330), inside the reply's words,
 * in each situation the person meets it. The record is this project's own:
 * the orchestrator's reply on inline generative UI prior art (2026-11-11),
 * whose table arrived as markdown. Its first version listed Slack and
 * Telegram; the owner asked why, and the redrawn table left them out.
 */
import InlineBlockReply from "./InlineBlockReply.svelte";

/** A product's maturity is a fact, not a CawCo status: its badge is neutral (The Reserved Hue Rule). */
type Status = [string, string];
const product = (
  name: string,
  decides: string,
  where: string,
  [status]: Status
) =>
  `[${JSON.stringify(name)}, ${JSON.stringify(decides)}, ${JSON.stringify(where)}, Badge(${JSON.stringify(status)})]`;

const COMPOSED = [
  product(
    "ChatGPT Apps SDK",
    "A tool call",
    "Inline card; fullscreen for bigger work",
    ["Live", "done"]
  ),
  product(
    "Claude.ai custom visuals",
    "The model writes it",
    "Inline and temporary; artifacts in the panel",
    ["Beta", "attn"]
  ),
  product("MCP Apps", "A tool call", "The host's choice, inline in most", [
    "Stable",
    "done",
  ]),
  product("Gemini dynamic view", "The model writes code", "In the response", [
    "Experiment",
    "attn",
  ]),
  product(
    "OpenUI / Thesys C1",
    "The model, over your components",
    "In the transcript, streamed",
    ["Live", "done"]
  ),
  product("Google A2UI", "The model, from a catalog", "The host's surface", [
    "v1.0",
    "neutral",
  ]),
  product("Vercel AI SDK streamUI", "A tool call", "Inline", [
    "Not recommended",
    "fail",
  ]),
  product(
    "Cursor canvases",
    "The model",
    "A durable artifact beside the chat",
    ["Live", "done"]
  ),
];
const FIXED = [
  product("Slack Block Kit", "A tool call", "In the message", ["Live", "done"]),
  product("Telegram inline keyboards", "A tool call", "Under the message", [
    "Live",
    "done",
  ]),
];

const table = (rows: string[]) => `root = Column([prior])
prior = Table(["Product", "Who decides", "Where it shows", "Status"], [${rows.join(", ")}])`;

export default {
  title: "Transcript/Inline block",
  component: InlineBlockReply,
  args: {
    name: "Inline UI prior art",
    asked:
      "why would we refer to telegram or slack's inline buttons in this conversation?",
    before:
      "We shouldn't. Telegram's and Slack's buttons are fixed controls a developer wires to a bot's message: no model decides what appears. Here are the ones where a model composes the UI:",
    after:
      "Taking Telegram and Slack out doesn't change the recommendation. The case for display-only blocks rests on generated-UI products too.",
    source: table(COMPOSED),
  },
};

/** The agent's comparison, drawn in its reply instead of a markdown table. */
export const Latest = {};

/** The agent is still writing its reply: the table's head first, the rows filling in. */
export const Writing = {
  args: {
    source: table(COMPOSED.slice(0, 3)),
    streaming: true,
    after: "",
  },
};

/** Scrolled up to the first version, which still listed Slack and Telegram. */
export const Updated = {
  args: {
    asked:
      "how have others implemented this and are there existing implementations? and what can we learn from their experience",
    before:
      "The research covers about 25 products and protocols. What exists, by who decides the UI appears:",
    after:
      "Products have tried three ways of deciding what UI shows up in a chat. Most real use runs on a tool call showing a fixed component.",
    source: table([...COMPOSED, ...FIXED]),
    mode: "fossil",
  },
};

/** The comparison moved into an artifact, which the agent keeps editing in the panel. */
export const MovedToArtifact = {
  args: {
    mode: "promoted",
    artifact: { title: "Inline UI prior art" },
    after: "",
  },
};

/** A chart the agent drew: a Mermaid bar chart through Pele, in its well. */
export const Chart = {
  args: {
    name: "Delegated spend",
    asked: "what did delegated work cost over the last four weeks?",
    before: "Spend per week, from the hub's records:",
    after: "Week four's rise is the design runs, which ran with no cap.",
    source: `root = Column([chart])
chart = Diagram("xychart-beta\\ntitle \\"Spend per week\\"\\nx-axis [W1, W2, W3, W4]\\ny-axis \\"USD\\"\\nbar [42, 58, 37, 61]", "Delegated work, last four weeks")`,
  },
};
