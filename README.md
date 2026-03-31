# cdn-panel

Internal image management panel for the Optidigi CDN. Handles project-based image uploads, WebP conversion, and multi-size variant generation.

Served at `https://cdn.optidigi.nl/panel`.

## What it does

- Web UI for uploading and managing images across projects
- Converts uploads to WebP and generates size variants (320, 640, 1024, 1920)
- Serves a `/health` endpoint for monitoring
- Provides a `/backfill-variants` API for migrating existing files

## Stack

- Python / Flask / Gunicorn (4 workers)
- Tailwind CSS (compiled, no build step at runtime)
- Docker — image published to `ghcr.io/optidigi/cdn-panel:latest`

## Deployment

Push to `main` → GitHub Actions builds and pushes the image to GHCR.

The running container is managed by `serverinfra-ops` (`stacks/cdn/`). To apply a new image on the server:

```bash
cd /srv/ops/infra/stacks/cdn
docker compose pull image-processor
docker compose up -d image-processor
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PANEL_USERNAME` | — | Login username |
| `PANEL_PASSWORD_HASH` | — | Bcrypt hash of the login password |
| `PANEL_SECRET_KEY` | — | Flask session secret key |
| `PANEL_SESSION_TIMEOUT` | — | Session lifetime in seconds (e.g. `86400`) |
| `MAX_UPLOAD_SIZE_MB` | — | Upload size limit in MB |
| `CDN_BASE_URL` | — | Public base URL for the CDN (e.g. `https://cdn.optidigi.nl`) |
| `CDN_ROOT` | `/data/cdn` | Container-internal path for CDN file storage |

Set via `.env` at the stack root on the server. Never committed to git.

## Local development

**PowerShell:**
```powershell
pip install -r requirements.txt
$env:PANEL_USERNAME='admin'
$env:PANEL_PASSWORD_HASH=$(python -c "import bcrypt; print(bcrypt.hashpw(b'dev', bcrypt.gensalt()).decode())")
$env:PANEL_SECRET_KEY='dev'
flask --app app run --debug
```

**Linux/macOS:**
```bash
pip install -r requirements.txt
PANEL_USERNAME=admin PANEL_PASSWORD_HASH=$(python -c "import bcrypt; print(bcrypt.hashpw(b'dev', bcrypt.gensalt()).decode())") PANEL_SECRET_KEY=dev flask --app app run --debug
```

The panel will be available at `http://localhost:5000/panel`.

## CSS changes

Tailwind is pre-compiled to `static/tailwind.css`. If you change template classes or `tailwind.config.js`, recompile before committing:

```bash
npx tailwindcss@3.4.17 -c tailwind.config.js -i input.css -o static/tailwind.css --minify
```
