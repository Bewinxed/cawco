# A project's browser (agent src/browser/image.ts): neko's Chromium with
# CawCo's program, policies and profile defaults. Built on the machine
# through the Engine API; its tag is the hash of these files.
FROM ghcr.io/m1k1o/neko/chromium:3.2.0

# Chromium's DevTools listens on loopback alone in a headful build, so socat
# carries the container's 9222 to it (the port is published on the host's
# 127.0.0.1 only, for the agent's gate).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends socat; \
    apt-get clean -y; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY chromium.conf /etc/neko/supervisord/chromium.conf
COPY policies.json /etc/chromium/policies/managed/policies.json
COPY --chown=neko preferences.json /home/neko/.config/chromium/Default/Preferences
