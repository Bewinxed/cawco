<script lang="ts">
  /**
   * Your message didn't wake Caw (pin 7's non-blocking case): it stays in
   * the thread and says so where it happened, with its reason, Try again and
   * the hub's words under Show details, as the house's fault line does
   * (RowFault).
   *
   * - `under`: under your message, on its words' start edge, the line in
   *   the fail ink (OpenPhone's "Failed to send" under the bubble).
   * - `caw`: a row of its own after your message, on Caw's speaker line in
   *   his needs-you pose, the line in the strong ink (GitHub Copilot's error
   *   under the assistant's name).
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";

  let {
    place,
    reason,
    details,
  }: {
    place: "under" | "caw";
    reason: string;
    details: string;
  } = $props();

  const again = () =>
    new Promise<void>((done) => {
      setTimeout(done, 900);
    });
</script>

{#if place === "under"}
  <RowFault {again} data-not-woken="under" {details} {reason} />
{:else}
  <div
    class="mt-(--space-3) flex min-w-0 flex-col gap-(--space-1)"
    data-not-woken="caw"
  >
    <p
      class="mark-line m-0 flex items-center gap-(--space-2) text-(--ink-strong) text-label"
    >
      <CawFace size={18} status="needs-you" />
      <span>Caw</span>
    </p>
    <RowFault
      {again}
      class="[--fault-ink:var(--ink-strong)]"
      {details}
      {reason}
    />
  </div>
{/if}
