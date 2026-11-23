<script lang="ts">
  /**
   * Colour in use: each base role doing its job (a ground under text, an
   * edge round a box, text at its three strengths), then the inks as the
   * product wears them (status badges, a line of code) and Caw coral on the
   * one act. Every piece is a real kit part or the role's own utility.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";

  /** The eight inks, each with what it means where it means something. */
  const INKS = [
    { role: "red", class: "text-red", use: "Failed" },
    { role: "orange", class: "text-orange", use: "Needs you" },
    { role: "yellow", class: "text-yellow", use: "Constants" },
    { role: "green", class: "text-green", use: "Done" },
    { role: "cyan", class: "text-cyan", use: "Live" },
    { role: "blue", class: "text-blue", use: "Names" },
    { role: "purple", class: "text-purple", use: "Numbers" },
    { role: "magenta", class: "text-magenta", use: "Keywords" },
  ];
</script>

<div class="grid gap-space-6 @phone:grid-cols-2">
  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-tx-2 type-meta">
      Base: grounds, edges, text
    </figcaption>
    <div class="overflow-clip rounded-lg ring ring-ui bg-bg">
      <div class="flex flex-col gap-space-1 p-space-4">
        <p class="text-tx type-label">
          tx · Deploy the hub to obelisk-of-light
        </p>
        <p class="text-tx-2 type-body">tx-2 · Started 2 min ago by Caw</p>
        <p class="text-tx-3 type-meta">tx-3 · Placeholder, disabled, faint</p>
      </div>
      <div
        class="flex flex-col gap-space-2 border-ui border-t bg-bg-2 p-space-4"
      >
        <p class="text-tx-2 type-meta">
          bg-2 · a well, a sidebar, a code block
        </p>
        <div class="flex flex-wrap gap-space-2">
          <span
            class="rounded-sm ring ring-ui bg-bg px-space-2 text-tx type-meta"
          >
            ui · edge
          </span>
          <span
            class="rounded-sm ring ring-ui-2 bg-ui px-space-2 text-tx type-meta"
          >
            ui-2 · hover
          </span>
          <span
            class="rounded-sm ring ring-ui-3 bg-ui-2 px-space-2 text-tx type-meta"
          >
            ui-3 · pressed
          </span>
        </div>
      </div>
    </div>
    <p class="text-tx-2 type-meta">bg · the page and every surface on it</p>
  </figure>

  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-tx-2 type-meta">Inks and Caw coral</figcaption>
    <div class="flex flex-wrap items-center gap-space-2">
      <Badge variant="fail"><span>Failed</span></Badge>
      <Badge variant="attn"><span>Needs you</span></Badge>
      <Badge variant="done"><span>Done</span></Badge>
      <Badge variant="live"><span>Live</span></Badge>
    </div>
    <pre class="overflow-x-auto rounded-lg bg-bg-2 p-space-3 type-code"><span
        class="text-magenta">const</span
      > <span class="text-blue">machine</span> = <span class="text-cyan"
        >"obelisk-of-light"</span
      >;
<span class="text-magenta">await</span> <span class="text-blue">deploy</span
      >(<span class="text-blue">machine</span>, {"{"} <span class="text-blue"
        >retries</span
      >: <span class="text-purple">3</span>, <span class="text-blue">dry</span
      >: <span class="text-yellow">false</span> {"}"});
<span class="text-tx-3">// Fails loudly in red, asks in orange.</span></pre>
    <ul class="flex flex-wrap gap-x-space-4 gap-y-space-1">
      {#each INKS as ink (ink.role)}
        <li class={["type-meta", ink.class]}>{ink.role} · {ink.use}</li>
      {/each}
    </ul>
    <div class="flex items-center gap-space-3">
      <Button>Deploy</Button>
      <span class="text-tx-2 type-meta">accent · the one act on a view</span>
    </div>
  </figure>
</div>
