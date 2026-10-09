// Probe: does a plugin auth loader's getAuth() return what auth.json holds
// at request time? It stamps every mock request with the key getAuth() gives.
export const Probe = async () => ({
  auth: {
    provider: "mockai",
    loader: async (getAuth) => ({
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("x-probe-key", (await getAuth())?.key ?? "(none)");
        return fetch(url, { ...init, headers });
      },
    }),
    methods: [],
  },
});
