/**
 * `bun scripts/docker-client-check.ts` (part of `bun run lint`): a Docker
 * client is made by `dockerAt` in packages/agent/src/browser/runtime.ts
 * alone. dockerode's modem takes `DOCKER_HOST` over the socket it is given
 * (docker-modem 5.0.7 lib/modem.js: "if (!this.host) { this.socketPath =
 * opts.socketPath; }"), so `new Docker({ socketPath })` dials a TCP endpoint
 * the environment names instead: on 2026-10-23 every session's container
 * ending read nothing that way (r191). `dockerAt` makes it with the modem's
 * variables out of the environment. Searched over every tracked and
 * untracked file of the repository; prints `file:line: text`; exits 1 on any.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const MADE = String.raw`new\s+(Docker|Dockerode|Modem)\s*\(`;
const HOME = "packages/agent/src/browser/runtime.ts";

const out =
  await Bun.$`git grep --untracked -nE -e ${MADE} -- ${"*.ts"} ${"*.js"} ${`:!${HOME}`} ${":!scripts/docker-client-check.ts"} ${":!**/node_modules/**"}`
    .cwd(ROOT)
    .nothrow()
    .quiet();
const lines = out.stdout.toString().trim();
if (out.exitCode > 1) {
  console.error(`git grep failed: ${out.stderr.toString().trim()}`);
  process.exit(2);
}
if (out.exitCode === 0 && lines) {
  console.log(
    `A Docker client is made by \`dockerAt\` (${HOME}) alone: \`new Docker({ socketPath })\` dials what DOCKER_HOST names instead of the socket given it. Make it with \`dockerAt(socketPath)\`:\n${lines
      .split("\n")
      .map((hit) => `  ${hit}`)
      .join("\n")}`
  );
  process.exit(1);
}
console.log(`docker clients: every one is made by dockerAt in ${HOME}`);
