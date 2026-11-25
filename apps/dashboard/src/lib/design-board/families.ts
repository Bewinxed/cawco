/**
 * The core kit components the board presents, each read from its states file
 * beside the component (`lib/components/ui`). States are written once in their
 * stories file so the board and the design graph draw the same thing.
 */
import type { Component } from "svelte";

/** A story as a states file writes it (CSF 3): what the board reads of it. */
interface Story {
  args?: Record<string, unknown>;
  component?: Component<Record<string, unknown>>;
}

/** An export of a states file as the story it is. */
function storyOf(value: unknown): Story {
  return typeof value === "object" && value !== null ? value : {};
}

/** A states file's module: its meta and its stories. */
type StatesFile = Record<string, unknown> & {
  default: {
    args?: Record<string, unknown>;
    component: Component<Record<string, unknown>>;
    title: string;
  };
};

const ROOT = "../components/ui/";

/**
 * Every kit states file, loaded with the board: a section is drawn in the
 * frame it mounts in, as the stage reads it (loaded on demand, a section
 * drew empty in the stage's sweep until its file arrived).
 */
const MODULES = import.meta.glob<StatesFile>(
  "../components/ui/**/*.stories.ts",
  { eager: true }
);
/** Every kit states file's own text: its exports in declaration order. */
const SOURCES = import.meta.glob<string>("../components/ui/**/*.stories.ts", {
  eager: true,
  import: "default",
  query: "?raw",
});

export interface Family {
  /** The component's states file, from lib/components/ui. */
  file: string;
  /** Each frame takes its pane's full width (a dialog, sheet, or table). */
  fill?: boolean;
  /** Hover, focus and press are drawn beside its first story. */
  forced?: boolean;
  /** The stories the section draws, where it shows fewer than its states file holds. */
  pick?: string[];
}

/** One frame of a section: a story, its component and its args. */
interface Frame {
  args: Record<string, unknown>;
  component: Component<Record<string, unknown>>;
  label: string;
  name: string;
}

/** A family's section as drawn: its component's name and its frames. */
export interface Card {
  family: Family;
  frames: Frame[];
  title: string;
}

const WORD_BREAK =
  /(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/gu;

/** A story's export name as words: `IconOnly` reads "Icon only". */
function wordsOf(name: string): string {
  const words = name.replace(WORD_BREAK, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A family's section: the component's name (the states file's title past
 * its group) and the frames of its stories, in the order the file writes
 * them.
 */
export function cardOf(family: Family): Card {
  const module = MODULES[`${ROOT}${family.file}`];
  if (!module) {
    throw new Error(`No states file at lib/components/ui/${family.file}`);
  }
  const source = SOURCES[`${ROOT}${family.file}`] ?? "";
  const meta = module.default;
  const at = (name: string) => source.indexOf(`export const ${name} `);
  const frames = Object.entries(module)
    .filter(([name]) => name !== "default")
    .filter(([name]) => !family.pick || family.pick.includes(name))
    .sort(([a], [b]) => at(a) - at(b))
    .map(([name, value]) => {
      const story = storyOf(value);
      return {
        name,
        label: wordsOf(name),
        component: story.component ?? meta.component,
        args: { ...meta.args, ...story.args },
      };
    });
  return {
    family,
    frames,
    title: meta.title.slice(meta.title.lastIndexOf("/") + 1),
  };
}

/** The kit's sections, by the group the design graph lists them under. */
export const GROUPS: { title: string; families: Family[] }[] = [
  {
    title: "Actions and navigation",
    families: [
      { file: "button/button.stories.ts", forced: true },
      { file: "toggle/toggle.stories.ts", forced: true },
      { file: "toggle-group/toggle-group.stories.ts", forced: true },
      { file: "icon-toggle/icon-toggle.stories.ts", forced: true },
      { file: "tabs/tabs.stories.ts", forced: true },
    ],
  },
  {
    title: "Inputs and picks",
    families: [
      { file: "input/input.stories.ts", forced: true },
      { file: "input-group/input-group.stories.ts" },
      { file: "textarea/textarea.stories.ts" },
      { file: "checkbox/checkbox.stories.ts", forced: true },
      { file: "switch/switch.stories.ts", forced: true },
      { file: "select/select.stories.ts" },
      { file: "option-group/option-group.stories.ts" },
    ],
  },
  {
    title: "Status and feedback",
    families: [
      { file: "badge/badge.stories.ts" },
      { file: "alert/alert.stories.ts" },
      { file: "live-dot/live-dot.stories.ts" },
      { file: "spinner/spinner.stories.ts" },
      { file: "progress/progress.stories.ts" },
      {
        file: "skeleton/skeleton.stories.ts",
        pick: ["ListWaiting", "CardWaiting"],
      },
      { file: "sonner/sonner.stories.ts", fill: true },
      { file: "empty/empty-state.stories.ts" },
    ],
  },
  {
    title: "Surfaces and structure",
    families: [
      { file: "popover/popover.stories.ts" },
      { file: "dropdown-menu/dropdown-menu.stories.ts" },
      { file: "tooltip/tooltip.stories.ts", fill: true },
      { file: "command/command.stories.ts" },
      { file: "dialog/dialog.stories.ts", fill: true },
      { file: "sheet/sheet.stories.ts", fill: true },
      { file: "drawer/drawer.stories.ts", fill: true },
      { file: "table/table.stories.ts", fill: true },
      { file: "row/row.stories.ts", fill: true },
      { file: "kbd/kbd.stories.ts" },
    ],
  },
];
