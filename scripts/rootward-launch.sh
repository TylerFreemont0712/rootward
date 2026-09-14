#!/usr/bin/env bash
# Rootward desktop launcher: one click to play.
#
#   rootward-launch.sh             START: install packages if the lockfile changed, build the client, start the
#                                  server in the background, and open the game. If Rootward is already running,
#                                  just open it (a click never kills a game in progress).
#   rootward-launch.sh --restart   stop the server, then START (use this after pulling new code)
#   rootward-launch.sh --open      open the game in the browser without starting anything
#   rootward-launch.sh --stop      stop the server
#   rootward-launch.sh --install   write Rootward.desktop in the repository root and put a copy on the Desktop
#                                  (run it again after moving the repository folder)
#
# Logs and the pidfile live in ~/.local/state/rootward/. Runs themselves are saved by the server in
# ~/.local/share/rootward/ (ADR-0006), so stopping or restarting never loses progress.
#
# Env hooks, handy for testing: ROOTWARD_NO_OPEN=1 skips the browser, ROOTWARD_NO_NOTIFY=1 skips notifications and
# dialogs, and ROOTWARD_PORT, ROOTWARD_DATA_DIR, and XDG_STATE_HOME are honored.
set -u

# Desktop launchers inherit a bare PATH, and on this machine node comes from Homebrew and pnpm from ~/.npm-global
# (both are only added in ~/.bashrc). Directories that do not exist are harmless.
export PATH="$HOME/.npm-global/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

SELF="$(readlink -f "$0")"
ROOT="$(cd "$(dirname "$SELF")/.." && pwd)"
ICON="$ROOT/scripts/rootward.svg"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/rootward"
LOG="$STATE_DIR/launcher.log"
PIDFILE="$STATE_DIR/server.pid"

# The port: the environment wins, then .env, then the server's default (apps/server/src/env.ts).
dotenv_port() {
  [ -f "$ROOT/.env" ] || return 0
  grep -E '^[[:space:]]*ROOTWARD_PORT[[:space:]]*=' "$ROOT/.env" | tail -n 1 | cut -d= -f2- | tr -d "\"' \t\r"
}
PORT="${ROOTWARD_PORT:-}"
[ -n "$PORT" ] || PORT="$(dotenv_port)"
case "$PORT" in '' | *[!0-9]*) PORT=7331 ;; esac
URL="http://127.0.0.1:${PORT}"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$1" >>"$LOG"; }

notify() {
  [ -n "${ROOTWARD_NO_NOTIFY:-}" ] && return 0
  command -v notify-send >/dev/null 2>&1 && notify-send -a Rootward -i "$ICON" Rootward "$1" >/dev/null 2>&1
  return 0
}

fail() {
  echo "rootward-launch: $1" >&2
  [ -d "$STATE_DIR" ] && log "FAILED: $1"
  if [ -z "${ROOTWARD_NO_NOTIFY:-}" ]; then
    notify "$1"
    command -v zenity >/dev/null 2>&1 &&
      zenity --error --title=Rootward --no-wrap --text="$(printf '%s\n\nLog: %s' "$1" "$LOG")" >/dev/null 2>&1
  fi
  return 1
}

open_game() {
  [ -n "${ROOTWARD_NO_OPEN:-}" ] && return 0
  command -v xdg-open >/dev/null 2>&1 && setsid xdg-open "$URL" >/dev/null 2>&1 &
  return 0
}

# Rootward answers /api/health with its engine version; anything else on the port is not Rootward.
is_up() { curl -fsS --max-time 2 "${URL}/api/health" 2>/dev/null | grep -q '"engineVersion"'; }

