/**
 * The owner's own decisions, as the hub kept them on 31 Oct 2026: the pages
 * "Small fleet calls" (asked 09:38), "A project conversation is just a
 * session: your calls" (09:56) and "After the audit" (11:15), with their
 * questions, options, reasons, his picks, his notes and the advisor's
 * settlement word for word. Shown here as they stood before he answered,
 * so the open ones wait and the answered ones are the record.
 */
import type { Decision, Message, Thread } from "./model.js";

const CLAUDE = "Claude Code" as const;
const MACHINE = "obelisk";
const PROJECT = "Cawco-Dev";

/* Small fleet calls, asked 09:38. */

const search: Decision = {
  id: "search",
  question:
    "Exa is out of credits, so agents' web searches fail. Which search do agents use?",
  why: "CLAUDE.md and every research brief name Exa for search, and Monid's search has run in one research pass so far.",
  kind: "tools",
  options: [
    {
      id: "exa",
      label: "Top up Exa",
      line: "Searches work again as they did, with no change to rules or skills.",
      cost: "You pay Exa for every search agents run.",
      recommended: true,
    },
    {
      id: "monid",
      label: "Monid's search by default",
      line: "Searches run through Monid, which agents already use for scraping.",
      cost: "Its search is untried beyond one pass, and every search spends Monid balance.",
      recommended: false,
    },
  ],
};

const connectors: Decision = {
  id: "connectors",
  question:
    "Six claude.ai connectors (ElevenLabs, Microsoft 365, Gmail, BudgetPixel, Drive, Claude Docs) load into every session. Where do they stay?",
  why: "Their tool names take about 4,600 tokens of every session's context, and across every transcript on this machine no CawCo session has called one: the few calls came from Anbar and home-folder sessions.",
  kind: "tools",
  options: [
    {
      id: "keep",
      label: "Keep them everywhere",
      line: "Every agent can mail, edit Office files, make images and voices from any project.",
      cost: "Every CawCo session carries their 4,600 tokens of tool names.",
      recommended: false,
    },
    {
      id: "cawco",
      label: "Deny them in CawCo's project",
      line: "CawCo sessions start lighter, and Anbar and your other projects keep them.",
      cost: "A CawCo agent that needs mail or a voice asks you to turn that connector back on.",
      recommended: true,
    },
    {
      id: "everywhere",
      label: "Deny them in every session",
      line: "Every session on the fleet starts lighter.",
      cost: "Anbar's sessions lose the Gmail and Microsoft 365 tools they have used, until a row turns them back on.",
      recommended: false,
    },
  ],
};

const elevenlabs: Decision = {
  id: "elevenlabs",
  question:
    "The fleet's own ElevenLabs server needs a sign-in and fails to connect in every session, while the claude.ai ElevenLabs connector works. What happens to the fleet's one?",
  why: "The claude.ai connector already gives every session ElevenLabs's speech, image, video and agent tools, so a signed-in fleet copy adds a second set of the same.",
  kind: "tools",
  after: "connectors",
  options: [
    {
      id: "signin",
      label: "Sign in to it",
      line: "The connection error goes away and the fleet holds its own ElevenLabs login.",
      cost: "Sessions carry ElevenLabs's tools twice, once through each door.",
      recommended: false,
    },
    {
      id: "remove",
      label: "Remove it",
      line: "The connection error leaves every session, and ElevenLabs stays through claude.ai.",
      cost: "ElevenLabs then rests on your claude.ai connector alone.",
      recommended: true,
    },
  ],
};

const oldPages: Decision = {
  id: "old-pages",
  question:
    "About 14 of your pages have been replaced by newer pages you picked on, and their pins are answered. What happens to them?",
  why: "Each one only repeats questions a newer page settled, yet its open pins and unsent cards still show beside the live ones.",
  kind: "scope",
  options: [
    {
      id: "leave",
      label: "Leave them",
      line: "Every old page and its threads stay as they are.",
      cost: "Their open pins and unsent cards stay in your lists beside the live ones.",
      recommended: false,
    },
    {
      id: "resolve",
      label: "Resolve their pins, keep the pages",
      line: "Each pin closes with a reply naming the page that replaced it, and the pages stay to look back on.",
      cost: "The old pages still stand in the Decisions tab.",
      recommended: false,
    },
    {
      id: "delete",
      label: "Resolve their pins, then delete the pages",
      line: "Only live pages remain, and each pin's thread names what replaced it before it goes.",
      cost: "An old page's own picks go with it; the newer page holds the current ones.",
      recommended: true,
    },
  ],
};

