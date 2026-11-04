// Planted: each spawn spawn-names-env refuses, then the ones it leaves alone.
declare const argv: string[];
declare const env: Record<string, string>;

export const bare = Bun.spawn(["true"]);
export const noEnv = Bun.spawn(["true"], { stdout: "ignore" });
export const syncNoEnv = Bun.spawnSync(argv, { cwd: "/" });
export const objectForm = Bun.spawn({ cmd: ["true"], stdout: "ignore" });

export const live = Bun.spawn(["true"], { env: process.env });
export const made = Bun.spawnSync(argv, { cwd: "/", env: { PATH: "/bin" } });
export const shorthand = Bun.spawn(["true"], { env });
export const shorthandAmong = Bun.spawn(["true"], { stdout: "ignore", env });
export const objectFormEnv = Bun.spawn({ cmd: ["true"], env: process.env });
export const shell = await Bun.$`true`;
