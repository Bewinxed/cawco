// CawCo's passkey bridge in a project's browser (Dockerfile, chromium.conf
// --load-extension). It makes itself Chromium's WebAuthn proxy, so no page's
// navigator.credentials.get() or create() reaches Chromium's own dialog, and
// hands each ceremony to the daemon through chrome.storage.session, which the
// daemon reads and writes over CDP by evaluating in this service worker:
//
// - a ceremony stands as `passkey-request:<requestId>`:
//   { type: "get" | "create", requestId, requestDetailsJson, at };
// - the daemon answers with `passkey-response:<requestId>`:
//   { responseJson } (PublicKeyCredential.toJSON()) or { error: { name, message } };
// - this worker completes the ceremony and removes both keys; a ceremony the
//   page aborts or lets time out loses its keys the same way.
//
// Session storage dies with the browser, as the request ids do. Every
// listener is registered at load, so a storage change or a proxy event wakes
// a suspended worker.

const REQUEST = "passkey-request:";
const RESPONSE = "passkey-response:";

const proxy = chrome.webAuthenticationProxy;
const store = chrome.storage.session;

// Another extension holding the proxy, or this one already attached by an
// earlier run of this worker, comes back as an error string.
proxy.attach().then((error) => {
  if (error) {
    console.warn(`webAuthenticationProxy.attach: ${error}`);
  }
});

const stand = (type) => (request) =>
  store.set({
    [`${REQUEST}${request.requestId}`]: {
      type,
      requestId: request.requestId,
      requestDetailsJson: request.requestDetailsJson,
      at: Date.now(),
    },
  });

proxy.onGetRequest.addListener(stand("get"));
proxy.onCreateRequest.addListener(stand("create"));

// The container has no platform authenticator.
proxy.onIsUvpaaRequest.addListener(({ requestId }) =>
  proxy.completeIsUvpaaRequest({ requestId, isUvpaa: false })
);

proxy.onRequestCanceled.addListener((requestId) =>
  store.remove([`${REQUEST}${requestId}`, `${RESPONSE}${requestId}`])
);

const complete = async (requestId, response) => {
  const key = `${REQUEST}${requestId}`;
  const request = (await store.get(key))[key];
  await store.remove([key, `${RESPONSE}${requestId}`]);
  if (!request) {
    return;
  }
  const details = response.error
    ? { requestId, error: response.error }
    : { requestId, responseJson: response.responseJson };
  try {
    await (request.type === "create"
      ? proxy.completeCreateRequest(details)
      : proxy.completeGetRequest(details));
  } catch (error) {
    console.warn(`passkey request ${requestId}: ${error}`);
  }
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") {
    return;
  }
  for (const [key, change] of Object.entries(changes)) {
    if (key.startsWith(RESPONSE) && change.newValue) {
      complete(Number(key.slice(RESPONSE.length)), change.newValue);
    }
  }
});
