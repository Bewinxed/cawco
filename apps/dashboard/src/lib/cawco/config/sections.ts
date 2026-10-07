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
    group: "Automation",
    label: "Rules",
    purpose: "What CawCo answers when a session says something",
    icon: IconRules,
    hue: "var(--hue-green-500)",
  },
  {
    slug: "hooks",
    group: "Automation",
    label: "Hooks",
    purpose: "Scripts each machine runs at a session's lifecycle events",
    icon: IconHook,
    hue: "var(--hue-cyan-500)",
  },
  {
    slug: "delegate-types",
    group: "Agents",
    label: "Delegate types",
    purpose: "Presets a session's delegate call picks from",
    icon: IconSubagents,
    hue: "var(--hue-blue-500)",
  },
  {
    slug: "subagents",
    group: "Agents",
    label: "Subagents",
    purpose: "Agent files written to ~/.claude/agents on every machine",
    icon: IconSubagent,
    hue: "var(--hue-orange-500)",
  },
  {
    slug: "cli-tools",
    group: "Tools",
    label: "Command-line tools",
    purpose: "CLIs each machine must have",
    icon: IconTerminal,
    hue: "var(--hue-green-600)",
  },
  {
    slug: "mcp",
    group: "Tools",
    label: "MCP servers",
    purpose: "Servers written to every machine",
    icon: IconToolMcp,
    hue: "var(--hue-cyan-400)",
  },
  {
    slug: "skills",
    group: "Tools",
    label: "Skills & plugins",
    purpose: "Skills, plugins and marketplaces",
    icon: IconBolt,
    hue: "var(--hue-amber-500)",
  },
  {
    slug: "memory",
    group: "Memory",
    label: "Memory files",
    purpose: "CLAUDE.md and the model documents",
    icon: IconBook,
    hue: "var(--hue-blue-600)",
  },
  {
    slug: "models",
    group: "Hub",
    label: "Models CawCo uses",
    purpose: "OpenRouter and the supervisor server",
    icon: IconCpu,
    hue: "var(--hue-orange-500)",
  },
  {
    slug: "spend",
    group: "Hub",
    label: "Spend",
    purpose: "What a project's budget does once it is reached",
    icon: IconDollar,
    hue: "var(--hue-amber-500)",
  },
  {
    slug: "phone",
    group: "Hub",
    label: "Phone",
    purpose: "Pushes to the CawCo app when something needs you",
    icon: IconPhone,
    hue: "var(--hue-green-500)",
  },
  {
    slug: "updates",
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
