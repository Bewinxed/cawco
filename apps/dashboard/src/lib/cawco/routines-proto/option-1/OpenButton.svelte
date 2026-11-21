<script lang="ts">
  /**
   * The one way a row opens what it stands for, every row alike: the kit's
   * icon button at its row size, its name in its tooltip and for a screen
   * reader (the open symbol a session row and a needs card use to open an
   * item beside the list). `beside` opens the thing beside the list;
   * `session` goes to the session that did a run, at its own address; `here`
   * opens a run's whole result in place, and says it is open.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconArrowUpRight, IconMaximize, IconMinimize } from "#lib/icons.js";

  let {
    label,
    kind,
    href,
    open = false,
    onopen,
  }: {
    /** What it opens, said in full: "Open Triage new GitHub issues". */
    label: string;
    kind: "beside" | "session" | "here";
    /** Where a session lives; a link, so it opens in a new tab too. */
    href?: string;
    /** For `beside` and `here`: what it opens stands open now. */
    open?: boolean;
    onopen?: () => void;
  } = $props();

  const ICONS = {
    session: IconArrowUpRight,
    beside: IconMaximize,
    here: IconMaximize,
  } as const;
  const icon = $derived(kind === "here" && open ? IconMinimize : ICONS[kind]);
</script>

<Tip {label}>
  {#snippet children(tip)}
    <Button
      {...tip}
      aria-current={kind === "beside" && open ? "true" : undefined}
      aria-expanded={kind === "here" ? open : undefined}
      aria-label={label}
      {href}
      {icon}
      onclick={(event: MouseEvent) => {
        if (onopen) {
          event.preventDefault();
          onopen();
        }
      }}
      size="icon-xs"
      tone="quiet"
      variant="ghost"
    />
  {/snippet}
</Tip>
