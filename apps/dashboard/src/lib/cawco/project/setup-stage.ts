/**
 * A stage as the setup page holds it (the decision library's `Stage`, or the
 * stages the hub kept): its name, its kind, its look and what its hooks do.
 */

import type { StageColor, StageIcon, StageKind } from "@cawco/core/views";
import { STAGE_COLORS, STAGE_ICONS, STAGE_KINDS } from "@cawco/core/views";
import type { ElementNode } from "@openuidev/lang-core";

export interface Stage {
  color?: StageColor;
  hooks?: Record<string, string>;
  icon?: StageIcon;
  kind: StageKind;
  name: string;
}

/** The list with `one` moved from `from` to `to`. */
export const moved = <T>(list: readonly T[], from: number, to: number): T[] => {
  const next = [...list];
  const [one] = next.splice(from, 1);
  next.splice(to, 0, one);
  return next;
};

/** The list with the item at `index` patched. */
export const patched = <T>(
  list: readonly T[],
  index: number,
  patch: Partial<T>
): T[] => list.map((one, i) => (i === index ? { ...one, ...patch } : one));

/** A delegate type a setup proposes: its id, its label, its brief, what runs it. */
export interface SetupDelegate {
  brief: string;
  id: string;
  name: string;
  runs?: string;
}

/** A setup as drafted in its program (`Setup(name, aim, stages, delegates, shape)`). */
export interface SetupDrafted {
  aim: string;
  delegates: SetupDelegate[];
  name: string;
  shape: string;
  stages: Stage[];
}

const asKind = (value: unknown): StageKind =>
  STAGE_KINDS.find((kind) => kind === value) ?? "todo";
const HOOK_KEYS = ["runs", "until", "after", "by"];

/** A stage as the program drafts it, or as the hub kept it (its hooks flat beside its look). */
export const stageOf = (
  held: Partial<Stage> & Record<string, unknown>
): Stage => {
  const hooks =
    held.hooks ??
    Object.fromEntries(
      HOOK_KEYS.filter((key) => typeof held[key] === "string").map((key) => [
        key,
        String(held[key]),
      ])
    );
  const icon = STAGE_ICONS.find((one) => one === held.icon);
  const color = STAGE_COLORS.find((one) => one === held.color);
  return {
    name: String(held.name ?? ""),
    kind: asKind(held.kind),
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
    ...(Object.keys(hooks).length > 0 ? { hooks } : {}),
  };
};

/** The stages as the hub keeps them (`stages`): each one's look and hooks flat, as stages.md writes them. */
export const storedStages = (list: Stage[]) =>
  list.map(({ name, kind, icon, color, hooks }) => ({
    name,
    kind,
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
    ...hooks,
  }));

/** A node of a parsed program that is a component's element. */
export const isElement = (value: unknown): value is ElementNode =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  value.type === "element";

/** A Setup element's props, read as data. */
export const draftedOf = (props: {
  aim?: unknown;
  delegates?: unknown;
  name?: unknown;
  shape?: unknown;
  stages?: unknown;
}): SetupDrafted => ({
  name: String(props.name ?? ""),
  aim: String(props.aim ?? ""),
  shape: String(props.shape ?? ""),
  stages: (Array.isArray(props.stages) ? props.stages : []).map((node) =>
    stageOf(isElement(node) ? node.props : {})
  ),
  delegates: (Array.isArray(props.delegates) ? props.delegates : []).map(
    (node): SetupDelegate => {
      const held: Record<string, unknown> = isElement(node) ? node.props : {};
      return {
        id: String(held.id ?? ""),
        name: String(held.name ?? held.id ?? ""),
        brief: String(held.brief ?? ""),
        ...(held.runs ? { runs: String(held.runs) } : {}),
      };
    }
  ),
});
