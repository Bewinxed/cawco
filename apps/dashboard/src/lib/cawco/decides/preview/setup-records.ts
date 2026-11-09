/**
 * What `GET /api/decides` and `GET /api/delegate-types` answered on the hub
 * at 2026-10-31 18:00 (its models named as @cawco/core/model-names names them), for a member's settings: the harnesses on his online
 * machines with their models (OpenCode's and pi's lists cut to their first
 * dozen; the hub lists 118 and 46), the fleet's skills (12 of its 62), and
 * the Advisor's and Common practice's delegate types. Design reviewer is an
 * agent he added, as Add a member writes it.
 */
import type { DelegateType } from "@cawco/core/delegate-types";
import type { FleetOffer, MemberRecord } from "../decides-client";

export const harnesses: FleetOffer["harnesses"] = [
  {
    id: "claude",
    name: "Claude Code",
    machines: [
      "obelisk-of-light",
      "Omars-MacBook-Pro",
      "niftybot.art",
      "uwucloud",
    ],
    models: [
      { id: "default", name: "Opus 5.5 (default)", default: true },
      { id: "opus", name: "Opus 5.5", default: false },
      {
        id: "claude-fable-5-2[1m]",
        name: "Fable 5.2 (1M context)",
        default: false,
      },
      {
        id: "claude-fable-5-1[1m]",
        name: "Fable 5.1 (1M context)",
        default: false,
      },
      { id: "sonnet", name: "Sonnet 5.5", default: false },
      { id: "haiku", name: "Sonnet 5", default: false },
      { id: "claude-fable-5-2", name: "Fable 5.2", default: false },
      { id: "claude-fable-5-1", name: "Fable 5.1", default: false },
      { id: "claude-opus-4-8", name: "Opus 4.8", default: false },
    ],
  },
  {
    id: "opencode",
    name: "OpenCode",
    machines: ["obelisk-of-light", "Omars-MacBook-Pro"],
    models: [
      { id: "default", name: "Flint 40B Free (default)", default: true },
      { id: "opencode/big-pickle", name: "Big Pickle", default: false },
      { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", default: false },
      {
        id: "openai/gpt-6-luna",
        name: "GPT-6 Luna (via openai)",
        default: false,
      },
      { id: "openai/gpt-6-astra", name: "GPT-6 Astra", default: false },
      { id: "openai/gpt-5.5", name: "GPT-5.5", default: false },
      {
        id: "opencode-go/kimi-k3.1-pro",
        name: "Kimi K3.1 Pro",
        default: false,
      },
      {
        id: "opencode-go/glm-5.3",
        name: "GLM-5.3 (via opencode-go)",
        default: false,
      },
      { id: "opencode-go/qwen3.8-max", name: "Qwen3.8 Max", default: false },
      {
        id: "anthropic/claude-opus-5-5",
        name: "Claude Opus 5.5",
        default: false,
      },
      {
        id: "anthropic/claude-sonnet-5-5",
        name: "Claude Sonnet 5.5",
        default: false,
      },
      {
        id: "litellm/qwen3.8-27b",
        name: "Qwen 3.8 27B (local)",
        default: false,
      },
    ],
  },
  {
    id: "pi",
    name: "pi",
    machines: ["obelisk-of-light", "Omars-MacBook-Pro"],
    models: [
      { id: "default", name: "Claude Opus 5 (default)", default: true },
      {
        id: "anthropic/claude-sonnet-5",
        name: "Claude Sonnet 5",
        default: false,
      },
      {
        id: "anthropic/claude-fable-5",
        name: "Claude Fable 5",
        default: false,
      },
      { id: "openai-codex/gpt-6.1-sol", name: "GPT-6.1 Sol", default: false },
      { id: "opencode-go/glm-5.3", name: "GLM-5.3", default: false },
      { id: "opencode-go/kimi-k3", name: "Kimi K3", default: false },
    ],
  },
];

/** The same fleet with OpenCode on no machine: its tile can't be picked. */
export const harnessesNoOpenCode: FleetOffer["harnesses"] = harnesses.map(
  (offer) => (offer.id === "opencode" ? { ...offer, machines: [] } : offer)
);

export const skills: FleetOffer["skills"] = [
  { id: "HIGAgentSkills", note: "skills:justinwetch/HIGAgentSkills" },
  { id: "animate", note: "skills:emilkowalski/skills@animate" },
  { id: "apple-design", note: "skills:emilkowalski/skills@apple-design" },
  {
    id: "apple-hig-empty-states",
    note: "skills:aka-kika/akakika-skills@apple-hig-empty-states",
  },
  { id: "clean-copy", note: "Cut interface copy that shouldn't exist." },
  { id: "defensive-css", note: "Hardens CSS layouts against hostile content." },
  {
    id: "design-pipeline",
    note: "Run impeccable's pipeline on CawCo's primitives.",
  },
  { id: "humanizer", note: "Remove signs of AI-generated writing from text." },
  { id: "moderncss", note: "Opinionated rules for writing CSS." },
  { id: "security-review", note: "Review the diff for security issues." },
  { id: "tailwind-best-practices", note: "Rules for Tailwind v4 syntax." },
  { id: "writing-for-agents", note: "Writing documents for agents." },
];

export const types: DelegateType[] = [
  {
    name: "advisor",
    description:
      "Advisor on Fable 5.2: a second, stronger opinion on one question, returned as guidance you apply yourself. Use it when an approach is hard to reverse and the evidence leaves it open, or when the same error keeps recurring.",
    harness: "claude",
    model: "claude-fable-5-2",
    effort: "high",
    mayStart: [],
  },
  {
    name: "research",
    description:
      "Web research on Sonnet 5.5: one question answered from many current sources, returned as a cited report where every finding carries its claim and URL.",
    harness: "claude",
    model: "sonnet",
    effort: "medium",
    mayStart: [],
  },
  {
    name: "design-reviewer",
    description:
      "Read DESIGN.md and the screens the card shows. Pick the option that keeps to its tokens and named rules, and name the rule that decided it.",
    harness: "claude",
    model: "opus",
    effort: "high",
    skills: ["defensive-css", "clean-copy"],
    mayStart: [],
  },
  {
    name: "release-checker",
    description:
      "Read the changelog and the last build's checks. Pick the option that ships safely, and say which check decided it.",
    harness: "opencode",
    model: "openai/gpt-6.1-sol",
    effort: "medium",
    mayStart: ["any"],
  },
];

/**
 * Each member's record as `GET /api/decides/members/:id/record` answered at
 * 2026-10-31 17:00: the Advisor has run and settled nothing yet, Common
 * practice decided three he took back. Caw's line is Cawco-Dev's month
 * (`GET /api/projects/:id/spend`); his thread count and newest turn are
 * this change's own figures, which no hub answered yet. Design reviewer is
 * the fixture's agent, its figures a busy month's.
 */
export const records: Record<string, MemberRecord> = {
  advisor: {
    caw: null,
    decided: 0,
    lastAt: null,
    takenBack: 0,
    waiting: 0,
    spendUsd: 8.121_333_5,
  },
  practice: {
    caw: null,
    decided: 3,
    lastAt: "2026-10-31T09:34:10.511Z",
    takenBack: 3,
    waiting: 0,
    spendUsd: 0.241_804_3,
  },
  caw: {
    caw: {
      spendUsd: 97.896_489_4,
      threads: 38,
      lastTurnAt: "2026-10-31T15:12:00.000Z",
    },
    decided: 0,
    lastAt: null,
    takenBack: 0,
    waiting: 0,
    spendUsd: 0,
  },
  "design-reviewer": {
    caw: null,
    decided: 1284,
    lastAt: "2026-10-31T14:02:00.000Z",
    takenBack: 17,
    waiting: 2,
    spendUsd: 1342.5,
  },
};
