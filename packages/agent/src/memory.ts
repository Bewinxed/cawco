/**
 * The agent's memory, accounted for: one log line that says what the process
 * holds, so its resident size can be read off a running machine.
 *
 * Every owner of a long-lived cache or per-session table registers a gauge for
 * it here ({@link gauge}); {@link memoryLine} reads them all beside Bun's own
 * figures. The line carries sizes and counts only: no key, no content, no
 * credential.
 */

import { heapStats } from "bun:jsc";

/**
 * Each gauge by name: how many entries (or MB, when the name says so) a table
 * holds, or — for a group — a figure per table, written as `${name}.${table}`.
 */
const gauges = new Map<string, () => number | Record<string, number>>();

/** Registers (or replaces) the gauge `name`; read only when a line is written. */
export const gauge = (name: string, read: () => number): void => {
  gauges.set(name, read);
};

/** Registers a group of gauges whose tables are named as they are read. */
export const gaugeGroup = (
  prefix: string,
  read: () => Record<string, number>
): void => {
  gauges.set(prefix, read);
};

/** Registers one gauge per table, each as `${prefix}.${key}`, reading its size. */
export const gaugeTables = (
  prefix: string,
  tables: Record<string, { readonly size: number }>
): void => {
  for (const [key, table] of Object.entries(tables)) {
    gauge(`${prefix}.${key}`, () => table.size);
  }
};

const MB = 1024 * 1024;
const mb = (bytes: number): number => Math.round(bytes / MB);

/** How many object types {@link memoryLine} names, most numerous first. */
const TOP_TYPES = 15;

/**
 * `memory rss=…MB heap=…/…MB extra=…MB objects=… top=Type:n,… tables=name:n,…`.
 * `heap` is JSC's live heap over its capacity; `extra` is what JSC objects
 * hold outside it (strings' and buffers' backing stores). What RSS holds
 * beyond the two is native: SQLite, worker threads, the runtime's own code.
 */
export const memoryLine = (): string => {
  const { rss } = process.memoryUsage();
  const stats = heapStats();
  const top = Object.entries(stats.objectTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TYPES)
    .map(([type, count]) => `${type}:${count}`)
    .join(",");
  const tables = [...gauges]
    .flatMap(([name, read]) => {
      let value: number | Record<string, number>;
      try {
        value = read();
      } catch {
        return [`${name}:?`];
      }
      return typeof value === "number"
        ? [`${name}:${value}`]
        : Object.entries(value).map(
            ([table, size]) => `${name}.${table}:${size}`
          );
    })
    .join(",");
  return [
    "memory",
    `rss=${mb(rss)}MB`,
    `heap=${mb(stats.heapSize)}/${mb(stats.heapCapacity)}MB`,
    `extra=${mb(stats.extraMemorySize)}MB`,
    `objects=${stats.objectCount}`,
    `top=${top}`,
    `tables=${tables}`,
  ].join(" ");
};

/** How often the agent writes its memory line. */
export const MEMORY_LOG_INTERVAL_MS = 10 * 60 * 1000;
