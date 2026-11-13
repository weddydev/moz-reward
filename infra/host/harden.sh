#!/bin/bash
# VPS hardening as code (P0-15 AC1; ARCHITECTURE §9, SECURITY §11). Idempotent: every step checks before it
# changes anything and prints `ok` or `CHANGED`; a second run prints `harden: 0 changes`.
#
# Run as root on the VPS from a copy of the repo's infra/ directory (it reads infra/host and infra/docker):
#   scp -r infra root@<host>:/root/moz-infra && ssh root@<host> bash /root/moz-infra/host/harden.sh
# After the first run root can no longer log in over SSH: developers use their own sudo users (one per
# infra/host/files/admins/<user>.pub). Before closing the root session, open a NEW session as your user and
# run `sudo -n true` (the script can't prove a login it has no private key for).
#
# What it does: package updates; Docker CE from Docker's signed repository + daemon.json; 4 GB swap; kernel
# sysctls; admin users (key-only, sudo) and the CI user `deploy` (forced command → sudo moz-deploy, not in the
# docker group); sshd policy (keys only, no root, AllowUsers) checked with `sshd -t` and `sshd -T`; ufw
# default-deny with SSH rate-limited as the only inbound rule (the app is reachable only through the Cloudflare
# Tunnel); fail2ban; unattended upgrades; the root helper /usr/local/sbin/moz-deploy and its directories.
set -Eeuo pipefail
# `… | install_content` must run in this shell, or its change count is lost.
shopt -s lastpipe
umask 022
export LC_ALL=C DEBIAN_FRONTEND=noninteractive

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FILES=$HERE/files
DAEMON_JSON=$HERE/../docker/daemon.json
readonly DOCKER_KEY_FPR=9DC858229FC7DD38854AE2D88D81803C0EBFCD88
readonly HELPER=/usr/local/sbin/moz-deploy
readonly SWAPFILE=/swapfile
readonly SWAP_SIZE=4G

CHANGES=0
LAST_CHANGED=0
changed() {
  CHANGES=$((CHANGES + 1))
  LAST_CHANGED=1
  printf 'CHANGED %s\n' "$*"
}
ok() {
  LAST_CHANGED=0
  printf 'ok      %s\n' "$*"
}
die() {
  printf 'harden: FAILED: %s\n' "$*" >&2
  exit 1
}
trap 'die "line $LINENO: $BASH_COMMAND"' ERR

# install_file <src> <dest> <mode> [owner:group] — copies only when content, mode or owner differ.
install_file() {
  local src=$1 dest=$2 mode=$3 owner=${4:-root:root}
  if [[ -f $dest ]] && cmp -s "$src" "$dest" && [[ $(stat -c '%a %U:%G' "$dest") == "${mode#0} $owner" ]]; then
    ok "$dest"
    return 0
  fi
  install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dest"
  changed "$dest"
}

# install_content <dest> <mode> [owner:group] < content
install_content() {
  local tmp
  tmp=$(mktemp)
  cat >"$tmp"
  install_file "$tmp" "$@"
  rm -f "$tmp"
}

# ensure_dir <path> <mode> <owner:group>
ensure_dir() {
  local path=$1 mode=$2 owner=$3
  if [[ -d $path && $(stat -c '%a %U:%G' "$path") == "${mode#0} $owner" ]]; then
    ok "$path/"
    return 0
  fi
  install -d -m "$mode" "$path"
  chown "$owner" "$path"
  chmod "$mode" "$path"
  changed "$path/"
}

ensure_service() {
  local svc=$1
  if systemctl is-enabled --quiet "$svc" && systemctl is-active --quiet "$svc"; then
    ok "service $svc"
  else
    systemctl enable --now "$svc" >/dev/null 2>&1
    changed "service $svc enabled and started"
  fi
}

missing_packages() {
  local p
  for p in "$@"; do
    dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || printf '%s\n' "$p"
  done
}

