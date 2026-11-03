/**
 * The personal PR team, the person's own test case that fits no template,
 * as the records the hub would hold for it in its first minutes: their
 * words, Caw's first turn, the work he runs while he drafts the setup page,
 * and the stages he drafts. Shaped as the product's types, for the stories
 * of New project, the wait after Send, the board before setup, and the
 * setup page (decision page `onboarding-design`).
 */
import type { Stage } from "@cawco/core/task-views";
import { DAY_MS } from "@cawco/core/time";
import type { Message } from "../types";

/** Their words, as they typed them on the live fleet (2026-11-02). */
export const PR_WORDS =
  "set up a new project to be my personal PR team, you will handle my personal tasks, job hunts, social media and others, visa applications and travel. the aim is to propel me into wealth";

/** The name Caw gives it in his first turn. */
export const PR_NAME = "Your PR team";

/** The stages Caw drafts from their words (no template fits). */
export const PR_STAGES: Stage[] = [
  { name: "inbox", kind: "todo", hooks: {} },
  { name: "researching", kind: "active", hooks: { runs: "researcher" } },
  { name: "drafted", kind: "active", hooks: { runs: "writer" } },
  { name: "your-call", kind: "you", hooks: {} },
  { name: "sent", kind: "waiting", hooks: {} },
  {
    name: "waiting-on-reply",
    kind: "waiting",
    hooks: { after: "7d", afterMs: 7 * DAY_MS },
  },
  { name: "done", kind: "done", hooks: {} },
  { name: "dropped", kind: "dropped", hooks: {} },
];

/** The code template's stages, which stand in today for a project with no stages.md. */
export const CODE_STAGES: Stage[] = [
  { name: "ready", kind: "todo", hooks: {} },
  { name: "working", kind: "active", hooks: {} },
  { name: "review", kind: "you", hooks: {} },
  { name: "done", kind: "done", hooks: {} },
];

const at = (seconds: number): string =>
  new Date(Date.UTC(2026, 10, 2, 6, 29, seconds)).toISOString();

const row = (
  id: string,
  type: Message["type"],
  content: string,
  seconds: number,
  extra: Partial<Message> = {}
): Message => ({
  id,
  instanceId: "pr-team-conversation",
  type,
  content,
  timestamp: at(seconds),
  ...extra,
});

/** Their words, the conversation's first message, read by Caw. */
export const SENT: Message = row("sent", "user", PR_WORDS, 0, {
  state: "read",
});

/** Caw's first words, at about 13 s: what he read, and that a page is coming. */
export const CAW_FIRST: Message = row(
  "caw-first",
  "assistant",
  "A personal PR team: your job search, visa applications and renewals, travel, and a public voice, with every message going out only once you send it. A page is opening to confirm how it runs.",
  13
);

/** What Caw runs between his first words and the page, as the harness reports it. */
export const DRAFTING_TOOLS: Message[] = [
  row("t1", "tool.use", "", 9, {
    toolCallId: "t1",
    metadata: {
      toolName: "mcp__cawco__project_setup",
      toolInput: {},
      toolStatus: "success",
    },
  }),
  row("t2", "tool.use", "", 11, {
    toolCallId: "t2",
    metadata: {
      toolName: "mcp__cawco__project_name",
      toolInput: { name: PR_NAME },
      toolStatus: "success",
    },
  }),
  row("t3", "tool.use", "", 15, {
    toolCallId: "t3",
    metadata: {
      toolName: "Skill",
      toolInput: { skill: "decision-page" },
      toolStatus: "success",
    },
  }),
  row("t4", "tool.use", "", 19, {
    toolCallId: "t4",
    metadata: {
      toolName: "Read",
      toolInput: { file_path: "skills/decision-page/kit/page.html" },
      toolStatus: "success",
    },
  }),
  row("t5", "tool.use", "", 24, {
    toolCallId: "t5",
    metadata: {
      toolName: "Read",
      toolInput: { file_path: "skills/decision-page/RECIPES.md" },
      toolStatus: "success",
    },
  }),
  row("t6", "tool.use", "", 31, {
    toolCallId: "t6",
    metadata: {
      toolName: "mcp__cawco__folder_write",
      toolInput: { path: "decisions/setup/page.html" },
      toolStatus: "pending",
    },
  }),
];

/** Caw's answer once the setup page is sent: what he set up, no paths. */
export const SET_UP: Message = row(
  "set-up",
  "assistant",
  "Your PR team is set up: eight stages from Inbox to Done, a researcher and a writer, and the aim as the project's notes. Tell me the first thing to work on, or add it to Inbox.",
  190
);

/**
 * A question Caw asks while he drafts (the `ask` tool's `question` kind):
 * whether his work waits on it (`blocks`, with what waits) or goes on with
 * his assumption (`meanwhile`), and how it stands.
 */
export interface SetupAsk {
  answered?: string;
  blocks: boolean;
  id: string;
  /** Going on: what he goes ahead with until they answer. */
  meanwhile?: string;
  options: { label: string; recommended?: boolean }[];
  question: string;
  /** An answer came that changes what he had drafted: he is redoing it. */
  redoing?: string;
  /** Blocking: what waits on the answer. */
  waiting?: string;
}

/** The PR team's questions, from their words: what they leave open. */
export const PR_ASKS: SetupAsk[] = [
  {
    id: "visa",
    question: "Is the visa a renewal, or a new application?",
    blocks: true,
    waiting: "drafting the visa stages",
    options: [
      { label: "A renewal" },
      { label: "A new application", recommended: true },
      { label: "Not sure yet" },
    ],
  },
  {
    id: "socials",
    question: "Which accounts does it post from?",
    blocks: false,
    meanwhile: "drafting for LinkedIn and X",
    options: [
      { label: "LinkedIn" },
      { label: "X" },
      { label: "LinkedIn and X", recommended: true },
    ],
  },
  {
    id: "where",
    question: "Where are you job hunting?",
    blocks: false,
    meanwhile: "a researcher who looks at remote roles first",
    options: [
      { label: "Remote", recommended: true },
      { label: "Where I live" },
      { label: "Abroad" },
    ],
  },
];
