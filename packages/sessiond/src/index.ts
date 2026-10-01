/**
 * The sessiond package's surface: the daemon class and its constants. The
 * protocol types themselves live in `@cawco/core` (`core/src/sessiond.ts`),
 * because both sides of the socket need them and neither side owns them.
 */
// biome-ignore lint/performance/noBarrelFile: this file *is* the package's public surface, documented above
export * from "./server";
