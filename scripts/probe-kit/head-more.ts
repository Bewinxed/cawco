/**
 * The preview head's More (PreviewController `overflowMenu`) from a probe: a
 * finger's tap on More where the app says it stands (`preview head open-tab=…
 * more=x,y`), then on the menu's item by its name, as the simulator's
 * accessibility reads the open menu (axe `describe-ui`). Both taps are a
 * touch down and up: on Xcode 27 axe's default tap style reports success and
 * delivers nothing (cameroncooke/AXe#71).
 */
import { until } from "../scratch-fleet";

const AXE = "/opt/homebrew/bin/axe";
const TAP = `${AXE} tap --tap-style physical`;
/** PreviewController's `preview head open-tab=… more=x,y` line: where More stands, or `none`. */
export const MORE_AT = /^preview head open-tab=\S+ more=(\d+),(\d+)$/;

interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
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

/** Every element on screen with its name and frame, as axe reads them. */
async function named(
  udid: string
): Promise<{ frame?: Frame; label?: string }[]> {
  const out: { frame?: Frame; label?: string }[] = [];
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
  const at = heard.findLast((line) => MORE_AT.test(line))?.match(MORE_AT);
  if (!at) {
    throw new Error("the head said More does not stand");
  }
  // What stood before More opened, so the menu is told by what it adds.
  const before = new Set((await named(udid)).map((node) => node.label));
  await sh(`${TAP} -x ${at[1]} -y ${at[2]} --udid ${udid} >/dev/null`);
  const menu = await until(
    `More's ${item}`,
    () => named(udid),
    (all) => all.some((node) => node.label === item && !!node.frame),
    15_000
  ).catch(async () => await named(udid));
  const names = menu
    .map((node) => node.label)
    .filter((label): label is string => !!label && !before.has(label));
  const found = menu.find((node) => node.label === item && node.frame);
  if (!found?.frame) {
    throw new Error(
      `tapped More at ${at[1]},${at[2]}; no ${item} in what stands: ${names.join(" | ")}`
    );
  }
  const { frame } = found;
  const x = Math.round(frame.x + frame.width / 2);
  const y = Math.round(frame.y + frame.height / 2);
  await sh(`${TAP} -x ${x} -y ${y} --udid ${udid} >/dev/null`);
  return `tapped More at ${at[1]},${at[2]}, then ${item} at ${x},${y} (the menu: ${names.join(" | ")})`;
}
