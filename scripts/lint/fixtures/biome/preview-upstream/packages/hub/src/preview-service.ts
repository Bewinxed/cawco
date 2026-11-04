// Left alone: the preview service makes the upstream.
declare const address: string;
declare const token: string;
declare const port: number;
export const upstream = { for: "key", address, port, token };
