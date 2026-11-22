/** A stylesheet imported `with { type: "text" }`: its text, embedded by the bundler. */
declare module "*.css" {
  const text: string;
  export default text;
}
