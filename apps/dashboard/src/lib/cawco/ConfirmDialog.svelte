<script lang="ts">
  /**
   * The single host for {@link confirm}. Mounted once in the shell; renders
   * whatever the current `confirm(...)` call asked for, and answers it. Every
   * destructive action in the app funnels through this one dialog. Its
   * confirm button runs the asked work and stays pending, the dialog open,
   * until the work ends. Work that fails keeps the dialog open and says why
   * under the body, where the reader is already looking; only work that
   * succeeds closes it.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { confirmHost } from "./confirm.svelte";
  import { unfold } from "./motion/fold.svelte";

  const pending = $derived(confirmHost.pending);
  let running = $state(false);
  /** Why the last run failed (the dialog stays open), or null. */
  let failure = $state<string | null>(null);

  // A new question starts clean.
  $effect.pre(() => {
    if (pending) {
      failure = null;
    }
  });

  async function accept() {
    running = true;
    failure = null;
    try {
      await confirmHost.accept();
    } catch (caught) {
      failure = caught instanceof Error ? caught.message : String(caught);
    } finally {
      running = false;
    }
  }
</script>

<AlertDialog.Root
  onOpenChange={(next) => {
    if (!next) {
      confirmHost.dismiss();
    }
  }}
  open={pending !== null}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{pending?.title}</AlertDialog.Title>
      {#if pending?.body}
        <AlertDialog.Description>{pending.body}</AlertDialog.Description>
      {/if}
      {#if failure}
        <p class="failure" role="alert" transition:unfold>{failure}</p>
      {/if}
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel
        >{pending?.cancelLabel ?? 'Cancel'}</AlertDialog.Cancel
      >
      <AlertDialog.Action>
        {#snippet child({ props })}
          <Button
            {...props}
            failed={failure !== null}
            label={pending?.confirmLabel ?? 'Confirm'}
            onclick={accept}
            pending={running}
            pendingLabel={pending?.pendingLabel}
            variant={pending?.destructive ? 'destructive' : 'default'}
          />
        {/snippet}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  .failure {
    color: var(--status-fail-ink);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
  }
</style>
