<script lang="ts" module>
  import { CHECK_WORDS, INSTALL_CHECKS } from "@cawco/core";
  import { departBox } from "../motion/share.svelte";

  /** The key a check's chip departs under, and its row in Running lands. */
  export const checkKey = (check: string): string => `connect-check:${check}`;

  /**
   * Every chip on show departs as the install starts: Running's rows land
   * them, so each requirement flies into the row that checks it.
   */
  export function departChecks(): void {
    for (const chip of document.querySelectorAll<HTMLElement>(
      "[data-connect-window] [data-check-chip]"
    )) {
      const check = chip.dataset.checkChip;
      if (check && chip.checkVisibility()) {
        departBox(checkKey(check), chip, false);
      }
    }
  }
</script>

<script lang="ts">
  /**
   * What the installer needs on the machine (core install-script.ts), shown
   * before anything starts. On the desk, chips, each the hollow record of a
   * check not made yet: as the install starts they fly into the rows that
   * check them. On a phone, one sentence, which fades as the rows arrive.
   */
  import { phone } from "./installs.svelte";
  import StepMark from "./StepMark.svelte";

  const SENTENCE =
    "On it the installer needs Linux or macOS, x86_64 or arm64, curl, tar, a SHA-256 tool, systemd user services, openssl.";
</script>

{#if phone.current}
  <p data-slot="checklist" class="m-0 type-meta text-pretty text-ink-muted">
    {SENTENCE}
  </p>
{:else}
  <div data-slot="checklist" class="flex flex-col gap-space-2">
    <p id="connect-needs" class="m-0 type-meta text-ink-muted">
      On it the installer needs
    </p>
    <ul
      aria-labelledby="connect-needs"
      class="m-0 flex list-none flex-wrap gap-space-1 p-0"
    >
      {#each INSTALL_CHECKS as check (check)}
        <li
          data-check-chip={check}
          class="mark-line inline-flex h-c-badge-h items-center gap-space-1 rounded-xs bg-surface-recess px-space-2 type-label text-ink-strong"
        >
          <StepMark state="future" size="sm" />
          <span>{CHECK_WORDS[check]}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
