<script lang="ts">
  import { newId } from "#lib/cawco/id.js";
  /**
   * One line to Caw: the kit Textarea in a field shell, one line that grows,
   * and the coral send beside it. Enter sends, Shift+Enter breaks the line.
   * The send is pending while the hub takes it; a refusal stands under the
   * field in the hub's words and the words stay, to send again. Used on the
   * empty board, in Ask Caw for a view and in Caw's panel; the session
   * Composer is not, since it needs a session to bind to.
   */
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { departBox, land } from "#lib/cawco/motion/share.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconSend } from "#lib/icons.js";

  let {
    label,
    placeholder,
    onsend,
    autofocus = false,
    flies = false,
    text = $bindable(""),
    action,
    lands,
  }: {
    /** What the field is for, read out. */
    label: string;
    placeholder: string;
    /**
     * Sends the words, as message `id`; a throw is the hub's refusal, shown
     * under the field.
     */
    onsend: (text: string, id: string) => Promise<void>;
    autofocus?: boolean;
    /**
     * The words fly to the row they become (motion/share): each send gets
     * its message id here, the words depart under `sent:<id>` and the id
     * goes to `onsend` to send them as. The field stays; its text flies.
     */
    flies?: boolean;
    /** The words in the field, for a place that puts words there (New project's starter chips). */
    text?: string;
    /**
     * The send as a labelled primary (New project's `Start`), pending under
     * its own words; else the composer's icon send.
     */
    action?: { label: string; pendingLabel: string; empty: string };
    /** Words that fly in land on the field under this key (motion/share). */
    lands?: string;
  } = $props();

  let form = $state<HTMLFormElement | null>(null);

  let sending = $state(false);
  let refused = $state<string | null>(null);

  async function send() {
    const words = text.trim();
    if (sending) {
      return;
    }
    if (!words) {
      // A labelled send is never dimmed: pressed with nothing to send, it
      // says what it needs and puts the caret where the words go.
      if (action) {
        refused = action.empty;
        form
          ?.querySelector<HTMLTextAreaElement>("textarea:not([aria-hidden])")
          ?.focus();
      }
      return;
    }
    sending = true;
    refused = null;
    const id = newId();
    const field = form?.querySelector("textarea");
    if (flies && field) {
      departBox(`sent:${id}`, field);
    }
    try {
      await onsend(words, id);
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
  bind:this={form}
>
  <div class="shell" class:labelled={action}>
    <div class="landing" {@attach land(() => lands, { uniform: true })}>
      <!-- svelte-ignore a11y_autofocus -->
      <Textarea
        aria-label={label}
        {autofocus}
        class="field"
        oninput={() => {
          refused = null;
        }}
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
    </div>
    {#if action}
      <Button
        class="start pressable"
        failed={refused !== null}
        label={action.label}
        pending={sending}
        pendingLabel={action.pendingLabel}
        type="submit"
      />
    {:else}
      <Button
        aria-label="Send"
        class="send pressable"
        disabled={!text.trim()}
        icon={IconSend}
        pending={sending}
        size="icon"
        type="submit"
      />
    {/if}
  </div>
  {#if refused}
    <p class="refused" role="alert" class:beside={action} in:appear>
      {refused}
    </p>
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
  /* A labelled send stands centred on the field as it grows. */
  .shell.labelled {
    align-items: center;
  }
  .landing {
    display: flex;
    flex: 1 1 auto;
    min-inline-size: 0;
  }
  .shell :global(.field) {
    flex: 1 1 auto;
    min-block-size: var(--c-composer-field);
    max-block-size: 10rem;
  }
  /* A labelled send stands as tall as the field's one line. */
  .shell :global(.start) {
    flex: none;
    block-size: var(--c-composer-field);
  }
  /* The composer's send (Composer .stop): the field's height square, its
     16px plane. */
  .shell :global(.send) {
    --btn-icon: 16px;
    flex: none;
    inline-size: var(--c-composer-field);
    block-size: var(--c-composer-field);
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
  /* Beside the labelled send, under its trailing edge. */
  .refused.beside {
    align-self: flex-end;
    max-inline-size: 100%;
    text-align: end;
  }
</style>
