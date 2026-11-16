<script lang="ts">
  /**
   * What a pick on a limited row opens under that row in place (`unfold`),
   * with no modal, once the provider has answered or can't be asked: what
   * forcing it may meet, or why the provider can't be asked, and under it
   * the force itself. Its button wears the grant look (DESIGN.md: a choice
   * wider than what was asked is never made more inviting). It starts on
   * the row's text edge, `--lead` in from the row's own.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";

  let {
    words,
    action,
    onforce,
  }: {
    words: string;
    /** The force's words: Move anyway, Pick anyway. */
    action: string;
    onforce: () => void;
  } = $props();
</script>

<div
  data-slot="force"
  class="grid justify-items-start gap-space-2 ps-(--lead) pe-space-2 pb-space-2"
  role="alert"
  in:unfold
  out:unfold
>
  <p class="m-0 min-w-0 type-meta text-pretty text-ink-muted">
    {words}
  </p>
  <Button onclick={onforce} size="xs" variant="grant">{action}</Button>
</div>
