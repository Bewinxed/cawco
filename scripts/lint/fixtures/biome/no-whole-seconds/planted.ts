declare const read: { after: number; size: number };
declare const after: number;
declare const secondsOf: (ms: number) => number;
export const words = [
  `didn't answer within ${Math.round(read.after / 1000)} s`,
  `didn't answer within ${Math.round(after / 1000)} s`,
  `didn't answer within ${secondsOf(read.after)} s`,
  `${Math.round(read.size / 1000)} kB`,
];
