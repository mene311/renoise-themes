# renoisethemes.com — Express + EJS + SQLite app

## Stack
- Express (app.js) serves static public/ at line 144
- EJS templates in templates/
- SQLite WAL at db/themes.db
- Run via PM2 on Hetzner CPX11 (62.238.36.117)
- DNS: Cloudflare A record (grey-cloud, not proxied)

## Deploy
Push to master triggers webhook auto-deploy. Manual: ssh deploy@62.238.36.117
"cd /var/www/renoisethemes && git pull && pm2 restart renoise-themes"

## Key files
- app.js — entry point, check before touching nginx
- lib/email.js — email sending via Resend
- routes/ — Express route modules
- db/schema.js — DB schema

## Operations
- Analytics: Cloudflare GraphQL API (tokens in ~/.env on laptop)
- Server PM2: pm2 list, pm2 logs renoise-themes --lines 50
- DB queries: ssh deploy@62.238.36.117 sqlite3 /var/www/renoisethemes/db/themes.db

## Warnings
- Nginx does TLS termination only — app handles routing
- Sudo on VPS requires PTY (requiretty) — use app-level fixes first
- Email uses Resend — verify domain before it sends
- Dont edit db/*.db directly without backup
