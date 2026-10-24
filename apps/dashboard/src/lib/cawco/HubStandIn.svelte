<script lang="ts">
  /**
   * A states file's hub (hub-seam): what it wraps reads the hub's
   * connection and answers from `seam`, never the live client. A story's
   * decorator mounts it (hub-stand-in `hubAs`); the app never does.
   */
  import type { Snippet } from "svelte";
  import { type HubSeam, provideHub } from "./hub-seam";

  let { seam, children }: { seam: HubSeam; children: Snippet } = $props();

  provideHub({
    get state() {
      return seam.state;
    },
    get machineOffline() {
      return seam.machineOffline;
    },
    read: (path) => seam.read(path),
  });
</script>

{@render children()}
