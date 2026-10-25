/**
 * One run for the probe-slots spec: takes a slot of its own place (slot.ts
 * `holdSlot`), says when it holds it and at what nice, starts a child that
 * must run under its lease, holds it, then ends. Every line starts with the
 * time in ms, for the spec to order them.
 *
 *   bun slot-child.ts <dir> <count> <name> <hold ms | forever> <wait ms> <poll ms>
 *
 * A child it starts (`<name>/child`) takes no slot of its own: it says
 * INHERITED with its nice and ends.
 */
import { getPriority } from "node:os";
import { HEAVY_SLOT_ENV } from "../../packages/core/src/heavy-slots";
import { holdSlot } from "./slot";

const [
  dir = "",
  count = "1",
  name = "run",
  hold = "0",
  wait = "0",
  poll = "200",
] = process.argv.slice(2);
const say = (line: string) => console.log(`${Date.now()} ${line}`);

try {
  const lease = await holdSlot({ dir, count: Number(count) }, name, {
    waitMs: Number(wait),
    pollMs: Number(poll),
    say,
  });
  if (lease === null) {
    say(
      `INHERITED ${name} nice ${getPriority()} under ${process.env[HEAVY_SLOT_ENV]}`
    );
    process.exit(0);
  }
  say(`TAKEN ${name} slot ${lease.index} nice ${getPriority()}`);
  const child = Bun.spawn(
    [
      process.execPath,
      import.meta.path,
      dir,
      count,
      `${name}/child`,
      "0",
      "1000",
      poll,
    ],
    { stdout: "inherit", stderr: "inherit" }
  );
  await child.exited;
  if (hold === "forever") {
    await new Promise(() => undefined);
  }
  await Bun.sleep(Number(hold));
  lease.release();
  say(`RELEASED ${name}`);
} catch (error) {
  say(`TIMEOUT ${name}: ${error instanceof Error ? error.message : error}`);
  process.exit(4);
}
