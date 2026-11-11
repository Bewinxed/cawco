/**
 * Configure › Delegate types › a type's editor (Component Story Format 3,
 * live components): what its sessions start with, in the reach section
 * beside its skills, denied tools and the types it may start. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import type { DelegateType } from "@cawco/core/delegate-types";
import DelegateTypeEditorStage from "./DelegateTypeEditorStage.svelte";

const build: DelegateType = {
  name: "build",
  description:
    "Implements a scoped change across the dashboard and hub: edits, runs the checks, commits. Hand it a brief with the files it owns and the commands that prove it.",
  harness: "claude",
  model: "claude-opus-5-5",
  effort: "high",
  skills: ["svelte-foundations:coding", "svelte-house-rules"],
  mayStart: ["browser", "advisor"],
};

const designSkills = [
  "svelte-foundations:coding",
  "svelte-house-rules",
  "frontend-design",
  "component-canvas",
  "design-explore",
  "decision-page",
  "show",
  "clean-copy",
  "defensive-css",
  "moderncss",
  "tailwind-best-practices",
  "interfaces:better-layout",
  "interfaces:better-typography",
  "interfaces:better-accessibility",
  "impeccable:impeccable",
  "ui-observer",
  "clearshot",
  "make-interfaces-feel-better",
  "animation-performance",
  "code-foundations:debug",
];

export default {
  title: "Configure/Delegate type editor",
  component: DelegateTypeEditorStage,
  args: {
    type: build,
    taken: ["advisor", "browser", "design", "research"],
  },
};

/** A design delegate that starts with twenty skills and four servers. */
export const StartingSet = {
  args: {
    type: {
      ...build,
      name: "design",
      startingSet: {
        skills: designSkills,
        servers: ["context7", "chrome-devtools", "crw", "mobbin-web"],
      },
    },
    taken: ["advisor", "browser", "build", "research"],
  },
};

/** No starting set: its sessions start with everything installed. */
export const NoSet = { args: {} };

/** Two skills typed without a comma between them, and a blank server between two commas: neither saves. */
export const RunTogether = {
  args: {
    type: {
      ...build,
      startingSet: {
        skills: ["frontend-design", "component-canvas show", "clean-copy"],
        servers: ["context7", "", "crw"],
      },
    },
    left: ["type-start-skills", "type-start-servers"],
  },
};
