/**
 * The listen backlog every socat of CawCo's takes (`backlog=`): the agent's
 * preview bridge into a workspace (preview-bridge.ts) and the proxy relay
 * inside a workspace's sandbox (proxy-relay.ts `RELAY_STEP`). Dependency-free,
 * so the boundary's srt host imports it with the relay.
 *
 * socat takes one connection at a time and forks a child for it, and its own
 * backlog is 5 ("backlog=<count> … Default is 5",
 * dest-unreach.org/socat/doc/socat.html). A burst past it fails on a unix
 * socket at once ("EAGAIN For nonblocking UNIX domain sockets … the
 * connection cannot be completed immediately", connect(2)): a canvas's cold
 * open, about 200 module requests at once, had the agent's listener answer
 * 502 for each it lost, and the canvas didn't load. On TCP the kernel drops
 * the SYN instead, and the client tries again only after its retransmission
 * timeout, a second at first (RFC 6298 §2.1, "the RTO SHOULD be set to 1
 * second"). The kernel takes the smaller of this and `net.core.somaxconn`
 * ("silently capped to that value. Since Linux 5.4, the default in this file
 * is 4096", listen(2)).
 */
export const SOCAT_BACKLOG = 4096;
