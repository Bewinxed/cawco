export interface StillAShape {
  kind: "shape";
}
export type AlsoAShape = StillAShape | null;
export const planted = 1;
export function plantedToo(): number {
  return 2;
}
