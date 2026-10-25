<!--
  A moment from a record, said in the reader's own zone, as the dashboard
  says it (`Intl.DateTimeFormat(undefined, …)`, usage.ts): the frame
  (frame.js, `localize`) writes each `<time data-at>` in its reader's zone
  when it draws, so a capture made anywhere reads as his browser reads it.
  `fmt`: "day" (16 Oct), "clock" (05:06) or "dayClock" (16 Oct 05:06).
-->
<script>
  let { at, fmt = "day", class: className = "" } = $props();
</script>

<time class={["num", className]} data-at={at} data-fmt={fmt} datetime={new Date(at).toISOString()}></time>
