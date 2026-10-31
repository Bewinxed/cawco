/**
 * The component under review as the design graph's own model reads it
 * (core `graphOf`): the same section, groups and links the branch's
 * StateGraph draws, so a structure's map is the graph code itself.
 */
import {
  type GraphSection,
  graphOf,
  type StagePoint,
} from "@cawco/core/design-graph";
import { COMPONENT_NAME, LINKS, STATES } from "./review.svelte";

export const FILE = "apps/dashboard/src/lib/cawco/tasks/TaskColumn.stories.ts";

const SECTION: GraphSection = {
  file: FILE,
  name: COMPONENT_NAME,
  state: "drawn",
  stories: STATES.map((one) => ({
    name: one.story,
    from: one.from,
    label: one.note,
    interactions: [],
  })),
};

export const SECTION_GRAPH = graphOf(
  SECTION,
  Object.fromEntries(STATES.map((one) => [one.story, one.group])),
  LINKS.filter((one) => one.kind === "link").map((one) => ({
    from: one.from,
    to: one.to,
    ...(one.label ? { label: one.label } : {}),
  }))
);

export const pointAt = (story: string): StagePoint => ({
  file: FILE,
  story,
  interaction: "rest",
});
