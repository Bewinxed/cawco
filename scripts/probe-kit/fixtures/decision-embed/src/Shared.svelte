<script>
  /**
   * A note kept in a Yjs doc and written out as y-protocols' first sync
   * step: what a component sharing documents imports (the dashboard's
   * comment rail, through y-websocket). `data-one-yjs` says whether its
   * `Doc` is the overlay's (`window.cawcoArtifact.Y`), where an overlay runs
   * in this page: the page's one Yjs.
   */
  import * as encoding from "lib0/encoding";
  import { writeSyncStep1 } from "y-protocols/sync";
  import { Doc } from "yjs";

  let { title = "Shared note" } = $props();
  const doc = new Doc();
  doc.getText("note").insert(0, "Kept in one document");
  const step = encoding.createEncoder();
  writeSyncStep1(step, doc);
  const overlay = window.cawcoArtifact?.Y;
  const one = overlay ? String(overlay.Doc === Doc) : "no overlay";
</script>

<section class="shared" data-one-yjs={one}>
  <h3><span>{title}</span></h3>
  <p><span>{doc.getText("note").toString()}</span></p>
  <p><small>{encoding.length(step)} bytes in its first sync step</small></p>
</section>

<style>
  .shared { box-sizing: border-box; display: grid; gap: 6px; padding: 12px; inline-size: 280px; font-size: 14px; border-radius: 8px; background: light-dark(#f4f4f7, #23232a); }
  .shared h3, .shared p { margin: 0; }
  .shared h3 { font-size: 16px; }
</style>
