<script lang="ts">
  /**
   * The fleet with no machine to run a session on, where the board would
   * be (the wide screen's empty detail, the phone's home). In the shape of
   * New project: Caw at 80px over a title and one line.
   *
   * - `none`, no machine registered: the two ways in as icon cards, each
   *   opening the Connect a machine dialog on its tab.
   * - `offline`, machines registered and none online: one line and Check
   *   machines, which opens the top bar's Machines popover, where they are
   *   listed greyed.
   *
   * It enters with Caw's own enter and the cards in the list stagger
   * (motion/list-swap); from one state to the other the words cross-fade.
   * With `present` off the words fade and Caw leaves; `ongone` says when he
   * has, and the place lets it go.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import Caw from "./home/Caw.svelte";
  import { addMachine, JOIN_WAYS, machinesPopover } from "./join/join.svelte";
  import { crossIn, crossOut } from "./motion/curves.svelte";
  import { ListSwap } from "./motion/list-swap.svelte";
  import CardFace from "./project/CardFace.svelte";

  let {
    fleet,
    present = true,
    ongone,
  }: {
    /** No machine registered, or none of them online. */
    fleet: "none" | "offline";
    /** Off: the words fade and Caw leaves; `ongone` says when he has. */
    present?: boolean;
    ongone?: () => void;
  } = $props();

  /** Caw's side, as on New project. */
  const CAW_SIZE = 80;

  /** The cards come in by the list stagger, once, as the state first shows. */
  const enter = new ListSwap(true);
</script>

<div class="machines-empty" class:leaving={!present}>
  <div class="caw-80">
    <Caw
      next={["ready", "idle"]}
      {ongone}
      {present}
      size={CAW_SIZE}
      status={fleet === "none" ? "ready" : "idle"}
    />
  </div>
  <div class="body">
    {#key fleet}
      <div class="words" in:crossIn out:crossOut>
        {#if fleet === "none"}
          <h1 class="title">Connect a machine to run sessions</h1>
          <p class="line">
            Sessions run on your own machines. Install CawCo on one and it joins
            this fleet.
          </p>
          <div
            class="icon-cards"
            {@attach highlight({
              rows: ".icon-card",
              selected: ".icon-card[data-open]",
              axis: "xy",
            })}
          >
            {#each JOIN_WAYS as card, index (card.way)}
              <button
                aria-haspopup="dialog"
                class="icon-card"
                data-open={addMachine.open && addMachine.way === card.way
                  ? ""
                  : undefined}
                onclick={() => addMachine.show(card.way)}
                type="button"
                style:animation={enter.rowAnim(index)}
              >
                <CardFace
                  hue={card.hue}
                  icon={card.icon}
                  meta={card.meta}
                  name={card.name}
                />
              </button>
            {/each}
          </div>
        {:else}
          <h1 class="title">None of your machines are online</h1>
          <p class="line">
            Sessions run on a machine that is online. See which ones dropped and
            why.
          </p>
          <Button
            aria-haspopup="dialog"
            onclick={() => {
              machinesPopover.open = true;
            }}
          >
            Check machines
          </Button>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .machines-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    inline-size: 100%;
    max-inline-size: 34rem;
    margin-inline: auto;
  }
  .caw-80 {
    display: grid;
    place-items: center;
    min-block-size: 80px;
  }
  /* The states share this cell: the one leaving is pinned in it (crossOut). */
  .body {
    position: relative;
    inline-size: 100%;
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  .leaving .body {
    opacity: 0;
  }
  .words {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }
  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
    text-align: center;
    text-wrap: balance;
  }
  .line {
    margin: 0;
    max-inline-size: 26rem;
    font: var(--type-body);
    color: var(--ink-muted);
    text-align: center;
    text-wrap: pretty;
  }
  .icon-cards {
    inline-size: 100%;
    margin-block-start: var(--space-4);
  }
</style>
