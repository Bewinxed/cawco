<!--
  The capture stage (capture.ts): every option's part, mounted once with the
  owner's real records (data.js), so the static preview is made of their own
  markup laid out by the dashboard's own stylesheet. Nothing here is shown
  to anyone; capture.ts reads each `data-part` and writes it into parts.js.
  A board's cards are drawn once each (`card:<key>`) and set into its places
  (`data-card`) by the frame; Ask Caw is drawn once per open state and seat
  (`askcaw:…`) and set into each bar's `data-slot-part="askcaw"`.
-->
<script>
  import AskCaw from "./AskCaw.svelte";
  import Board from "./Board.svelte";
  import Card from "./Card.svelte";
  import CawColumn from "./CawColumn.svelte";
  import { cardDrawings, waiting } from "./data.js";
  import Fault from "./Fault.svelte";
  import GroupedList from "./GroupedList.svelte";
  import Head from "./Head.svelte";
  import Pane from "./Pane.svelte";
  import PhoneBars from "./PhoneBars.svelte";
  import PhoneBoard from "./PhoneBoard.svelte";

  /** [state, ask]: what a board is drawn in. C only shows where something waits. */
  const BOARDS = [
    ["rest", "C1"],
    ["stale", "C1"],
    ["waits", "C1"],
    ["waits", "C2"],
  ];
  /** [key, state, F2 mark]: the page's bar in each state. */
  const HEADS = [
    ["rest", "rest", false],
    ["waits", "waits", false],
    ["stale", "stale", false],
    ["stale-F2", "stale", true],
  ];
  /** Every fold set the two fold orders reach (Head.svelte): A v, vn, vna; B v, va, vna. */
  const FOLDS = ["", "v", "vn", "va", "vna", "n", "a", "na"];
  const SEATS = ["idle", "working", "asking-a", "asking-b"];
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
    {#each ["folded", "open"] as folds (folds)}
      <div data-part="table:desk:{state}:{folds}">
        <GroupedList desk {folds} items="rows" {state} />
      </div>
      <div data-part="table:phone:{state}:{folds}" style="inline-size: 390px">
        <GroupedList {folds} items="rows" {state} />
      </div>
    {/each}
  {/each}
  {#each ["H1", "H2"] as option (option)}
    {#each FOLDS as fold (fold)}
      {#each HEADS as [key, state, stale] (key)}
        <div data-part="head:{option}:{fold}:{key}">
          <Head {fold} {option} {stale} waiting={waiting(state)} writes={state !== "stale"} />
        </div>
      {/each}
    {/each}
  {/each}
  {#each ["none", "pane", "caw"] as open (open)}
    {#each SEATS as seat (seat)}
      <div data-part="askcaw:{open}:{seat}:desk"><AskCaw {open} {seat} /></div>
      <div data-part="askcaw:{open}:{seat}:phone"><AskCaw {open} phone {seat} /></div>
    {/each}
  {/each}
  {#each ["rest", "stale-F2"] as key (key)}
    <div data-part="phonebar:top:{key}" style="inline-size: 390px">
      <PhoneBars bar="top" stale={key === "stale-F2"} />
    </div>
  {/each}
  {#each ["rest", "stale-F2"] as key (key)}
    <div data-part="phonebar:narrow:{key}" style="inline-size: 329px">
      <PhoneBars bar="narrow" stale={key === "stale-F2"} />
    </div>
  {/each}
  {#each [0, 2] as count (count)}
    <div data-part="phonebar:foot:{count}" style="inline-size: 390px">
      <PhoneBars bar="foot" waiting={count} />
    </div>
  {/each}
  <div data-part="band:desk"><Fault size="band" /></div>
  <div data-part="band:phone" style="inline-size: 366px"><Fault size="band" /></div>
  <div data-part="popover:phone" style="inline-size: 366px">
    <div data-popover class="rounded-lg bg-surface-raised p-space-2 shadow-overlay"><Fault size="popover" /></div>
  </div>
  {#each ["top", "review"] as fork (fork)}
    {#each ["id", "bare"] as jump (jump)}
      <div data-part="pane:{fork}:{jump}:desk" style="inline-size: 480px; block-size: 800px">
        <Pane {fork} {jump} />
      </div>
      <div data-part="pane:{fork}:{jump}:phone" style="inline-size: 390px; block-size: 844px">
        <Pane {fork} {jump} phone />
      </div>
    {/each}
  {/each}
  {#each ["S1", "S2"] as option (option)}
    <div data-part="caw:{option}:desk" style="inline-size: 400px; block-size: 800px">
      <CawColumn {option} />
    </div>
  {/each}
  <div data-part="caw:S2:phone" style="inline-size: 390px; block-size: 420px">
    <CawColumn option="S2" phone />
  </div>
</main>
