/**
 * The aspect ratios Nano Banana makes, through Antigravity's image tool and
 * the Gemini API alike: "1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9,
 * 21:9" (https://ai.google.dev/gemini-api/docs/image-generation, read
 * 2026-11-04).
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
