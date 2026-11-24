<script lang="ts">
  /**
   * Colour in use: each base role doing its job (a ground under text, an
   * edge round a box, text at its three strengths), then the statuses as the
   * product wears them, the labels a person picks, a line of code in the
   * house code theme, and Caw coral on the one act. Every piece is a real kit
   * part or the role's own utility; every colour is a role, pointing at the
   * palette (theme.css).
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";

  /** The statuses: what a thing's state means. */
  const STATUSES = [
    {
      role: "danger",
      class: "text-danger",
      use: "Failed, an error, a destructive act",
    },
    { role: "caution", class: "text-caution", use: "Needs you, asks, warns" },
    { role: "success", class: "text-success", use: "Done" },
    { role: "live", class: "text-live", use: "Working" },
  ];
  /** The labels: a hue picked to mark a thing (an account, a column, a project). */
  const LABELS = [
    { role: "label-red", class: "bg-label-red" },
    { role: "label-orange", class: "bg-label-orange" },
    { role: "label-yellow", class: "bg-label-yellow" },
    { role: "label-green", class: "bg-label-green" },
    { role: "label-cyan", class: "bg-label-cyan" },
    { role: "label-blue", class: "bg-label-blue" },
    { role: "label-purple", class: "bg-label-purple" },
    { role: "label-magenta", class: "bg-label-magenta" },
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
    <figcaption class="text-tx-2 type-meta">
      Statuses, labels, code and Caw coral
    </figcaption>
    <div class="flex flex-wrap items-center gap-space-2">
      <Badge variant="fail"><span>Failed</span></Badge>
      <Badge variant="attn"><span>Needs you</span></Badge>
      <Badge variant="done"><span>Done</span></Badge>
      <Badge variant="live"><span>Live</span></Badge>
    </div>
    <ul class="flex flex-col gap-space-1">
      {#each STATUSES as status (status.role)}
        <li class={["type-meta", status.class]}>
          {status.role} · {status.use}
        </li>
      {/each}
    </ul>
    <ul class="flex flex-wrap gap-space-2" aria-label="Labels">
      {#each LABELS as label (label.role)}
        <li class="flex items-center gap-space-1 text-tx-2 type-meta">
          <span class={["size-space-3 rounded-xs", label.class]}></span>
          {label.role}
        </li>
      {/each}
    </ul>
    <pre
      class="overflow-x-auto rounded-lg bg-(--code-syntax-background) p-space-3 text-(--code-syntax-foreground) type-code"><span
        class="text-(--code-syntax-token-keyword)">const</span
      > machine = <span class="text-(--code-syntax-token-string)"
        >"obelisk-of-light"</span
      >;
<span class="text-(--code-syntax-token-keyword)">await</span> <span
        class="text-(--code-syntax-token-function)">deploy</span
      >(machine, {"{"} retries: <span
        class="text-(--code-syntax-token-constant)">3</span
      >, dry: <span class="text-(--code-syntax-token-constant)">false</span
      > {"}"});
<span class="text-(--code-syntax-token-comment)"
        >// The house code theme, as every code block draws it.</span
      ></pre>
    <div class="flex items-center gap-space-3">
      <Button>Deploy</Button>
      <span class="text-tx-2 type-meta">accent · the one act on a view</span>
    </div>
  </figure>
</div>
