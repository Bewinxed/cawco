// Planted: each shape no-raw-deadline refuses, then the ones it leaves alone.
declare const sleep: (ms: number) => Promise<void>;

export const signal = AbortSignal.timeout(5);
export const settled = new Promise((resolve) => {
  setTimeout(() => resolve(1), 5);
});
export const raced = Promise.race([fetch("x"), sleep(5)]);
export const spawned = Bun.spawn(["true"], { timeout: 5 });

export const unbounded = Bun.spawn(["true"], { timeout: false });
export const later = setTimeout(() => console.log("later"), 5);