# --- 0. Preconditions --------------------------------------------------------------------------------------------
((EUID == 0)) || die "run as root"
# shellcheck source=/dev/null
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || die "expected Ubuntu 24.04, found $PRETTY_NAME"
compgen -G "$FILES/admins/*.pub" >/dev/null || die "no admin keys in $FILES/admins"
[[ -s $FILES/deploy_ci.pub ]] || die "missing $FILES/deploy_ci.pub"
[[ -s $DAEMON_JSON ]] || die "missing $DAEMON_JSON (copy the whole infra/ directory)"
# A copy made on Windows can carry CRLF, which would corrupt authorized_keys, sshd and sudoers files.
if grep -rlq $'\r' "$HERE" "$DAEMON_JSON"; then
  die "CR line endings in $(grep -rl $'\r' "$HERE" "$DAEMON_JSON" | head -n1): copy from a git checkout (LF)"
fi
bash -n "$HERE/moz-deploy" || die "moz-deploy has a syntax error"
if dpkg-query -W -f='${Status}' docker.io 2>/dev/null | grep -q 'install ok installed'; then
  die "Ubuntu's docker.io is installed; remove it first (Docker CE from Docker's repository is used)"
fi

# --- 1. Docker's apt repository (key checked by full fingerprint) -------------------------------------------------
key_tmp=$(mktemp)
if [[ -s /etc/apt/keyrings/docker.asc ]]; then
  cp /etc/apt/keyrings/docker.asc "$key_tmp"
else
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$key_tmp"
fi
fpr=$(gpg --show-keys --with-colons "$key_tmp" 2>/dev/null | awk -F: '/^fpr/ { print $10; exit }')
[[ $fpr == "$DOCKER_KEY_FPR" ]] || die "Docker's apt key has fingerprint '$fpr', expected $DOCKER_KEY_FPR"
install_file "$key_tmp" /etc/apt/keyrings/docker.asc 0644
rm -f "$key_tmp"
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
  "$(dpkg --print-architecture)" "$VERSION_CODENAME" | install_content /etc/apt/sources.list.d/docker.list 0644

