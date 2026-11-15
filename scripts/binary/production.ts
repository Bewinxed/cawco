/**
 * The binary runs in production, its libraries included: imported first by
 * its entry (entry.ts, and the proof's test-entry.ts), before the CLI and
 * the hub load. The build's `define` (build-binary.ts) rewrites only the
 * literal `process.env.NODE_ENV` in the bundle; Elysia reads it through an
 * alias of `process.env` (elysia universal/env.ts), which no define reaches,
 * so without this the compiled hub ran in Elysia's development mode and
 * answered a thrown 5xx error's message as its problem's `detail`. Set on
 * the environment itself, at run time, through `Bun.env` (the same object
 * as `process.env`) so the define leaves it as written. A checkout's hub
 * (`bun packages/hub/src/index.ts`, the service a checkout installs) and
 * the published package start elsewhere and keep the environment they are
 * given: development where nobody says otherwise.
 */
Bun.env.NODE_ENV = "production";