const advisorNotice: Decision = {
  id: "advisor-notice",
  question:
    "When someone you handed choices to decides one for you, when do you hear about it?",
  why: "In Who decides you hand kinds of choice to others: the advisor takes design calls, and common practice takes tool and setting calls (it decided three on this page today). Yesterday you asked to hear about each of the advisor's answers as it happens, but small calls like today's three are easier to read together when you come back.",
  kind: "behaviour",
  picture: {
    title: "Who decides",
    caption: "Who decides for Cawco-Dev, where each one's tell-me setting goes",
  },
  options: [
    {
      id: "one",
      label: "Right away, for everyone",
      line: "Each time anyone decides something for you, you are told then.",
      cost: "Small calls, like the three common practice decided here today, each reach you one by one.",
      recommended: false,
    },
    {
      id: "member",
      label: "You choose for each one",
      line: "When you add someone to Who decides, you choose: tell me right away, or tell me when I'm back.",
      cost: "One more thing to choose for each one you add.",
      recommended: true,
    },
  ],
};

/* A project conversation is just a session: your calls, asked 09:56. */

export const switchOff: Decision = {
  id: "switchoff",
  question:
    "When you turn Caw off for a project, what happens to work its conversation already started?",
  why: "Since 'events are sends' (ee656789a), work the project's conversation starts counts as yours, so turning the Caw switch off no longer stops it. Before, it did. Attempts the dispatcher started still stop either way.",
  kind: "behaviour",
  options: [
    {
      id: "stop",
      label: "It stops, as before",
      line: "Off means nothing of Caw's keeps running.",
      cost: "Half-done work is cut where it stands.",
      recommended: true,
    },
    {
      id: "finish",
      label: "It finishes; only new events stop reaching Caw",
      line: "Nothing is cut midway.",
      cost: "Work keeps running after you said off.",
      recommended: false,
    },
  ],
};

const nameCaw: Decision = {
  id: "name",
  question: "What happens to the name Caw?",
  why: "From the advisor's re-read of your 10-29 words ('they should NOT be two different things', 'it's just the scope that is different'). Today 'Caw, lead of Cawco-Dev' is a kind of session with its own role. After this, a project conversation is an ordinary session scoped to the project.",
  kind: "scope",
  chosen: ["project"],
  options: [
    {
      id: "agent",
      label: "Caw is the agent's name and face everywhere",
      line: "Every session is Caw. 'Lead' goes, and a project conversation is titled by its first words, like any session.",
      cost: "Nothing marks a project conversation apart except its scope.",
      recommended: true,
    },
    {
      id: "project",
      label: "Caw names only project conversations",
      line: "Sessions on a folder stay unnamed. A conversation scoped to a project is called Caw.",
      cost: "That keeps a second kind in name, which is what you said shouldn't exist.",
      recommended: false,
    },
  ],
};

const mode: Decision = {
  id: "mode",
  question:
    "A conversation the hub starts (from an event, a routine or GitHub) runs unattended. Which permission mode does it get?",
  why: "Your rule: a session's permissions are its harness's own mode. Your note set it in three layers.",
  kind: "behaviour",
  chosen: ["layered"],
  note: "global caw settings -> per project override -> per routine/event override",
  options: [
    {
      id: "layered",
      label:
        "A global Caw setting, overridden per project, then per routine or event",
      line: "Each level picks one of the harness's own modes, and the most specific level wins.",
      cost: "Three places to look when a run behaves unexpectedly; the setting says which level it came from.",
      recommended: true,
    },
    {
      id: "chosen",
      label: "The mode you last chose for that harness on that machine",
      line: "One rule for every session, Full Send included.",
      cost: "An event-started conversation in Full Send runs whatever the event's text steers it to.",
      recommended: false,
    },
    {
      id: "default",
      label: "Always the harness's default (asking) mode",
      line: "Writes started by an event wait for you.",
      cost: "A second rule just for hub-started sessions.",
      recommended: false,
    },
  ],
};

