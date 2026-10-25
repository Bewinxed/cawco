<!--
  The demo: a bar to try it with, and one session's pane as the product
  draws it (its head, then the transcript).
-->
<script>
  import { LATENCIES, settings } from "./hub.js";
  import Transcript from "./Transcript.svelte";

  let { loading, align } = $props();

  let latency = $state(settings.latency);
  let gone = $state(settings.gone);
  const label = (ms) => `${ms / 1000} s`;
</script>

<div class="demo">
  <header class="bar">
    <fieldset class="latency">
      <legend>Hub latency</legend>
      {#each LATENCIES as ms (ms)}
        <label>
          <input
            type="radio"
            name="latency"
            value={ms}
            checked={latency === ms}
            onchange={() => {
              latency = ms;
              settings.latency = ms;
            }}
          />
          <span>{label(ms)}</span>
        </label>
      {/each}
    </fieldset>
    <label class="gone">
      <input
        type="checkbox"
        checked={gone}
        onchange={(event) => {
          gone = event.currentTarget.checked;
          settings.gone = gone;
        }}
      />
      <span>Spot no longer exists</span>
    </label>
    <button type="button" class="refresh" onclick={() => location.reload()}>Refresh</button>
    <p class="hint">Scroll up anywhere, then refresh.</p>
  </header>

  <main class="pane">
    <div class="pane-head">
      <h1>Fix the board's scroll after a reconnect</h1>
      <p>obsidian · Claude Code</p>
    </div>
    <Transcript {loading} {align} />
  </main>
</div>
