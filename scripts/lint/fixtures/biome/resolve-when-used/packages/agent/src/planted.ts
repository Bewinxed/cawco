const HOST = new URL("./host.ts", import.meta.url).pathname;
export const READER = Bun.resolveSync(
  "@cawco/design-tokens/tailwind-theme",
  HOST
);
export const LIBS = [["tailwindcss", Bun.resolveSync("tailwindcss", HOST)]];
export const META = import.meta.resolve("tailwindcss");
export const REQUIRED = require.resolve("tailwindcss");

export const inFunction = (): string => Bun.resolveSync("tailwindcss", HOST);
export function declared(): string {
  return Bun.resolveSync("tailwindcss/package.json", HOST);
}
export const later = {
  get path(): string {
    return Bun.resolveSync("tailwindcss", HOST);
  },
  read(): string {
    return import.meta.resolve("tailwindcss");
  },
};
export class Reader {
  where(): string {
    return require.resolve("tailwindcss");
  }
}
