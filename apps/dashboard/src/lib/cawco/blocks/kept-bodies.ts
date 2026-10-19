import { readJson, writeJson } from "../storage";

/**
 * The height each block's body last stood at, by project, page and block
 * (The Claim Of Nothing Rule: while a page is read again its skeleton stands
 * in the box it last drew in, else the box it draws in). Kept in
 * localStorage through the one way to it (storage.ts), as the Configure
 * cards keep theirs (config/cards.ts).
 */
const KEY = "cawco-block-bodies";
/** The bodies remembered: the blocks of the pages opened last. */
const LIMIT = 120;

type Kept = Record<string, number>;

const placeOf = (project: string, page: string, block: string) =>
  `${project}/${page}/${block}`;

/** The height `block`'s body last stood at on `page` of `project`, px; null if never drawn here. */
export function keptBody(
  project: string,
  page: string,
  block: string
): number | null {
  const height = readJson<Kept>(KEY, {})[placeOf(project, page, block)];
  return typeof height === "number" && height > 0 ? height : null;
}

/** Keeps the height `block`'s body stands at now, the newest last. */
export function keepBody(
  project: string,
  page: string,
  block: string,
  height: number
): void {
  const at = placeOf(project, page, block);
  const kept = readJson<Kept>(KEY, {});
  const rounded = Math.round(height * 100) / 100;
  if (kept[at] === rounded) {
    return;
  }
  const others = Object.entries(kept).filter(([place]) => place !== at);
  writeJson(
    KEY,
    Object.fromEntries([...others.slice(-(LIMIT - 1)), [at, rounded]])
  );
}