# Whoever is listening on the port, however it was started. This is the authority: a pidfile can go stale, and a
# server started by hand answers on the port just the same.
port_owner() { ss -ltnpH "sport = :${PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u; }
port_free() { [ -z "$(port_owner)" ]; }

# Is PID $1 a Rootward server from this checkout? PIDs get recycled, so check what the process is and where it runs.
is_rootward_pid() {
  local pid="${1:-}"
  { [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; } || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -q 'src/main\.ts' || return 1
  case "$(readlink "/proc/$pid/cwd" 2>/dev/null)" in "$ROOT" | "$ROOT"/*) return 0 ;; esac
  return 1
}

stop_server() {
  local pid="" owner _
  [ -f "$PIDFILE" ] && pid="$(cat "$PIDFILE" 2>/dev/null)"
  # SIGTERM first, so the server closes the database and its sandboxes cleanly.
  is_rootward_pid "$pid" && kill "$pid" 2>/dev/null
  for owner in $(port_owner); do is_rootward_pid "$owner" && kill "$owner" 2>/dev/null; done
  for _ in $(seq 1 20); do
    if port_free && ! is_rootward_pid "$pid"; then
      rm -f "$PIDFILE"
      return 0
    fi
    sleep 0.5
  done
  # Still there after ten seconds: force it.
  is_rootward_pid "$pid" && kill -9 "$pid" 2>/dev/null
  for owner in $(port_owner); do is_rootward_pid "$owner" && kill -9 "$owner" 2>/dev/null; done
  sleep 0.5
  rm -f "$PIDFILE"
  port_free || fail "Port ${PORT} is held by another program, so Rootward cannot use it."
}

# A server this launcher started that never came up must not linger in the background.
abandon() {
  kill "$1" 2>/dev/null
  rm -f "$PIDFILE"
}

ensure_tools() {
  command -v node >/dev/null 2>&1 ||
    { fail "Node.js was not found. Rootward needs Node 26 or newer; if it is installed elsewhere, edit the PATH line in scripts/rootward-launch.sh."; return 1; }
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
  case "$major" in '' | *[!0-9]*) major=0 ;; esac
  [ "$major" -ge 26 ] || { fail "Rootward needs Node 26 or newer, but found $(node --version 2>/dev/null)."; return 1; }
  command -v pnpm >/dev/null 2>&1 || { fail "pnpm was not found. Install it with: npm i -g pnpm@12.4.1"; return 1; }
  command -v curl >/dev/null 2>&1 || { fail "curl was not found; the launcher needs it to see when the server is up."; return 1; }
}

# pnpm is quick when nothing changed, so it runs on every start: after a pull, it installs exactly what the lockfile
# says. Offline with packages already installed, the game still starts.
update_packages() {
  log "Checking packages"
  pnpm install --frozen-lockfile --prefer-offline >>"$LOG" 2>&1 && return 0
  if [ -d "$ROOT/node_modules" ]; then
    notify "Could not update packages (offline?). Starting with the ones already installed."
    return 0
  fi
  fail "Installing packages failed. The log says why."
}

# Why a start failed on a taken port: another Rootward server (Restart replaces it) or some other program.
busy_port() {
  if is_up; then
    fail "Another Rootward server already holds port ${PORT}. Use Restart to replace it."
  else
    fail "Port ${PORT} is already in use by another program. Stop it, or set ROOTWARD_PORT in .env to another port."
  fi
}

start_server() {
  ensure_tools || return 1
  cd "$ROOT" || { fail "The Rootward folder is missing: $ROOT"; return 1; }
  mkdir -p "$STATE_DIR"
  [ -f "$LOG" ] && mv -f "$LOG" "$LOG.1"
  notify "Starting Rootward…"

  update_packages || return 1
  log "Building the client"
  pnpm run build >>"$LOG" 2>&1 || { fail "Building the client failed. The log says why."; return 1; }

  log "Starting the server at ${URL}"
  ROOTWARD_PORT="$PORT" setsid node apps/server/src/main.ts >>"$LOG" 2>&1 </dev/null &
  local pid=$! _
  echo "$pid" >"$PIDFILE"

  # Started means the process we launched owns the port, not just that something answers: an older server that is
  # still running would answer while ours fails to listen.
  for _ in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PIDFILE"
      if is_up || grep -q 'EADDRINUSE' "$LOG" 2>/dev/null; then
        busy_port
      else
        fail "The server stopped while starting. The log says why."
      fi
      return 1
    fi
    if grep -q 'EADDRINUSE' "$LOG" 2>/dev/null; then
      abandon "$pid"
      busy_port
      return 1
    fi
    if is_up && port_owner | grep -qx "$pid"; then
      log "Running"
      notify "Rootward is running at ${URL}"
      open_game
      return 0
    fi
    sleep 0.5
  done
  abandon "$pid"
  fail "Rootward did not start within 30 seconds. The log says why."
}

install_desktop() {
  local entry="$ROOT/Rootward.desktop" desktop gio
  cat >"$entry" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Rootward
GenericName=Programming Roguelike
Comment=Update packages, start the Rootward server, and open the game
Exec=$SELF
Path=$ROOT
Icon=$ICON
Terminal=false
StartupNotify=true
Categories=Game;
Keywords=rootward;roguelike;programming;coding;education;
Actions=Restart;Open;Stop;

[Desktop Action Restart]
Name=Restart (rebuild and start fresh)
Exec=$SELF --restart

[Desktop Action Open]
Name=Open in browser (don't start the server)
Exec=$SELF --open

[Desktop Action Stop]
Name=Stop the server
Exec=$SELF --stop
EOF
  chmod 755 "$entry"
  desktop="$(xdg-user-dir DESKTOP 2>/dev/null)"
  [ -n "$desktop" ] || desktop="$HOME/Desktop"
  mkdir -p "$desktop"
  install -m 755 "$entry" "$desktop/Rootward.desktop"
  # File managers only run launchers they trust. The system gio writes to the desktop's metadata store; Homebrew's
  # copy, which comes first on this PATH, may not.
  gio=/usr/bin/gio
  [ -x "$gio" ] || gio="$(command -v gio || true)"
  [ -n "$gio" ] && "$gio" set "$desktop/Rootward.desktop" metadata::trusted true >/dev/null 2>&1
  echo "Wrote $entry"
  echo "Installed $desktop/Rootward.desktop"
}

case "${1:-}" in
  --install) install_desktop ;;
  --open) open_game ;;
  --stop)
    if [ -f "$PIDFILE" ] || [ -n "$(port_owner)" ]; then
      stop_server && notify "Rootward stopped."
    else
      notify "Rootward is not running."
    fi
    ;;
  --restart)
    stop_server || exit 1
    start_server
    ;;
  "" | --start)
    if is_up; then
      notify "Rootward is already running. Opening it (use Restart after updating)."
      open_game
      exit 0
    fi
    start_server
    ;;
  *)
    echo "usage: $(basename "$0") [--start | --restart | --open | --stop | --install]" >&2
    exit 2
    ;;
esac
