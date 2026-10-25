<!--
  The capture stage (capture.ts): every option's part, mounted once with the
  owner's real task records (data.js), so the static preview is made of
  their own markup laid out by the dashboard's own stylesheet. Nothing here
  is shown to anyone; capture.ts reads each `data-part` and writes it into
  parts.js. A board's cards are drawn once each (`card:<key>`) and set into
  its places (`data-card`) by the frame.
-->
<script>
  import Board from "./Board.svelte";
  import Card from "./Card.svelte";
  import CawColumn from "./CawColumn.svelte";
  import { cardDrawings } from "./data.js";
  import GroupedList from "./GroupedList.svelte";
  import Head from "./Head.svelte";
  import Pane from "./Pane.svelte";
  import PhoneBars from "./PhoneBars.svelte";
  import PhoneBoard from "./PhoneBoard.svelte";
  import Slots from "./Slots.svelte";

  /** [state, ask]: what a board is drawn in. C only shows where something waits. */
  const BOARDS = [
    ["rest", "C1"],
    ["stale", "C1"],
    ["waits", "C1"],
    ["waits", "C2"],
  ];
  /** [key, waiting, F2 mark, writes]: the page's bar in each state. */
  const HEADS = [
    ["rest", 0, false, true],
    ["waits", 2, false, true],
    ["stale", 0, false, false],
    ["stale-F2", 0, true, false],
  ];
</script>

<main style="display: grid; gap: 24px; padding: 24px; inline-size: 1212px">
  {#each cardDrawings() as drawing (drawing.key)}
    <div data-part="card:{drawing.key}" style="inline-size: 300px">
      <Card ask={drawing.ask} item={drawing.item} />
    </div>
  {/each}
  {#each ["D1", "D2"] as option (option)}
    {#each BOARDS as [state, ask] (state + ask)}
      <div data-part="board:{option}:{state}:{ask}" style="block-size: 600px">
        <Board {ask} {option} {state} />
      </div>
    {/each}
  {/each}
  {#each ["P1", "P2"] as option (option)}
    {#each BOARDS as [state, ask] (state + ask)}
      <div data-part="phone:{option}:{state}:{ask}" style="inline-size: 390px">
        <PhoneBoard {ask} {option} {state} />
      </div>
    {/each}
  {/each}
  {#each ["rest", "waits", "stale"] as state (state)}
    <div data-part="table:desk:{state}">
      <GroupedList desk items="rows" {state} />
    </div>
    <div data-part="table:phone:{state}" style="inline-size: 390px">
      <GroupedList items="rows" {state} />
    </div>
  {/each}
  {#each ["H1", "H2"] as option (option)}
    {#each ["1440", "1037"] as width (width)}
      {#each HEADS as [key, waiting, stale, writes] (key)}
        <div data-part="head:{option}:{width}:{key}">
          <Head {option} {stale} {waiting} {width} {writes} />
        </div>
      {/each}
    {/each}
  {/each}
  {#each ["rest", "stale-F2"] as key (key)}
    <div data-part="phonebar:top:{key}" style="inline-size: 390px">
      <PhoneBars bar="top" stale={key === "stale-F2"} />
    </div>
  {/each}
  {#each [0, 2] as waiting (waiting)}
    <div data-part="phonebar:foot:{waiting}" style="inline-size: 390px">
      <PhoneBars bar="foot" {waiting} />
    </div>
  {/each}
  <div data-part="band:desk">
    <div data-band class="rounded-sm bg-surface-raised px-space-3 py-space-2 shadow-tile"><Slots /></div>
  </div>
  <div data-part="band:phone" style="inline-size: 390px">
    <div data-band class="rounded-sm bg-surface-raised px-space-3 py-space-2 shadow-tile"><Slots stacked /></div>
  </div>
  <div data-part="popover:phone" style="inline-size: 390px">
    <div data-popover class="rounded-lg bg-surface-raised p-space-3 shadow-overlay"><Slots stacked /></div>
  </div>
  {#each ["top", "review"] as fork (fork)}
    <div data-part="pane:{fork}:desk" style="inline-size: 480px; block-size: 800px">
      <Pane {fork} />
    </div>
    <div data-part="pane:{fork}:phone" style="inline-size: 390px; block-size: 844px">
      <Pane {fork} phone />
    </div>
  {/each}
  {#each ["S1", "S2"] as option (option)}
    <div data-part="caw:{option}:desk" style="inline-size: 400px; block-size: 800px">
      <CawColumn {option} />
    </div>
    <div data-part="caw:{option}:phone" style="inline-size: 390px; block-size: 420px">
      <CawColumn {option} phone />
    </div>
  {/each}
</main>
