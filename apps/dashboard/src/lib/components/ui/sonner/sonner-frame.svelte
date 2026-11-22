<script lang="ts">
  /**
   * The kit's Toaster in a frame of its own (its states file's): its layer
   * held in a box (`contain: layout`, so the fixed layer stands in the
   * frame), holding the toasts the mock sends it, each kept on screen. The
   * toaster takes its own id, so its toasts reach it alone.
   */
  import { toast } from "svelte-sonner";
  import Toaster from "./sonner.svelte";

  let {
    toasts,
    height,
  }: {
    /** Each toast's words, its line and its action, sent as the frame opens. */
    toasts: { words: string; line?: string; action?: string }[];
    /** The frame's height, px: room for the toasts. */
    height: number;
  } = $props();

  const id = $props.id();

  $effect(() => {
    const sent = toasts.map((one) =>
      toast(one.words, {
        toasterId: id,
        duration: Number.POSITIVE_INFINITY,
        description: one.line,
        action: one.action
          ? { label: one.action, onClick: () => undefined }
          : undefined,
      })
    );
    return () => {
      for (const one of sent) {
        toast.dismiss(one);
      }
    };
  });
</script>

<div
  class="relative h-(--frame-h) w-field-group max-w-full overflow-clip contain-layout"
  style:--frame-h={`${height}px`}
>
  <Toaster expand {id} position="bottom-right" />
</div>
