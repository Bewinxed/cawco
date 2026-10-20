/**
 * The preview's states, for the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Preview`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const previewWords = {
  /**
   * The page's content process ended a second time for the same page (the
   * first reloads it by itself): the system ended it, most often over its
   * memory. The app hears it from WebKit; a browser never tells the parent page.
   */
  stoppedTitle: "This page stopped",
  stoppedLine:
    "It closed while it ran, most likely because it needed more memory than this device gives a page.",
  /** The state's way back: the page loaded afresh. */
  tryAgain: "Try again",
  /** Try again while the page loads. */
  reloading: "Reloading…",
  /**
   * A host-mode preview turned the dashboard away twice (hub
   * preview-access.ts): the browser holds no pass for `domain`, the domain
   * the names stand under. Opened over plain http, the dashboard is another
   * site to those https names, so no frame of it carries their pass;
   * opened over https under them, this browser kept none.
   */
  passTurnedAway: (domain: string, overHttps: boolean) =>
    overHttps
      ? `This preview turned the dashboard away twice: this browser kept no pass for ${domain}. Allow cookies for ${domain} in this browser, then try again.`
      : `This preview turned the dashboard away: previews on their own names need the dashboard opened over https under the same domain, which is ${domain}. Open the dashboard at an https address under ${domain}, and its previews open there.`,
};
