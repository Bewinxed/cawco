<script>
  /**
   * A note kept in a Yjs doc and written out as y-protocols' first sync
   * step: what a component sharing documents imports (the dashboard's
   * comment rail, through y-websocket). `data-defined` says every member it
   * imports is there and Yjs's constructor checks hold (a nested map read
   * back is a map); `data-overlay` whether CawCo's overlay runs in this page
   * (`window.cawcoArtifact`), which brings no Yjs of its own into it.
   */
  import * as encoding from "lib0/encoding";
  import { writeSyncStep1 } from "y-protocols/sync";
  import {
    applyUpdate,
    Doc,
    encodeStateAsUpdate,
    encodeStateVector,
    Map as YMap,
    Text as YText,
  } from "yjs";

  let { title = "Shared note" } = $props();
  const doc = new Doc();
  doc.getText("note").insert(0, "Kept in one document");
  doc.getMap("card").set("reply", new YMap());
  const step = encoding.createEncoder();
  writeSyncStep1(step, doc);
  const copy = new Doc();
  applyUpdate(copy, encodeStateAsUpdate(doc));
  const defined =
    [applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector, YMap, YText].every(
      (one) => typeof one === "function"
    ) &&
    copy.getMap("card").get("reply") instanceof YMap &&
    copy.getText("note").toString() === "Kept in one document";
  const overlay = "cawcoArtifact" in window;
</script>

<section class="shared" data-defined={String(defined)} data-overlay={String(overlay)}>
  <h3><span>{title}</span></h3>
  <p><span>{copy.getText("note").toString()}</span></p>
  <p><small>{encoding.length(step)} bytes in its first sync step</small></p>
</section>

<style>
  .shared { box-sizing: border-box; display: grid; gap: 6px; padding: 12px; inline-size: 280px; font-size: 14px; border-radius: 8px; background: light-dark(#f4f4f7, #23232a); }
  .shared h3, .shared p { margin: 0; }
  .shared h3 { font-size: 16px; }
</style>
