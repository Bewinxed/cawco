/**
 * The tab icon's clock, on a worker: it posts one message every interval it
 * is told. A tab's icon is looked at while its tab is in the background,
 * where a page's own timers slow down and `requestAnimationFrame` stops
 * (css-tricks.com/the-making-of-an-animated-favicon: "setInterval/setTimeout
 * slows and stops because inactive tab"); a worker's do not. It lives only
 * while Caw is moving.
 */
addEventListener("message", (event: MessageEvent<number>) => {
  setInterval(() => postMessage(null), event.data);
});
