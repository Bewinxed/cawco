// Planted: each shape hub-timers-named refuses, then the ones it leaves alone.
declare const lifetime: {
  after: (name: string, ms: number, run: () => void) => void;
  every: (name: string, ms: number, run: () => void) => void;
};
declare const run: () => void;

setTimeout(run, 5);
setInterval(run, 5);
setImmediate(run);
lifetime.after("", 5, run);
lifetime.every("", 5, run);

lifetime.after("board publish", 0, run);
lifetime.every("loop minute line", 60_000, run);
