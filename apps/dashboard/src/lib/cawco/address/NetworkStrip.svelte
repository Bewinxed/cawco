<script lang="ts">
  /**
   * What CawCo adds, drawn: the network's line with the computer the hub
   * runs on, the one device CawCo adds to it (new, in the brand's ink), and
   * the person's phone, each by its mark and name, under the network's
   * name. Nothing of the computer changes; the device is CawCo's own.
   */
  import { IconLaptop, IconPhone, IconPlus } from "#lib/icons.js";

  let {
    network,
    domain,
    name,
  }: { network: string; domain: string; name: string } = $props();
</script>

<figure class="m-0 grid gap-space-2" data-slot="network-strip">
  <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
  <ul
    class="relative m-0 flex list-none flex-wrap items-center justify-between gap-space-2 p-0 before:absolute before:inset-x-space-4 before:top-1/2 before:h-px before:bg-border-control"
    role="list"
  >
    <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
    <li
      class="mark-line relative flex min-w-0 items-center gap-space-1 rounded-pill border border-border-control bg-surface-raised px-space-2 py-space-1 type-meta text-ink-strong"
    >
      <IconLaptop aria-hidden="true" class="size-icon-md text-ink-muted" />
      <span class="min-w-0 wrap-anywhere">obelisk</span>
    </li>
    <li
      class="mark-line relative flex min-w-0 items-center gap-space-1 rounded-pill border border-brand-solid bg-brand-wash px-space-2 py-space-1 type-meta text-brand-ink"
    >
      <IconPlus aria-hidden="true" class="size-icon-sm" />
      <span class="min-w-0 wrap-anywhere">{name}</span>
    </li>
    <li
      class="mark-line relative flex min-w-0 items-center gap-space-1 rounded-pill border border-border-control bg-surface-raised px-space-2 py-space-1 type-meta text-ink-strong"
    >
      <IconPhone aria-hidden="true" class="size-icon-md text-ink-muted" />
      <span class="min-w-0 wrap-anywhere">your phone</span>
    </li>
  </ul>
  <figcaption class="type-meta text-center text-ink-muted wrap-anywhere">
    {network} · {domain}
  </figcaption>
</figure>
