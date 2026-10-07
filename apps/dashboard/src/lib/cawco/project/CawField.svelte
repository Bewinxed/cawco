<script lang="ts">
  /**
   * One line to Caw: the kit Textarea in a field shell, one line that grows,
   * and the coral send beside it. Enter sends, Shift+Enter breaks the line.
   * The send is pending while the hub takes it; a refusal stands under the
   * field in the hub's words and the words stay, to send again. Used on the
   * empty board, in Ask Caw for a view and in Caw's panel; the session
   * Composer is not, since it needs a session to bind to.
   */
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconSend } from "#lib/icons.js";

  let {
    label,
    placeholder,
    onsend,
    autofocus = false,
  }: {
    /** What the field is for, read out. */
    label: string;
    placeholder: string;
    /** Sends the words; a throw is the hub's refusal, shown under the field. */
    onsend: (text: string) => Promise<void>;
    autofocus?: boolean;
  } = $props();

  let text = $state("");
  let sending = $state(false);
  let refused = $state<string | null>(null);

  async function send() {
    const words = text.trim();
    if (!words || sending) {
      return;
    }
    sending = true;
    refused = null;
    try {
      await onsend(words);
      text = "";
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
    }
  }
</script>

<form
  class="caw-field"
  onsubmit={(event) => {
    event.preventDefault();
    send();
  }}
>
  <div class="shell">
    <!-- svelte-ignore a11y_autofocus -->
    <Textarea
      aria-label={label}
      {autofocus}
      class="field"
      onkeydown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          send();
        }
      }}
      {placeholder}
      rows={1}
      bind:value={text}
    />
    <Button
      aria-label="Send"
      class="send pressable"
      disabled={!text.trim()}
      icon={IconSend}
      pending={sending}
      size="icon"
      type="submit"
    />
  </div>
  {#if refused}
    <p class="refused" role="alert" in:appear>{refused}</p>
  {/if}
</form>

<style>
  .caw-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    inline-size: 100%;
  }
  .shell {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .shell :global(.field) {
    flex: 1 1 auto;
    min-block-size: var(--c-btn-h);
    max-block-size: 10rem;
  }
  /* A phone never zooms into the field (PRODUCT.md, Phone fields). */
  @media (pointer: coarse), (max-width: 639px) {
    .shell :global(.field) {
      font-size: max(16px, var(--text-body));
    }
  }
  .refused {
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
