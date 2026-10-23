<script lang="ts">
  import { encode } from "uqr";
  /**
   * The phone step's object on a desk: a QR of the address the phone opens
   * once (the given name, slash and all), and beside it the three things in
   * order, numbered as they are done. The QR is drawn from its modules in
   * the ink of the page, on the raised surface, with its quiet zone.
   */
  import Words from "./Words.svelte";

  let {
    address,
    typed,
    domain,
    name,
    network,
  }: {
    /** What the QR opens. */
    address: string;
    /** What to type the first time, if not scanning. */
    typed: string;
    domain: string;
    name: string;
    network: string;
  } = $props();

  /** Its modules as one path of unit squares, with a 2-module quiet zone. */
  const code = $derived.by(() => {
    const { data, size } = encode(address, { ecc: "M", border: 2 });
    let path = "";
    data.forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) {
          path += `M${x} ${y}h1v1h-1z`;
        }
      });
    });
    return { path, size };
  });

  const steps = $derived([
    `${network} on, signed in to ${domain}`,
    `Scan this, or type ${typed}`,
    `Then ${name}, on its own`,
  ]);
</script>

<!-- The QR and its steps side by side, the steps' column taking what is
     left and wrapping inside it, never pushing past the tray's edge. -->
<div
  class="grid min-w-0 grid-cols-(--qr-cols) items-center gap-x-space-4"
  data-slot="phone-qr"
  style:--qr-cols="var(--c-address-qr) minmax(0, 1fr)"
>
  <svg
    class="block size-c-address-qr flex-none rounded-well bg-surface-raised text-ink-strong shadow-xs"
    aria-label="QR code for {address}"
    role="img"
    viewBox="0 0 {code.size} {code.size}"
  >
    <path d={code.path} fill="currentColor" shape-rendering="crispEdges" />
  </svg>
  <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
  <ol class="m-0 grid min-w-0 list-none gap-space-2 p-0" role="list">
    <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
    {#each steps as step, index (index)}
      <li class="mark-line flex min-w-0 items-start gap-space-2 type-body">
        <span class="mark-cell">
          <span
            class="box-border grid size-icon-md place-items-center rounded-pill border border-border-control type-meta leading-none num text-ink-muted"
            aria-hidden="true">{index + 1}</span
          >
        </span>
        <span class="mark-text min-w-0 text-ink-strong"
          ><Words text={step} /></span
        >
      </li>
    {/each}
  </ol>
</div>
