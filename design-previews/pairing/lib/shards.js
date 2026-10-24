/**
 * The shatter's constants, as the design gives them (`pairing/shards.ts`):
 * coordinates are percentages of the well's box (the QR's, the empty
 * well's, or the device wireframe's). Spokes clockwise from 12 o'clock at
 * 0°, 48°, 85°, 140°, 176°, 225°, 268°, 318°; the ring at 0.36 of the
 * half-diagonal with per-spoke jitter. The badge is never cut.
 */
export const SHARDS = [
  {
    id: "inner-0",
    clip: "polygon(50.0% 50.0%, 50.0% 23.5%, 68.0% 33.8%)",
    centroid: [56.0, 35.8],
    driftX: 0.9,
    rotate: 9,
    stagger: 0,
  },
  {
    id: "outer-0",
    clip: "polygon(50.0% 23.5%, 50.0% 0.0%, 100.0% 0.0%, 100.0% 5.0%, 68.0% 33.8%)",
    centroid: [70.7, 12.8],
    driftX: 3.1,
    rotate: 13,
    stagger: 60,
  },
  {
    id: "inner-1",
    clip: "polygon(50.0% 50.0%, 68.0% 33.8%, 76.9% 47.6%)",
    centroid: [65.0, 43.8],
    driftX: 2.2,
    rotate: 9,
    stagger: 10,
  },
  {
    id: "outer-1",
    clip: "polygon(68.0% 33.8%, 100.0% 5.0%, 100.0% 45.6%, 76.9% 47.6%)",
    centroid: [87.7, 31.1],
    driftX: 5.7,
    rotate: 13,
    stagger: 90,
  },
  {
    id: "inner-2",
    clip: "polygon(50.0% 50.0%, 76.9% 47.6%, 66.0% 69.1%)",
    centroid: [64.3, 55.6],
    driftX: 2.1,
    rotate: 9,
    stagger: 20,
  },
  {
    id: "outer-2",
    clip: "polygon(76.9% 47.6%, 100.0% 45.6%, 100.0% 100.0%, 92.0% 100.0%, 66.0% 69.1%)",
    centroid: [87.0, 70.1],
    driftX: 5.5,
    rotate: 13,
    stagger: 110,
  },
  {
    id: "inner-3",
    clip: "polygon(50.0% 50.0%, 66.0% 69.1%, 51.8% 76.2%)",
    centroid: [56.0, 65.1],
    driftX: 0.9,
    rotate: 9,
    stagger: 30,
  },
  {
    id: "outer-3",
    clip: "polygon(66.0% 69.1%, 92.0% 100.0%, 53.5% 100.0%, 51.8% 76.2%)",
    centroid: [67.4, 87.9],
    driftX: 2.6,
    rotate: 13,
    stagger: 140,
  },
  {
    id: "inner-4",
    clip: "polygon(50.0% 50.0%, 51.8% 76.2%, 33.1% 66.9%)",
    centroid: [45.0, 64.4],
    driftX: -0.8,
    rotate: -9,
    stagger: 30,
  },
  {
    id: "outer-4",
    clip: "polygon(51.8% 76.2%, 53.5% 100.0%, 0.0% 100.0%, 33.1% 66.9%)",
    centroid: [32.2, 87.4],
    driftX: -2.7,
    rotate: -13,
    stagger: 160,
  },
  {
    id: "inner-5",
    clip: "polygon(50.0% 50.0%, 33.1% 66.9%, 24.3% 50.9%)",
    centroid: [35.8, 55.9],
    driftX: -2.1,
    rotate: -9,
    stagger: 40,
  },
  {
    id: "outer-5",
    clip: "polygon(33.1% 66.9%, 0.0% 100.0%, 0.0% 51.7%, 24.3% 50.9%)",
    centroid: [12.6, 69.6],
    driftX: -5.6,
    rotate: -13,
    stagger: 190,
  },
  {
    id: "inner-6",
    clip: "polygon(50.0% 50.0%, 24.3% 50.9%, 33.6% 31.8%)",
    centroid: [36.0, 44.2],
    driftX: -2.1,
    rotate: -9,
    stagger: 50,
  },
  {
    id: "outer-6",
    clip: "polygon(24.3% 50.9%, 0.0% 51.7%, 0.0% 0.0%, 5.0% 0.0%, 33.6% 31.8%)",
    centroid: [12.9, 30.0],
    driftX: -5.6,
    rotate: -13,
    stagger: 210,
  },
  {
    id: "inner-7",
    clip: "polygon(50.0% 50.0%, 33.6% 31.8%, 50.0% 23.5%)",
    centroid: [44.5, 35.1],
    driftX: -0.8,
    rotate: -9,
    stagger: 60,
  },
  {
    id: "outer-7",
    clip: "polygon(33.6% 31.8%, 5.0% 0.0%, 50.0% 0.0%, 50.0% 23.5%)",
    centroid: [32.7, 12.3],
    driftX: -2.6,
    rotate: -13,
    stagger: 240,
  },
];

/** The badge falls first, whole, face shut. */
export const BADGE_FALL = { rotate: -14, driftPx: -6, stagger: 0 };
export const CRACK = { offsetPx: 2 };
export const FALL = { startAfterCrack: 120 };

const SPACE = /\s+/;

/** A shard's polygon as points, % of the well. */
export const pointsOf = (clip) =>
  clip
    .slice("polygon(".length, -1)
    .split(",")
    .map((pair) =>
      pair
        .trim()
        .split(SPACE)
        .map((v) => Number.parseFloat(v))
    );
