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

/** Every kit states file, as the stage loads it. */
const MODULES = import.meta.glob<StatesFile>(
  "../components/ui/**/*.stories.ts",
  {
    eager: true,
  }
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
  /** Subset of stories to draw when a file holds width-only twins. */
  pick?: string[];
  /** Takes a full row of the board. */
  wide?: boolean;
}

/** One frame of the board: a story, its component and its args. */
interface Frame {
  args: Record<string, unknown>;
  component: Component<Record<string, unknown>>;
  label: string;
  name: string;
}

const WORD_BREAK =
  /(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/gu;

/** A story's export name as words: `IconOnly` reads "Icon only". */
function wordsOf(name: string): string {
  const words = name.replace(WORD_BREAK, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function statesOf(family: Family): { module: StatesFile; source: string } {
  const module = MODULES[`${ROOT}${family.file}`];
  if (!module) {
    throw new Error(`No states file at lib/components/ui/${family.file}`);
  }
  return { module, source: SOURCES[`${ROOT}${family.file}`] ?? "" };
}

/** The frames of a states file, in the order it writes them. */
export function framesOf(family: Family): Frame[] {
  const { module, source } = statesOf(family);
  const meta = module.default;
  const at = (name: string) => source.indexOf(`export const ${name} `);
  return Object.entries(module)
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
}

/** The component's name, the states file's title past its group. */
export function titleOf(family: Family): string {
  const { title } = statesOf(family).module.default;
  return title.slice(title.lastIndexOf("/") + 1);
}

/** The board's core component groups. */
export const GROUPS: { title: string; families: Family[] }[] = [
  {
    title: "Actions and navigation",
    families: [
      { file: "button/button.stories.ts", forced: true },
      { file: "toggle/toggle.stories.ts", forced: true },
      { file: "toggle-group/toggle-group.stories.ts", forced: true },
      { file: "icon-toggle/icon-toggle.stories.ts", forced: true },
      { file: "fluid-tabs/fluid-tabs.stories.ts" },
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
      { file: "skeleton/skeleton.stories.ts" },
      { file: "sonner/sonner.stories.ts", wide: true, fill: true },
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
      { file: "dialog/dialog.stories.ts", wide: true, fill: true },
      { file: "sheet/sheet.stories.ts", wide: true, fill: true },
      { file: "drawer/drawer.stories.ts", fill: true },
      { file: "table/table.stories.ts", wide: true, fill: true },
      { file: "row/row.stories.ts", fill: true },
      { file: "kbd/kbd.stories.ts" },
    ],
  },
];
