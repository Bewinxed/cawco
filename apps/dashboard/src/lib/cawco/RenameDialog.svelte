<script lang="ts">
  /**
   * Renaming a session, from whichever menu offers it. The caller decides
   * where the name is kept; a failed rename leaves the dialog open.
   */
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Input } from "#lib/components/ui/input/index.js";

  let {
    open: shown = $bindable(false),
    current,
    onrename,
  }: {
    open?: boolean;
    /** What it is called now: the field opens holding it. */
    current: string;
    onrename: (title: string) => Promise<void>;
  } = $props();

  let title = $state("");
  let busy = $state(false);
  /** The last rename went through. */
  let renamed = $state(false);

  // Seeded as it opens only: a live rename arriving while the owner types
  // must not replace what they are typing.
  $effect.pre(() => {
    if (shown) {
      title = untrack(() => current);
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!next || busy) {
      return;
    }
    busy = true;
    renamed = false;
    try {
      await onrename(next);
      renamed = true;
      shown = false;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open={shown}>
  <Dialog.Content>
    <form class="grid gap-6" onsubmit={submit}>
      <Dialog.Header>
        <Dialog.Title>Rename session</Dialog.Title>
        <Dialog.Description>
          What this session is called wherever it is listed. It does not change
          the transcript.
        </Dialog.Description>
      </Dialog.Header>
      <!-- First tabbable thing in the dialog, so it is what opens focused. -->
      <Input aria-label="Session title" autocomplete="off" bind:value={title} />
      <Dialog.Footer>
        <Button
          onclick={() => {
            shown = false;
          }}
          type="button"
          variant="outline"
          >Cancel</Button
        >
        <Button
          disabled={!title.trim()}
          failed={!renamed}
          label="Rename"
          pending={busy}
          pendingLabel="Renaming…"
          type="submit"
        />
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
