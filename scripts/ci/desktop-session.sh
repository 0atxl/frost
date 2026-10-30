#!/usr/bin/env bash
set -euo pipefail
state=$(mktemp -d "$RUNNER_TEMP/frost-session-XXXXXX")
desktop_pid=
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$desktop_pid" ]] && kill -0 -- "-$desktop_pid" 2>/dev/null; then
    kill -TERM -- "-$desktop_pid"
    for attempt in {1..50}; do
      if ! kill -0 -- "-$desktop_pid" 2>/dev/null; then break; fi
      sleep 0.1
    done
    if kill -0 -- "-$desktop_pid" 2>/dev/null; then kill -KILL -- "-$desktop_pid"; fi
  fi
  rm -rf "$state"
  exit "$result"
}
trap cleanup EXIT
export TMPDIR="$state/tmp"
export XDG_DATA_HOME="$state/data"
export XDG_CONFIG_HOME="$state/config"
export XDG_CACHE_HOME="$state/cache"
export XDG_RUNTIME_DIR="$state/runtime"
mkdir -p "$TMPDIR" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
setsid --wait dbus-run-session -- "$@" &
desktop_pid=$!
wait "$desktop_pid"
