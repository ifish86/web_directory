#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Web Directory installer
#
# Copies the project, installs dependencies, builds the frontend and installs
# a systemd service. Run as root:
#
#   sudo ./install.sh
#
# Options:
#   --dir <path>      Install directory      (default: /opt/web-directory)
#   --port <port>     Service port           (default: 8080)
#   --password <pw>   Initial admin password (default: admin)
#   --user <name>     Service user           (default: webdirectory)
# ---------------------------------------------------------------------------

INSTALL_DIR="/opt/web-directory"
PORT="8080"
ADMIN_PASSWORD="admin"
SERVICE_USER="webdirectory"
SERVICE_NAME="web-directory"

usage() {
  cat <<EOF
Web Directory installer

Usage: sudo $0 [options]

Options:
  --dir <path>      Install directory (default: /opt/web-directory)
  --port <port>     Port the service listens on (default: 8080)
  --password <pw>   Initial admin password (default: admin)
  --user <name>     System user that runs the service (default: webdirectory)
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) INSTALL_DIR="${2:?missing value for --dir}"; shift 2 ;;
    --port) PORT="${2:?missing value for --port}"; shift 2 ;;
    --password) ADMIN_PASSWORD="${2:?missing value for --password}"; shift 2 ;;
    --user) SERVICE_USER="${2:?missing value for --user}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR"

# --- safety + preflight -----------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "error: run as root, e.g. sudo $0" >&2
  exit 1
fi

if [[ -z "$INSTALL_DIR" || "$INSTALL_DIR" == "/" ]]; then
  echo "error: invalid install directory '$INSTALL_DIR'" >&2
  exit 1
fi

for cmd in node npm rsync useradd systemctl; do
  command -v "$cmd" >/dev/null || { echo "error: required command not found: $cmd" >&2; exit 1; }
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" -lt 18 ]]; then
  echo "error: Node.js 18+ is required (found $(node -v))" >&2
  exit 1
fi

if [[ "$ADMIN_PASSWORD" =~ [[:space:]] ]]; then
  echo "error: admin password must not contain spaces" >&2
  exit 1
fi

# --- copy project ------------------------------------------------------------
echo "==> Copying project to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/backend" "$INSTALL_DIR/frontend"

rsync -a --exclude node_modules --exclude data "$SRC_DIR/backend/" "$INSTALL_DIR/backend/"
rsync -a --exclude node_modules --exclude dist "$SRC_DIR/frontend/" "$INSTALL_DIR/frontend/"
for f in README.md .gitignore deploy; do
  [[ -e "$SRC_DIR/$f" ]] && cp -a "$SRC_DIR/$f" "$INSTALL_DIR/"
done

# --- dependencies + build ----------------------------------------------------
echo "==> Installing backend dependencies"
(cd "$INSTALL_DIR/backend" && npm install --omit=dev)

echo "==> Installing frontend dependencies and building"
(cd "$INSTALL_DIR/frontend" && npm install && npm run build && npm prune --omit=dev)

# --- service user + data dir -------------------------------------------------
if ! id -u "$SERVICE_USER" &>/dev/null; then
  echo "==> Creating system user '$SERVICE_USER'"
  useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "==> Preparing data directory"
mkdir -p "$INSTALL_DIR/backend/data"

ENV_FILE="$INSTALL_DIR/backend/data/service.env"
if [[ "$ADMIN_PASSWORD" != "admin" ]]; then
  printf 'PORTAL_ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "==> Initial admin password set from --password"
else
  # Keep the built-in default so the UI shows the "change password" warning.
  rm -f "$ENV_FILE"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# --- systemd service ----------------------------------------------------------
echo "==> Installing systemd service '$SERVICE_NAME'"
sed -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__USER__|$SERVICE_USER|g" \
    "$SRC_DIR/deploy/web-directory.service" > "/etc/systemd/system/$SERVICE_NAME.service"

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

# --- done ---------------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "$IP" ]] || IP="127.0.0.1"
echo
echo "Done! Web Directory is running."
echo "  URL:            http://$IP:$PORT"
echo "  Admin password: $ADMIN_PASSWORD"
echo "  Logs:           journalctl -u $SERVICE_NAME -f"