const oldThreads: Decision = {
  id: "old",
  question: "What happens to the existing Caw threads?",
  why: "Threads become sessions. The old thread tables and screens are a second code path.",
  kind: "scope",
  chosen: ["drop"],
  options: [
    {
      id: "drop",
      label: "Drop them",
      line: "The thread tables, routes and screens all go, with no export.",
      cost: "The old threads' history is gone.",
      recommended: true,
    },
    {
      id: "export",
      label: "Export each to the project folder as markdown, then drop them",
      line: "One code path. The history stays readable at assets/threads/*.md.",
      cost: "Old threads are no longer clickable conversations.",
      recommended: false,
    },
    {
      id: "keep",
      label: "Keep them read-only in the app",
      line: "Old threads look as they do today.",
      cost: "The thread screens and tables stay for reading only.",
      recommended: false,
    },
  ],
};

const brief: Decision = {
  id: "brief",
  question:
    "Caw gets an 8,000-character brief prepended to his first message. What replaces it?",
  why: "The tools describe themselves, and the orchestrator memory document already loads for any session that can delegate.",
  kind: "approach",
  chosen: ["none"],
  note: "/writing-for-agents and /designing-skills-and-tools,it should have some kind of context appended to tell itwhere it started and what was the trigger etc andperhaps guidance for each as progressive disclosure read both skills i linked above",
  options: [
    {
      id: "none",
      label:
        "No brief: a context line on each hub message, and one skill per trigger",
      line: "A conversation starts like any session. Each message the hub sends opens with one or two lines: where it started and what triggered it, with a link. Guidance for each trigger kind is a skill whose body loads only when that trigger fires.",
      cost: "The per-trigger skills have to be written and kept current.",
      recommended: true,
    },
    {
      id: "doc",
      label: "A ten-line project memory document",
      line: "A short note scoped to the project: its tools and where its folder is. You can edit it in Settings.",
      cost: "One more document to keep current.",
      recommended: false,
    },
  ],
};

const triage: Decision = {
  id: "triage",
  question:
    "While Jev is off, every Caw wake gets a batch of untriaged tasks appended. Keep it?",
  why: "Events become plain messages to the project's conversation.",
  kind: "behaviour",
  chosen: ["drop"],
  options: [
    {
      id: "drop",
      label: "Drop it",
      line: "Events arrive as their own words. The conversation reads the board with task_read when it needs to.",
      cost: "Untriaged tasks wait for Jev or for someone to ask.",
      recommended: true,
    },
    {
      id: "keep",
      label: "Keep it",
      line: "Untriaged tasks still ride along on each event.",
      cost: "Every event turn re-reads the batch.",
      recommended: false,
    },
  ],
};

const boundarySettlement = {
  by: "advisor" as const,
  name: "Advisor",
  why: "The person already picked \"Like any session: on my checkout\" on the one-session-kind page ten hours ago, the hub gives a boundary only to a work item's workspace and none to any other session, commit f781d438d removed Caw's place boundary, and the 2026-10-14 journey entry records why a mount boundary on a person's own folder was a fight that is now over.",
  sources: [
    "decisions/one-session-kind/page.oui",
    "packages/hub/src/work-items.ts",
    "packages/hub/src/server.ts",
    "JOURNEY.md",
    "PRODUCT.md",
  ],
  at: "2026-10-31T10:04:12Z",
};

const boundary: Decision = {
  id: "boundary",
  question:
    "Should a project conversation on your own checkout run inside a sandbox boundary?",
  why: "A plain session on that folder runs on the host today. You said a single session would do Caw's job better.",
  kind: "rules",
  chosen: ["no"],
  settled: boundarySettlement,
  options: [
    {
      id: "no",
      label: "No, the same as any session on that folder",
      line: "One behaviour for every session.",
      cost: "It can reach anything your user account can, as any session there does.",
      recommended: true,
    },
    {
      id: "yes",
      label: "Yes, sandboxed",
      line: "It can't touch anything outside its place.",
      cost: "It differs from every other session on the same folder.",
      recommended: false,
    },
  ],
};

/* After the audit, asked 11:15. */

export const restart: Decision = {
  id: "restart",
  question:
    "Design work is stopped. How does it restart under the new clean-slate skill?",
  why: "Who decides is the smallest of the four and its design is already picked, popover included, so it shows whether the new skill holds before more is spent.",
  kind: "scope",
  options: [
    {
      id: "one",
      label: "One at a time, Who decides first",
      line: "Each surface starts after you've judged the one before it: Who decides, then the design graph, the decision page and the decision surface.",
      cost: "The last surface reaches you days later.",
      recommended: true,
    },
    {
      id: "all",
      label: "All four now",
      line: "Every stopped surface restarts today, each from its first step on a fresh branch from main.",
      cost: "If the new skill still misses, four runs are spent before you see one.",
      recommended: false,
    },
    {
      id: "wait",
      label: "Not yet",
      line: "Nothing runs until you say so.",
      cost: "No design work moves meanwhile.",
      recommended: false,
    },
  ],
};

