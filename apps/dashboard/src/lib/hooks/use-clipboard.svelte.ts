import { dur } from "#lib/cawco/motion/curves.svelte.js";

/** Use this hook to copy text to the clipboard and show a copied state. The
 * state holds for --dur-hold (app.css), then clears.
 *
 * ## Usage
 * ```svelte
 * <script lang="ts">
 * 		import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
 *
 * 		const clipboard = new UseClipboard();
 * </script>
 *
 * <button onclick={clipboard.copy('Hello, World!')}>
 *     {#if clipboard.copied === 'success'}
 *         Copied!
 *     {:else if clipboard.copied === 'failure'}
 *         Failed to copy!
 *     {:else}
 *         Copy
 *     {/if}
 * </button>
 * ```
 *
 */
export class UseClipboard {
  #copiedStatus = $state<"success" | "failure">();
  private timeout: ReturnType<typeof setTimeout> | undefined = undefined;

  /** Copies the given text to the users clipboard.
   *
   * ## Usage
   * ```ts
   * clipboard.copy('Hello, World!');
   * ```
   *
   * @param text
   * @returns
   */
  async copy(text: string) {
    if (this.timeout) {
      this.#copiedStatus = undefined;
      clearTimeout(this.timeout);
    }

    try {
      await navigator.clipboard.writeText(text);

      this.#copiedStatus = "success";

      this.timeout = setTimeout(() => {
        this.#copiedStatus = undefined;
      }, dur("--dur-hold"));
    } catch {
      // an error can occur when not in the browser or if the user hasn't given clipboard access
      this.#copiedStatus = "failure";

      this.timeout = setTimeout(() => {
        this.#copiedStatus = undefined;
      }, dur("--dur-hold"));
    }

    return this.#copiedStatus;
  }

  /** true when the user has just copied to the clipboard. */
  get copied() {
    return this.#copiedStatus === "success";
  }

  /**	Indicates whether a copy has occurred
   * and gives a status of either `success` or `failure`. */
  get status() {
    return this.#copiedStatus;
  }
}
