# Install: Docker

Single-container Docker run — suitable for testing or simple personal installs.

## Run Command

```bash
docker run -d \
  --name roamly \
  -p 3000:3000 \
  -v ./data:/app/data \
  -v ./uploads:/app/uploads \
  -e ENCRYPTION_KEY=<your-32-byte-hex-key> \
  --restart unless-stopped \
  mauriceboe/roamly:latest
```

`ENCRYPTION_KEY` is strongly recommended but not strictly required. If omitted, a key is auto-generated on first start and persisted to `data/.encryption_key`. Setting it explicitly means you can recreate the container from scratch (e.g. on a new host) without losing access to stored encrypted data (API keys, SMTP credentials, OIDC secrets, MFA secrets).

Generate an encryption key with:

```bash
openssl rand -hex 32
```

### Common optional variables

Pass additional `-e` flags for timezone and CORS/email link support:

```bash
  -e TZ=Europe/Berlin \
  -e ALLOWED_ORIGINS=https://roamly.example.com \
```

See [Environment-Variables](Environment-Variables) for the full list.

## Image Tags

| Tag | Example                  | Behavior |
|---|--------------------------|---|
| `latest` | `mauriceboe/roamly:latest` | Always the newest release across all major versions |
| Major version | `mauriceboe/roamly:4`      | Latest release pinned to that major version |
| Full version | `mauriceboe/roamly:4.0.0`  | Exact release; never changes |

Replace `mauriceboe/roamly:latest` in the run command with your chosen tag to pin to a major version or exact release.

## Volume Reference

| Volume | Container path | What lives there |
|---|---|---|
| `./data` | `/app/data` | `travel.db` (SQLite database), `logs/roamly.log`, `.jwt_secret`, `.encryption_key` |
| `./uploads` | `/app/uploads` | Uploaded files (photos, documents, covers, avatars) |

Both volumes must survive container replacement — they are your persistent state. Never remove them before pulling a new image.

### Named Volumes

The run command above uses bind mounts (`./data`, `./uploads`). You can use Docker named volumes instead, which are fully managed by Docker and not tied to a host path:

```bash
docker run -d \
  --name roamly \
  -p 3000:3000 \
  -v roamly_data:/app/data \
  -v roamly_uploads:/app/uploads \
  -e ENCRYPTION_KEY=<your-32-byte-hex-key> \
  --restart unless-stopped \
  mauriceboe/roamly:latest
```

Docker creates `roamly_data` and `roamly_uploads` automatically on first run. Named volumes are easier to manage with `docker volume` commands and work better in some NAS or container-management environments.

## Health Check

The container exposes a health endpoint at:

```
http://localhost:3000/api/health
```

Docker polls it automatically (interval: 30 s, timeout: 5 s, retries: 3, start period: 15 s). You can check it manually:

```bash
curl -s http://localhost:3000/api/health
```

## Verify the Container Is Running

```bash
docker ps --filter name=roamly
docker logs roamly
```

## Limitations of `docker run`

A bare `docker run` command has no built-in secret management and is harder to reproduce after a system reboot. For production, see [Install-Docker-Compose](Install-Docker-Compose), which adds security hardening (`read_only`, `cap_drop`, `cap_add`, `no-new-privileges`, `tmpfs`) and makes it easy to manage environment variables through a `.env` file.

## Next Steps

- [Reverse-Proxy](Reverse-Proxy) — HTTPS is required for PWA install and the `roamly_session` cookie `secure` flag
- [Install-Docker-Compose](Install-Docker-Compose) — recommended for production
- [Environment-Variables](Environment-Variables) — full list of configurable variables
- [Updating](Updating) — how to pull a new image without losing data