const finishedPush: Decision = {
  id: "finished-push",
  question:
    "While you're at your desk but on another chat, does work you asked for reach you when it's done?",
  why: "Today every turn ends silent then, so finished work you asked for shows nowhere until you open its chat.",
  kind: "behaviour",
  options: [
    {
      id: "silent",
      label: "No, it stays silent",
      line: "Nothing reaches you until you come back to the chat.",
      cost: "Work you asked for can sit done and unseen.",
      recommended: false,
    },
    {
      id: "asked",
      label: "Yes, work you asked for",
      line: "Work you asked for ends with its report: it shows under Finished and pushes to your phone; every other turn stays silent.",
      cost: "One push each time something you asked for is done.",
      recommended: true,
    },
  ],
};

/** His note on "All four now", as he wrote it. */
export const AUDIT_NOTE =
  "don't fuck this up bysteering twoards the original design";

/** His words on the connectors question, which picked nothing. */
export const CONNECTORS_WORDS =
  "aren't connectors/mcps handled by caw? remove budget pixel";

/* The threads. */

const auditAsk: Message = {
  kind: "ask",
  id: "audit-ask",
  at: "2026-10-31T11:15:20Z",
  blocking: true,
  topic: "After the audit",
  decisions: [restart, finishedPush],
  waits: [
    "Who decides: its popover build, not started",
    "The design graph: its clean-slate run, not started",
    "The decision page: its clean-slate run, not started",
    "The decision surface: its clean-slate run, not started",
  ],
};

export const audit: Thread = {
  id: "audit",
  session: "Restart the stopped design surfaces",
  harness: CLAUDE,
  machine: MACHINE,
  project: PROJECT,
  doing: "Waiting on you before it restarts any design work",
  standing: "stopped",
  since: "2026-10-31T11:15:20Z",
  open: 2,
  newest:
    "Design work is stopped. How does it restart under the new clean-slate skill?",
  line: "2 asked together · 4 surfaces not started",
  isNew: true,
  messages: [auditAsk],
};

const fleetAsk: Message = {
  kind: "ask",
  id: "fleet-ask",
  at: "2026-10-31T09:38:03Z",
  blocking: true,
  topic: "Small fleet calls",
  decisions: [search, connectors, elevenlabs, oldPages],
  waits: [
    "Research briefs: every web search fails until Exa or Monid is settled",
    "The settings row for Cawco-Dev's connectors, not written",
    "14 replaced pages and their open pins, left as they are",
  ],
};

const fleet: Thread = {
  id: "fleet",
  session: "Tidy the fleet's tools and replaced pages",
  harness: CLAUDE,
  machine: MACHINE,
  project: PROJECT,
  doing: "Waiting on you at step 2 of 5, the search rule",
  standing: "stopped",
  since: "2026-10-31T09:38:03Z",
  open: 4,
  newest:
    "Exa is out of credits, so agents' web searches fail. Which search do agents use?",
  line: "4 asked together · web search failing",
  messages: [fleetAsk],
};

const cawAsk: Message = {
  kind: "ask",
  id: "caw-ask",
  at: "2026-10-31T09:56:50Z",
  blocking: true,
  topic: "A project conversation is just a session",
  decisions: [switchOff, nameCaw, mode, oldThreads, brief, triage, boundary],
  waits: ["Its plan's step 4 of 6: what the Caw switch turns off"],
};

const cawYou: Message = {
  kind: "you",
  id: "caw-you",
  at: "2026-10-31T10:21:40Z",
  picks: [
    {
      question: nameCaw.question,
      label: "Caw names only project conversations",
    },
    {
      question: mode.question,
      label:
        "A global Caw setting, overridden per project, then per routine or event",
    },
    { question: oldThreads.question, label: "Drop them" },
    {
      question: brief.question,
      label:
        "No brief: a context line on each hub message, and one skill per trigger",
    },
    { question: triage.question, label: "Drop it" },
  ],
  note: brief.note,
};

