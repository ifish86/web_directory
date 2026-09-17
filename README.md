# Web Directory

A self-hosted index / table of contents for the web interfaces running on this device. It scans listening ports, detects which ones serve a web UI, and presents them as a grid of cards with a password-protected configuration page.

- **Backend** (`backend/`) — Node.js + Express. Discovers listening TCP ports (via `/proc/net/tcp` on Linux), probes each for an HTTP(S) interface, reads page titles and process names, and exposes a REST API. Configuration (names, icons, colors, order, hidden state, password hash) is stored in `backend/data/config.json`.
- **Frontend** (`frontend/`) — Quasar (Vue 3 + Vite). A landing page with cards for each interface, plus a password-protected configuration page.
- **Deployment** — `install.sh` installs the app to `/opt/web-directory` and registers a `systemd` service (`web-directory`).

## Requirements

- Linux with `systemd`
- Node.js 18+ and npm
- `rsync`

## Install (systemd)

```bash
git clone git@github.com:ifish86/web_directory.git
cd web_directory
sudo ./install.sh
```

Options:

```bash
sudo ./install.sh --dir /opt/web-directory --port 3100 --password mypassword --user webdirectory
```

The app is then available at `http://<device-ip>:3100` and restarts automatically on boot.

### Uninstall

```bash
sudo systemctl disable --now web-directory
sudo rm /etc/systemd/system/web-directory.service
sudo systemctl daemon-reload
sudo rm -rf /opt/web-directory
sudo userdel webdirectory
```

## Default password

- Initial password: `admin` — change it on the **Security** tab of the config page.
- Pass `--password` to `install.sh` (or set `PORTAL_ADMIN_PASSWORD`) to choose a different initial password.

## Development

Backend:

```bash
cd backend && npm install && npm run dev
```

Frontend:

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:9000 — Vite proxies `/api` to the backend on http://localhost:3100.

## Production (without systemd)

```bash
cd frontend && npm install && npm run build
cd ../backend && npm install && npm start
```

The backend serves the built UI and the API together at http://localhost:3100.

## Backend environment variables

| Variable                   | Default        | Description                              |
| -------------------------- | -------------- | ---------------------------------------- |
| `PORTAL_PORT`              | `3100`         | Port the backend listens on              |
| `PORTAL_ADMIN_PASSWORD`    | `admin`        | Initial admin password (first run only)  |
| `PORTAL_DATA_DIR`          | `backend/data` | Directory for `config.json`              |
| `PORTAL_SCAN_CONCURRENCY`  | `25`           | Concurrent HTTP probes during a scan     |

## API

| Method | Path                          | Auth | Description                              |
| ------ | ----------------------------- | ---- | ---------------------------------------- |
| GET    | `/api/services`               | no   | List discovered + custom services        |
| GET    | `/api/settings`               | no   | Public settings                          |
| POST   | `/api/auth/login`             | no   | Login, returns bearer token              |
| POST   | `/api/auth/logout`            | yes  | Invalidate token                         |
| POST   | `/api/auth/change-password`   | yes  | Change admin password                    |
| POST   | `/api/scan`                   | yes  | Trigger a rescan                         |
| POST   | `/api/services`               | yes  | Add a custom service                     |
| PUT    | `/api/services/:id`           | yes  | Update a service                         |
| DELETE | `/api/services/:id`           | yes  | Remove (custom) or hide (auto) a service |
| POST   | `/api/services/reorder`       | yes  | Reorder service cards                    |
| PUT    | `/api/settings`               | yes  | Update settings                          |