# --- 2. Packages and updates --------------------------------------------------------------------------------------
apt-get update -qq
PKGS=(ufw fail2ban python3-systemd unattended-upgrades apt-listchanges zstd openssl jq ca-certificates curl gnupg
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin)
mapfile -t missing < <(missing_packages "${PKGS[@]}")
if ((${#missing[@]} > 0)); then
  apt-get install -y -qq --no-install-recommends "${missing[@]}" >/dev/null
  changed "installed ${missing[*]}"
else
  ok "packages"
fi
upgradable=$(apt-get -s -o Dpkg::Options::=--force-confold upgrade | grep -c '^Inst ' || true)
if ((upgradable > 0)); then
  apt-get -y -qq -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef upgrade >/dev/null
  changed "upgraded $upgradable package(s)"
else
  ok "no pending updates"
fi
if [[ -f /var/run/reboot-required ]]; then
  printf 'note    a reboot is required (unattended-upgrades reboots at 04:30; or reboot now)\n'
fi

# --- 3. Docker daemon ---------------------------------------------------------------------------------------------
dockerd --validate --config-file "$DAEMON_JSON" >/dev/null
install_file "$DAEMON_JSON" /etc/docker/daemon.json 0644
if ((LAST_CHANGED)); then
  # live-restore keeps running containers across this restart once it is on.
  systemctl restart docker
fi
ensure_service docker
ensure_service containerd

# --- 4. Swap and kernel settings ----------------------------------------------------------------------------------
if [[ -z $(swapon --show=NAME --noheadings) ]]; then
  [[ -f $SWAPFILE ]] || fallocate -l "$SWAP_SIZE" "$SWAPFILE"
  chmod 0600 "$SWAPFILE"
  mkswap -q "$SWAPFILE" >/dev/null
  swapon "$SWAPFILE"
  changed "swap $SWAP_SIZE at $SWAPFILE"
else
  ok "swap ($(swapon --show=NAME,SIZE --noheadings | tr -s ' ' | paste -sd ','))"
fi
if [[ -f $SWAPFILE ]] && ! grep -qE "^${SWAPFILE}[[:space:]]" /etc/fstab; then
  printf '%s none swap sw 0 0\n' "$SWAPFILE" >>/etc/fstab
  changed "/etc/fstab swap entry"
fi
install_file "$FILES/sysctl/60-moz.conf" /etc/sysctl.d/60-moz.conf 0644
((LAST_CHANGED)) && sysctl -q -p /etc/sysctl.d/60-moz.conf >/dev/null

# --- 5. Users -----------------------------------------------------------------------------------------------------
# UIDs from 2000 up, so no login shares uid/gid 999 (Postgres/Redis files) or 1000 (the app, Caddy logs).
ensure_user() {
  local name=$1
  if id -u "$name" >/dev/null 2>&1; then
    ok "user $name"
  else
    useradd -m -s /bin/bash -K UID_MIN=2000 -K UID_MAX=2999 -K GID_MIN=2000 -K GID_MAX=2999 "$name"
    changed "user $name"
  fi
  # No password logins at all (keys only); `passwd -l` is idempotent.
  passwd -l "$name" >/dev/null 2>&1 || true
}

ADMINS=()
for key in "$FILES"/admins/*.pub; do
  name=$(basename "$key" .pub)
  [[ $name =~ ^[a-z][a-z0-9-]{1,30}$ ]] || die "admin key file name '$name' is not a valid user name"
  [[ $name != deploy && $name != root ]] || die "'$name' can't be an admin user"
  ssh-keygen -l -f "$key" >/dev/null || die "$key is not a public key"
  ensure_user "$name"
  ensure_dir "/home/$name/.ssh" 0700 "$name:$name"
  install_file "$key" "/home/$name/.ssh/authorized_keys" 0600 "$name:$name"
  ADMINS+=("$name")
done
admin_sudoers=$(mktemp)
for name in "${ADMINS[@]}"; do
  printf '%s ALL=(ALL:ALL) NOPASSWD: ALL\n' "$name"
done | { echo "# Moz Rewards developers (infra/host/harden.sh): key-only SSH users with sudo."; cat; } >"$admin_sudoers"
visudo -cqf "$admin_sudoers" || die "generated admin sudoers is invalid"
install_file "$admin_sudoers" /etc/sudoers.d/moz-admins 0440
rm -f "$admin_sudoers"

# CI: one forced command, no shell, no forwarding; sudo may run only the helper, without arguments.
ensure_user deploy
for group in docker sudo adm lxd; do
  if id -nG deploy | tr ' ' '\n' | grep -qx "$group"; then
    gpasswd -d deploy "$group" >/dev/null
    changed "removed deploy from group $group"
  fi
done
ensure_dir /home/deploy/.ssh 0755 root:root
ssh-keygen -l -f "$FILES/deploy_ci.pub" >/dev/null || die "deploy_ci.pub is not a public key"
printf 'restrict,command="sudo -n %s" %s\n' "$HELPER" "$(head -n1 "$FILES/deploy_ci.pub")" |
  install_content /home/deploy/.ssh/authorized_keys 0644 root:root
visudo -cqf "$FILES/sudoers/moz-deploy" || die "sudoers/moz-deploy is invalid"
install_file "$FILES/sudoers/moz-deploy" /etc/sudoers.d/moz-deploy 0440
visudo -cq || die "the sudoers configuration is invalid"

# --- 6. The root helper and its directories -----------------------------------------------------------------------
install_file "$HERE/moz-deploy" "$HELPER" 0755
ensure_dir /etc/moz 0700 root:root
ensure_dir /var/lib/moz 0755 root:root
ensure_dir /var/lib/moz/releases 0755 root:root
for env in staging production; do
  ensure_dir "/var/lib/moz/$env" 0755 root:root
  # Caddy (65534) writes access logs; the worker (gid 1000) reads them for the System page (C-35).
  ensure_dir "/var/lib/moz/$env/caddy-logs" 2750 65534:1000
done

# --- 7. SSH -------------------------------------------------------------------------------------------------------
grep -qE '^Include /etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config ||
  die "/etc/ssh/sshd_config does not include sshd_config.d (expected on Ubuntu 24.04)"
for name in "${ADMINS[@]}"; do
  [[ -s /home/$name/.ssh/authorized_keys ]] || die "$name has no authorized key; refusing to lock out root"
done
sshd_conf=/etc/ssh/sshd_config.d/00-moz.conf
sshd_backup=$(mktemp)
[[ -f $sshd_conf ]] && cp -p "$sshd_conf" "$sshd_backup"
{
  cat "$FILES/sshd/00-moz.conf"
  printf 'AllowUsers deploy %s\n' "${ADMINS[*]}"
} | install_content "$sshd_conf" 0644
if ((LAST_CHANGED)); then
  if ! sshd -t; then
    if [[ -s $sshd_backup ]]; then cp -p "$sshd_backup" "$sshd_conf"; else rm -f "$sshd_conf"; fi
    die "sshd -t rejected the new policy (previous file restored)"
  fi
  systemctl try-reload-or-restart ssh.service
fi
rm -f "$sshd_backup"
# Assert the effective policy (first value wins, so another drop-in can't have overridden ours).
effective=$(sshd -T 2>/dev/null)
for want in "passwordauthentication no" "kbdinteractiveauthentication no" "permitrootlogin no" \
  "pubkeyauthentication yes" "authenticationmethods publickey" "maxauthtries 3" "allowtcpforwarding no" \
  "allowagentforwarding no" "x11forwarding no" "permittunnel no" "permituserenvironment no"; do
  grep -qx "$want" <<<"$effective" || die "sshd -T does not show '$want'"
done
ok "sshd policy (sshd -T)"

# --- 8. Firewall: SSH (rate-limited) is the only inbound port, IPv4 and IPv6 --------------------------------------
if ! grep -qx 'IPV6=yes' /etc/default/ufw; then
  sed -i 's/^IPV6=.*/IPV6=yes/' /etc/default/ufw
  changed "ufw IPv6"
fi
ufw_before=$(ufw status verbose)
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw default deny routed >/dev/null
# The SSH rule is added before anything is removed or enabled, so this session is never cut off.
ufw limit 22/tcp comment ssh >/dev/null
mapfile -t extra < <(ufw status numbered | awk '/^\[/ && !/ 22\/tcp/' | sed -E 's/^\[ *([0-9]+)\].*/\1/' | sort -rn)
for n in "${extra[@]}"; do
  ufw --force delete "$n" >/dev/null
done
ufw status | grep -q '^Status: active' || ufw --force enable >/dev/null
ufw_after=$(ufw status verbose)
if [[ $ufw_before == "$ufw_after" ]]; then ok "ufw"; else changed "ufw (deny in, limit 22/tcp)"; fi
rules=$(ufw status | awk '/^[0-9A-Za-z]/ && !/^Status|^To/' | awk '{ print $1 }' | sort -u | paste -sd ' ')
[[ $rules == "22/tcp" ]] || die "ufw allows more than 22/tcp: $rules"

# --- 9. fail2ban and unattended upgrades --------------------------------------------------------------------------
install_file "$FILES/fail2ban/moz.local" /etc/fail2ban/jail.d/moz.local 0644
((LAST_CHANGED)) && systemctl restart fail2ban
ensure_service fail2ban
fail2ban-client status sshd >/dev/null || die "fail2ban's sshd jail is not running"

install_file "$FILES/apt/20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades 0644
install_file "$FILES/apt/52moz-unattended-upgrades" /etc/apt/apt.conf.d/52moz-unattended-upgrades 0644
apt-config dump | grep -q 'Unattended-Upgrade::Automatic-Reboot-Time "04:30"' || die "unattended-upgrades config not loaded"
ensure_service unattended-upgrades

# --- Summary ------------------------------------------------------------------------------------------------------
trap - ERR
printf 'listening (non-loopback): %s\n' \
  "$(ss -tlnH | awk '{ print $4 }' | grep -vE '^(127\.|\[::1\]|::1)' | sort -u | paste -sd ' ')"
printf 'harden: %d change%s\n' "$CHANGES" "$([[ $CHANGES == 1 ]] || echo s)"
