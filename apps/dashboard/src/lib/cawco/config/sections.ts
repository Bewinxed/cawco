import type { Component } from "svelte";
import {
  IconBolt,
  IconBook,
  IconCpu,
  IconDollar,
  IconDownload,
  IconHook,
  IconPhone,
  IconRules,
  IconSubagent,
  IconSubagents,
  IconTerminal,
  IconToolMcp,
} from "#lib/icons.js";

/** One entry of the Configure rail: where it lives and what it is for. */
export interface ConfigSection {
  /** It lists rows the rail counts beside its name; a setting has no count. */
  counted: boolean;
  group: string;
  hue: string;
  icon: Component;
  label: string;
  /** The one line under the section's title. */
  purpose: string;
  slug: SectionSlug;
}

export type SectionSlug =
  | "rules"
  | "hooks"
  | "delegate-types"
  | "subagents"
  | "cli-tools"
  | "mcp"
  | "skills"
  | "memory"
  | "models"
  | "phone"
  | "spend"
  | "updates";

export const SECTIONS: ConfigSection[] = [
  {
    slug: "rules",
    counted: true,
    group: "Automation",
    label: "Rules",
    purpose: "What CawCo answers when a session says something",
    icon: IconRules,
    hue: "var(--hue-green-500)",
  },
  {
    slug: "hooks",
    counted: true,
    group: "Automation",
    label: "Hooks",
    purpose: "Scripts each machine runs at a session's lifecycle events",
    icon: IconHook,
    hue: "var(--hue-cyan-500)",
  },
  {
    slug: "delegate-types",
    counted: true,
    group: "Agents",
    label: "Delegate types",
    purpose: "Presets a session's delegate call picks from",
    icon: IconSubagents,
    hue: "var(--hue-blue-500)",
  },
  {
    slug: "subagents",
    counted: true,
    group: "Agents",
    label: "Subagents",
    purpose: "Agent files written to ~/.claude/agents on every machine",
    icon: IconSubagent,
    hue: "var(--hue-orange-500)",
  },
  {
    slug: "cli-tools",
    counted: true,
    group: "Tools",
    label: "Command-line tools",
    purpose: "CLIs each machine must have",
    icon: IconTerminal,
    hue: "var(--hue-green-600)",
  },
  {
    slug: "mcp",
    counted: true,
    group: "Tools",
    label: "MCP servers",
    purpose: "Servers written to every machine",
    icon: IconToolMcp,
    hue: "var(--hue-cyan-400)",
  },
  {
    slug: "skills",
    counted: true,
    group: "Tools",
    label: "Skills & plugins",
    purpose: "Skills, plugins and marketplaces",
    icon: IconBolt,
    hue: "var(--hue-amber-500)",
  },
  {
    slug: "memory",
    counted: true,
    group: "Memory",
    label: "Memory files",
    purpose: "CLAUDE.md and the model documents",
    icon: IconBook,
    hue: "var(--hue-blue-600)",
  },
  {
    slug: "models",
    counted: false,
    group: "Hub",
    label: "Models CawCo uses",
    purpose: "OpenRouter and the supervisor server",
    icon: IconCpu,
    hue: "var(--hue-orange-500)",
  },
  {
    slug: "spend",
    counted: false,
    group: "Hub",
    label: "Spend",
    purpose: "Project budgets",
    icon: IconDollar,
    hue: "var(--hue-amber-500)",
  },
  {
    slug: "phone",
    counted: false,
    group: "Hub",
    label: "Phone",
    purpose: "Pushes to the CawCo app when something needs you",
    icon: IconPhone,
    hue: "var(--hue-green-500)",
  },
  {
    slug: "updates",
    counted: false,
    group: "Hub",
    label: "Updates",
    purpose: "The builds your machines run, and when they install them",
    icon: IconDownload,
    hue: "var(--hue-blue-500)",
  },
];

export const sectionOf = (slug: SectionSlug): ConfigSection =>
  SECTIONS.find((section) => section.slug === slug) as ConfigSection;

/** The rail's groups, in order, each with its sections. */
export const GROUPS = [
  ...new Set(SECTIONS.map((section) => section.group)),
].map((group) => ({
  group,
  sections: SECTIONS.filter((section) => section.group === group),
}));

/** Where the Configure sidebar link goes: the section last opened. */
export const LAST_KEY = "cawco.config.last";
