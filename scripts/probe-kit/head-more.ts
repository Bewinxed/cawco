/**
 * The preview head's More (PreviewController `overflowMenu`) from a probe: a
 * finger's tap on More where the app says it stands (`preview head open-tab=…
 * more=x,y`), the open menu's rows as the simulator's accessibility reads
 * them (axe `describe-ui`), and a tap on one of them by its name. Every tap
 * is a touch down and up: on Xcode 27 axe's default tap style reports
 * success and delivers nothing (cameroncooke/AXe#71).
 */
import { until } from "../scratch-fleet";

const AXE = "/opt/homebrew/bin/axe";
const TAP = `${AXE} tap --tap-style physical`;
/** PreviewController's `preview head open-tab=… more=x,y` line: where More stands, or `none`. */
export const MORE_AT = /^preview head open-tab=\S+ more=(\d+),(\d+)$/;

export interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** One element on screen, as the simulator's accessibility names it. */
export interface Named {
  frame?: Frame;
  label?: string;
}

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/** Every element on screen with its name and frame, as axe reads them, the window first. */
export async function named(udid: string): Promise<Named[]> {
  const out: Named[] = [];
  const walk = (node: Record<string, unknown>) => {
    out.push({
      label: (node.AXLabel ?? node.label) as string | undefined,
      frame: node.frame as Frame | undefined,
    });
    for (const kid of (node.children as
      Record<string, unknown>[] | undefined) ?? []) {
      walk(kid);
    }
  };
  const roots = JSON.parse(
    await sh(`${AXE} describe-ui --udid ${udid}`)
  ) as Record<string, unknown>[];
  for (const root of roots) {
    walk(root);
  }
  return out;
}

/** The open menu: where More was tapped, and what the menu added to the screen, top to bottom. */
export interface OpenMore {
  at: [number, number];
  rows: Named[];
}

/** Taps More and reads what its menu puts on the screen, once `ready` holds of it (or 15 s). */
export function openMore(
  udid: string,
  heard: string[],
  ready?: (rows: Named[]) => boolean
): Promise<OpenMore> {
  const line = heard.findLast((said) => MORE_AT.test(said))?.match(MORE_AT);
  if (!line) {
    throw new Error("the head said More does not stand");
  }
  return openMenuAt(udid, [Number(line[1]), Number(line[2])], ready);
}

/** Taps the control at `at` that opens a menu, and reads what the menu puts on the screen. */
export async function openMenuAt(
  udid: string,
  at: [number, number],
  ready: (rows: Named[]) => boolean = (rows) => rows.length > 0
): Promise<OpenMore> {
  // What stood before the menu opened, so the menu is told by what it adds.
  const before = new Set((await named(udid)).map((node) => node.label));
  await sh(`${TAP} -x ${at[0]} -y ${at[1]} --udid ${udid} >/dev/null`);
  const added = async () =>
    (await named(udid))
      .filter((node) => !!node.label && !!node.frame && !before.has(node.label))
      .sort((a, b) => (a.frame?.y ?? 0) - (b.frame?.y ?? 0));
  const rows = await until("More's menu", added, ready, 15_000).catch(added);
  return { at, rows };
}

/**
 * Puts the open menu away: a tap at `away`, a point the menu does not cover.
 * Not on the control that opened it: on iOS 26 the menu opens over its
 * control, and a tap there is the menu's first row.
 */
export async function closeMenu(
  udid: string,
  away: [number, number]
): Promise<void> {
  await sh(`${TAP} -x ${away[0]} -y ${away[1]} --udid ${udid} >/dev/null`);
  await Bun.sleep(800);
}

/**
 * Opens More and taps its item named `item`. Answers what it did, with the
 * menu's names as read, for the check's evidence; throws with the same when
 * More or the item is not on screen.
 */
export async function runMoreItem(
  udid: string,
  heard: string[],
  item: string
): Promise<string> {
  const open = await openMore(udid, heard, (rows) =>
    rows.some((row) => row.label === item)
  );
  const names = open.rows.map((row) => row.label).join(" | ");
  const frame = open.rows.find((row) => row.label === item)?.frame;
  if (!frame) {
    throw new Error(
      `tapped More at ${open.at.join(",")}; no ${item} in what stands: ${names}`
    );
  }
  const x = Math.round(frame.x + frame.width / 2);
  const y = Math.round(frame.y + frame.height / 2);
  await sh(`${TAP} -x ${x} -y ${y} --udid ${udid} >/dev/null`);
  return `tapped More at ${open.at.join(",")}, then ${item} at ${x},${y} (the menu: ${names})`;
}
