# A project's browser (agent src/browser/image.ts): neko's Chromium with
# CawCo's program, policies, profile defaults and X server. Built on the
# machine through the Engine API; its tag is the hash of these files.
FROM ghcr.io/m1k1o/neko/chromium:3.2.0

# Chromium's DevTools listens on loopback alone in a headful build, so socat
# carries the container's 9222 to it (the port is published on the host's
# 127.0.0.1 only, for the agent's gate). The X server's mouse driver is the
# desktop's pointer (xorg.conf). ibus-gtk3 is Chromium's input method
# (chromium.conf's GTK_IM_MODULE), its module alone, with no ibus daemon.
# bluez: BLE stack for passkey proximity relay (virtual HCI adapter, agent
# passkey-inject.ts).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends socat xserver-xorg-input-mouse ibus-gtk3 bluez; \
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
# CawCo's WebAuthn proxy (passkey-extension/background.js), loaded by
# chromium.conf's --load-extension and again over DevTools by the daemon's
# passkey bridge (agent passkey-bridge.ts, Extensions.loadUnpacked).
COPY passkey-extension/ /opt/cawco/passkey-extension/
COPY --chown=neko preferences.json /home/neko/.config/chromium/Default/Preferences
# Debian's /usr/bin/chromium, which chromium.conf runs, adds
# --disable-extensions-except= with the --load-extension paths it finds in
# CHROMIUM_FLAGS unless CHROMIUM_FLAGS holds --enable-remote-extensions.
# chromium.conf's --load-extension is an argument, not in CHROMIUM_FLAGS, so
# that list came out empty and every extension was off, the bridge's too.
# The base image's /etc/chromium.d/extensions set the flag along with a
# --load-extension of /usr/share/chromium/extensions, which holds none; it
# goes, and /etc/chromium.d/cawco sets the flag alone.
RUN set -eux; \
    rm -f /etc/chromium.d/extensions; \
    echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --enable-remote-extensions"' > /etc/chromium.d/cawco
