declare const CAWCO_ENV: Record<string, string>;
declare const CAWCO_HUB_PORT: number;
declare const readEnv: (name: string | undefined) => string | undefined;
export const hub = readEnv(CAWCO_ENV.hubUrl);
export const dev = readEnv(CAWCO_ENV.devHubUrl);
export const port = CAWCO_HUB_PORT;
export const named = readEnv("CAWCO_HUB_URL");
export const fine = readEnv(CAWCO_ENV.hubPortsRange);
