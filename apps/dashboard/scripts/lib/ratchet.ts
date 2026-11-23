/**
 * Shared baseline read/write helper for dashboard count ratchets
 * (`spacing-ratchet.ts`, `row-ratchet.ts`). Keeps both scripts free of
 * duplication and type assertions.
 */
interface Baseline {
  count: number;
  files: Record<string, number>;
}

function parseBaseline(raw: unknown): Baseline {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("ratchet baseline must be a JSON object");
  }
  const count = Reflect.get(raw, "count");
  const filesRaw = Reflect.get(raw, "files");
  if (
    typeof count !== "number" ||
    typeof filesRaw !== "object" ||
    filesRaw === null
  ) {
    throw new Error("ratchet baseline is missing numeric count or files map");
  }
  const files: Record<string, number> = {};
  for (const [key, value] of Object.entries(filesRaw)) {
    if (typeof value === "number") {
      files[key] = value;
    }
  }
  return { count, files };
}

export async function runRatchet(opts: {
  advice: string;
  baselinePath: string;
  files: Record<string, number>;
  name: string;
  noun: string;
}): Promise<void> {
  const { advice, baselinePath, files, name, noun } = opts;
  const count = Object.values(files).reduce((a, b) => a + b, 0);
  const say = (s: string) => process.stdout.write(`${s}\n`);

  if (process.argv.includes("--write-baseline")) {
    const baseline: Baseline = { count, files };
    await Bun.write(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    say(`${name}: baseline written, ${count} ${noun}`);
    return;
  }

  const baseline = parseBaseline(await Bun.file(baselinePath).json());
  if (count > baseline.count) {
    say(`${name}: ${count} ${noun}, up from ${baseline.count}. ${advice}`);
    for (const [path, n] of Object.entries(files)) {
      const before = baseline.files[path] ?? 0;
      if (n > before) {
        say(`  ${path}: ${before} → ${n}`);
      }
    }
    process.exitCode = 1;
  } else {
    say(`${name}: ${count} ${noun} (baseline ${baseline.count})`);
  }
}
