/**
 * The aspect ratios Nano Banana makes, through Antigravity's image tool and
 * the Gemini API alike: the ten every per-model table of
 * https://aistudio.google.com/docs/image-generation.md holds ("Aspect
 * ratios and image size", read 2026-11-05) and Gemini 3.1 Flash Lite Image
 * names ("New `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`,
 * `16:9`, `21:9` aspect ratios",
 * https://aistudio.google.com/docs/models/gemini-3.1-flash-lite-image.md).
 * Nano Banana 2.1 and 3.1 Flash Image also make 1:4, 4:1, 1:8 and 8:1, but
 * no size the call admits (at most 3:1) is nearer one of those than 21:9.
 */
const RATIOS = [
  [1, 1],
  [3, 2],
  [2, 3],
  [3, 4],
  [4, 3],
  [4, 5],
  [5, 4],
  [9, 16],
  [16, 9],
  [21, 9],
] as const;

const SIZE = /^(\d+)x(\d+)$/u;

/** `size`'s width and height, or none for `auto`. */
export const sizeOf = (
  size: string
): { height: number; width: number } | null => {
  const match = SIZE.exec(size);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
};

/** The aspect ratio nearest `size` (`WIDTHxHEIGHT`), or none for `auto`. */
export const ratioOf = (size: string): string | null => {
  const asked = sizeOf(size);
  if (!asked) {
    return null;
  }
  const ratio = Math.log(asked.width / asked.height);
  const [best] = [...RATIOS].sort(
    (a, b) =>
      Math.abs(Math.log(a[0] / a[1]) - ratio) -
      Math.abs(Math.log(b[0] / b[1]) - ratio)
  );
  return best ? `${best[0]}:${best[1]}` : null;
};
