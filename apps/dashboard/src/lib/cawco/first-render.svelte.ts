/**
 * Whether the page still draws from what the server drew it from.
 *
 * Hydration keeps the server's page only where the first client render
 * draws the same data: where it draws other data, Svelte throws the
 * server's part away and builds its own in its place, silently (its if and
 * each blocks: "remove the server-rendered DOM and start over"). What the
 * server reads from this browser's copies (prefs.ts) can be behind what the
 * page keeps (another window's, one not yet sent, one too long to send),
 * and what only the page can ask (a media query) the server guessed.
 *
 * So until the first paint is up, the page draws the server's answers (the
 * layout's data), and only then its own: the Shell lets go a frame after it
 * mounts, and a part that differs moves to the page's answer as it moves
 * for any change. On the server it is never let go.
 */
let held = $state(true);

export const firstRender = {
  /** Whether what is drawn is still the server's first paint. */
  get held(): boolean {
    return held;
  },
  /** The page's own answers from here on. Once, by the Shell. */
  release(): void {
    held = false;
  },
};
