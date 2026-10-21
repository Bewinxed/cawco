/**
 * A copy or cut pressed as the person presses it (⌘ or Ctrl with C or X),
 * and what it put on the clipboard: the copy event's `text/plain` as the
 * page's handlers left it (read by a listener on the window, after every
 * handler on the page), and on Chromium the system clipboard itself,
 * read back through `navigator.clipboard` once the page may read it.
 * WebKit grants a page no clipboard read, so there the event's is the read.
 */
import type { Page } from "playwright-core";
import type { Engine } from "./kit";

export interface Copied {
  /** The system clipboard's text (Chromium), null where it can't be read. */
  clipboard: string | null;
  /** The copy or cut event's `text/plain` once the page's handlers ran. */
  event: string | null;
}

export async function pressCopy(
  page: Page,
  engine: Engine,
  key: "c" | "x" = "c"
): Promise<Copied> {
  if (engine === "chromium") {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.evaluate(() => {
    const seen = globalThis as unknown as { __copied: string | null };
    seen.__copied = null;
    const read = (copied: ClipboardEvent) => {
      seen.__copied = copied.clipboardData?.getData("text/plain") ?? null;
      window.removeEventListener("copy", read);
      window.removeEventListener("cut", read);
    };
    window.addEventListener("copy", read);
    window.addEventListener("cut", read);
  });
  await page.keyboard.press(`ControlOrMeta+${key}`);
  const event = await page.evaluate(
    () => (globalThis as unknown as { __copied: string | null }).__copied
  );
  const clipboard =
    engine === "chromium"
      ? await page.evaluate(() => navigator.clipboard.readText())
      : null;
  return { event, clipboard };
}
