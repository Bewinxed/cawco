/**
 * A generated file's last step, shared by the dashboard's generators
 * (preflight.ts, screen-edges.ts): with `--check`, write nothing and fail
 * when the committed file, formatted alike on this machine's bun (fmt.ts
 * `formattedAlike`), is not what the generator makes; without, write it.
 */
import { join } from "node:path";
import { formattedAlike } from "../../../../scripts/fmt";

const DASHBOARD = join(import.meta.dir, "../..");

/** What a generator says of its file: its name, the file, and its words when the file stands as made and when it does not. */
interface Generated {
  made: string;
  name: string;
  /** From the dashboard's root. */
  out: string;
  stale: string;
  standing: string;
}

export async function writeOrCheck(file: Generated): Promise<void> {
  const path = join(DASHBOARD, file.out);
  if (!process.argv.includes("--check")) {
    await Bun.write(path, file.made);
    console.log(`${file.name}: wrote ${file.out}`);
    return;
  }
  const committed = await Bun.file(path).text();
  if (await formattedAlike(file.out, committed, file.made)) {
    console.log(`${file.name}: ${file.standing}`);
    return;
  }
  console.error(
    `${file.name}: ${file.out} ${file.stale} (run bun run ${file.name})`
  );
  process.exit(1);
}
