/**
 * What the page's Caw shows, read by CawHost.svelte and written by
 * preview.js: his status (a file, assets/mascot/caw/<status>.riv), his size,
 * whether he holds his still, and `key`, bumped to mount him afresh (the
 * preview's own step into a moment, which no board plays).
 */
export const caw = $state({
  status: "ready",
  size: 128,
  still: false,
  present: false,
  key: 0,
});

/** Called once a freshly mounted Caw has entered (his drawn enter, or his fade in, has ended). */
export const cawEvents = { entered: () => undefined };
