/**
 * What an area's projects would fall back to the fleet's for, were it gone
 * or were they out of it: per row setting, how many of them take it from
 * the area now (each project's settings in effect, core `settingsInEffect`),
 * in the hub's own words for a delete ("2 projects fall back to the fleet's
 * account"). Who decides and delegate types are read from files the hub
 * alone resolves per project, so the delete's question says those go with
 * the area, and the hub's answer counts them.
 */
import {
  type AreaSettingName,
  areaWords,
  areasScreenWords as words,
} from "@cawco/core/words/areas";
import type { AskHereRequest } from "../ask-here.svelte";
import type { ProjectRow } from "../client.svelte";

const ROW: readonly [keyof ProjectRow["inEffect"], AreaSettingName][] = [
  ["account", "account"],
  ["cap", "cap"],
  ["onCap", "onCap"],
  ["cawMode", "cawMode"],
];

const fallBackLines = (projects: readonly ProjectRow[]): string[] => {
  // The settings by how many projects fall back on each, so the same
  // projects' settings are said once: "3 projects fall back to the fleet's
  // budget and rule at the budget".
  const byCount = new Map<number, AreaSettingName[]>();
  for (const [field, name] of ROW) {
    const count = projects.filter(
      (project) => project.inEffect[field].from === "area"
    ).length;
    if (count > 0) {
      byCount.set(count, [...(byCount.get(count) ?? []), name]);
    }
  }
  return [...byCount].map(([count, names]) =>
    areaWords.fallBackAll(count, names)
  );
};

/**
 * Deleting an area, asked where it was asked (AskHere): the projects that
 * leave it, what of theirs falls back to the fleet's, and that its folder
 * and scoped rules go with it. `run` deletes it and does what follows.
 */
export const deleteQuestion = (
  at: string,
  name: string,
  projects: readonly ProjectRow[],
  run: () => Promise<unknown>
): AskHereRequest => {
  const falls = fallBackLines(projects);
  return {
    at,
    title: words.deleteTitle(name),
    body: [
      words.deleteProjects(projects.map((one) => one.name)),
      ...(falls.length > 0 ? [words.deleteFallsBack(falls)] : []),
      words.deleteFolder,
    ],
    confirmLabel: words.deleteConfirm,
    pendingLabel: words.deleting,
    destructive: true,
    run,
  };
};
