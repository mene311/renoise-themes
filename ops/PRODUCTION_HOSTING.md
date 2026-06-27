# Renoise Themes — Production Hosting Plan

## Recommendation

Use a small VPS (Hetzner CX/CPX class) behind Cloudflare DNS. Cloudflare Pages should remain only the temporary landing-page host until the full Node app is ready.

The full app is **not** a good fit for static Cloudflare Pages because it needs:

- Node/Express runtime
- SQLite writes
- persistent uploaded `.xrnc` files
- persistent generated previews/palettes/screenshots
- native Node dependencies: `better-sqlite3`, `sharp`, `@napi-rs/canvas`
- background-ish CPU work when rendering previews

## Target architecture

```txt
Cloudflare DNS
  └─ A/AAAA renoisethemes.com → VPS
      └─ Nginx TLS reverse proxy
          ├─ /uploads, /css, /js served as static files
          └─ Express app on 127.0.0.1:3000 via PM2
              ├─ db/themes.db SQLite WAL
              └─ public/uploads/* persistent disk
```

## Minimum VPS size

Start with:

- 2 vCPU
- 2–4 GB RAM
- 40+ GB disk
- Ubuntu 24.04 LTS

A 1 GB box may run the app, but preview rendering plus native modules will be tight. Choose 2 GB minimum if possible.

## Deployment path

1. Keep Cloudflare serving the coming-soon page while polishing.
2. Provision VPS.
3. Run `ops/bootstrap.sh` as root.
4. Clone repo to `/var/www/renoisethemes` as `deploy`.
5. Create `.env` from `.env.example`.
6. Run:

```bash
npm ci --omit=dev
npm run preflight
pm2 start ops/pm2/ecosystem.config.cjs
```

7. Install `ops/nginx/renoisethemes.com` and issue Let's Encrypt cert.
8. Run a private smoke test by pointing local `/etc/hosts` or a temporary subdomain at the VPS.
9. Switch Cloudflare DNS from Pages to the VPS A record.

## Required environment

```env
SESSION_SECRET=<64+ char random string>
NODE_ENV=production
PORT=3000
RESEND_API_KEY=<optional until email is enabled>
EMAIL_FROM=noreply@renoisethemes.com
DEPLOY_SECRET=<webhook secret if using /deploy>
```

## Persistent data to back up

- `db/themes.db`
- `db/themes.db-wal` / `db/themes.db-shm` during live backup flows
- `public/uploads/themes/`
- `public/uploads/palettes/`
- `public/uploads/previews/`
- `public/uploads/screenshots/`

Use `ops/scripts/backup.sh` for SQLite `.backup` plus uploads tarball.

## Preflight

Run before deploys:

```bash
npm run preflight
```

This checks syntax, native dependency imports, preview maps, DB readability, and writable upload directories.

## Why not Cloudflare Pages / Workers?

Cloudflare Pages is static and Workers do not provide a normal persistent POSIX filesystem. Moving this app there would require replacing SQLite and uploads with D1/R2 plus reworking preview generation. That is possible later, but it is a migration project, not a launch path.

## Later scaling path

If traffic grows:

1. Move uploads/previews to object storage (Cloudflare R2).
2. Keep SQLite initially, with Litestream backups.
3. Move DB to Postgres only if write concurrency becomes real.
4. Split preview rendering into a queue/worker if uploads spike.
