declare module "cawco:pi-config" {
  export function setEmbeddedQuickJSWasmPath(path: string): void;
}
declare module "cawco:quickjs" {
  const path: string;
  export default path;
}
