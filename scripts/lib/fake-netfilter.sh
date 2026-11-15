#!/bin/bash
# Test double for scripts/moz-origin-firewall.test.ts (P0-15 C1b): sourced after infra/host/moz-origin-firewall,
# it replaces iptables, ip6tables, iptables-restore and docker with shell functions backed by files, so the
# script's real logic runs without root or netfilter.
#
#   $FAKE/v4/<chain>, $FAKE/v6/<chain>   one rule per line, exactly as `iptables -S` prints it (no -N/-P line)
#   $FAKE/calls                          every iptables/ip6tables call (after `-w <secs>`)
#   $FAKE/restore                        the last iptables-restore input
#   $FAKE/docker                         every docker call (heartbeats)
#
# Knobs: FAKE_VARIANT (iptables -V text), FAKE_FAIL_RESTORE=1, FAKE_FAIL_INSERT=1.
# shellcheck disable=SC2034 # STATE and SEED are read by the sourced script

fake_ipt() {
  local dir=$1 op chain file pos target
  shift
  [[ ${1:-} == -w ]] && shift 2
  echo "$*" >>"$FAKE/calls"
  op=${1:-}
  chain=${2:-}
  file=$dir/$chain
  case $op in
    -V) echo "${FAKE_VARIANT:-iptables v1.8.10 (nf_tables)}" ;;
    -N)
      [[ -e $file ]] && return 1
      : >"$file"
      ;;
    -L) [[ -e $file ]] ;;
    -S)
      [[ -e $file ]] || return 1
      echo "-N $chain"
      cat "$file"
      ;;
    -C) [[ -e $file ]] && grep -qxF -- "-A $chain ${*:3}" "$file" ;;
    -I)
      [[ -e $file ]] || return 1
      ((${FAKE_FAIL_INSERT:-0})) && return 1
      pos=$3
      target=${*: -1}
      # Like iptables: a jump to a user chain that does not exist fails.
      case $target in DROP | RETURN | ACCEPT) ;; *) [[ -e $dir/$target ]] || return 1 ;; esac
      {
        head -n $((pos - 1)) "$file"
        echo "-A $chain ${*:4}"
        tail -n +"$pos" "$file"
      } >"$file.new"
      mv "$file.new" "$file"
      ;;
    -D)
      [[ -e $file ]] || return 1
      sed -i "${3}d" "$file"
      ;;
    *)
      echo "fake iptables: unsupported: $*" >&2
      return 2
      ;;
  esac
}

iptables() { fake_ipt "$FAKE/v4" "$@"; }
ip6tables() { fake_ipt "$FAKE/v6" "$@"; }

iptables-restore() {
  local input line name
  input=$(cat)
  printf '%s\n' "$input" >"$FAKE/restore"
  ((${FAKE_FAIL_RESTORE:-0})) && return 1
  while IFS= read -r line; do
    case $line in
      :*)
        name=${line#:}
        : >"$FAKE/v4/${name%% *}"
        ;;
      "-A "*)
        name=${line#-A }
        echo "$line" >>"$FAKE/v4/${name%% *}"
        ;;
    esac
  done <<<"$input"
}

docker() { echo "$*" >>"$FAKE/docker"; }

mkdir -p "$FAKE/v4" "$FAKE/v6"
STATE=$FAKE/state
SEED=$FAKE/seed