export const caw: Thread = {
  id: "caw",
  session: "Make a project conversation an ordinary session",
  harness: CLAUDE,
  machine: MACHINE,
  project: PROJECT,
  doing: "Stopped at step 4 of 6, the Caw switch",
  standing: "stopped",
  since: "2026-10-31T10:22:05Z",
  open: 1,
  newest: switchOff.question,
  line: "1 of 7 still open · 5 picked, 1 settled for you",
  messages: [
    cawAsk,
    {
      kind: "settled",
      id: "caw-settled",
      at: boundarySettlement.at,
      decision: boundary,
      settlement: boundarySettlement,
    },
    cawYou,
    {
      kind: "agent",
      id: "caw-agent",
      at: "2026-10-31T10:22:05Z",
      text: "Resumed with your five picks and the advisor's. One is still open: what turning Caw off does to work its conversation already started. Step 4 waits on it.",
    },
  ],
};

/** The same session after it ended with the switch never picked. */
export const cawEnded: Thread = {
  ...caw,
  standing: "ended",
  doing: "Ended at 13:40",
  since: "2026-10-31T13:40:00Z",
  line: "Ended · 1 never picked · Caw takes it",
  messages: [
    ...caw.messages,
    {
      kind: "ended",
      id: "caw-ended",
      at: "2026-10-31T13:40:00Z",
      neverPicked: [switchOff.question],
      takenBy: "Caw, Cawco-Dev's conversation,",
    },
  ],
};

const notice: Thread = {
  id: "notice",
  session: "Settle how advisors report back",
  harness: CLAUDE,
  machine: MACHINE,
  project: PROJECT,
  doing: "Working on Who decides' members list",
  standing: "ahead",
  since: "2026-10-31T09:38:03Z",
  open: 0,
  newest: advisorNotice.question,
  line: "Went ahead on Right away, for everyone",
  messages: [
    {
      kind: "ahead",
      id: "notice-ahead",
      at: "2026-10-31T09:38:03Z",
      decision: advisorNotice,
      chosen: "one",
      since: "Nothing built on it yet: it keeps yesterday's pick",
    },
  ],
};

const advisor: Thread = {
  id: "advisor",
  session: "Advisor",
  harness: CLAUDE,
  machine: MACHINE,
  project: PROJECT,
  doing: "Settles rules and approach calls for Cawco-Dev",
  standing: "quiet",
  since: boundarySettlement.at,
  open: 0,
  newest: boundary.question,
  line: "Settled 1 for you today",
  messages: [
    {
      kind: "settled",
      id: "advisor-settled",
      at: boundarySettlement.at,
      decision: boundary,
      settlement: boundarySettlement,
    },
  ],
};

/** The open list: what stops work, then what went ahead. */
export const OPEN: Thread[] = [fleet, caw, audit, notice];

/** Every thread, quiet ones too. */
export const ALL: Thread[] = [fleet, caw, audit, notice, advisor];

/** The figures over the list. Permission asks stay in their sessions. */
export const STRIP = { stopping: 7, sessions: 3, ahead: 1, permissions: 2 };

/** A decided record, as search finds it. */
export interface Found {
  at: string;
  by: string;
  chosen: string;
  id: string;
  kind: string;
  note?: string;
  project: string;
  question: string;
  session: string;
  thread: string;
}

const found = (d: Decision, chosen: string, by: string, at: string): Found => ({
  id: d.id,
  at,
  question: d.question,
  chosen,
  by,
  note: d.note,
  thread: "caw",
  session: caw.session,
  project: PROJECT,
  kind: d.kind ?? "yours",
});

/** Every decided record of the day. */
export const DECIDED: Found[] = [
  found(
    nameCaw,
    "Caw names only project conversations",
    "You",
    "2026-10-31T10:21:40Z"
  ),
  found(
    mode,
    "A global Caw setting, overridden per project, then per routine or event",
    "You",
    "2026-10-31T10:21:40Z"
  ),
  found(oldThreads, "Drop them", "You", "2026-10-31T10:21:40Z"),
  found(
    brief,
    "No brief: a context line on each hub message, and one skill per trigger",
    "You",
    "2026-10-31T10:21:40Z"
  ),
  found(triage, "Drop it", "You", "2026-10-31T10:21:40Z"),
  found(
    boundary,
    "No, the same as any session on that folder",
    "Advisor",
    boundarySettlement.at
  ),
];
