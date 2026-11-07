import type { ListedBrowser } from "@cawco/core/browser";

/**
 * What a browser artifact's head holds, from what is true of the browser
 * (PreviewPane, and the browser bench on the same rule): Take over only
 * while there is a page to take (the browser live on a machine the hub
 * reaches, its stream drawn in the well), Hand back whenever the person
 * holds it, so a held browser can always go back; the address while the
 * browser is live, in the head on a desk and at the stream's foot on a
 * phone's sheet (BrowserView `addressAtFoot`).
 */
export function browserHead(
  row: ListedBrowser,
  {
    online,
    viewing,
    sheet,
  }: { online: boolean; viewing: boolean; sheet: boolean }
): { control: boolean; address: boolean } {
  const live = row.state === "live" && online;
  return {
    control: !!row.takeover || (live && viewing),
    address: live && !sheet,
  };
}
