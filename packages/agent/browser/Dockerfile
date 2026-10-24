# A project's browser (agent src/browser/image.ts): neko's Chromium with
# CawCo's program, policies, profile defaults and X server. Built on the
# machine through the Engine API; its tag is the hash of these files.
FROM ghcr.io/m1k1o/neko/chromium:3.2.0

# Chromium's DevTools listens on loopback alone in a headful build, so socat
# carries the container's 9222 to it (the port is published on the host's
# 127.0.0.1 only, for the agent's gate). The X server's mouse driver is the
# desktop's pointer (xorg.conf).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends socat xserver-xorg-input-mouse; \
    apt-get clean -y; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# A desktop with a mouse and no touchscreen (xorg.conf). neko connects to its
# touchscreen driver's socket at start unless told not to, and stops when the
# socket is not there (server/internal/desktop/manager.go: "unable to connect
# to input driver").
COPY xorg.conf /etc/neko/xorg.conf
ENV NEKO_DESKTOP_INPUT_ENABLED=false

COPY chromium.conf /etc/neko/supervisord/chromium.conf
COPY policies.json /etc/chromium/policies/managed/policies.json
COPY --chown=neko preferences.json /home/neko/.config/chromium/Default/Preferences
