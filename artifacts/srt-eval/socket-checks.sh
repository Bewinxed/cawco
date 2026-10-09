#!/bin/bash
# Prototype (Linux): which host Unix sockets a command can connect to. Connects
# and sends nothing. srt's seccomp layer, which would refuse every AF_UNIX
# socket, cannot start under Ubuntu's bwrap AppArmor profile (srt #429), so
# path hiding is all that stands between a command and these.
for sock in /run/podman/podman.sock /run/docker.sock /run/tailscale/tailscaled.sock /run/ssh-unix-local/socket /run/dbus/system_bus_socket /run/snapd.socket /run/mullvad-vpn /run/libvirt/virtlockd-sock; do
  if [ ! -e "$sock" ]; then
    printf '%-34s %s\n' "$sock" "not visible"
  elif timeout 3 socat -u OPEN:/dev/null "UNIX-CONNECT:$sock" >/dev/null 2>&1; then
    printf '%-34s %s\n' "$sock" "CONNECTS"
  else
    printf '%-34s %s\n' "$sock" "refused"
  fi
done
