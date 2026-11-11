/**
 * A block an agent drew in its reply (tsk-330), inside the reply's words,
 * in each situation the person meets it. The record is this project's own:
 * the orchestrator's reply on inline generative UI prior art (2026-11-11),
 * whose table arrived as markdown. Its first version listed Slack and
 * Telegram; the owner asked why, and the redrawn table left them out.
 *
 * The media stories name their files as an agent does, a path in the
 * project's folder or on its machine, each served here from beside this
 * file (block-fixtures/): canvas captures of this block, the phone app's
 * paywall story, and a narration made with ElevenLabs for this story.
 */
import cawTap from "./block-fixtures/caw-tap.webp?url";
import mergeChecksPage from "./block-fixtures/merge-checks.html?raw";
import paywallStory from "./block-fixtures/paywall-story.mp4?url";
import releaseNarration from "./block-fixtures/release-narration.mp3?url";
import replyWriting from "./block-fixtures/reply-writing.png?url";
import replyWritten from "./block-fixtures/reply-written.png?url";
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

/** A chart the agent drew with no size: it fits the reply's words. */
export const Chart = {
  args: {
    name: "Delegated spend",
    asked: "what did delegated work cost over the last four weeks?",
    before: "Spend per week, from the hub's records:",
    after: "Week four's rise is the design runs, which ran with no cap.",
    source: `root = Column([chart])
chart = Diagram("xychart-beta\\ntitle \\"Spend per week\\"\\nx-axis [W1, W2, W3, W4]\\ny-axis \\"USD\\"\\nbar [42, 58, 37, 61]", "Hub records, last four weeks")`,
  },
};

/** A small pie beside the words, its legend beside it: a glance at where the week went. */
export const SmallChart = {
  args: {
    name: "Where the week went",
    asked: "where did this week's agent time go?",
    before: "Most of it went to design, as you asked:",
    after:
      "Review stayed small because the merge checks caught the two failures before anyone read them.",
    source: `root = Column([chart])
chart = Diagram("pie title Hours by kind\\n\\"Design\\" : 42\\n\\"Build\\" : 31\\n\\"Review\\" : 12\\n\\"Research\\" : 9", "Session records, this week", "small")`,
  },
};

/** A medium line chart of twelve weeks, read at the reply's measure. */
export const MediumChart = {
  args: {
    name: "Merged per week",
    asked: "is the fleet landing more work than it did in the summer?",
    before: "Yes. Merged changes per week since August, every machine counted:",
    after:
      "The dip in week seven is the hub migration, when merges were held for two days.",
    source: `root = Column([chart])
chart = Diagram("xychart-beta\\ntitle \\"Merged changes per week\\"\\nx-axis [W1, W2, W3, W4, W5, W6, W7, W8, W9, W10, W11, W12]\\ny-axis \\"Merged\\"\\nline [18, 22, 21, 27, 31, 30, 14, 33, 38, 41, 39, 46]", "August to November", "medium")`,
  },
};

/** A timeline drawn full: the reply takes the turn's width for it. */
export const FullDiagram = {
  args: {
    name: "Inline blocks timeline",
    asked: "how long did inline blocks take, end to end?",
    before: "Nine working days from the pitch to main:",
    after: "The build ran two pieces side by side, which saved two days.",
    source: `root = Column([plan])
plan = Diagram("gantt\\ntitle Inline blocks, pitch to main\\ndateFormat YYYY-MM-DD\\nsection Shape\\nPitch drawn :a1, 2026-11-02, 2d\\nOwner picks :a2, after a1, 1d\\nsection Build\\nLibrary and prompt :b1, after a2, 2d\\nTranscript block :b2, after a2, 3d\\nKeep as artifact :b3, after b2, 2d\\nsection Land\\nMerge checks :c1, after b3, 1d\\nShipped :milestone, after c1, 0d", "Session records, November", "full")`,
  },
};

/** A long flow the agent wrote top to bottom, so it fits the reply's column. */
export const LongFlow = {
  args: {
    name: "How a delegate lands",
    asked: "walk me through what happens between delegate and main",
    before: "From the brief to main, with every place it can come back:",
    after:
      "A failed check or a conflict goes back to the same session, which fixes and finishes again.",
    source: `root = Column([flow])
flow = Diagram("---\\ntitle: A delegate's path to main\\n---\\nflowchart TB\\nA[Brief] --> B[Workspace cut]\\nB --> C[Session reads the code]\\nC --> D[Edits and commits]\\nD --> E[finish_item]\\nE --> F[Rebase onto main]\\nF --> G{Merge checks}\\nG -->|pass| H[Pushed to main]\\nG -->|fail| I[Back to the session]\\nF -->|conflict| I\\nI --> D\\nH --> J[Report to parent]")`,
  },
};

