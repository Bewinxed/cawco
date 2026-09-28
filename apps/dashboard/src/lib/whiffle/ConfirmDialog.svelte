<script lang="ts">
  /**
   * The single host for {@link confirm}. Mounted once in the shell; renders
   * whatever the current `confirm(...)` call asked for, and answers it. Every
   * destructive action in the app funnels through this one dialog. Its
   * confirm button runs the asked work and stays pending, the dialog open,
   * until the work ends.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { confirmHost } from "./confirm.svelte";

  const pending = $derived(confirmHost.pending);
  let running = $state(false);
  /** The last run threw (the dialog stays open): no check. */
  let failed = $state(false);

  async function accept() {
    running = true;
    failed = false;
    try {
      await confirmHost.accept();
    } catch (error) {
      failed = true;
      throw error;
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
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel
        >{pending?.cancelLabel ?? 'Cancel'}</AlertDialog.Cancel
      >
      <AlertDialog.Action>
        {#snippet child({ props })}
          <Button
            {...props}
            {failed}
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
