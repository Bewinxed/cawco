<script lang="ts">
  /**
   * A project's details card as the project's head holds it: hung from the
   * head's place mark on a desk, the kit's bottom sheet on a phone
   * (DetailsHang), the card (DetailsCard) fed and answered by the hub
   * through the card's tie (DetailsHub): the project's row, the board's
   * machines, the fleet's accounts and the moves the hub carries, and the
   * hub's calls on the client this tree's hub seam names, so a states
   * file's stand-in answers them. Its answers in a step live as long as
   * the head, so closing the card loses nothing.
   */
  import { hubSeam } from "#lib/cawco/hub-live.js";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { accountsStore } from "#lib/cawco/stores/accounts.svelte.js";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
  import { movesStore } from "#lib/cawco/stores/moves.svelte.js";
  import { goto } from "$app/navigation";
  import { DetailsHub } from "./details-hub.svelte";
  import HungDetails from "./HungDetails.svelte";

  let {
    project,
    anchor,
    open = $bindable(false),
  }: {
    project: ProjectRow;
    /** The head's place mark it hangs from. */
    anchor: HTMLElement | null;
    open?: boolean;
  } = $props();

  const seam = hubSeam();
  const hub = new DetailsHub({
    project: () => project,
    machines: () => boardStore.machines,
    accounts: () => accountsStore.accounts,
    moves: () => movesStore.moves,
    seam,
    goSignIn: () => goto("/config/accounts"),
    onclose: () => {
      open = false;
    },
  });

  // Opened: what the card reads beyond the project's row, read again.
  $effect(() => {
    if (open) {
      hub.read();
    }
  });
  // The hub's state, kept as when it was last reached.
  $effect(() => hub.heard());
</script>

<HungDetails {anchor} bind:open source={hub} />
