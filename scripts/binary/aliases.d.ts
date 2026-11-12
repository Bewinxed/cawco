/// <reference path="../../packages/agent/src/binary-modules.d.ts" />
declare module "cawco:pi-runtime";
/** pi's package entry, in test builds only (scripts/build-binary.ts). */
declare module "cawco:smoke-pi" {
  export function resizeImage(
    inputBytes: Uint8Array,
    mimeType: string,
    options?: { maxWidth?: number; maxHeight?: number; maxBytes?: number }
  ): Promise<{
    width: number;
    height: number;
    wasResized: boolean;
    mimeType: string;
  } | null>;
}
/** pi-tui's package entry, in test builds only (scripts/build-binary.ts). */
declare module "cawco:smoke-pi-tui" {
  export function getNativeClipboard():
    | {
        getText: () => Promise<string | null | undefined>;
        getImage: unknown;
      }
    | undefined;
}