/** A short flow written left to right: on a phone it turns top to bottom. */
export const ShortFlow = {
  args: {
    name: "Delegate in four steps",
    asked: "what's the short version?",
    before: "Four steps, each waiting on the one before:",
    after: "Everything else is a way back into the second step.",
    source: `root = Column([flow])
flow = Diagram("flowchart LR\\nA[Brief] --> B[Delegate works] --> C[Merge checks] --> D[Main]")`,
  },
};

/** The merge-checks page as its own document, as a page artifact stands at its own address. */
const mergeChecks = URL.createObjectURL(
  new Blob([mergeChecksPage], { type: "text/html" })
);

/** Where the media stories' files sit in the project's folder, as a delegate's outputs land there. */
const ASSETS = "assets/4a0d95d4";
const FILES = {
  [`${ASSETS}/reply-writing.png`]: replyWriting,
  [`${ASSETS}/reply-written.png`]: replyWritten,
  "/home/ana/.cawco/shots/caw-tap.webp": cawTap,
  [`${ASSETS}/paywall-story.mp4`]: paywallStory,
  [`${ASSETS}/release-narration.mp3`]: releaseNarration,
};

/** Two screenshots side by side: the reply while the agent wrote it, and once it was written. */
export const BeforeAndAfter = {
  args: {
    name: "Streaming the table",
    asked: "show me what the table looks like while you're still writing it",
    before: "Two captures of the same reply, a second apart:",
    after:
      "The head and the rows it has stand at once; nothing moves as the rest arrive.",
    files: FILES,
    source: `root = Column([pair])
pair = Row([writing, written])
writing = Image("${ASSETS}/reply-writing.png", "The reply mid-stream: the table's head and its first three rows", "Before: three rows in")
written = Image("${ASSETS}/reply-written.png", "The same reply written: all eight rows of the table", "After: all eight rows")`,
  },
};

/** An animated picture that plays as it is: Caw's tap, looping beside the words. */
export const AnimatedPicture = {
  args: {
    name: "Caw's tap",
    asked: "what does the phone app's first screen do before the paywall?",
    before: "Caw walks in and taps the phone, on a loop:",
    after: "It runs once on first launch, then the paywall's words come up.",
    files: FILES,
    source: `root = Column([tap])
tap = Image("/home/ana/.cawco/shots/caw-tap.webp", "Caw walking up to a phone on a desk and tapping its screen", "The first 3.6 seconds, looped", "small")`,
  },
};

/** A clip in the platform's player, its frames loaded only once it plays. */
export const Video = {
  args: {
    name: "Paywall story",
    asked: "send me the paywall story as it ships",
    before: "The ten-second story the paywall opens on, as the app ships it:",
    after:
      "It's 160 KB at this size; the app carries the full 1024 by 1536 cut.",
    files: FILES,
    source: `root = Column([clip])
clip = Video("${ASSETS}/paywall-story.mp4", "Paywall story, 10.8 seconds, no sound", "small")`,
  },
};

/** Narration from a text-to-speech tool, in the platform's player with its caption. */
export const Narration = {
  args: {
    name: "Release narration",
    asked: "read this week's release note aloud for the changelog video",
    before: "Here's the narration, made with ElevenLabs in the Alice voice:",
    after: "If the pace is right, I'll lay it under the changelog video.",
    files: FILES,
    source: `root = Column([voice])
voice = Audio("${ASSETS}/release-narration.mp3", "This week in CawCo, 11.8 seconds, Alice voice")`,
  },
};

/** A slideshow of four steps, one at a time, with its arrows and count. */
export const Slideshow = {
  args: {
    name: "How a delegate lands",
    asked: "walk me through what a delegate does after it finishes",
    before: "Four steps, one per slide:",
    after: "A failed check or a conflict sends it back to the second step.",
    source: `root = Column([steps])
steps = Slides([brief, work, checks, main], "From a delegate's finish to main")
brief = Column([Text("1. Finish", "title"), Text("The delegate calls finish_item with its report and its proof: each command it ran, with the output."), Badge("Report written", "done")])
work = Column([Text("2. Rebase", "title"), Text("The hub rebases its commits onto main. A conflict goes straight back to the same session, which fixes it and finishes again."), Badge("Rebased onto main", "done")])
checks = Column([Text("3. Merge checks", "title"), Text("The checks the project's gate names run on the rebased branch: types, lint, the house checks and formatting."), Row([StatTile("Passed", 3, "done"), StatTile("Running", 1, "live")])])
main = Column([Text("4. Main", "title"), Text("Once every check passes the hub pushes to main and the parent reads the report."), Badge("Pushed", "done")])`,
  },
};

/** An HTML page the agent made as an artifact, live in the reply: its bars fill as the checks run. */
export const LivePage = {
  args: {
    name: "Merge checks",
    asked: "can you show the merge checks as they'd look running?",
    before: "I made it as a page; here it is live:",
    after: "Each bar is one check, at the time it took on the last run.",
    pages: [
      {
        name: "merge-checks-live",
        title: "Merge checks, live",
        src: mergeChecks,
      },
    ],
    source: `root = Column([page])
page = Preview("merge-checks-live", "Last run's times, looped")`,
  },
};
