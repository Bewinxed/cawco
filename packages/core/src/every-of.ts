/**
 * `values` as written, checked to name every member of `T`. For a union
 * that stays written out (the apps' schema names an enum by its alias only
 * then), so its runtime list cannot fall behind it: a member added to the
 * union and not to the list fails to compile here, naming it.
 */
export const everyOf =
  <T extends string>() =>
  <const V extends readonly T[]>(
    values: V &
      ([T] extends [V[number]] ? unknown : { missing: Exclude<T, V[number]> })
  ): V =>
    values;
