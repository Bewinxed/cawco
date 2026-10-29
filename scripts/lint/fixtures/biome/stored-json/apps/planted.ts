// Planted: a JSON column labelled, and a parse cast; then a parse read as
// unknown, which passes.
declare const text: (
  name: string,
  options: { mode: "json" }
) => {
  $type: <T>() => T;
};
interface Shape {
  a: number;
}

export const column = text("shape", { mode: "json" }).$type<Shape>();
export const cast = JSON.parse("{}") as Shape;

export const read = JSON.parse("{}") as unknown;
