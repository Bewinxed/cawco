// Planted: each shape no-raw-deadline refuses, then the ones it leaves alone.
declare const sleep: (ms: number) => Promise<void>;
declare const spawn: (
  argv: string[],
  options: { timeout: number | false }
) => void;

export const signal = AbortSignal.timeout(5);
export const settled = new Promise((resolve) => {
  setTimeout(() => resolve(1), 5);
});
export const raced = Promise.race([fetch("x"), sleep(5)]);
export const spawned = Bun.spawn(["true"], { timeout: 5 });
declare const lifetime: {
  after: (name: string, ms: number, run: () => void) => void;
};
export const timed = new Promise((resolve) => {
  lifetime.after("a read's deadline", 5, () => resolve(1));
});

spawn(["true"], { timeout: false });
export const later = setTimeout(() => console.log("later"), 5);
